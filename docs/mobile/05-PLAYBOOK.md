# Playbook — promptovi, modeli, režimi

> Korak po korak od prve komande do App Store-a. Za svaki korak: **koji model**,
> **koji effort**, **koji režim**, i **tačan prompt** za copy-paste.
>
> Promptovi su pisani da se oslanjaju na dokumente iz `docs/mobile/` — zato su
> kratki. Claude pročita dokument i ima ceo kontekst, umesto da mu ga ti
> prepričavaš svaki put.

---

## DEO A — Kako se bira model, effort i režim

### A0. ⚡ Profil „bez štednje" — ovo gazi sve tabele ispod

Ako ti cena nije ograničenje, ne čitaj ostatak Dela A. Radi ovako:

```
/model          → izaberi Opus 4.8 iz liste (NE kucaj `opus`, taj alias vodi na Opus 5)
/effort xhigh
```

I to je to za 90% koraka. `xhigh` ostaje uključen kroz celu sesiju.

**Kada dižeš na `max`** — samo četiri mesta u celom projektu, plus zaglavljivanje:

| Korak | Zašto |
|---|---|
| 0.1 Monorepo refaktor | Dira živi deploy |
| 1.1 Chat schema | Skupo za menjanje kasnije |
| 1.8 Kanali i zvuci | **Nepovratno** na Androidu |
| 3.2 Editor prototip | Najteži tehnički deo |
| Bilo šta zaglavljeno posle 2 pokušaja | Očigledno |

**Kada spuštaš na `high`** — nikad, osim ako ti se ne čeka. `xhigh` je sladak
spot; `max` na mehaničkom poslu te samo usporava.

> ⚠️ **`max` svuda te čini sporijim, ne bržim.** Rekao si da hoćeš što pre —
> to je wall-clock, ne tokeni. Na prekucavanju JSX-a `max` misli minut i po
> duže za isti rezultat. Novac ti ne fali, ali vreme fali.

**Šta ostaje isto bez obzira na profil:** plan mode pre svakog većeg zahvata i
`/clear` između koraka. To nisu mere štednje — to je da ti ne razvali repo i da
kvalitet ne padne na trećem koraku.

**Jedini izuzetak koji bih probao:** korak 0.1 (monorepo refaktor) pusti jednom
na **Fable 5 / `max`**. Taj korak je tačno profil za koji je Fable pravljen —
dugo istraživanje pre prve izmene, preko celog repoa. Ako ti se ne dopadne
rezultat, `/rewind` i vrati se na 4.8. Košta te 20 minuta da saznaš.

---

### A1. Modeli

| Alias | Model | Kada |
|---|---|---|
| `fable` | Fable 5 | Najjači. Dugačke sesije, istraživanje pre akcije, teški refaktori |
| `opus` | Opus 5 | Arhitektura, schema, nepovratne odluke, debug teških bagova |
| `sonnet` | Sonnet 5 | **Radni konj.** Pisanje koda po odobrenom planu, UI, testovi |
| `haiku` | Haiku 4.5 | Sitnice — preimenovanje, formatiranje, mehaničke izmene |
| `opusplan` | Opus planira → Sonnet izvršava | **Za tebe najkorisniji.** Vidi A4 |
| `sonnet[1m]` | Sonnet, 1M konteksta | Kad treba da pročita ceo `areasV2.ts` (120 KB) i još pola repoa |

Menja se sa `/model`, ili `/model sonnet` direktno.

### A2. Reasoning effort

Nivoi: `low` · `medium` · `high` (podrazumevano) · `xhigh` · `max`

```
/effort high        # postavi za sesiju
/effort             # otvori meni
```

Trajno u `settings.json`: `"effortLevel": "high"`.

| Effort | Kada |
|---|---|
| `low` | Mehanički posao. Preimenuj, prevedi, formatiraj |
| `medium` | Rutinski UI ekran po specifikaciji koja već postoji |
| `high` | **Podrazumevano.** Skoro sve |
| `xhigh` | Nepovratne odluke, schema, teški bagovi, monorepo refaktor |
| `max` | Zaglavio si posle dva pokušaja. Skupo — nemoj kao default |

**`ultrathink`** je nešto drugo: reč koju ubaciš u sam prompt za jednokratno
dublje razmišljanje. Ne menja podešavanje sesije.

```
ultrathink: zašto unread badge ostaje na 1 posle čitanja?
```

### A3. Režimi dozvola (`Shift+Tab` ciklus)

```
Manual  →  Accept Edits  →  Plan  →  (Bypass)  →  (Auto)
```

