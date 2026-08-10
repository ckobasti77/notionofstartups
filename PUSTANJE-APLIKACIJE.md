# Kako da drugari instaliraju Devotion na Android

Za tvoj slučaj — 5-6 ljudi, svi na Androidu — **Play Store je pogrešan alat.**
Evo zašto, konkretno:

Google od novembra 2023. traži da svaki **novi lični developer nalog** pre prvog
izlaska u produkciju sprovede zatvoreno testiranje sa **12 testera koji ostanu
prijavljeni 14 dana neprekidno**. Ti imaš šestoro ljudi. Ne možeš da ispuniš uslov
ni da hoćeš. Uz to ide 25$ jednokratno i čekanje na pregled.

Umesto toga: **EAS internal distribution.** Expo ti napravi APK u oblaku i da ti
link. Pošalješ link u grupu, oni kliknu i instaliraju. Bez naloga, bez pregleda,
bez ograničenja broja ljudi, bez ijednog dinara.

> Ovo važi samo za Android. Za iPhone nema besplatnog puta — traži Apple Developer
> nalog, 99$ godišnje, pa TestFlight. Kad ti zatreba, javi.

---

# DEO 1 — Šta ćemo uraditi, redom

Aplikacija na telefonu tvog drugara mora da priča sa dve stvari koje **postoje na
internetu**, a ne na tvom laptopu:

```
   Telefon (APK)
        |
        +---> Convex produkcija   (baza + logika)   quirky-vulture-47
        |
        +---> Vercel produkcija   (web, /embed rute za kanvas i editor)
```

Sad ti aplikacija gađa `10.0.2.2:3000` i dev bazu — a `10.0.2.2` je tvoj laptop
gledano iz emulatora. Na tuđem telefonu to ne postoji. **Zato prvo dižemo
produkciju, pa tek onda pravimo APK.** Ako preskočiš ovaj deo, dobićeš aplikaciju
koja se otvori i onda ne radi ništa.

Redosled je: backend → web → mobilni. Svaki sledeći zavisi od prethodnog.

---

# DEO 2 — Produkcijski backend (Convex)

### 2.1 Pusti funkcije na produkciju

```
cd ~/Desktop/Web\ Dev\ Projects/notion-clone
npx convex deploy
```

Ovo gura kod na `quirky-vulture-47`. Ispisaće ti URL deployment-a — **zapiši ga**,
treba ti dva puta kasnije. Izgleda otprilike ovako:

```
https://quirky-vulture-47.eu-west-1.convex.cloud
```

