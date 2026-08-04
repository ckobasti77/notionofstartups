# Setup na Windowsu — od nule do aplikacije na telefonu

> Pisano za nekoga ko nikad nije pravio mobilnu aplikaciju. Svaki korak ima
> objašnjenje *zašto*, ne samo komandu. Ne preskači redosled.

---

## Pre svega: kako uopšte funkcioniše mobilni razvoj

Tri stvari koje treba da razumeš pre prve komande:

**1. Ti pišeš JavaScript, a izlaz je native aplikacija.**
React Native uzima tvoj React kod i, umesto `<div>`, crta prave Android i iOS
komponente. Nije WebView, nije sajt. Dugme u tvojoj aplikaciji je isto dugme koje
crta i Instagram.

**2. Postoje dva režima rada i lako se pomešaju.**

| Režim | Šta je | Kad se koristi |
|---|---|---|
| **Expo Go** | Gotova aplikacija iz prodavnice koja učita tvoj kod preko QR koda | Prvih par dana, dok nemaš native module |
| **Development build** | Tvoja aplikacija, kompajlirana, sa razvojnim alatima unutra | Čim dodaš bilo šta native — a nama treba odmah, zbog zvukova |

Expo Go ne može custom notifikacione zvuke. Znači: **Expo Go služi samo za prvi
"radi li uopšte", posle prelazimo na development build.** Nemoj da se navikneš na
Expo Go pa da se iznenadiš.

**3. iOS se ne kompajlira na Windowsu i nikad neće.**
Xcode postoji samo za macOS. Ali ne treba ti — EAS Build je Expo servis koji ima
farmu Mac-ova u cloudu. Kucaš komandu na Windowsu, njihov Mac kompajlira, tebi
stigne fajl. Sve što izguglaš kao "iOS emulator for Windows" je ili prevara ili
iznajmljen Mac u pozadini.

---

## Korak 1 — Osnovni alati

Već imaš Node i git zbog Next.js projekta, ali proveri verzije:

```powershell
node -v      # mora 20.9 ili više
npm -v
git --version
```

Ako je Node stariji, instaliraj sa nodejs.org (LTS verzija).

**Preporučeno:** koristi **PowerShell**, ne stari `cmd`. Neke Expo komande na
`cmd` prijave čudne greške oko putanja.

---

## Korak 2 — Android okruženje

Ovo je tvoja svakodnevna petlja razvoja, jer radi lokalno i brzo.

### 2.1 Android Studio

Skini sa `developer.android.com/studio` i instaliraj. Pri instalaciji obavezno
štiklirati:

- Android SDK
- Android SDK Platform
- Android Virtual Device

### 2.2 Podesi promenljive okruženja

Windows pretraga → "Edit the system environment variables" → Environment Variables.

Novi **korisnički** `ANDROID_HOME`:

```
C:\Users\admin\AppData\Local\Android\Sdk
```

Zatim u `Path` dodaj tri stavke:

```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
%ANDROID_HOME%\tools\bin
```

Zatvori sve terminale, otvori nov, proveri:

```powershell
adb --version
```

Ako `adb` nije prepoznat, `ANDROID_HOME` pokazuje na pogrešan folder.

### 2.3 Napravi emulator

Android Studio → More Actions → Virtual Device Manager → Create Device.

Uzmi **Pixel 7** sa najnovijim system image-om. Pusti ga jednom da vidiš da se
podiže.

> Emulator jede RAM. Ako imaš 16 GB ili manje, zatvaraj Chrome dok radiš, ili
> koristi svoj Android telefon preko USB debugging-a — brže je i realnije.

---

## Korak 3 — Expo projekat

U korenu monorepoa:

```powershell
cd "C:\Users\admin\Desktop\Web Dev Projects\notion-clone"
npx create-expo-app@latest apps/mobile --template default
```

Template `default` donosi expo-router i TypeScript, što nam oboje treba.

Zatim instaliraj sve što nam treba odmah:

```powershell
cd apps/mobile

# Convex + auth
npx expo install convex @convex-dev/auth expo-secure-store

# Stilovi
npx expo install nativewind tailwindcss react-native-reanimated

# Notifikacije i uređaj
npx expo install expo-notifications expo-device expo-constants

# Kasnije, ali da znaš šta dolazi:
# npx expo install expo-image-picker expo-camera expo-av expo-haptics
# npx expo install react-native-webview
```

**Zašto `npx expo install`, a ne `npm install`:** Expo bira verziju paketa koja
odgovara tvom SDK-u. `npm install` će ti dovući najnoviju verziju koja često nije
kompatibilna, i dobiješ grešku koju je teško dijagnostikovati.

---

## Korak 4 — Prvi start

```powershell
npx expo start
```

Otvara se terminal sa QR kodom.

- Pritisni **`a`** → podiže se Android emulator
- Skeniraj QR **Expo Go** aplikacijom sa telefona (skini je iz prodavnice)

Ako vidiš početni ekran — okruženje radi. To je najveća prepreka i prešao si je.

---

## Korak 5 — Expo nalog i EAS

EAS (Expo Application Services) je servis koji kompajlira u cloudu.

```powershell
npm install -g eas-cli
eas login          # napravi nalog na expo.dev ako ga nemaš
eas init           # veže projekat za tvoj Expo nalog
eas build:configure
```