| Režim | Šta radi | Kada |
|---|---|---|
| **Manual** | Pita za svaku akciju | Kad prvi put diraš nešto osetljivo |
| **Accept Edits** | Automatski prihvata izmene fajlova | Kad je plan odobren i samo se izvršava |
| **Plan** | **Ne dira fajlove.** Čita, istražuje, napiše plan, čeka odobrenje | Pre svakog većeg zahvata |

### A4. `opusplan` — zašto je baš za tvoj slučaj

```
/model opusplan
```

Opus razmišlja u plan modu, Sonnet piše kod kad odobriš plan. Dobiješ Opus
kvalitet odluka po Sonnet ceni izvršenja. Za projekat od 15 nedelja to je
ozbiljna razlika.

**Ovo neka ti bude podrazumevani model kroz ceo projekat.** Prebacuj se na
`opus` ili `fable` samo za korake gde ovaj dokument to izričito kaže.

### A5. Plan mode vs `/goal` vs Ultraplan

Tri različite stvari, često se brkaju:

| | Šta radi | Kad |
|---|---|---|
| **Plan mode** | Istraži → napiše plan → **ti odobriš** → izvršava | Pre svake izmene koja dira više fajlova |
| **`/goal`** | Radi u petlji **sam**, dok uslov ne bude ispunjen | „Dok `npm run check` ne prođe" |
| **Ultraplan** | Planira u cloudu, ti komentarišeš plan u browseru | Veliki zahvati gde hoćeš da komentarišeš pojedine delove plana |

**Uslov ide do 4000 znakova.** To je otprilike stranica i po teksta — dovoljno da
napišeš celu listu prijema, ne samo jednu rečenicu. Iskoristi to: što je uslov
precizniji, to evaluator manje improvizuje.

Kratka verzija, za rutinske korake:

```
/goal npm run check izlazi sa kodom 0 i svi testovi u chat.test.ts su zeleni
```

Duga verzija, za korake gde stvarno hoćeš da te pusti da odeš od računara:

```
/goal Zadatak je gotov kad je SVE ispod tačno:

1. `npm run check` izvršen i izlazi sa kodom 0 — bez TypeScript grešaka i bez
   ESLint upozorenja.
2. `npx vitest run packages/backend/convex/chat.test.ts` izvršen, svi testovi
   prolaze, nijedan nije preskočen (skipped) ni označen kao todo.
3. Test fajl pokriva svih šest scenarija: član ne može da čita tuđi DM; thread
   nasleđuje dozvole od zadatka; unread se NE povećava autoru poruke;
   markChannelRead nulira i unreadCount i mentionCount; openDirectMessage vraća
   isti kanal bez obzira koji od dvoje korisnika ga prvi pozove; lazy thread se
   pravi tek pri prvoj poruci, ne unapred.
4. `npx convex dev --once` izvršen bez greške — schema se primenjuje čisto.
5. Nijedna funkcija u chat.ts nije ostala bez `returns` validatora — provereno i
   pokazano u transkriptu.

Ako neki od ovih koraka ne prolazi, popravi kod i pokreni ponovo. Ne menjaj
test da bi prošao — popravi implementaciju.
```

Poslednja rečenica je bitna. Bez nje petlja ume da „ispuni uslov" tako što
oslabi test.

### Kako se piše uslov koji radi

Evaluator (Haiku) sudi **isključivo po onome što je Claude pokazao u
transkriptu**. Ne pokreće komande sam, ne otvara fajlove.

| ✅ Dokazivo | ❌ Nedokazivo |
|---|---|
| `npm run check izlazi sa kodom 0` | `kod je čist` |
| `ekran je otvoren i screenshot priložen` | `UI izgleda dobro` |
| `svih 6 testova prolazi, ispis priložen` | `pokriveni su ivični slučajevi` |
| `git diff pokazuje izmene samo u apps/mobile` | `nije ništa pokvareno` |

Zato u uslov piši **„izvršeno i izlaz pokazan"**, ne samo „radi".

Zaustavljanje: `/goal clear` ili `Ctrl+C`. Status: `/goal` bez argumenata.

> ⚠️ `/goal` + Accept Edits znači da Claude radi sam, u petlji, i menja fajlove
> bez pitanja. Pusti to samo kad si na zasebnoj grani i kad postoji checkpoint.

### A6. Zlatno pravilo

> **Plan mode + Opus za odluku. Accept Edits + Sonnet za izvršenje.**
>
> Nikad ne puštaj Sonnet da sam odlučuje o schemi.
> Nikad ne plaćaj Opus da prekucava JSX po gotovoj specifikaciji.

