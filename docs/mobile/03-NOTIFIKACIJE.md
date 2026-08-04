# Obaveštenja i zvuci

> Cilj: **da po zvuku znaš šta je stiglo, bez vađenja telefona.** Isto kao što
> prepoznaješ zvono KupujemProdajem-a među svim ostalim aplikacijama.
>
> ⚠️ Ovaj dokument sadrži odluke koje se **ne mogu promeniti posle prvog builda**
> bez posledica po postojeće korisnike. Pročitati sekciju 4 pre bilo kakvog koda.

---

## 1. Zašto ovo ne može na webu

Trenutni sistem koristi `web-push` sa VAPID ključevima (`convex/push.ts`,
`convex/pushSubscriptions.ts`). To radi, ali:

| Mogućnost | Web push | Native |
|---|---|---|
| Obaveštenje kad je app zatvorena | ✅ | ✅ |
| **Custom zvuk po tipu događaja** | ❌ | ✅ |
| Probijanje Focus / Do Not Disturb režima | ❌ | ✅ (`timeSensitive`) |
| Badge sa brojem na ikoni | ⚠️ delimično | ✅ |
| Grupisanje po razgovoru | ❌ | ✅ |
| Brzi odgovor iz obaveštenja | ❌ | ✅ |
| Prilagođena vibracija | ❌ | ✅ |
| iOS bez „dodaj na početni ekran" | ❌ | ✅ |

Custom zvuk je jedina stavka koju ni jedan browser ni na jednoj platformi ne
podržava. To je tehnički razlog za native aplikaciju, nezavisno od svega ostalog.

---

## 2. Kako se uklapa u postojeći sistem

Postojeći tok ostaje netaknut:

```
mutacija (npr. tasks.assign)
    ↓
createNotification()            ← convex/lib/notifications.ts
    ↓
upis u tabelu `notifications`   ← dedupeKey sprečava duplikate
    ↓
scheduler.runAfter(0, ...)
    ↓
push.deliver                    ← web-push, VAPID
```

Dodaje se **paralelna grana**, ne zamena:

```
    ↓
    ├─→ push.deliver          ← web (desktop browser) — ostaje
    └─→ expoPush.deliver      ← mobilni (Android + iOS) — novo
```

### Nova tabela

```ts
expoPushTokens: defineTable({
  profileId: v.id("profiles"),
  token: v.string(),                    // ExponentPushToken[xxxxx]
  platform: v.union(v.literal("ios"), v.literal("android")),
  deviceName: v.union(v.string(), v.null()),
  appVersion: v.string(),
  channelVersion: v.number(),           // koja generacija kanala je na uređaju
  mutedTypes: v.array(v.string()),      // korisnikova podešavanja
  quietHoursStart: v.union(v.number(), v.null()),  // minuti od ponoći
  quietHoursEnd: v.union(v.number(), v.null()),
  lastSeenAt: v.number(),
  failureCount: v.number(),
  createdAt: v.number(),
})
  .index("by_profileId", ["profileId"])
  .index("by_token", ["token"])
```

`channelVersion` je bitan — po njemu server zna koje kanale uređaj poznaje
(vidi sekciju 4.1).

### Nova akcija

`convex/expoPush.ts` — šalje na `https://exp.host/--/api/v2/push/send`,
u serijama do 100 tokena. Ne treba `"use node"` jer je običan `fetch`.

Payload:

```ts
{
  to: "ExponentPushToken[...]",
  title: "Marko ti je dodelio zadatak",
  body: "Redizajn landinga",
  sound: "task_assigned.wav",          // Android koristi kanal, iOS ovo
  channelId: "task_assigned_v1",        // samo Android
  priority: "high",
  badge: 3,
  interruptionLevel: "timeSensitive",   // samo iOS
  categoryId: "task",                   // za brze akcije
  data: {
    notificationId, startupId, targetType, targetId, type,
  },
}
```

