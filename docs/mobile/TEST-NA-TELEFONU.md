# Testiranje na telefonu

> ⚠️ **Ispravka (avgust 2026).** Ranija verzija ovog dokumenta je tvrdila da za
> Fazu 0 možeš da testiraš na iPhone-u preko Expo Go bez Apple naloga. **To više
> ne važi.**
>
> Od maja 2026. Expo Go na App Store-u je zamrznut na **SDK 54** — verzija za
> SDK 55 je zapela na Apple odobrenju bez roka. Ovaj projekat je na **SDK 57**.
> Te dve verzije se nikad neće sresti.
>
> Expo sada Expo Go zvanično tretira kao „alat za učenje" i za sve ostalo
> upućuje na development build.

---

## Tri puta — izaberi jedan

| Put | Košta | Vreme | Radi za |
|---|---|---|---|
| **A. Android** | 0 din | odmah | Faze 0–4 |
| **B. iOS development build** | $99/god | 24–48h za nalog | sve, uključujući zvuke |
| **C. `eas go`** | $99/god | isto kao B | isto što i Expo Go, ali ličan |

---

## A. Android — jedini besplatan način, radi odmah

Expo Go za SDK 57 **postoji za Android**. Play Store nije zapeo kao App Store.

Tokeni, navigacija i ekrani se ne razlikuju po platformi — ono što potvrdiš na
Androidu važi i za iOS. Ovo je najbrži način da vidiš da li Faza 0 radi.

### Na fizičkom Android telefonu

1. Otvori `https://expo.dev/go?sdkVersion=57&platform=android&device=true`
2. Skini APK odatle (ne iz Play Store-a — tamo je druga verzija)
3. Instaliraj, dozvoli instalaciju iz nepoznatog izvora
4. `npx expo start` na PC-u, skeniraj QR

### Na emulatoru

Ako imaš Android Studio iz koraka 2 setup vodiča:

```bash
cd apps/mobile
npx expo start
# pritisni `a`
```

---

## B. iOS development build — pravo rešenje

Ovo ti ionako treba od Faze 1 (custom zvuci ne rade ni u jednom Expo Go).
Razlika je samo što sad postaje **blokada, a ne priprema**.

### 1. Apple Developer Program — $99/godišnje

`developer.apple.com` → Enroll. **Odobrenje 24–48h.** Uradi danas.

### 2. Registruj iPhone

```bash
eas device:create
```

Generiše link → otvoriš ga na iPhone-u → instaliraš profil.

### 3. Build

```bash
eas build --profile development --platform ios
```

10–20 minuta. Na pitanje o sertifikatima — **pusti EAS da upravlja**.

### 4. Instaliraj

Otvori link sa builda na iPhone-u.

**Prvi put obavezno:** Settings → General → VPN & Device Management → tvoj profil
→ **Trust**. Bez toga se aplikacija ne otvara.

### 5. Odsad

```bash
npx expo start --dev-client
```

Skeniraš QR **svojom** aplikacijom. Expo Go ti više nikad ne treba.

---

## C. `eas go` — ako baš hoćeš Expo Go na iPhone-u

```bash
eas go
```

Sagradi ličnu verziju Expo Go za tvoj SDK i pošalje je u tvoj TestFlight.

**Takođe traži Apple Developer članarinu**, pa nema prednost nad putem B —
a development build tvoje prave aplikacije ti je korisniji od Expo Go.

---

## Šta NE raditi

❌ **Ne spuštaj projekat na SDK 54** da bi Expo Go iz App Store-a radio.
Izgubio bi dane na version churn, a za notifikacije u Fazi 1 ti dev build ionako
treba. Rešavao bi problem koji za dve nedelje prestaje da postoji.

❌ **Ne traži iOS simulator za Windows.** Ne postoji.

---

## Šta proveriti kad se otvori

- [ ] Aplikacija se otvara bez crvenog ekrana
- [ ] Pet tabova: Danas · Prostor · Chat · Obaveštenja · Više
- [ ] Tabovi se prebacuju
- [ ] Header prikazuje naziv startupa
- [ ] Tap na naziv otvara listu tvojih startupa ⚠️ **ovo je pravi test**
- [ ] Promena teme telefona menja temu aplikacije
- [ ] Nema belih ekrana — prazna stanja se vide

---

## Kad zapne

| Simptom | Uzrok | Rešenje |
|---|---|---|
| „requires a newer version of Expo Go" | App Store Expo Go = SDK 54, projekat = SDK 57 | Put A ili B gore |
| QR se skenira ali ne učitava | Različit Wi-Fi | `npx expo start --tunnel` |
| „Unable to resolve module" | Keš | `npx expo start --clear` |
| Lista startupa prazna | Convex ne radi | Proveri `npx convex dev` i `EXPO_PUBLIC_CONVEX_URL` |
| Aplikacija se ne otvara (dev build) | Profil nije poveren | Settings → VPN & Device Management → Trust |
| Notifikacije ne stižu | Expo Go ili emulator | Dev build + **fizički** uređaj |

---

**Izvori:**

- [Expo Go and the App Store in May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026)
- [Install Expo Go for SDK 57](https://expo.dev/go)