---

## DEO B — Priprema (uradi jednom, pre svega)

### B1. Ažuriraj `CLAUDE.md`

Tvoj `CLAUDE.md` već radi `@AGENTS.md`. Dodaj mobilni kontekst.

```
/model sonnet
/effort medium
```

> Pročitaj `docs/mobile/00-PLAN.md`. Dopuni `CLAUDE.md` sekcijom „Mobilna
> aplikacija" koja ukratko opisuje: da je backend deljen između `apps/web` i
> `apps/mobile`, da se `convex/` nikad ne menja samo zbog mobilnog bez provere
> da web i dalje radi, i da su detaljni planovi u `docs/mobile/`. Dodaj
> `@docs/mobile/00-PLAN.md` import. Maksimum 20 redova — `CLAUDE.md` se učitava
> u svaku sesiju, ne pretrpavaj ga.

### B2. Pravila po tipu fajla

```
/model sonnet
/effort medium
```

> Napravi `.claude/rules/mobile.md` sa `paths: ["apps/mobile/**"]` u
> frontmatteru. Sadržaj: konvencije za React Native u ovom projektu — NativeWind
> umesto Tailwind klasa direktno, `expo-router` file-based rute, `npx expo
> install` umesto `npm install`, minimalna dodirna meta 44pt, obavezan safe
> area, `react-native-reanimated` umesto Framer Motion. Kratko i konkretno.
>
> Napravi i `.claude/rules/convex.md` sa `paths: ["packages/backend/**"]` koji
> podseća da se pre pisanja Convex koda čita
> `convex/_generated/ai/guidelines.md`, da svaka funkcija ima `returns`
> validator, i da provera pristupa uvek ide kroz `requireStartupMember`.

### B3. Subagenti

Napravi tri, u `.claude/agents/`. Ovo se isplati — svaki radi u svom kontekstu i
ne troši tvoj glavni.

**`.claude/agents/convex-review.md`**

```markdown
---
description: Proverava Convex funkcije pre commit-a — validatore, indekse, provere pristupa, N+1 čitanja. Koristi posle svake izmene u packages/backend/convex.
model: opus
effort: high
tools: [Read, Grep, Glob, Bash]
---

Ti si recenzent Convex koda za ovaj projekat.

Za svaku izmenjenu funkciju proveri:
1. Ima li `args` i `returns` validator
2. Ide li provera pristupa kroz `requireStartupMember` / `requireProfile` /
   `requireAdmin` iz `convex/lib/auth.ts`
3. Koristi li `.withIndex()` umesto `.filter()` na velikim tabelama
4. Postoji li odgovarajući indeks u `schema.ts`
5. Ima li čitanja u petlji koja bi trebalo da budu jedan upit
6. Poštuje li limite iz `convex/lib/validators.ts`

Vrati listu nalaza, najozbiljniji prvi. Ako nema problema, reci to jasno.
Ne menjaj kod — samo prijavi.
```

**`.claude/agents/rn-review.md`**

```markdown
---
description: Pregleda React Native ekrane — dodirne mete, safe area, tastatura, prazna stanja, pristupačnost. Koristi posle svakog novog mobilnog ekrana.
model: sonnet
effort: high
tools: [Read, Grep, Glob]
---

Ti si recenzent React Native UI koda.

Proveri:
1. Dodirne mete minimum 44x44 pt
2. Safe area gore i dole (notch, home indicator)
3. `KeyboardAvoidingView` gde postoji unos teksta
4. Prazno, učitavanje i greška — sva tri stanja
5. Osnovni tekst minimum 16px
6. `accessibilityLabel` na ikonicama bez teksta
7. Da se poštuje `AccessibilityInfo.isReduceMotionEnabled`
8. Da se ne koriste web-only API-ji (localStorage, window, document)

Vrati konkretne nalaze sa brojem linije. Ne menjaj kod.
```

**`.claude/agents/mobile-planner.md`**

```markdown
---
description: Razbija fazu iz docs/mobile na konkretne korake pre implementacije. Koristi na početku svake nove faze.
model: opus
effort: xhigh
tools: [Read, Grep, Glob]
---

Pročitaj relevantne dokumente iz `docs/mobile/` i postojeći kod.

Vrati plan implementacije: redosled fajlova, šta svaki radi, koje Convex
funkcije zove, koji su rizici i šta se testira. Bez pisanja koda.

Budi konkretan sa imenima fajlova i funkcija. Ako ti nešto u dokumentu nije
jasno ili je u koliziji sa postojećim kodom, prijavi to umesto da pretpostaviš.
```