`data` mora da nosi dovoljno da aplikacija otvori tačan ekran na tap —
ista polja koja `push.ts` već šalje.

### Proširenje validatora

```ts
export const notificationTypeValidator = v.union(
  // postojeći
  v.literal("task_assigned"),
  v.literal("task_status_changed"),
  v.literal("task_due_soon"),
  v.literal("task_due_today"),
  v.literal("task_overdue"),
  v.literal("idea_voted"),
  v.literal("idea_converted"),
  v.literal("vote_requested"),
  v.literal("request_resolved"),
  v.literal("puls_ready"),
  // novi, iz chata
  v.literal("chat_message"),
  v.literal("chat_mention"),
  v.literal("chat_dm"),
);
```

I `notificationTargetTypeValidator` dobija `v.literal("chat")`.

---

## 3. Katalog kanala i zvukova

**Sedam kanala. Trinaest tipova događaja.** Namerno manje kanala nego tipova —
sedam zvukova je već granica onoga što se pamti.

| Channel ID | Tipovi | Zvuk | Karakter | Android važnost | iOS |
|---|---|---|---|---|---|
| `dm_v1` | `chat_dm` | `dm.wav` | mek dvotonski, topao, silazno-uzlazni | HIGH | default |
| `mention_v1` | `chat_mention` | `mention.wav` | oštar uzlazni triton — „traže te" | HIGH | **timeSensitive** |
| `channel_v1` | `chat_message` | `channel.wav` | jedan tih ton, kratak | DEFAULT | passive |
| `task_v1` | `task_assigned`, `task_status_changed` | `task.wav` | odsečan dvostruki klik | HIGH | default |
| `deadline_v1` | `task_due_soon`, `task_due_today`, `task_overdue` | `deadline.wav` | ozbiljan silazni, duži | HIGH | **timeSensitive** |
| `vote_v1` | `vote_requested`, `request_resolved` | `vote.wav` | najtvrđi, prepoznatljiv udarac | HIGH | **timeSensitive** |
| `quiet_v1` | `idea_voted`, `idea_converted`, `puls_ready` | — bez zvuka | tiho | LOW | passive |

### Zašto ova podela

- **`dm` odvojen od `channel`** — direktna poruka gotovo uvek traži odgovor;
  poruka u kanalu obično ne. Ovo je najkorisnija razlika u celom katalogu.
- **`mention` odvojen od oba** — `@` znači „konkretno ti", i mora da probije
  Focus režim.
- **`deadline` skuplja tri tipa** — `due_soon`, `due_today` i `overdue` se
  razlikuju tekstom i bojom, ne zvukom. Tri različita zvuka za rokove bi bila
  buka bez informacije.
- **`quiet_v1` nema zvuk** — glasovi za ideje i sedmični puls su prijatni, ali
  ne zaslužuju da ti prekinu razgovor. Vidiš ih kad otvoriš telefon.

---

## 4. Android — zamke

### 4.1 Zvuk je zaključan za kanal ⚠️

**Od Androida 8 (API 26), zvuk se postavlja pri kreiranju kanala i posle se ne
može promeniti iz koda.** Ako promeniš `sound` u kodu i pošalješ update, postojeći
korisnici i dalje čuju stari zvuk. Zauvek. Jedini izlaz je reinstalacija — što
niko neće da uradi.

**Rešenje: verzionisani ID-jevi od prvog dana.**

