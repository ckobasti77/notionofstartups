# Noćni log — ostatak Faze 3 i cela Faza 4

> Radim sam po `docs/mobile/zadaci/lanac-faza-3-4.md`. Posle svakog koraka:
> commit koda → dopiši blok ovde → commit loga → sledeći korak.
>
> Grana: `faza-3-nocni`. Baseline: mobile `tsc --noEmit` = 0, `npm run check` = 0.

---

## [00:54] KORAK 1 — M3.3 Tabele i prilozi
Status: GOTOVO
Fajlovi:
- `apps/mobile/src/app/(app)/stranica/[id].tsx` (grananje po `kind`)
- `apps/mobile/src/components/stranica/table-panel.tsx` (485 r)
- `apps/mobile/src/components/stranica/cell-edit-sheet.tsx` (287 r — `CellEditSheet` + `ColumnEditSheet`)
- `apps/mobile/src/components/stranica/files-panel.tsx` (413 r)
- `apps/mobile/src/components/stranica/file-preview.tsx` (104 r)

Šta radi:
- **Tabele** (`kind === 'table'`): zamrznuta prva kolona + horizontalni skrol
  ostatka uz zajednički vertikalni skrol; tap na ćeliju → bottom sheet (ne
  inline); paginacija redova (`usePaginatedQuery`, 50/serija, „Učitaj još");
  dodavanje/brisanje reda i kolone (samo autor, `canEditStructure`); vrednost
  ćelije menja svaki član. Limiti (2000 znakova ćelija, 120 naziv kolone)
  mirror-ovani lokalno kao u `lib/task-meta.ts`.
- **Prilozi** (`kind === 'file'`): upload iz galerije (`expo-image-picker`),
  kamere (`launchCameraAsync`) i sistemskog birača (`expo-document-picker`);
  kategorije iz `pageFileCategoryValidator` → ikona+labela; slika i PDF u
  aplikaciji (`FilePreview`: `expo-image` / `WebView`), ostalo kroz sistemski
  otvarač (`expo-web-browser`); brisanje uz potvrdu; `canManage` iz
  `pages.get.permissions.canEdit`. Upload flow preslikan iz `message-composer`.
- Sva tri stanja: učitavanje (spinner), prazno (`EmptyState` + poziv na akciju),
  greška (route `ErrorBoundary`).

Preskočeno (pošteno):
- **Uvoz Excela** — ostaje web-only (spec izuzetak). `importRows` mutacija postoji,
  ali mobilni nema parser tabela; nije žrtvovan prostor na to.
- **`pageFiles.reorder`** — drag-reorder priloga je desktop-ergonomija; na
  mobilnom redosled po vremenu. Zapisano u komentaru komponente.
- **`note` editor** — beleška i dalje placeholder; rich-text editor je zaseban
  kolosek (M3.2 „measure-then-decide"), van ovog koraka.
- **`expo-camera`** — nije instaliran; `ImagePicker.launchCameraAsync` pokriva
  „slikaj" bez teške native kamere. Svesna odluka, bez novog paketa.

Kamera/kamera-dozvola i sistemski otvarač se ne mogu proveriti u ovom okruženju
(nema uređaja); logika je preslikana iz već postojećeg, radnog chat upload-a.

Pregled (`rn-review`): popravljena 1 blokada + 5 nalaza (zaseban commit):
`KeyboardAvoidingView behavior="padding"` na oba OS-a (Android tastatura je
prekrivala unos u sheet-u); osnovni tekst tabele i CTA podignut na ≥16px;
`insets.bottom` u listi priloga / skrolu tabele / preview kontejneru;
`accessibilityRole="button"` na backdrop-ima.

`tsc --noEmit` (apps/mobile): **0**
`npm run check` (root): **0**

---

## [01:06] KORAK 2 — M3.4 Pretraga
Status: GOTOVO
Fajlovi:
- `apps/mobile/src/app/(app)/pretraga.tsx` (377 r — nov ekran)
- `apps/mobile/src/app/(app)/_layout.tsx` (registracija rute)
- `apps/mobile/src/components/app-header.tsx` (ikonica pretrage → `/pretraga`)

Šta radi:
- Full-screen ekran, otvara se iz ikonice pretrage u `AppHeader` (bila „prazna"
  do sada). Header: back + search box (autofokus, clear dugme).
- Izvori i grupe: `search.pages` → **Zadaci** (`kind === 'task'`) i **Stranice**
  (ostale vrste); `chat.searchMessages` → **Poruke**. Obe query-je scope-ovane na
  aktivni startup.
- Debounce 300ms; tap na rezultat → `zadatak/[id]` / `stranica/[id]` / `razgovor/[id]`.
- Stanja: prompt pre kucanja (< 2 znaka), spiner (uklj. debounce prozor),
  „nema rezultata", „izaberi startup" (kad `activeStartupId` još null), i route
  `ErrorBoundary`.

Preskočeno (pošteno):
- **Ideje i misli** — spec traži i te grupe, ali `ideaNodes`/`thoughtNodes` nemaju
  full-text search indeks u backendu, a korak 2 je mobile-only (bez backend
  izmena). Nisu lažirane kao prazne grupe. Da bi radile, treba backend korak
  (search indeksi) + izlaganje kroz `search.ts` — van ovog koraka. **Za Jovana.**
- **Web paritet za „Poruke"** — web `search-dialog.tsx` još ne prikazuje poruke
  (mada `chat.searchMessages` postoji). Mobilni ide ispred; web dohvatiti kasnije.

Pregled (`rn-review`): bez blokade; popravljeno 5 nalaza (zaseban commit) —
clear dugme + visina inputa na 44pt, četvrto stanje bez izabranog startupa,
`automaticallyAdjustKeyboardInsets` (iOS), `accessibilityLabel` na polju.

Typed routes regenerisani (`expo start --offline`, pa ugašen) da `/pretraga`
bude tipizovana ruta — `.expo/` je gitignored, ništa se ne commit-uje.

`tsc --noEmit` (apps/mobile): **0**
`npm run check` (root): **0**

---

## [01:15] KORAK 3 — M4.1 Odobrenja
Status: GOTOVO
Fajlovi:
- `apps/mobile/src/app/(app)/odobrenja.tsx` (424 r — nov ekran)
- `apps/mobile/src/app/(app)/_layout.tsx` (registracija rute)
- `apps/mobile/src/app/(app)/(tabs)/vise.tsx` (živi badge + ruta `/odobrenja`)

Šta radi:
- Ekran u tabu „Više" (bivši statični badge „2" → **živi broj**:
  `overview.pendingCount + listNestingInbox.incoming`).
- Objedinjuje tri izvora u iste kartice:
  1. **Brisanje** (`overview.requestsForVote` + `deletionBallots`) — jednoglasnost:
     jedan „Protiv" odmah odbija, „Za" briše tek kad svi odobre; kartica pokazuje
     „fali još N glasova ZA". Ko traži → `startups.listMembers` (limit 50).
  2. **Ugnježdavanje ideja** (`collaboration.resolveNesting`) — child → parent,
     Odobri/Odbij.
  3. **Ugnježdavanje stranica** (`areasV2.approveNesting/rejectNesting`) — isto.
- Svaka nepovratna radnja (i „Za brisanje" i svaki „Protiv"/„Odbij", jer trajno
  zatvaraju tuđi zahtev) traži potvrdu. Po-kartica zaključavanje tokom mutacije.
- Stanja: učitavanje, prazno („Sve je čisto"), „izaberi startup", `ErrorBoundary`.

Preskočeno (pošteno):
- **Moji zahtevi / istorija / vraćeni sadržaj** — `overview` ih vraća
  (`myRequests`, `history`, `recovered`) i web ih prikazuje, ali mobilni ekran je
  namerno fokusiran na ono što čeka MOJU odluku („glasanje u pokretu"). Read-only
  pregled sopstvenih zahteva je sekundaran; ostavljen za kasnije. **Za Jovana.**

Pregled (`rn-review`): 1 blokada + 3 naloga popravljena (zaseban commit) —
`insets.bottom` na listi; potvrda i za „Protiv"/„Odbij"; `listMembers` limit 50;
zauzeta kartica više ne zaključava ostale.

Typed routes regenerisani za `/odobrenja` (isti postupak kao korak 2).

`tsc --noEmit` (apps/mobile): **0**
`npm run check` (root): **0**

---

## [01:29] KORAK 4 — W4.2 Embed rute za canvas ⚠️ jedini web korak
Status: GOTOVO (za `ideas`; `thoughts`/`area`/`page` DELIMIČNO — vidi Preskočeno)
Fajlovi (svi novi):
- `apps/web/app/embed/canvas/[kind]/[id]/page.tsx` (50 r)
- `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` (250 r)
- `apps/web/app/embed/canvas/[kind]/[id]/error.tsx` (31 r)

`wc -l` napomena: `error.tsx` je 31 red (< 40), ali **nije placeholder** — to je
funkcionalna Next granica greške (`"use client"`, prima `error`+`reset`, prikazuje
poruku i dugme „Pokušaj ponovo"; hvata npr. `requireStartupMember` bacanje kad
token nema pristup). Kompaktna je jer joj je posao uzak.

Bitno otkriće: preview rute iz zadatka (`app/canvas-preview/` itd.) **postoje ali
su prazni direktorijumi** — nije bilo šta da se kopira. Canvas view komponente
(`IdeasCanvasView`…) primaju već razrešene podatke + gomilu callback-a i traže
1000-redova kontejner (`ideas-view.tsx`), pa se ne mogu „samo umetnuti".

Šta radi:
- Ruta `/embed/canvas/[kind]/[id]?token=<jwt>&theme=<light|dark>` — pun ekran, bez
  sidebara/chrome-a (root layout obavija samo providere).
- **Token-auth**: zaseban `ConvexReactClient` + `setAuth(() => token)` (sinhrono,
  pre prvog upita), obmotan u `ConvexProvider` koji zaseni cookie-auth iz layout-a.
- **Ideje**: read/nav `@xyflow/react` (v12) iz `api.ideas.list`; apsolutne pozicije
  (sabiranje relativnih offseta uz lanac roditelja), bez editovanja layouta
  (ergonomija sa §5.2). Touch kontrole (krupnije `Controls`, pinch/pan).
- **postMessage protokol** (§5.2): WebView→native `node:open`, `selection`, `ready`;
  native→WebView `theme`, `focus` — plus prošireno `zoom`/`fit` da mobilni rail
  (korak 5) ima mete (zaseban commit, i dalje unutar web koraka).
- Stanja: učitavanje, prazno („Prazan kanvas"), token/kind splash, `error.tsx`.

Provereno u browseru (dev server na :3000):
- `/embed/canvas/ideas/test-id` (bez tokena) → splash „Nedostaje token", bez greške.
- `…?token=faketoken&theme=dark` → token-klijent **stvarno ispalio** autentikovan
  `ideas.list`; backend vratio `ArgumentValidationError` (jer „test-id" nije Id),
  a `error.tsx` boundary to uhvatio i prikazao čisto — nema belog ekrana.
  (Pun render sa pravim podacima traži validan token+startupId sa uređaja.)

Preskočeno / DELIMIČNO (pošteno):
- **`thoughts` / `area` / `page` kanvasi** — ruta ih prihvata, infrastruktura
  (auth, tema, protokol) je zajednička, ali dohvat podataka za njih nije povezan;
  svaki traži svoj kontejner-nivo plumbing (drugačiji upiti i oblik čvorova).
  Prikazuju čistu poruku „još nije povezan". `ideas` je kritična vrsta za korake
  5–6, pa je ona odrađena end-to-end. **Za Jovana:** ostale vrste su sledeći web
  posao (po uzoru na `ideas`).

`npm run check` (root, uklj. `next build` + tsc): **0** (embed ruta = ƒ dynamic)

---