Provera: `/agents` treba da ih prikaže sva tri.

### B4. Higijena duge sesije

| Komanda | Kada |
|---|---|
| `/context` | Na svakih sat vremena — vidiš koliko je konteksta zauzeto |
| `/compact` | Kad `/context` pređe ~70%, a još si u istom zadatku |
| `/clear` | **Između koraka.** Nov korak = nova sesija |
| `Esc` `Esc` → `/rewind` | Kad nešto pukne — vrati kod i razgovor na checkpoint |
| `/resume` | Vrati se na raniju sesiju |

**Najvažnije pravilo cele sesije:** `/clear` između koraka iz Dela C. Svaki korak
je zaseban zadatak. Ako ne čistiš, do trećeg koraka Claude vuče 100k tokena
nebitnog konteksta i kvalitet pada.

---

## DEO C — Korak po korak

Format svakog koraka:

```
▸ Model · Effort · Režim
  Prompt
```

---

## FAZA 0 — Temelj (1 nedelja)

### 0.1 Monorepo refaktor ⚠️

Najrizičniji korak u projektu — dira živi deploy. Zato Opus i `xhigh`.

```
/clear
/model opus
/effort xhigh
Shift+Tab → Plan mode
```

> Pročitaj `docs/mobile/00-PLAN.md` sekciju 3.
>
> Napravi plan za prelazak ovog repozitorijuma na npm workspaces monorepo:
> Next.js aplikacija ide u `apps/web`, Convex backend u `packages/backend`,
> priprema se prazan `apps/mobile`.
>
> Plan mora da pokrije: sve `tsconfig.json` path aliase, `convex.json`,
> `.github` workflow-e, `.vercel` konfiguraciju, `vitest.config.ts`, `next.config.ts`,
> i `.claude/skills` ako referenciraju putanje. Posebno naglasi šta moram
> **ručno** da promenim u Vercel dashboard-u i u Convex podešavanjima.
>
> Ne menjaj ništa dok ne odobrim plan.

Kad odobriš — pre izvršenja napravi granu:

```bash
git checkout -b monorepo-refactor
```

Posle izvršenja, verifikacija:

```
/goal npm run check prolazi bez greške, npx convex dev --once prolazi bez greške, i `npm run build` u apps/web uspešno završi
```

> ⚠️ Ne merge-uj dok ne testiraš pun deploy sa grane. Ako pukne — `/rewind`.

### 0.2 Expo skelet

```
/clear
/model sonnet
/effort medium
Shift+Tab Shift+Tab → Accept Edits
```

> Pročitaj `docs/mobile/01-SETUP-WINDOWS.md` korake 3–4.
>
> Napravi Expo aplikaciju u `apps/mobile` sa expo-router i TypeScript-om.
> Instaliraj pakete iz koraka 3 dokumenta, isključivo preko `npx expo install`.
> Podesi NativeWind. Napravi `eas.json` tačno kao u koraku 5 dokumenta.
>
> Postavi `app.json`: ime aplikacije, slug, bundle identifier
> `com.PROMENI.notionclone`, ikona i splash placeholder.
>
> Na kraju mi reci šta ja treba ručno da uradim (Expo nalog, `eas login`).

### 0.3 Convex i auth na mobilnom

```
/clear
/model opus
/effort high
Shift+Tab → Plan mode
```

> Pročitaj `docs/mobile/01-SETUP-WINDOWS.md` korak 8 i `packages/backend/convex/auth.ts`.
>
> Napravi plan za povezivanje `apps/mobile` sa Convex-om: `ConvexReactClient`,
> `ConvexAuthProvider` sa `expo-secure-store` kao skladištem, ekran prijave,
> i deep link koji hvata pozivnicu (`invites.ts`) i vodi na registraciju.
>
> Posebno mi objasni kako Convex Auth flow radi na React Native u odnosu na web
> — gde je razlika i šta može da zezne.

### 0.4 Dizajn tokeni

```
/clear
/model sonnet
/effort medium
Accept Edits
```

> Pročitaj `apps/web/app/globals.css` i `docs/mobile/02-EKRANI.md` sekciju 11.
>
> Prenesi dizajn tokene u `apps/mobile`: `tailwind.config.js` sa istim bojama,
> radijusima i tipografskom skalom, plus svetla i tamna tema. Napravi
> `useColorScheme` hook koji podržava svetlo / tamno / sistemsko.
>
> Napravi osnovne primitive u `apps/mobile/components/ui/`: Button, Card, Input,
> Badge, Avatar, Skeleton — po uzoru na `apps/web/components/ui/`, ali native.

