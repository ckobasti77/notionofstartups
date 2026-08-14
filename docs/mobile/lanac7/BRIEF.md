# Lanac 7 — kreiranje kompletno + `pages:get` puca

Plan: `docs/mobile/lanac7/PLAN.md`. Dokazi: `docs/mobile/lanac7/dokazi/` + izlazi
komandi navedeni ovde.

---

## 1. BAG — `pages:get` baca „Server Error"

### Uzrok, doslovno

Živi server (logcat sesije „Provera lanca 6 na uređaju", `docs/mobile/PROVERA-NA-UREDJAJU.md` K-B):

```
[CONVEX Q(pages:get)] Server Error
ReturnsValidationError: Object contains extra field `tableColumnCount`
that is not in the validator.
```

Isti kvar, reprodukovan crvenim testom u ovom lancu (convex-test formulacija):

```
Error: Return value validation failed for query "pages:get":
Validator error: Unexpected field `tableColumnCount` in object
```
```
Error: Return value validation failed for query "pages:get":
Validator error: Unexpected field `fileCount` in object
```

**Mehanizam:** `pages.get` vraća `{ ...page }`, a Convex **returns validator
odbija svako polje koje ne nabroji**. U komitovanom stanju je
`pageDocumentValidator` bio lokalan u `pages.ts` sa samo `treeRevision` +
`canvasPreview`; šest polja iz šeme je falilo: `fileCount`,
`filePreviewStorageId`, `filePrimaryCategory`, `tableRowCount`,
`tableColumnCount`, `sourceMessageId`. Sveža TABELA pada jer create odmah upiše
`tableRowCount: 1, tableColumnCount: 1` (`lib/page_creation.ts:298-319` →
`lib/page_tables.ts#syncTableSummary`); svež PRILOG-oblačić pada zbog
`fileCount: 0` (`page_creation.ts:321`); stranica iz chat poruke zbog
`sourceMessageId`. Beleška/zadatak ne pišu ta polja — zato je pad izgledao
„nasumičan po vrsti". Kvar leži nem dok se polje prvi put NE UPIŠE, pa ga
deploy, tsc i lint ne vide.

### Popravka

Zatečena u radnom stablu (nekomitovana, iz sesije provere na uređaju) i ovde
zadržana + verifikovana: `pageDocumentValidator` preseljen u
`packages/backend/convex/lib/validators.ts:289-298` sa svih šest polja;
`pages.ts` ga uvozi. Parity test `packages/backend/convex/pages.validator.test.ts`
poredi skup polja šeme i validatora u oba smera.

### Dokazi (crveno → zeleno)

1. Novi e2e testovi: `packages/backend/convex/pages.test.ts:200-246` —
   `pages.create` → `pages.get` za sve četiri vrste bez sadržaja (tabela očekuje
   `tableRowCount:1, tableColumnCount:1, content:""`; prilozi `fileCount:0`).
2. **Crveno:** `git stash push -- …/lib/validators.ts …/pages.ts` (vraćen HEAD
   bag) → `npx vitest run --project backend --no-file-parallelism pages.test`
   → **2 pala** (tabela, prilozi) sa porukama iznad; beleška/zadatak prošli.
3. **Zeleno:** `git stash pop` → isti testovi **8/8**; ceo backend
   **26 fajlova / 247 testova** zeleno.
4. Živa provera na dev deploymentu: `npx convex run pages:get` (identitet kroz
   `--identity`) prolazi za svežu file stranicu i za tabelu; nova tabela
   `proba-cir` (3×2, ćirilica) se otvara u aplikaciji bez greške.
5. Usputna rupa zatvorena: `table-limits-parity.test.ts` sada proverava i
   `MAX_TABLE_IMPORT_BATCH` (bio je mirrorovan u `apps/mobile/src/lib/table-limits.ts`,
   a neproveren).

---

## 2. Poruka o grešci više ne laže

Semantika (utvrđena i ugrađena): **server throw** → `useQuery` BACA tokom
rendera (hvata boundary); **pukla veza** → ništa se ne baca, upiti samo večno
„učitavaju". Stara poruka „Veza je nakratko prekinuta / proveri Convex dev
servis" je stajala na SVAKI throw — slala je na mrežu za serverske greške.

**Web:**
- `apps/web/app/error.tsx` — podrazumevano **„Greška na serveru"** + stvarna
  poruka (`accessErrorMessage`) + sklopivi „Tehnički detalji" (sirovi
  `error.message` + digest) + „Pokušaj ponovo"; varijanta **„Nema veze sa
  serverom"** se prikazuje SAMO kad `useConvexConnectionState()` kaže da
  WebSocket nije povezan (tu ostaje savet o dev servisu).
