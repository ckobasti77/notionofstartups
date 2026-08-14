# Lanac 7 — kreiranje kompletno + `pages:get` puca

> Status: odobren plan, implementacija u toku. Svaka stavka na kraju dobija dokaz
> (fajl + linija, izlaz komande ili snimak) u `BRIEF.md`.

## 0. Zatečeno stanje (utvrđeno istraživanjem, menja obim)

**Bug iz stavke 1 je već dijagnostikovan i popravljen — nekomitovano.** Sesija „Provera
lanca 6 na uređaju" (`docs/mobile/PROVERA-NA-UREDJAJU.md`, kvar K-B) ostavila je u radnom
stablu:

- Uzrok (doslovno iz logcat-a te sesije):
  `ReturnsValidationError: Object contains extra field 'tableColumnCount' that is not in
  the validator.`
- U HEAD stanju je `pageDocumentValidator` lokalan u `pages.ts` i nosi samo
  `treeRevision` + `canvasPreview`; šest polja iz šeme fali: `fileCount`,
  `filePreviewStorageId`, `filePrimaryCategory`, `tableRowCount`, `tableColumnCount`,
  `sourceMessageId`. Convex returns validator odbija VIŠAK polja → klijent vidi samo
  „Server Error". Sveža tabela pada jer create odmah upiše
  `tableRowCount: 1, tableColumnCount: 1` (`lib/page_tables.ts:115-120` pozvan iz
  `lib/page_creation.ts:298-319`); svež prilog-oblačić pada zbog `fileCount: 0`
  (`page_creation.ts:321`); stranica nastala iz chat poruke zbog `sourceMessageId`.
- Popravka u radnom stablu: `pageDocumentValidator` premešten u
  `packages/backend/convex/lib/validators.ts` sa svih šest polja + netrackovan parity
  test `packages/backend/convex/pages.validator.test.ts`. Dev deployment već vozi
  popravku (provereno kroz `npx convex run pages:get` — prolazi).

**Poruka „Veza je nakratko prekinuta"** živi isključivo u `apps/web/app/error.tsx:25-27`
(Next root boundary). Semantika u celom sistemu: server throw → `useQuery` BACA tokom
rendera; pukla veza → ništa ne baca, upiti večno „učitavaju" (mobilna zamka Z8).
`connectionState` se nigde ne koristi. Mobilni WebView (kanvas) prikazuje bas taj web
`error.tsx`, pa web popravka leči i telefon.

**Kreiranje:** web dijalog VEĆ šalje telo beleške (pun editor) i sva task polja kroz
`api.areasV2.createPage`; mobilni sheet VEĆ šalje task polja, telo je plain-text.
`file`/`table` ne nude ništa ni na jednoj strani. `result.pageId` se na mobilnom baca,
nacrt se briše na svako zatvaranje. Import tabele postoji na obe strane ali post-create;
prilozi multi-upload postoji na obe strane ali post-create. Backend ne traži nijednu novu
mutaciju.

**Duplikat parsera:** web `apps/web/lib/csv.ts` + `normalizeTableMatrix` naspram mobilnog
`apps/mobile/src/lib/table-import.ts` (CSV kroz SheetJS + svoj normalize/clamp/chunk).
`editor-web` NEMA kopiju (uvoz u telo beleške na mobilnom je native-side u
`note-insert-sheet.tsx`). XLSX čitanje ostaje platformsko: web `read-excel-file`,
mobilni SheetJS sa CDN tarball-a (izvor se NE menja — CVE istorija npm paketa).

## 1. Deo 1 — `pages:get` (prioritet)

| # | Stavka | Dokaz |
|---|---|---|
| 1.1 | Zadržana zatečena popravka (validators/pages/parity test), ništa se ne piše iznova | git diff |
| 1.2 | Novi testovi u `pages.test.ts`: `create` → `get` za sva 4 kind-a bez sadržaja (tabela očekuje `tableRowCount:1, tableColumnCount:1, content:""`; file `fileCount:0`) | test fajl + zelen run |
| 1.3 | Crveno→zeleno: `git stash push -- …/lib/validators.ts …/pages.ts` → vitest pad sa doslovnim `ReturnsValidationError` → `git stash pop` → zeleno; tekst greške doslovno u BRIEF | izlazi obe komande |
| 1.4 | `table-limits-parity.test.ts` dobija `MAX_TABLE_IMPORT_BATCH` (mirror već postoji u `apps/mobile/src/lib/table-limits.ts`, parity lista ga ne proverava) | test + run |

## 2. Deo 2 — „veza pala" ≠ „funkcija bacila"

Web:
- `apps/web/lib/errors.ts`: izdvojen `accessErrorMessage`/`accessErrorCode` iz
  `components/app-root.tsx:53-73` (ogledalo mobilnog `src/lib/errors.ts`);
  `app-root.tsx` i `auth-screen.tsx` prelaze na njega.
- `app/error.tsx`: podrazumevano „Greška na serveru" + stvarna poruka + sklopivi detalj
  (`error.message`, digest) + „Pokušaj ponovo"; varijanta o prekinutoj vezi SAMO kad
  `useConvexConnectionState()` kaže da WebSocket nije povezan.
- `WorkspaceErrorBoundary` (obrazac `SearchResultsBoundary`) oko površina koje zovu
  `pages.get` (`page-workspace-view`, detalj-dijalog u `workspace-shell`) — pad jedne
  stranice ne obara ceo workspace.