Ako nisi siguran, otvori [dashboard.convex.dev](https://dashboard.convex.dev),
izaberi produkcijski deployment, pa Settings → URL & Deploy Key.

### 2.2 Podesi auth na produkciji ⚠

**Ovo je korak koji svi preskoče i onda niko ne može da se uloguje.**

Produkcijski deployment je zasebna baza sa zasebnim podešavanjima. Ključevi za
prijavu koji rade u dev-u **ne postoje** na produkciji. Pusti:

```
npx @convex-dev/auth --prod
```

To generiše `JWT_PRIVATE_KEY` i `JWKS` na produkciji.

### 2.3 Prenesi ostale promenljive

Backend koristi još pet. Pogledaj šta imaš u dev-u:

```
npx convex env list
```

pa svaku prepiši na produkciju:

```
npx convex env set VAPID_PUBLIC_KEY   "..." --prod
npx convex env set VAPID_PRIVATE_KEY  "..." --prod
npx convex env set VAPID_SUBJECT      "..." --prod
npx convex env set EXPO_ACCESS_TOKEN  "..." --prod
npx convex env set BOOTSTRAP_ADMIN_CODE "..." --prod
```

`BOOTSTRAP_ADMIN_CODE` je kod kojim sebe praviš adminom u novoj bazi — stavi nešto
što niko neće pogoditi.

### 2.4 Pusti migracije na produkciji

Produkcijska baza je prazna i nema kanale. Isto ono što si jutros radio, samo `--prod`:

```
npx convex run migrations:runChatBackfill --prod
```

---

# DEO 3 — Produkcijski web (Vercel)

Tvoj Vercel projekat se zove `notionofstartups`.

### 3.1 Podesi promenljive na Vercelu

[vercel.com](https://vercel.com) → projekat `notionofstartups` → **Settings** →
**Environment Variables**. Za okruženje **Production** dodaj:

| Ime | Vrednost |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | produkcijski `.convex.cloud` URL iz koraka 2.1 |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | isto to, samo `.convex.site` umesto `.convex.cloud` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | isti kao u tvom `.env.local` |

### 3.2 Pusti web

```
git push
```

Vercel sam pokreće build. Kad završi, dobiješ adresu tipa
`https://notionofstartups.vercel.app` — **zapiši i nju**, treba ti u sledećem delu.

### 3.3 Proveri pre nego što kreneš dalje

Otvori tu adresu u browseru i uloguj se. Ako se ne uloguješ, nešto iz koraka 2.2
nije prošlo — vrati se, nemoj dalje.

---

# DEO 4 — APK

Sad kad produkcija radi, pravimo aplikaciju koja je gađa.

### 4.1 Upiši produkcijske adrese u `eas.json`

**Ovo je najvažniji korak celog uputstva.** `.env.local` je u `.gitignore`, pa
**EAS ga uopšte ne vidi** kad pravi build u oblaku. Ako ovo ne uradiš, aplikacija
se sagradi bez ijedne adrese i na telefonu ne radi ništa.

Otvori `apps/mobile/eas.json` i profil `preview` dopuni blokom `env`:

```json
"preview": {
  "distribution": "internal",
  "ios": { "simulator": false },
  "env": {
    "EXPO_PUBLIC_CONVEX_URL": "https://quirky-vulture-47.eu-west-1.convex.cloud",
    "EXPO_PUBLIC_WEB_URL": "https://notionofstartups.vercel.app"
  }
}
```

Obe vrednosti zameni onim što si zapisao u koracima 2.1 i 3.2. Bez `/` na kraju.

> Ne brini što ove adrese ulaze u git. Prefiks `EXPO_PUBLIC_` znači da su ionako
> javne — svejedno završe unutar APK-a koji deliš. Tajne se nikad ne stavljaju ovde.

### 4.2 Instaliraj EAS i uloguj se

```
npm install -g eas-cli
eas login
```

Ako nemaš Expo nalog, napravi ga na [expo.dev](https://expo.dev) — besplatan je.

Projekat je već povezan (ima `projectId` u `app.json`), pa `eas init` ne moraš.

### 4.3 Napravi build

```
cd apps/mobile
eas build --platform android --profile preview
```

Prvi put će te pitati da napravi **keystore** — to je ključ kojim se aplikacija
potpisuje. Reci **da** i pusti Expo da ga čuva. (Bitno za kasnije: ako ikad izgubiš
keystore, ne možeš da izdaš ažuriranje postojeće instalacije, ljudi moraju da
brišu i instaliraju ispočetka.)

Build se pravi u oblaku. Na besplatnom planu ide u sporiji red — računaj
**15 do 40 minuta**. Možeš da zatvoriš terminal; napredak pratiš na
[expo.dev](https://expo.dev) pod Builds.

Kad završi, dobiješ link i QR kod. **To je to što šalješ drugarima.**

---

# DEO 5 — Šta drugari treba da urade

Pošalji im link. Na Android telefonu:

1. Otvore link → dugme **Install**
2. Preuzme se `.apk`
3. Android kaže nešto tipa *„Iz bezbednosnih razloga ne smeš da instaliraš nepoznate aplikacije iz ovog izvora"* → **Settings** → uključe dozvolu za taj browser → **Back**
4. **Install**
5. Play Protect javi *„Nepoznata aplikacija"* → **Install anyway**

Ta dva upozorenja su normalna i pojaviće se svakome. Znače samo da aplikacija nije
prošla kroz Play Store, ne da nešto nije u redu. Reci im to unapred da se ne
uplaše i ne odustanu.

---

# DEO 6 — Nova verzija

Kad promeniš nešto:

```
git push                    # web na Vercel
npx convex deploy           # backend na produkciju
cd apps/mobile
eas build --platform android --profile preview
```

Novi link, ponovo pošalješ. Instaliraju preko postojeće — podaci ostaju.

Kad ti dosadi da svaki put praviš build, postoji `eas update` koji gura samo
izmenjeni JavaScript direktno u instalirane aplikacije, bez novog APK-a. Radi za
sve osim za izmene native paketa. To je sledeći korak kad ovo prvo prohoda.

---

# DEO 7 — Ako jednom ipak budeš hteo Play Store

Kad aplikacija izađe iz kruga drugara:

1. Registruj se na [play.google.com/console](https://play.google.com/console) — **25$ jednokratno**
2. Ako se registruješ kao **firma** (traži D-U-N-S broj), preskačeš pravilo o
   12 testera. Kao fizičko lice ne preskačeš.
3. Sprovedi zatvoreno testiranje: 12 testera, 14 dana neprekidno
4. `eas build --profile production` pravi `.aab` (Play Store ne prima `.apk`)
5. `eas submit --platform android` šalje ga u Play Console
6. Popuniš opis, ikonice, screenshot-e, politiku privatnosti (obavezna) i pošalješ
   na pregled

Ali za sada ti ovo ne treba.

---

## Redosled u jednoj koloni, da ne lutaš

```
1. npx convex deploy
2. npx @convex-dev/auth --prod
3. npx convex env set ... --prod        (pet promenljivih)
4. npx convex run migrations:runChatBackfill --prod
5. Vercel → Settings → Environment Variables → Production
6. git push                              → sačekaj build, zapiši adresu
7. Otvori adresu, uloguj se              → ako ne radi, STANI
8. apps/mobile/eas.json → dodaj "env" u profil "preview"
9. npm install -g eas-cli && eas login
10. cd apps/mobile && eas build -p android --profile preview
11. Pošalji link
```