### 0.5 Tab navigacija

```
/clear
/model sonnet
/effort medium
Accept Edits
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekcije 2 i 3.
>
> Napravi navigacionu strukturu sa expo-router: `(auth)` i `(app)` grupe, pet
> tabova (Danas, Prostor, Chat, Obaveštenja, Više), header sa startup
> switcher-om koji čita `startups.listForCurrent`.
>
> Ekrani neka budu prazni placeholder-i sa naslovom. Cilj je da navigacija radi
> i da se vidi lista mojih startupa.

**✅ Faza 0 gotova kad:** uloguješ se na telefonu i vidiš svoje startupe.

---

## FAZA 1 — Chat i notifikacije (3 nedelje)

### 1.1 Chat schema ⚠️

Schema je skupa za menjanje kasnije. Zato `fable` i `xhigh`.

```
/clear
/model fable
/effort xhigh
Shift+Tab → Plan mode
```

> Pročitaj `docs/mobile/04-CHAT.md` u celosti, pa `packages/backend/convex/schema.ts`.
>
> Napravi plan za dodavanje pet chat tabela. Pre nego što napišeš plan,
> proveri da li se predloženi indeksi zaista poklapaju sa upitima iz sekcije 8
> dokumenta, i da li denormalizacija u `chatChannels` pokriva listu razgovora
> bez N+1 čitanja.
>
> Ako nađeš grešku ili propust u dokumentu — reci mi to umesto da ga slepo
> slediš. Dokument je nacrt, ne zakon.

Posle odobrenja i izvršenja:

```
@convex-review proveri nove chat tabele i indekse
```

### 1.2 Chat backend

```
/clear
/model opusplan
/effort high
Plan mode
```

> Pročitaj `docs/mobile/04-CHAT.md` sekcije 3–8.
>
> Implementiraj `packages/backend/convex/chat.ts`: upite `listChannels`,
> `messages`, `channelForAnchor`, `unreadSummary`, i mutacije `sendMessage`,
> `sendToAnchor`, `markChannelRead`, `openDirectMessage`, `toggleReaction`.
>
> Kritično: `requireChannelAccess` iz sekcije 3, lazy kreiranje threada iz
> sekcije 4, i inkrementalni unread iz sekcije 5. Ne izmišljaj drugi model
> dozvola — sve ide kroz postojeći `requireStartupMember`.

### 1.3 Testovi za chat

```
/clear
/model sonnet
/effort high
Accept Edits
```

> Pogledaj kako su pisani `packages/backend/convex/tasks.test.ts` i
> `notifications.test.ts`, pa napiši `chat.test.ts` u istom stilu.
>
> Pokrij: član ne može da čita tuđi DM, thread nasleđuje dozvole od zadatka,
> unread se ne povećava autoru, `markChannelRead` nulira brojač,
> `openDirectMessage` vraća isti kanal bez obzira ko ga zove prvi, lazy thread
> se pravi tek pri prvoj poruci.

```
/goal svi testovi u packages/backend/convex/chat.test.ts prolaze i npm run check izlazi bez greške
```

### 1.4 Migracija kanala

```
/clear
/model sonnet
/effort high
Plan mode
```

> Pročitaj `docs/mobile/04-CHAT.md` sekciju 9 i postojeće migracije u
> `packages/backend/convex/migrations.ts`.
>
> Napiši migraciju koja za svaki aktivan startup pravi kanal po oblasti i
> `chatReads` red za svakog člana. Idempotentna — ponovno pokretanje ne sme da
> napravi duplikate.

### 1.5 Lista razgovora

```
/clear
/model sonnet
/effort medium
Accept Edits
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 6.
>
> Napravi Chat tab: tri segmenta (Kanali / Direktne / Praćeno), lista sa
> poslednjom porukom, vremenom i unread badge-om. Podaci iz `chat.listChannels`
> i `chat.listDirectMessages`.

### 1.6 Ekran razgovora