- Baner veze (`useConvexConnectionState`, prag ~3 s) u app shell-u.

Mobilni:
- Isti baner veze u root `_layout.tsx` (leči i Z8 — večno „Pripremam radni prostor"
  dobija vidljiv razlog).
- `stranica/[id]` ErrorBoundary: okvir „Greška na serveru" + detalj + retry.

## 3. Deo 3 — kreiranje prima sve

### 3a. Zajednički parser — nov paket `packages/shared` (`@devotion/shared`)
- `src/table-matrix.ts`: `detectCsvDelimiter`, `parseCsv` (BOM, `;`, navodnici),
  `normalizeTableMatrix`, `clampCellLengths`, `chunkRows` — jezgro seli iz
  `apps/web/lib/csv.ts` i `apps/mobile/src/lib/table-import.ts`.
- Web `lib/csv.ts` → tanak re-export; mobilna CSV grana prelazi sa SheetJS-a na
  `parseCsv` (ponašanje identično webu); XLSX grane ostaju platformske.
- Testovi (prazan fajl, jedan red, ćirilica, `;`, BOM, navodnici) u paketu; nov vitest
  projekat u root `vitest.config.ts`. Next već ima `externalDir`, Metro već prati
  workspace root.

### 3b. Tok kreiranja
- Tabela: matrica PRE create-a → `createPage` → `pageTables.importRows` serije po 200
  (prva `columns` + `mode:"replace"`). Prva serija padne → `areasV2.archivePage` (nema
  huska) + poruka; kasnija padne → delimičan uvoz ostaje + poruka i uputnica na ponovni
  uvoz u prikazu tabele. Server ostaje autoritet za granice.
- Prilozi: izbor PRE create-a → `createPage` → sekvencijalni upload → po fajlu ishod.
  Nijedan uspeo → arhiviraj + poruka; deo uspeo → stranica ostaje + spisak neuspelih.
  Zatvaranje blokirano tokom uploada.
- „Poništi" posle kreiranja: web toast sa akcijom → `areasV2.archivePage`; mobilni
  `pushUndo` sa novim `UndoAction` članom `pageCreate` + case u `use-undo-runner.ts`.

### 3c. Web dijalog (`create-page-dialog.tsx`)
- `table`: „Uvezi CSV/XLSX" (fajl → matrica → pregled + „Prvi red su zaglavlja") ili
  „Ručno" (nazivi kolona + mali grid početnih redova); progres serija.
- `file`: multi izbor + prevuci-i-pusti, klijentske granice iz `lib/page-files.ts`,
  po-fajlu status.
- `note`/`task`: ne dira se (već kompletno).

### 3d. Mobilni sheet (`page-create-sheet.tsx`)
- Obavezno gore (vrsta, naslov); suštinsko po vrsti odmah ispod; ostalo iza „Više
  opcija". `result.pageId` se koristi.
- Tabela: `expo-document-picker` → shared parser → create+import tok; ručno kolone +
  redovi kao stack mini-forma (obrazac `CheckpointDraftList`).
- Prilozi: galerija multi + dokumenti multi + kamera; `planPageFilePicks` pre create-a;
  upload posle create-a sa brojačem.
- Beleška — pun tentap editor PRE kreiranja (odluka korisnika): red „Telo beleške"
  otvara editor kao drugu, punu visinu ISTOG sheet-a (swap sadržaja u istom RN Modalu —
  ništa ne stoji iznad WebView-a). Nova lean komponenta `draft-note-editor.tsx`
  (isti `NOTE_EDITOR_HTML` + bridge lista, bez autosave-a); ubacivanje tabele radi,
  ubacivanje priloga u telo onemogućeno uz hint (traži pageId). Fallback ako se
  WebView-u-Modalu loše ponaša na emulatoru: pushed ruta `nacrt-beleske` + auto-reopen
  sheeta kroz draft store (tada regen typed routes). Provera na emulatoru pre zatvaranja,
  uključujući slučaj „podstranica iz otvorene beleške" (dva istovremena editora).
- Nacrt: `src/lib/create-draft.ts` — module-level store (obrazac `undo.ts`), ključ
  `${startupId}:${areaId}:${parentPageId ?? 'root'}`; zatvaranje bez uspeha čuva,
  otvaranje vraća (+ „Odbaci nacrt"), uspeh briše. In-memory: preživljava slučajno
  zatvaranje/navigaciju, ne restart (SecureStore ~2KB limit ne prima telo od 20KB).
- Mete 44pt, tekst 16px (meta izuzetak), tri stanja svuda.

## 4. Kapije

```
cd apps/mobile && npx tsc --noEmit
cd apps/web    && npx tsc --noEmit
npx tsc -p packages/backend/convex/tsconfig.json --noEmit
npm run lint
npm test
npm run build
```

Podsetnici: nijedan linter ne pokriva `apps/mobile` (tsc je jedina mreža); editor-web
bundle se NE dira (nema regen-a) osim ako fallback ruta ne zatraži izmenu bridge liste.

## 5. Kraj

`docs/mobile/lanac7/BRIEF.md`: uzrok doslovno prepisan (crveni test/logovi), urađeno po
vrsti stranice, šta nije urađeno i zašto (prilozi u telu nacrta beleške; in-memory
nacrt), commit.