```ts
export const CHANNEL_VERSION = 1;

export const CHANNELS = [
  { id: `dm_v${CHANNEL_VERSION}`,       name: "Direktne poruke",  sound: "dm.wav",       importance: HIGH },
  { id: `mention_v${CHANNEL_VERSION}`,  name: "Pominjanja",       sound: "mention.wav",  importance: HIGH },
  { id: `channel_v${CHANNEL_VERSION}`,  name: "Poruke u kanalu",  sound: "channel.wav",  importance: DEFAULT },
  { id: `task_v${CHANNEL_VERSION}`,     name: "Zadaci",           sound: "task.wav",     importance: HIGH },
  { id: `deadline_v${CHANNEL_VERSION}`, name: "Rokovi",           sound: "deadline.wav", importance: HIGH },
  { id: `vote_v${CHANNEL_VERSION}`,     name: "Glasanja",         sound: "vote.wav",     importance: HIGH },
  { id: `quiet_v${CHANNEL_VERSION}`,    name: "Tiho",             sound: null,           importance: LOW },
] as const;
```

Kad za godinu dana poželiš drugačiji zvuk za DM:

1. `CHANNEL_VERSION = 2`
2. Aplikacija pri pokretanju obriše `*_v1` kanale i napravi `*_v2`
3. Pošalje novi `channelVersion` u `expoPushTokens`
4. Server šalje na `_v2` kanale za uređaje koji ih imaju

Bez ovoga si zaključan zauvek. **Ovo je jedina nepovratna odluka u celom
projektu.**

### 4.2 Fajlovi

- Format: `.wav` (najsigurniji), 44.1 kHz
- Lokacija: `android/app/src/main/res/raw/`
- **Ime fajla: samo mala slova, brojevi i donja crta.** `dm_soft.wav` je u redu,
  `dm-soft.wav` ili `dmSoft.wav` — Android build pukne
- Kroz Expo config plugin, bez ručnog diranja `android/` foldera:

```json
{
  "plugins": [
    ["expo-notifications", {
      "icon": "./assets/notification-icon.png",
      "color": "#0F172A",
      "sounds": [
        "./assets/sounds/dm.wav",
        "./assets/sounds/mention.wav",
        "./assets/sounds/channel.wav",
        "./assets/sounds/task.wav",
        "./assets/sounds/deadline.wav",
        "./assets/sounds/vote.wav"
      ]
    }]
  ]
}
```

### 4.3 Ostalo

- Ikona obaveštenja mora biti **potpuno bela silueta na providnoj pozadini**.
  Sve u boji Android pretvori u beli kvadrat.
- Za slanje treba FCM: `google-services.json` iz Firebase konzole →
  `eas credentials`. Ne commit-ovati u git.
- Kineski proizvođači (Xiaomi, Huawei, Oppo) agresivno ubijaju pozadinske
  procese. Treba onboarding korak koji uputi korisnika na
  „Battery optimization → Don't optimize".

---

## 5. iOS — zamke

### 5.1 Format zvuka mora biti tačan ⚠️

Fajl **mora** biti jedan od: Linear PCM, MA4, µ-law ili a-law, upakovan u
`.caf`, `.aiff` ili `.wav`. Maksimum **30 sekundi**.

