# Provera lanca 6 na uređaju

Emulator **Pixel 9 (Android 16)**, `emulator-5554`, development build
`com.devotion.app`. Convex dev, Next.js dev (`localhost:3000`) i Metro (`8081`)
uključeni. Sve provereno prstom preko `adb`, svaka stavka ima snimak ekrana.

Snimci: `docs/mobile/provera/lanac6/`.

---

## 0. Okruženje — ZA-POPRAVKU Z9 potvrđen

`adb reverse --list` je pri startu bio **prazan** — mapiranja stvarno ne prežive
restart emulatora. Bez njih kanvas javlja `ERR_CONNECTION_REFUSED`. Postavljeno:

```
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```

Z8 (DNS / „Pripremam radni prostor") se nije javio. Port 3000 je proveren da je
Devotion, a ne „alati": `GET /embed/canvas/ideas/proba` → **200**, ne 404.

---

## 1. Tabela ishoda

| # | Stavka | Ishod | Dokaz |
|---|---|---|---|
| 1 | Aplikacija se diže (P2 native paketi) | **Radi** | `01-app-launch-b.png` |
| 2 | Editor beleške — traka alata + tabela (B1) | **Nije radilo → popravljeno** | `02-editor-fokus.png` (pre) · `02-traka-alata.png`, `02-ponovo-tabela.png` (posle) |
| 3 | Kanvas ideja i misli — „Uredi raspored", ugnježden čvor | **Radi** | `03-rezim-uredi.png`, `03-perzistencija-fit.png`, `03-misli-perzistencija.png` |
| 4 | Preimenovanje — zadatak, tabela, prilozi | **Radi** (uz dva popravljena kvara na putu) | `04-preimenovan.png`, `04-kolona-preimenovana.png`, `04-prilog-preimenovan.png` |
| 5 | Pozivnica je LINK, ne go kod | **Radi** | `05-pozivnica-kreirana.png`, `05-clipboard.png` |
| 6 | Restart pamti temu i izabran startup | **Radi** | `06-drugi-startup.png` → `06-posle-restarta-b.png` |
| 7 | Istorija radnji — tri izmene, stek od 20 | **Radi** | `07-istorija.png` |

Usput nađena i popravljena **dva kvara koja nisu na listi**, oba su rušila ekran:
`pages.get` na tabelama/prilozima i otpremanje svakog priloga sa telefona.
Detalji u sekciji 3.

---

## 2. Stavka po stavka

### 1. Aplikacija se diže — RADI

Cold start posle `force-stop`. Dev-launcher je javio da je *prošli* pokušaj pucao
(pre ove sesije), ali app se digao bez problema: `Running "main"`, ekran „Danas",
podaci učitani. **Nijedna greška oko Tiptap/tentap native dela** — nov development
build nije potreban, `NATIVE-BUILD.md` se ne aktivira.

`01-cold-start.png` → `01-app-launch-b.png`

### 2. Editor beleške — NIJE RADILO → POPRAVLJENO

**Simptom.** Otvoriš belešku, telo je prazno iako beleška ima sadržaj. Dodir u
telo ne radi ništa: nema kursora, nema tastature, nema trake alata.
(`02-editor-fokus.png`)

**Šta je pokazao logcat.**

```
chromium: [INFO:CONSOLE:62] "Uncaught SyntaxError: Invalid or unexpected token",
                            source: about:blank (62)
```

**Dijagnoza (CDP preko `adb forward` na WebView).** `#root` postoji ali ima **0
dece** — React se nikad nije montirao. Telo dokumenta je 693 KB sirovog teksta,
a `<script>` sadrži… sam HTML šablon. Generisani `note-editor-html.ts` je imao
**33 `<!DOCTYPE`-a, dva `<script>` otvaranja i samo jedno zatvaranje**.

**Uzrok.** `apps/mobile/editor-web/inline.mjs:44` je ubacivao bundle kroz
`String.replace(placeholder, string)`. U string-zameni `$&`, `` $` ``, `$'` i `$$`
nisu obični znaci nego naredbe: `` $` `` ubacuje ceo tekst PRE pogotka. Minifikovan
bundle stringove piše kao template literale, pa u njemu ima **32× `` $` ``, 4× `$&`
i 31× `$$`** — šablon je ubačen 32 puta, `<script>` je ostao nezatvoren i WebView
je pao pre nego što je React uopšte krenuo.

Ovo `tsc` ne može da vidi: bundle je jedan džinovski string literal, sintaksno
ispravan TypeScript.

**Popravka.**

- `inline.mjs` — zamena ide kroz **funkciju** (`() => …`), koja ne tumači `$`.
- Nova kapija u istom skriptu: izlaz mora imati **tačno po jedan** `<!DOCTYPE`,
  `<html`, `#root` i `</script>`; skripta mora da uđe doslovno; skripta ne sme da
  sadrži `<!--` (u kombinaciji sa `<script` gura HTML parser u „script data double
  escaped" stanje, isti ishod drugim putem).
  Stara provera („ima li `<script>`") je propuštala jer iskvaren izlaz **ima**
  script tag — samo ih ima 33.
- Bundle regenerisan: 678 KB → **643 KB** (razlika = 32 kopije šablona).

**Provera posle popravke.**

- Telo beleške se prikazuje (`02-editor-posle-popravke.png`).
- Dodir u telo → kursor, tastatura i **traka alata** (`+`, B, I, S, `<>`, link,
  H1–H3) tačno iznad tastature (`02-traka-alata.png`).
- Kucanje → „Sačuvano" (`02-kucanje.png`).
- „+" → „Ubaci tabelu 3×3" → tabela se ubacuje i renderuje sa ivicama
  (`02-bez-tastature.png`).
- **B1, pravi test:** izlazak i ponovni ulazak u belešku **koja već ima tabelu** —
  tabela je tu, **nema banera „Samo čitanje"**, čuvar gubitka nije okinuo, znači
  bundle round-trip-uje tabelu verno (`02-ponovo-tabela.png`).
- Izmena ćelije prolazi — CDP potvrdio sadržaj ćelija
  `["Ty","","","","abc","","","",""]` (`02-tabela-izmena.png`).

### 3. Kanvas ideja i misli — RADI

Kanvas se učitava sa `localhost:3000` (reverse mapiranje), most radi
(`auth`, `selection`, `moved`, `viewport` u logu).

- Dugme „Uredi raspored" postoji u rail-u (ikona sa strelicama). Ulaskom se
  pojavi pilula **„Uređivanje rasporeda"**, plav okvir platna i isprekidane
  ivice čvorova (`03-rezim-uredi.png`).
- Pomeranje kartice radi, traka „Ideja je pomerena. / Poništi" se pojavi
  (`03-pomeren-kita.png`).
- **Ugnježden čvor** („F7 ideja telefon", `parentId`) pomeren posebno
  (`03-pomeren-ugnjezden.png`).
- Izlazak → povratak: **sve pozicije tačno gde su ostavljene**, uključujući i
  bivši ugnježden čvor. Zamka apsolutno↔relativno se **nije** ispoljila
  (`03-perzistencija-fit.png`).
- Isto za **Misli**: pomeranje, četiri ugaone ručke (K2) na izabranom čvoru,
  perzistencija posle povratka, i sačuvana kamera se vraća
  (`03-misli-pomeren.png`, `03-misli-perzistencija.png`).
- Embed prati temu — u tamnoj temi je i kanvas taman (`07-kanvas.png`).

Sitno zapažanje (nije kvar): pri prvom otvaranju kanvasa vraćena je sačuvana
kamera iz ranije sesije u kojoj nijedan čvor nije bio u kadru, pa platno izgleda
prazno dok se ne pritisne „centriraj sve". Posle prvog `fit`-a se pamti dobra
kamera.

### 4. Preimenovanje — RADI

- **Zadatak:** „…" → **„Preimenuj — Menja naslov ove stranice"**. Preimenovano
  „E7 zadatak sa datumom" → „…X", uz traku „Preimenovano u… / Poništi"
  (`04-zadatak-sheet.png`, `04-preimenovan.png`).
- **Tabela:** dodir na zaglavlje kolone → sheet **„NAZIV KOLONE"** sa poljem,
  „Pomeri levo/desno" i „Obriši kolonu". „Kolona 1" → „Kolona 1X"
  (`04-kolona-sheet.png`, `04-kolona-preimenovana.png`).
  Sama stranica-tabela ima „Preimenuj" u „…" (`04-tabela-sheet.png`).
- **Prilozi:** olovka uz prilog → sheet **„Preimenuj prilog"**. „45.png" →
  „45.pngX" (`04-prilog-preimenuj.png`, `04-prilog-preimenovan.png`).

### 5. Pozivnica je LINK — RADI

„Nova pozivnica" → dijalog **„Pozivnica kreirana"** sa punim linkom:

```
http://localhost:3000/?invite=016DF8-46166B-B9FCF3-5E2687
```

„KOPIRAJ LINK" → potvrda „Pozivni link je kopiran". Sadržaj clipboard-a
proveren nalepljivanjem u polje pretrage (`KEYCODE_PASTE`) — nalepio se **ceo
link, doslovno**, ne go kod (`05-clipboard.png`).

Napomena: domen dolazi iz `EXPO_PUBLIC_WEB_URL`. U ovom dev buildu je
`http://localhost:3000`; za pravu pozivnicu mora da se postavi produkciona
adresa, inače je link neupotrebljiv van emulatora.

### 6. Restart pamti temu i startup — RADI

Postavljeno: tema **Tamno**, startup **„Nauči AI"** (drugi po redu, ne prvi).
`adb shell am force-stop com.devotion.app`, pa ponovo otvoreno.

Posle restarta: **tamna tema i „Nauči AI"** (`06-posle-restarta-b.png`). Oboje
preživelo.

(Force-stop na development buildu vraća na Expo dev-launcher — to je osobina
dev builda, ne aplikacije.)

### 7. Istorija radnji — RADI

Tri pomeranja na kanvasu ideja (tri `moved` poruke u logu). Ekran „Istorija
radnji" prikazuje **sve tri** sa vremenima; najnovija je aktivna i ima „Poništi",
starije su prigušene uz objašnjenje **„Poništava se redom, od najnovije."** —
LIFO, kako i treba (`07-istorija.png`). Brojač na „Više" prati stanje (3).

Stek je `MAX_UNDO_ENTRIES = 20` u `apps/mobile/src/lib/undo.ts:283`. Držan je u
modulskim promenljivama, dakle **po sesiji** — posle `force-stop`-a je bio prazan
(pre restarta je brojač stajao na 2, posle restarta 0). To je zatečena odluka
(poništavanje traži podatke koje backend ne čuva), ne regresija — ali vredi da
stoji zapisano.

---

## 3. Kvarovi nađeni i popravljeni

### K-A · Editor beleške se nije izvršavao (stavka 2)

Opisano gore. Fajlovi: `apps/mobile/editor-web/inline.mjs`,
`apps/mobile/src/lib/note-editor-html.ts` (regenerisan).

### K-B · `pages.get` obara svaku tabelu i svaki prilog

**Simptom.** Otvaranje bilo koje `table` stranice sa telefona → crveni ekran:

```
[CONVEX Q(pages:get)] Server Error
ReturnsValidationError: Object contains extra field `tableColumnCount`
that is not in the validator.
```

(`04-tabela-panel.png`)

**Uzrok.** `pages.get` vraća `{ ...page, … }`, a njegov returns validator
(`pageDocumentValidator`) nije nosio šest opcionih polja iz šeme:
`fileCount`, `filePreviewStorageId`, `filePrimaryCategory`, `tableRowCount`,
`tableColumnCount`, `sourceMessageId`.

Kvar je **serverski i zajednički za oba klijenta** — pogađa i web. Leži nem dok
se polje prvi put ne upiše: `tableColumnCount` nastane tek posle prve kolone,
`fileCount` posle prvog priloga, `sourceMessageId` kod zadatka napravljenog iz
chat poruke. Liste su bile bezbedne jer `summarizePage` polja bira nabrajanjem.

**Popravka.**

- `pageDocumentValidator` premešten u `packages/backend/convex/lib/validators.ts`
  i dopunjen svih šest polja.
- Nov test `packages/backend/convex/pages.validator.test.ts` poredi **skup polja
  `pages` tabele u šemi** sa skupom polja validatora, u oba smera. Novo polje u
  `schema.ts` sada obara test odmah.

Posle popravke tabela se otvara normalno (`04-tabela-retry.png`).

### K-C · Nijedan prilog se ne može poslati sa telefona

**Simptom.** „Greška — Otpremanje nije uspelo." na svaki izbor iz galerije
(`04-prilog-otpremljen.png`).

**Uzrok.** Convex vraća:

```
400 {"code":"BadHeader","message":"Bad header for content-type: invalid HTTP header"}
```

React Native, kad je telo zahteva `Blob`, uzima `Content-Type` **iz samog bloba**
i gazi zaglavlje prosleđeno u `fetch`. A `fetch('file://…')` daje odgovor bez
`Content-Type`, pa je `blob.type === ""` — zahtev ode sa praznim zaglavljem.
Instrumentacijom potvrđeno: `blobType: ""`, `mime: "image/png"`, i **isti 400 i
kad se zaglavlje ukloni** (jer ga RN svejedno postavlja iz bloba).

Kod je izgledao potpuno ispravno — `headers: { 'Content-Type': mimeType }` stoji
napisano na sva tri mesta i nema efekta.

**Domet.** Isti obrazac je bio na **sva tri** mesta za otpremanje:
prilozi stranice, prilog u telu beleške, prilog u chatu. Sva tri su bila mrtva.

**Popravka.** Nov modul `apps/mobile/src/lib/upload.ts`:

- `readUploadBlob(uri, mimeType)` — pravi **nov blob sa tipom**
  (`new Blob([raw], { type })`), sa `application/octet-stream` kao rezervom;
- `postUploadBlob(uploadUrl, blob)` — POST bez ručnog zaglavlja (jedan izvor
  istine) i greška koja nosi HTTP status.

Sva tri poziva prebačena na njega.

Provereno na uređaju posle popravke:

- **prilozi stranice** — `45.png · Slika · 208 KB` (`04-prilog-posle-popravke.png`);
- **prilog u telu beleške** — bez greške, a CDP nad editorom potvrdio
  `noteFiles: 1, imgs: 1, tables: 1`: čvor je ubačen, potpisan URL stigao kroz
  `setNoteFileUrls` i slika se crta, a ranije ubačena tabela je i dalje tu
  (`08-prilog-u-belesci.png`).
- **chat** — **nije vožen prstom.** Koristi isti `postUploadBlob`/`readUploadBlob`
  i prolazi `tsc`, ali to nije dokaz na uređaju. Prva sledeća prilika: poslati
  sliku u kanal i potvrditi.

---

## 4. Logcat — svaki crveni i žuti red

| Red | Kada | Status |
|---|---|---|
| `chromium: Uncaught SyntaxError: Invalid or unexpected token, source: about:blank (62)` | otvaranje beleške | **rušio editor — popravljeno (K-A)** |
| `ReturnsValidationError: Object contains extra field 'tableColumnCount'` | otvaranje tabele | **rušio ekran — popravljeno (K-B)** |
| `400 BadHeader: Bad header for content-type` | slanje priloga | **rušilo otpremanje — popravljeno (K-C)** |
| `chromium: [tiptap warn]: Duplicate extension names found: ['listItemBranchingDeleteKeymap', 'textStyle', 'listItem']` | svako otvaranje editora | **i dalje se javlja**, ne ruši ništa — vidi sekciju 5 |
| `ReactNativeJS: Response.blob() is using React Native's Blob … Add the 'expo-blob' package` | svako otpremanje | i dalje se javlja; upozorenje o performansama, ne o ispravnosti |
| `unknown:ReactHost: ReactNoCrashSoftException: raiseSoftException(onWindowFocusChange(hasFocus="true")): Tried to access onWindowFocusChange while context is not ready` | svaki cold start | benigno, RN startup trka; app se normalno diže |
| `chromium: Error with Permissions-Policy header: Unrecognized feature: 'browsing-topics'` | kanvas WebView | dolazi iz Next dev servera, ne iz našeg koda |
| `chromium: [INFO:CONSOLE] "[HMR] connected" / "[Fast Refresh] rebuilding"` | kanvas WebView | dev-only |
| `chromium: Seed missing signature` (variations_seed_loader) | start WebView-a | emulatorski WebView, nema veze sa app-om |
| `E BugleRcs`, `E WifiStaIfaceAidlImpl`, `E TaskPersister`, `E webview_service: Not starting debugger` | stalno | sistemski šum emulatora, drugi procesi |

---

## 5. Ostaje otvoreno

**Tiptap: dupla imena ekstenzija.** Editor pri svakom učitavanju javlja
`Duplicate extension names found: ['listItemBranchingDeleteKeymap', 'textStyle',
'listItem']`. Ne ruši ništa i ne kvari sadržaj — čuvar gubitka nije okinuo, a
tabela, blok koda i prilog round-trip-uju verno. Znači da se te tri ekstenzije
registruju i kroz `TenTapStartKit` i kroz naše dodatke u `NOTE_BRIDGES`.

**Nije dirano jer je van sedam stavki** i jer bi menjanje liste bridge-ova
tražilo punu ponovnu proveru round-tripa tela beleške. Preporuka za sledeći
lanac: proći `NOTE_BRIDGES` i ukloniti dupla `tiptapExtensionDeps`.

**`EXPO_PUBLIC_WEB_URL`** je u ovom buildu `http://localhost:3000` — pre bilo
kakvog deljenja pozivnice mora na produkcionu adresu (sekcija 2, stavka 5).

**Chat prilog nije vožen prstom** — popravka K-C je zajednička, ali dokazana je
na dva od tri mesta (sekcija 3, K-C).

---

## 6. Kapije

| Kapija | Komanda | Ishod |
|---|---|---|
| tsc mobilni | `npx tsc --noEmit -p apps/mobile/tsconfig.json` | **0 grešaka** |
| tsc backend | `npx tsc -p packages/backend/convex/tsconfig.json --noEmit` | **0 grešaka** |
| lint | `npm run lint` | **čisto — 0 grešaka, 0 upozorenja** |
| test | `npm test` | **51 fajl, 437 testova — svi prolaze** (uključujući nov `pages.validator.test.ts`) |
| build | `npm run build` | **prošao** |
| editor bundle | `npm run editor:build --workspace @devotion/mobile` | prošao uz novu kapiju; 643 KB |

Podsetnik koji i dalje važi: **nijedan linter ne pokriva `apps/mobile`**
(`expo lint` je pokvaren, root eslint ga ignoriše) — mobilni se proverava samo
kroz `tsc`.

---

## 7. Pouka

Sva tri kvara su prošla kroz `tsc`, lint, 437 testova i lov na mrtav kod bez
ijednog signala:

- **K-A** je bio u generisanom string literalu — sintaksno savršen TypeScript
  koji sadrži pokvaren HTML.
- **K-B** je bio nesklad između šeme i returns validatora koji se ispolji tek kad
  se polje prvi put UPIŠE u bazu, a ne kad se kod deploy-uje.
- **K-C** je bio kod koji doslovno postavlja ispravno zaglavlje, a runtime ga
  tiho prepisuje.

Nijedna od te tri klase se ne vidi statički. Jedini alat koji ih je našao je
prst na ekranu i `logcat`. Zato uz svaku popravku ide i kapija koja meri **izlaz**
(struktura HTML-a, poklapanje šeme i validatora), ne nameru.