- `apps/web/lib/errors.ts` — `accessErrorMessage`/`accessErrorCode` izdvojeni iz
  `app-root.tsx` (ogledalo mobilnog `src/lib/errors.ts`); prešli na njega
  `app-root.tsx` i `auth-screen.tsx`.
- `apps/web/components/workspace/workspace-error-boundary.tsx` —
  `WorkspaceErrorBoundary` oko `PageWorkspaceView` (workspace-shell.tsx:896) i
  detalj-dijaloga (workspace-shell.tsx:~1002): pad JEDNE stranice više ne obara
  ceo workspace; kartica u mestu sa pravom porukom, detaljem i retry-jem.
  + `useQueryTolerant` (preko `useQueries`) za PRATEĆE upite: shell-ov
  `detailPage` (footer) i `targetParent` u create dijalogu grešku vraćaju kao
  `undefined` umesto rušenja.
- `apps/web/components/connection-banner.tsx` — baner „Veza sa serverom je
  prekinuta — pokušavam ponovo…" kad veza stoji prekinuta >3 s; montiran u
  `app-providers.tsx` (pokriva i auth ekran).
- **Dokaz uživo:** novi `error.tsx` je tokom provere prikazao pravu grešku
  („Greška na serveru" + „Too many re-renders…") — i time uhvatio stvarni bag u
  prvom nacrtu `useQueryTolerant` (vidi §5).