**Ako format nije podržan, iOS pusti podrazumevani zvuk i ne prijavi nikakvu
grešku.** Nema loga, nema upozorenja. Ovo je poznat problem
([expo/expo#40954](https://github.com/expo/expo/issues/40954)) i najčešći razlog
zašto ljudi misle da custom zvuk „ne radi na iOS-u".

Konverzija:

```bash
ffmpeg -i izvor.wav -c:a pcm_s16le -ar 44100 -ac 1 -f caf dm.caf
```

Provera da je stvarno prošlo:

```bash
ffprobe dm.caf     # mora pisati: pcm_s16le, 44100 Hz
```

### 5.2 Ostalo

- Fajl mora biti **u bundle-u**, u root-u resursa. Referencira se **tačnim
  imenom sa ekstenzijom**: `"sound": "dm.caf"` — ne `"dm"`, ne `"sounds/dm.caf"`
- Push radi **samo na fizičkom uređaju**. Simulator ne prima remote push.
- Treba APNs ključ (`.p8`) sa `developer.apple.com` → Keys. Uneti kroz
  `eas credentials`.
- **`interruptionLevel`** (iOS 15+):
  - `passive` — bez zvuka, čeka u centru
  - `active` — normalno (podrazumevano)
  - `timeSensitive` — **probija Focus režim**; koristimo za `mention`, `deadline`, `vote`
  - `critical` — probija i silent switch, ali **traži poseban entitlement od
    Apple-a** koji se posebno traži i retko dobija. Ne računamo na njega.

### 5.3 Ograničenja koja se ne mogu zaobići

- Silent switch (fizički prekidač) gasi sve osim `critical` — nema zaobilaženja
- Ako korisnik ugasi zvuk za aplikaciju u iOS podešavanjima, gotovo
- Ne postoji zvuk kad je aplikacija u prvom planu — to moraš sam da odsviraš
  preko `expo-av`

---

## 6. Kako se pravi zvuk

### Princip

Zvuci se pamte po **konturi visine**, ne po timbru. Kroz džep, u tramvaju, sa
dva metra razdaljine — čuješ da li ton ide gore ili dole, ne čuješ da li je
marimba ili zvonce.

| Kanal | Kontura | Trajanje |
|---|---|---|
| `dm` | dva tona, dole pa gore (▁▔) — „ej" | 0.4 s |
| `mention` | tri tona uzlazno, oštro (▁▂▔) — „TI!" | 0.5 s |
| `channel` | jedan tih ton (▁) | 0.25 s |
| `task` | dva ista tona, odsečno (▔▔) — „klik-klik" | 0.35 s |
| `deadline` | dva tona, gore pa dole, duže (▔▁) — ozbiljno | 0.8 s |
| `vote` | tri tona silazno, tvrdo (▔▂▁) — „odluka" | 0.9 s |

Svi ispod 1 sekunde. Duži zvuk je iritantan posle desetog puta.

### Odakle nabaviti

1. **Napraviti** — Audacity je besplatan. Sine talas ili FM sintezа, envelope sa
   brzim napadom i kratkim opadanjem.
2. **Kupiti** — soundsnap.com, sound library-ji sa UI zvucima
3. **Besplatni** — freesound.org (proveri licencu — mora dozvoljavati komercijalnu
   upotrebu), Google Material sound library

**Ne koristiti** zvuke iz drugih aplikacija — i pravno je problem i zbunjuje
korisnika.

### Priprema fajlova

```bash
# Iz izvora u oba formata
for name in dm mention channel task deadline vote; do
  ffmpeg -i src/$name.wav -c:a pcm_s16le -ar 44100 -ac 1 \
         assets/sounds/$name.wav                  # Android
  ffmpeg -i src/$name.wav -c:a pcm_s16le -ar 44100 -ac 1 -f caf \
         assets/sounds/$name.caf                  # iOS
done
```

Normalizuj glasnoću na **-3 dB peak** da svi budu podjednako glasni. Zvuk koji
je duplo tiši od ostalih deluje kao da ne radi.

---

## 7. Korisnička podešavanja

Ekran „Obaveštenja i zvuci" (iz taba Više ili ⚙️ na Obaveštenjima):

```
┌────────────────────────────────────────┐
│  ‹  Obaveštenja i zvuci                │
├────────────────────────────────────────┤
│  CHAT                                  │
│  Direktne poruke        [▶]      [●━]  │
│  Pominjanja (@)         [▶]      [●━]  │
│  Poruke u kanalima      [▶]      [━○]  │
│                                        │
│  ZADACI                                │
│  Dodeljeni zadaci       [▶]      [●━]  │
│  Rokovi                 [▶]      [●━]  │
│  Promene statusa                 [━○]  │
│                                        │
│  TIM                                   │
│  Glasanja i odobrenja   [▶]      [●━]  │
│  Ideje                           [━○]  │
│  Sedmični puls                   [●━]  │
│                                        │
│  TIHI SATI                             │
│  Uključeno                       [●━]  │
│  Od 22:00 do 08:00                     │
│  ⓘ Rokovi i pominjanja i dalje prolaze │
│                                        │
│  [ Sistemska podešavanja telefona ]    │
└────────────────────────────────────────┘
```

`[▶]` pušta zvuk odmah — korisnik čuje šta bira.

**Tihi sati** se primenjuju na serveru (`quietHoursStart` / `quietHoursEnd` u
`expoPushTokens`), a `mention` i `deadline` ih probijaju. Vremenska zona:
koristi se već postojeći `belgradeDayKey` iz `convex/lib/notifications.ts`.

Dugme na dnu vodi u sistemska podešavanja preko `Linking.openSettings()` — jer
ako je korisnik ugasio obaveštenja na nivou OS-a, ništa u aplikaciji ne pomaže.

---

## 8. Grupisanje i brze akcije

### Grupisanje

Pet poruka iz istog kanala = jedno obaveštenje, ne pet.

- Android: `groupKey: "chat:<channelId>"`
- iOS: `threadId: "chat:<channelId>"`

### Brze akcije (`categoryId`)

| Kategorija | Akcije |
|---|---|
| `chat` | Odgovori (inline unos) · Označi pročitanim |
| `task` | Označi gotovim · Otvori |
| `vote` | Za · Protiv · Otvori |

Odgovor na poruku direktno iz obaveštenja, bez otvaranja aplikacije — to je
funkcija koju web push nikad neće imati.

### Badge

Broj na ikoni = `notifications.unreadCount` + nepročitane chat poruke, sabrano
kroz sve startupe. Ažurira se u svakom push payload-u (`badge` polje) i pri
otvaranju aplikacije.

---

## 9. Checklist za testiranje

Sve **isključivo na fizičkim uređajima**. Emulator i simulator ne važe.

**Android**

- [ ] Svih 7 kanala vidljivo u Settings → Apps → Notifications
- [ ] Svaki kanal pušta svoj zvuk kad se testira iz sistemskih podešavanja
- [ ] Zvuk radi kad je aplikacija zatvorena (swipe iz recents)
- [ ] Zvuk radi posle restarta telefona
- [ ] Grupisanje: 5 poruka iz istog kanala = jedno obaveštenje
- [ ] Brzi odgovor iz obaveštenja stiže u chat
- [ ] Badge broj tačan
- [ ] Testirano na Xiaomi ili Huawei uređaju (battery killer)
- [ ] Tap na obaveštenje otvara **tačan** ekran, ne početni

**iOS**

- [ ] Svaki zvuk se čuje (nije podrazumevani „tri-ton")
- [ ] `timeSensitive` probija Focus režim
- [ ] Zvuk radi kad je aplikacija force-quit-ovana
- [ ] `threadId` grupiše po razgovoru
- [ ] Brzi odgovor radi sa lock screena
- [ ] Badge broj tačan
- [ ] Silent switch gasi zvuk (očekivano ponašanje)
- [ ] Tap otvara tačan ekran

**Oba**

- [ ] Tihi sati poštovani, `mention` i `deadline` prolaze
- [ ] Isključen tip obaveštenja stvarno ne stiže
- [ ] Token se osvežava posle reinstalacije
- [ ] `dedupeKey` sprečava dupli push za isti događaj
- [ ] Deinstalacija → token se čisti posle `failureCount` praga

---

## 10. Redosled implementacije

1. `expoPushTokens` tabela + registracija tokena
2. `convex/expoPush.ts` — slanje, batch, obrada grešaka
3. Grana u `createNotification` ka `expoPush.deliver`
4. **Katalog kanala — zaključati pre bilo kog builda** (sekcija 3)
5. Zvučni fajlovi napravljeni i konvertovani u oba formata
6. Kreiranje kanala pri pokretanju aplikacije
7. Rutiranje na tap (`data.targetType` → ekran)
8. Ekran podešavanja + tihi sati
9. Grupisanje i brze akcije
10. Testiranje po checklisti iz sekcije 9