```
/clear
/model sonnet
/effort high
Accept Edits
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 6 i `04-CHAT.md` sekciju 7.
>
> Napravi ekran razgovora: obrnuta `FlatList`, mehurići grupisani po autoru,
> separatori po danu, `usePaginatedQuery` sa učitavanjem pri skrolu **nagore**,
> optimistički unos, svajp desno za odgovor, long-press za reakcije.
>
> Za threadove header nosi kontekst entiteta i vodi na njega.
>
> Obrati pažnju na tastaturu — unos mora da ostane vidljiv.

```
@rn-review pregledaj ekran razgovora
```

### 1.7 Expo push infrastruktura

```
/clear
/model opus
/effort high
Plan mode
```

> Pročitaj `docs/mobile/03-NOTIFIKACIJE.md` sekciju 2, pa
> `packages/backend/convex/push.ts`, `pushSubscriptions.ts` i
> `lib/notifications.ts`.
>
> Napravi plan za `expoPushTokens` tabelu i `expoPush.ts` akciju, i za granu u
> `createNotification` koja šalje i na Expo pored postojećeg web push-a.
>
> Web push mora da nastavi da radi netaknut. Objasni mi gde tačno u
> `createNotification` ide nova grana i zašto baš tu.

### 1.8 Kanali i zvuci ⚠️ NEPOVRATNO

Jedina odluka u projektu koja se ne može opozvati. `xhigh`, plan mode, bez žurbe.

```
/clear
/model opus
/effort xhigh
Plan mode
```

> Pročitaj `docs/mobile/03-NOTIFIKACIJE.md` sekcije 3, 4 i 5.
>
> ⚠️ Android zaključava zvuk za notification channel pri kreiranju. Ovo je
> nepovratno za postojeće instalacije.
>
> Napravi plan za: konstantu `CHANNEL_VERSION`, katalog od sedam kanala sa
> verzionisanim ID-jevima, kreiranje kanala pri pokretanju aplikacije, brisanje
> starih verzija, i upis `channelVersion` u `expoPushTokens`.
>
> Pre plana, preispitaj katalog iz sekcije 3 — da li je sedam kanala prava
> granularnost, i da li je mapiranje 13 tipova na 7 kanala smisleno. Reci mi
> ako bi nešto promenio.
>
> Takođe: `expo-notifications` config plugin u `app.json` sa `sounds` nizom,
> i tačan format za oba OS-a.

**Zvučne fajlove pripremaš ti**, ne Claude. Sekcija 6 dokumenta ima `ffmpeg`
komande i opis karaktera svakog zvuka.

### 1.9 Rutiranje na tap

```
/clear
/model sonnet
/effort high
Accept Edits
```

> Kad korisnik tapne obaveštenje, `data.targetType` i `data.targetId` treba da
> otvore tačan ekran. Tipovi su `page`, `ideas`, `approvals`, `puls` i novi
> `chat` — vidi `convex/lib/validators.ts`.
>
> Implementiraj rutiranje, uključujući slučaj kad je aplikacija bila potpuno
> zatvorena (cold start iz obaveštenja).

### 1.10 Ekran podešavanja obaveštenja

```
/clear
/model sonnet
/effort medium
Accept Edits
```

> Pročitaj `docs/mobile/03-NOTIFIKACIJE.md` sekciju 7. Napravi ekran
> „Obaveštenja i zvuci" sa prekidačima po tipu, dugmetom za probu zvuka,
> tihim satima, i linkom ka sistemskim podešavanjima preko `Linking.openSettings()`.
>
> Tihi sati se primenjuju na serveru — dodaj i to u `expoPush.ts`.

**✅ Faza 1 gotova kad:** tim priča kroz aplikaciju i svako zna po zvuku šta je
stiglo. Prođi checklist iz sekcije 9 dokumenta o notifikacijama, na fizičkim
uređajima.

---

## FAZA 2 — Zadaci (2 nedelje)

Odavde je ritam ustaljen: `opusplan` + `high` + plan mode za svaki ekran.

### 2.1 Danas

```
/clear
/model opusplan
/effort high
Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 4 i
> `apps/web/components/workspace/command-center-view.tsx`.
>
> Napravi tab Danas: segmenti Pregled / Moji zadaci, grupisanje po prekoračeno /
> danas / sledeće / blokirano, kartice zadataka sa svajp gestovima (desno =
> done sa haptikom, levo = meni).
>
> Bez kanbana — svajp lista, kako dokument opisuje.

### 2.2 Detalj zadatka

```
/clear
/model opusplan
/effort high
Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.2.
>
> Napravi ekran detalja zadatka: status, prioritet, rok, izvršioci (max 10),
> instrukcije, checkpointi sa progresom (max 100), i link na thread diskusije iz
> chata. Checkpoint tap = odmah toggle + haptika, bez dugmeta za čuvanje.

### 2.3 Puls

```
/clear
/model sonnet
/effort medium
Accept Edits
```

> Pročitaj `apps/web/components/workspace/puls-view.tsx` i `convex/puls.ts`.
> Napravi mobilnu verziju sedmičnog pulsa, sa navigacijom kroz nedelje.

---

## FAZA 3 — Stranice (3 nedelje)

### 3.1 Stablo i lista

```
/clear
/model opusplan
/effort high
Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 5. Napravi tab Prostor:
> nivo oblasti, pa lista stranica sa ikonom po `kind`, pa ugnježdene stranice sa
> breadcrumb-om. Nazad koristi logiku iz `workspace-route.ts` (`pageBackRoute`).

