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