**Mobilni:**
- `apps/mobile/src/components/connection-banner.tsx` — isti baner (prag 3 s),
  montiran u root `_layout.tsx` IZNAD svega (leči i zamku Z8: večno „Pripremam
  radni prostor" sada ima vidljiv razlog).
- `stranica/[id]` ErrorBoundary: naslov **„Greška na serveru"** + poruka kroz
  `accessErrorMessage` (ranije sirov `error.message`), retry ostaje.
- WebView kanvas na telefonu prikazuje web `error.tsx` — web popravka leči i taj
  ekran.

---

## 3. Kreiranje prima sve što vrsta nosi

Backend NIJE dobio nove mutacije — sve ide kroz postojeće (`areasV2.createPage`
+ `pageTables.importRows` + `pageFiles.generateUploadUrl/attach` +
`areasV2.archivePage`), server ostaje autoritet za granice.

### Zajednički parser — `packages/shared` (`@devotion/shared`)

- `packages/shared/src/table-matrix.ts`: `detectCsvDelimiter` (`,` `;` tab),
  `parseCsv` (RFC 4180 navodnici, BOM, CRLF), `normalizeTableMatrix`,
  `sourceWidth`, `clampCellLengths`, `chunkRows` — JEDNO jezgro za oba klijenta.
- Web `apps/web/lib/csv.ts` → tanak re-export (postojeći importeri i
  `csv.test.ts` netaknuti); mobilni `apps/mobile/src/lib/table-import.ts` → CSV
  grana prešla sa SheetJS-a na `parseCsv` (sada identično tumačenje kao web),
  normalize/clamp/chunk sa shared; XLSX grane ostaju platformske
  (web `read-excel-file`, mobilni SheetJS CDN tarball — izvor NIJE diran).
- Testovi (gol-slučajevi): `packages/shared/src/table-matrix.test.ts` — prazan
  fajl, jedan red, **ćirilica**, **`;` razdvajač**, **BOM**, navodnici sa
  prelomom reda, clamp, serije. Nov vitest projekat `shared` u root
  `vitest.config.ts`.
- `SPREADSHEET_TYPES` (MIME lista za picker) sada jednom, u
  `lib/table-import.ts` — dve lokalne kopije obrisane.

### Web dijalog (`apps/web/components/workspace/create-page-dialog.tsx`)

- **Beleška/Zadatak: nije dirano** — već su imali pun editor tela, odn.
  status/prioritet/izvršioce/rok/instrukcije/checkpointe (gol: „nemoj da pišeš
  ponovo").
- **Tabela:** režim „Uvezi CSV/XLSX" (fajl → matrica → pregled + „Prvi red su
  zaglavlja"; naslov se popuni iz imena fajla) ILI „Ručno" (nazivi kolona +
  grid početnih redova, do 20 — masovno ide uvozom). Posle `createPage` idu
  serije `importRows` po 200 (prva nosi kolone, `replace` briše seed red) sa
  brojačem napretka. **Prva serija padne → stranica se arhivira** (nema huska),
  dijalog ostaje otvoren sa unosom; kasnija serija padne → delimičan uvoz ostaje
  uz jasnu poruku i uputnicu na „Uvezi" u prikazu tabele.
- **Prilozi:** multi izbor (input `multiple` + prevuci-i-pusti), klijentske
  granice iz `lib/page-files.ts` (server presuđuje), sekvencijalni upload sa
  brojačem po fajlu posle kreiranja. **Nijedan fajl ne prođe → stranica se
  arhivira** + poruka; deo prođe → stranica ostaje + spisak neuspelih.
- **„Poništi"** na toast-u uspeha (8 s) → `areasV2.archivePage`; radi za sve
  četiri vrste. Zatvaranje dijaloga je blokirano dok traje upis/otpremanje.
- Kvarne poruke idu kroz `accessErrorMessage` (prava serverska poruka).

**Dokazano mišem (Chrome, Kod Majstora):**
- CSV sa **BOM + `;` + ćirilicom** (`dokazi/proba-cir.csv`) → pregled čist
  (kolone Име/Град/Broj), kreirana tabela **3 kolone × 2 reda**, seed red
  zamenjen, stranica se ODMAH otvara (bivši bag) — potvrda i u bazi:
  `{tableColumnCount: 3, tableRowCount: 2}`.
- Prilozi: 2 fajla odjednom → stranica `L7 prilozi web` sa **`fileCount: 2`**,
  otvara se bez greške.
- **„Poništi"** kliknut → u bazi `archivedAt` upisan (stranica arhivirana).

### Mobilni sheet (`apps/mobile/src/components/canvas/page-create-sheet.tsx`)

- Struktura: obavezno gore (vrsta + naslov), suštinsko po vrsti odmah ispod,
  ostalo iza „Više opcija" (task polja — kao i pre; ručne kolone/redovi tabele).
  `result.pageId` se sada koristi (ranije bacan).
- **Beleška — PUN tentap editor PRE kreiranja** (odluka korisnika): red „Telo
  beleške" menja sadržaj ISTOG sheeta u punu stranu editora
  (`draft-note-editor.tsx`: isti `NOTE_EDITOR_HTML` bundle, ista bridge lista,
  ista `NoteToolbar`; bez autosave-a — telo živi u memoriji do kreiranja).
  Ubacivanje tabele/bloka koda/linka radi (sheet-ovi su BRAĆA glavnog sheeta,
  komande idu kroz ref sa zapamćenom selekcijom — Android gubi selekciju van
  WebView-a). **Prilozi u telu nacrta su onemogućeni uz objašnjenje**
  (traže `pageId`); dodaju se u editoru posle kreiranja. HTML ide u `content`.
- **Tabela:** „Uvezi CSV/XLSX" (`expo-document-picker` → shared parser; iste
  provere kolona/redova/praznog fajla kao web, naslov iz imena fajla) ili ručne
  kolone + redovi kao mini-forme (obrazac `CheckpointDraftList`, do 20 redova).
  Isti create→import tok sa serijama, čišćenjem na padu prve serije i porukom o
  delimičnom uvozu.
- **Prilozi:** galerija (multi) + dokumenti (multi) + kamera;
  `planPageFilePicks` predproverava tip/veličinu/kapacitet PRE kreiranja
  (odbijeni se imenuju), upload posle kreiranja kroz `lib/upload.ts` sa
  brojačem; ista pravila čišćenja kao web.
- **Nacrt:** `src/lib/create-draft.ts` — in-memory store (obrazac `undo.ts`),
  ključ `startup:oblast:roditelj`. Zatvaranje bez uspeha ČUVA nacrt, otvaranje
  ga vraća uz red „Vraćen je nesačuvan nacrt / Odbaci"; uspeh ga briše. Slučajan
  dodir po backdrop-u više ne briše unos (stara svesna odluka zamenjena
  ključevanim nacrtom — nacrt ne može da iskoči pod tuđim zaglavljem).
  Ne preživljava restart aplikacije: SecureStore (~2KB/vrednost) ne prima telo
  od 20KB+; ista odluka kao za undo stek.
- **„Poništi":** `pushUndo` sa novim članom unije `pageCreate`
  (`lib/undo.ts`) + grana u `use-undo-runner.ts` → `areasV2.archivePage`.
- Mete 44pt (segmenti, uklanjanje, „Odbaci"), tekst 16px (statusne mete 13px),
  prazna/učitavanje/greška stanja za nove sekcije (progres faze, hint tekstovi,
  Alert-i sa pravim porukama).

---

## 4. Kapije

| Kapija | Ishod |
|---|---|
| `cd apps/mobile && npx tsc --noEmit` | **0 grešaka** |
| `cd apps/web && npx tsc --noEmit` | **0 grešaka** |
| `npx tsc -p packages/backend/convex/tsconfig.json --noEmit` | **0 grešaka** |
| `npm run lint` | **čisto — 0 grešaka, 0 upozorenja** |
| `npm test` (`vitest run --no-file-parallelism`) | **52 fajla, 451 test — svi prolaze** (14 novih) |
| `npm run build` | **prošao** |

Napomena o testovima: pod punim opterećenjem mašine (Convex+Next+Metro+emulator)
paralelni vitest UME da obara nasumične testove na timeout od 5 s (npr. 7, pa 14
fajlova — svaki put drugi skup, transform >200 s). Sekvencijalni run
(`--no-file-parallelism`) je stabilan i BRŽI (29-75 s). Testovi su isti; ovo je
osobina okruženja, ne koda.

Editor-web bundle NIJE diran (nema regen-a); nema novih ruta (nema typed-routes
regen-a). Podsetnik koji i dalje važi: nijedan linter ne pokriva `apps/mobile` —
mobilno pokriva tsc.

---

## 5. Šta je živa provera uhvatila (a statika nije)

**`useQueryTolerant` — beskonačna petlja rendera.** Prvi nacrt je pravio nov
`queries` objekat na svaki render; `useQueries` na novu referencu pravi novu
pretplatu → „Too many re-renders". Popravka u dva koraka: memoizacija po
sadržaju, pa ključ preko `getFunctionName(query)` — jer je **`api.x.y` Proxy
koji na SVAKI pristup daje novu referencu**, pa je i `useMemo` dep na sam
`query` pucao svaki render. tsc, lint i 451 test nisu videli ništa; novi
`error.tsx` ekran je grešku pokazao S PRAVOM porukom — čime je usput dokazao
i sebe (deo 2 radi).

---

## 6. Šta NIJE urađeno i zašto

- **Prilozi unutar TELA beleške pri kreiranju (mobilni nacrt):** `noteFile`
  čvor traži upload → `pageId`, koji pre kreiranja ne postoji. Onemogućeno uz
  vidljivo objašnjenje u „Dodaj u belešku" sheet-u; dodaju se odmah posle
  kreiranja u istom editoru. (Web dijalog isto ne nudi priloge u telu beleške —
  zatečeno stanje.)
- **Nacrt ne preživljava restart aplikacije** — in-memory po odluci (SecureStore
  limit ~2KB naspram tela od 20KB+); preživljava zatvaranje sheeta i navigaciju,
  što je slučaj iz gola („sheet se slučajno zatvori").
- **Ručni unos redova ograničen na 20 (obe platforme)** — svesna granica UI-ja;
  masovni unos ide uvozom fajla (serije do 5000 redova).
- **Provera na uređaju (emulator):** u toku sesije je emulator pao pod
  opterećenjem mašine i podignut je ponovo; ishodi provere sheeta na uređaju su
  dopisani u §7.

---

## 7. Provera na uređaju (emulator)

Pixel 9 (emulator-5554), development build, svež bundle sa Metro-a (Fast Refresh
je bio ISKLJUČEN u dev klijentu — bez ručnog „Reload" iz Expo menija app vozi
stari kod; usput je emulator jednom pao pod opterećenjem mašine i podignut je
ponovo, `adb reverse` mapiranja ne prežive ni to — Z9 i dalje važi).

| Šta | Ishod | Dokaz |
|---|---|---|
| Nov sheet: 4 vrste + red „Telo beleške" | **Radi** | `dokazi/02-sheet-forma.png` |
| PUN tentap editor kao druga strana sheeta (WebView u sheet-u) | **Radi** — placeholder, kucanje, tastatura | `dokazi/03-editor-strana.png`, `04-editor-kucanje.png` |
| Traka alata iznad tastature (bez E10 duplog ofseta) | **Radi** — `bottom: 0` u KAV sheetu | `dokazi/04-editor-kucanje.png` |
| Bold + aktivno stanje dugmeta (`useBridgeState`) | **Radi** | `dokazi/05-forma-pregled.png` (bold u pregledu) |
| „Gotovo" → pregled tela u redu forme | **Radi** — „Telo sa telefona - lanac 7 Podebljano / Dodirni za uređivanje" | `dokazi/05-forma-pregled.png` |
| Kreiranje beleške sa telom iz editora | **Radi** — telo stiglo u `content`, bold očuvan u pravom editoru | `dokazi/06-kreirano-undo.png`, `07-beleska-telo.png` |
| Undo traka „Poništi" posle kreiranja (`pageCreate`) | **Radi** — „Beleška je kreirana. / Poništi" | `dokazi/06-kreirano-undo.png` |
| Sinhronizacija sa weba | **Radi** — `proba-cir` (kreirana mišem na webu) vidljiva na vrhu Dev liste | `dokazi/02-sheet-forma.png` |
| Zamka Z7 (sheet iznad WebView-a guta touchend) | **Nije se ispoljila** — dodiri u editor rade i posle otvaranja/zatvaranja strane |

**Nije vоženo prstom na uređaju** (prekid provere; kod prošao tsc + deli logiku
sa dokazanim putanjama): vraćanje nacrta posle zatvaranja sheeta; ručne
kolone/redovi tabele na telefonu; izbor priloga kroz sistemske pikere (upload
putanja `upload.ts` → `attach` dokazana ranije na uređaju u K-C i danas mišem na
webu; parser dokazan testovima + webom). Prva sledeća prilika: proći ta tri toka
prstom.