### 3.2 Editor ⚠️ najteži korak faze

```
/clear
/model fable
/effort xhigh
Plan mode
```

> Pročitaj `docs/mobile/00-PLAN.md` sekciju 5.1 i
> `apps/web/components/rich-text-editor.tsx` u celosti.
>
> Napravi plan za mobilni editor preko `@10play/tentap-editor`: kako se
> postojeće Tiptap ekstenzije (`starter-kit`, `extension-table`,
> `extension-list`) pakuju u web bundle za WebView, kako ide bridge u oba smera,
> i kako se zadržava postojeći autosave sa `revision` konflikt-zaštitom iz
> `pages.ts`.
>
> Prvo mi napravi **minimalan prototip** samo sa bold/italic/liste, da izmerimo
> performanse pre nego što uložimo u pun editor. Ne kreni na kompletnu
> implementaciju odmah.

### 3.3 Tabele i prilozi

```
/clear
/model sonnet
/effort high
Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.4 i `convex/pageTables.ts`,
> `pageFiles.ts`. Napravi pregled tabele sa zamrznutom prvom kolonom i
> editovanjem ćelije kroz bottom sheet, plus upload priloga iz galerije i kamere.

### 3.4 Pretraga

```
/clear
/model sonnet
/effort medium
Accept Edits
```

> `convex/search.ts` + `search-dialog.tsx` → mobilni ekran pretrage preko celog
> ekrana, sa rezultatima grupisanim po tipu.

---

## FAZA 4 — Odobrenja i canvasi (2 nedelje)

### 4.1 Odobrenja

```
/clear
/model opusplan
/effort high
Plan mode
```

> Pročitaj `apps/web/components/workspace/approvals-view.tsx` (28 KB) i
> `convex/collaboration.ts`. Napravi mobilni ekran odobrenja: deletion ballots,
> nesting requests, glasanje. Ovo je ekran gde je mobilni **bolji** od desktopa
> — glasa se u pokretu, pa neka bude brz i jasan.

### 4.2 Embed rute za canvas

```
/clear
/model opus
/effort high
Plan mode
```

> Pročitaj `docs/mobile/00-PLAN.md` sekciju 5.2 i postojeće preview rute u
> `apps/web/app/canvas-preview/`, `codex-ideas-preview/`,
> `codex-thought-flow-preview/`.
>
> Napravi plan za `/embed/canvas/[kind]/[id]` rutu: bez sidebara i chrome-a,
> autentikacija tokenom, touch-friendly kontrole, i `postMessage` protokol
> definisan u dokumentu.

### 4.3 Mobilni canvas ekran

```
/clear
/model sonnet
/effort high
Accept Edits
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.3. Napravi full-screen ekran sa
> native headerom, `react-native-webview` u sredini i native akcionim rail-om.
> Tap na node otvara native bottom sheet sa detaljem.
>
> Pazi na sudar gestova: WebView uzima pan i zoom, native zadržava swipe-back.

### 4.4 Ideje i admin

```
/clear
/model sonnet
/effort medium
Accept Edits
```

> Napravi ekran Ideje (lista + glasanje native, canvas kroz WebView iz 4.3) i
> admin ekrane: članovi (`startups.listMembers`) i pozivnice (`invites.ts`),
> vidljive samo za `role === "admin"`.

---

## FAZA 5 — Mobilne supermoći (2 nedelje)

```
/clear
/model opusplan
/effort high
Plan mode
```

Jedan po jedan, svaki kao zaseban korak sa `/clear` između:

> Glasovna beleška: `expo-av` snimanje, upload u Convex storage, transkript, pa
> kreiranje `ideaNodes` zapisa. Dugme u FAB meniju i kao brza akcija.

> Share sheet: registruj aplikaciju kao share target na oba OS-a. Podeljen
> tekst ili link postaje nova ideja ili zadatak, uz izbor startupa.

> Kamera: `expo-camera` → slika → prilog na stranici ili nova stranica sa slikom.

> Home screen widget sa današnjim zadacima. Napomena: widget je native kod
> (WidgetKit na iOS, Glance na Androidu) — objasni mi obim posla pre nego što
> kreneš.