`eas build:configure` pravi `eas.json`. Podesi ga ovako:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": { "production": {} }
}
```

Tri profila:

- **development** — razvojni build sa alatima, za tvoj telefon
- **preview** — čist build za testere, bez alata
- **production** — ono što ide u prodavnicu

---

## Korak 6 — Android development build

```powershell
eas build --profile development --platform android
```

Prvi build traje 10–20 minuta u redu čekanja. Kad završi, dobiješ link i QR kod.
Otvori ga na telefonu, skini `.apk`, instaliraj (Android će pitati za dozvolu za
instalaciju iz nepoznatog izvora — dozvoli).

Odsad pokrećeš razvoj sa:

```powershell
npx expo start --dev-client
```

i skeniraš QR **svojom** aplikacijom, ne Expo Go-om.

---

## Korak 7 — Apple nalog i iOS build

### 7.1 Apple Developer Program

1. Idi na `developer.apple.com` i prijavi se sa svojim Apple ID-jem
2. Enroll u Apple Developer Program — **$99 godišnje**
3. Odobrenje obično stigne za 24–48h (individualni nalog); kod kompanijskog
   traže D-U-N-S broj i ume da potraje

> Bez ovoga možeš da instaliraš samo na svoj telefon, i sertifikat ističe za 7
> dana. Za tim koji testira — plati.

### 7.2 Registruj svoj iPhone

```powershell
eas device:create
```

Nudi tri načina; najlakši je da ti generiše link, otvoriš ga na iPhone-u i
instaliraš profil. Time se UDID tvog telefona upisuje u proviziono odobrenje.

### 7.3 Build

```powershell
eas build --profile development --platform ios
```

EAS pita da li da sam upravlja sertifikatima — **reci da**. To je onaj deo iOS
razvoja koji istorijski najviše ljudi izludi, i Expo ga rešava umesto tebe.

Kad završi, otvori link na iPhone-u i instaliraj.

**Prvi put na uređaju:** Settings → General → VPN & Device Management → tvoj
profil → Trust. Bez toga aplikacija neće da se otvori.

---

## Korak 8 — Poveži Convex

U `apps/mobile/.env.local`:

```
EXPO_PUBLIC_CONVEX_URL=https://tvoj-deployment.convex.cloud
```

Isti URL koji već stoji u `.env.local` web aplikacije.

> Prefiks `EXPO_PUBLIC_` je obavezan — bez njega promenljiva ne stiže do koda.

Provider u `apps/mobile/app/_layout.tsx`:

```tsx
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      {/* navigacija */}
    </ConvexAuthProvider>
  );
}
```

Razlika u odnosu na web: token ide u `expo-secure-store` (Keychain na iOS,
EncryptedSharedPreferences na Androidu) umesto u cookie.

---

## Korak 9 — TestFlight za tim

Kad Faza 1 bude gotova i hoćeš da tim testira:

```powershell
eas build --profile production --platform ios
eas submit --platform ios
```

Zatim na `appstoreconnect.apple.com` → TestFlight → dodaj testere po email-u.
Oni skinu TestFlight aplikaciju i dobiju tvoju.

Za Android ekvivalent je Internal Testing na Play Console-u:

```powershell
eas build --profile production --platform android
eas submit --platform android
```

---

## Svakodnevna petlja kad sve proradi

```powershell
# Terminal 1 — backend
npx convex dev

# Terminal 2 — mobilni
cd apps/mobile
npx expo start --dev-client
```

Menjaš kod → čuva se → telefon se osveži za sekundu. Isto kao Next.js hot reload.

---

## Kad zapne

| Simptom | Uzrok | Rešenje |
|---|---|---|
| `adb` nije prepoznat | `ANDROID_HOME` pogrešan | Proveri putanju SDK-a u Android Studio → SDK Manager |
| Metro se ne povezuje sa telefonom | Telefon i PC nisu na istom Wi-Fi | Isti Wi-Fi, ili `npx expo start --tunnel` |
| "Unable to resolve module" | Keš | `npx expo start --clear` |
| Build pukne na EAS | Nekompatibilna verzija paketa | `npx expo install --check` pa `npx expo-doctor` |
| iOS build traži sertifikate | Prvi put | Pusti EAS da upravlja — odgovori `yes` |
| Aplikacija se ne otvara na iPhone-u | Profil nije poveren | Settings → General → VPN & Device Management → Trust |
| Notifikacije ne stižu | Testiraš na emulatoru | Push radi samo na **fizičkom uređaju** |
| Windows: "path too long" | Duboke `node_modules` putanje | Uključi long paths: `git config --system core.longpaths true` + registry `LongPathsEnabled=1` |

---

## Šta *ne* treba da radiš

- ❌ Ne instaliraj "iOS emulator za Windows" — to ne postoji
- ❌ Ne pokreći `npx expo eject` / `prebuild` osim ako ne moraš; gubiš Expo pogodnosti
- ❌ Ne koristi `npm install` za Expo pakete — koristi `npx expo install`
- ❌ Ne testiraj notifikacije na emulatoru — nikad neće raditi kako treba
- ❌ Ne commit-uj `.env.local` ni `google-services.json`

---

## Redosled za prvi dan

1. Node i git provereni ✓
2. Android Studio + emulator radi ✓
3. `create-expo-app` prošao ✓
4. `npx expo start` prikazuje ekran na emulatoru ✓
5. EAS nalog napravljen, `eas init` prošao ✓
6. Android development build instaliran na telefonu ✓
7. Apple Developer prijava poslata (čeka se odobrenje) ⏳
8. Convex URL povezan, `useQuery` vraća podatke ✓

Kad ovo prođe, sve ostalo je pisanje UI-ja.