> Biometrija: `expo-local-authentication` kao brava pri otvaranju, opciono u
> podešavanjima.

> Haptika: `expo-haptics` na završetku zadatka, slanju poruke, svajpu.

---

## FAZA 6 — Izlazak (2 nedelje)

### 6.1 Ikone i grafika

```
/clear
/model sonnet
/effort medium
```

> Napravi plan za sve grafičke resurse: ikona aplikacije u svim potrebnim
> veličinama, adaptivna ikona za Android, splash, **monohromatska bela ikona za
> obaveštenja**, screenshotovi za obe prodavnice. Reci mi tačno koje dimenzije
> mi trebaju i šta moram sam da nacrtam.

### 6.2 Provera pred izlazak

```
/clear
/model fable
/effort xhigh
```

> Pročitaj sve iz `docs/mobile/`. Prođi kroz `apps/mobile` i napravi izveštaj:
> šta iz planiranog nije implementirano, gde nedostaju prazna stanja ili obrada
> grešaka, gde nema `accessibilityLabel`, gde bi aplikacija pukla bez mreže, i
> šta bi moglo da izazove odbijanje u App Store review-u.
>
> Ne popravljaj — samo prijavi, sortirano po ozbiljnosti.

### 6.3 Build i submit

```
/clear
/model sonnet
/effort medium
```

> Pročitaj `docs/mobile/01-SETUP-WINDOWS.md` korak 9. Vodi me kroz production
> build i submit za obe platforme, korak po korak. Reci mi tačno šta ja kucam,
> a šta ti radiš.

---

## DEO D — Kad zapne

| Situacija | Šta uraditi |
|---|---|
| Isti bag dva puta nepopravljen | `/clear`, pa `/model fable`, `/effort max`, i opiši bag **od nule** — bez istorije neuspelih pokušaja |
| Claude menja fajlove koje nisi tražio | Prebaci na Manual mode. Suzi prompt na jedan fajl |
| Odgovori postali plitki | `/context` — verovatno si preko 70%. `/compact` ili `/clear` |
| Nešto je puklo posle izmene | `Esc` `Esc` → `/rewind` na checkpoint pre izmene |
| Ne razumeš zašto nešto ne radi | `ultrathink: ` + opis. Jednokratno, bez menjanja efforta |
| Veliki refaktor, hoćeš da komentarišeš plan po delovima | `/ultraplan <opis>` — planira u cloudu, ti komentarišeš u browseru |
| Petlja „radi dok ne prođe" | `/goal <merljiv uslov>`. Uslov mora biti dokaziv iz transkripta |

---

## DEO E — Šta raditi svaki dan

```bash
# Terminal 1
npx convex dev

# Terminal 2
cd apps/mobile && npx expo start --dev-client

# Terminal 3
claude
```

U Claude sesiji:

```
/model opusplan
/effort high
```

Pa jedan korak iz Dela C. Kad korak završi:

1. `@convex-review` ako je diran backend
2. `@rn-review` ako je diran mobilni ekran
3. `npm run check`
4. Test na fizičkom telefonu — **ne samo na emulatoru**
5. Commit
6. `/clear` pre sledećeg koraka

---

## Rezime u jednoj tabeli

**Profil „bez štednje" (A0) — ovo koristi:**

| Tip posla | Model | Effort | Režim |
|---|---|---|---|
| Monorepo refaktor (0.1) | Opus 4.8 *(probaj Fable 5)* | `max` | Plan |
| Chat schema (1.1) | Opus 4.8 | `max` | Plan |
| Kanali i zvuci (1.8) ⚠️ | Opus 4.8 | `max` | Plan |
| Editor prototip (3.2) | Opus 4.8 | `max` | Plan |
| Backend funkcije | Opus 4.8 | `xhigh` | Plan |
| Složen ekran (chat, editor) | Opus 4.8 | `xhigh` | Plan |
| Nov ekran po specifikaciji | Opus 4.8 | `xhigh` | Accept Edits |
| Testovi | Opus 4.8 | `xhigh` | Accept Edits + `/goal` |
| Preimenovanje, formatiranje | Opus 4.8 | `high` | Accept Edits |
| Zaglavljeno posle 2 pokušaja | Opus 4.8 | `max` | Manual |
| Finalna revizija pred izlazak (6.2) | Opus 4.8 | `max` | Plan |

Ignoriši `sonnet`, `haiku` i `opusplan` gde god se pominju u koracima iz Dela C —
to su preporuke za profil sa vođenjem računa o ceni.
