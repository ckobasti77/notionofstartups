# Noćni lanac — ostatak Faze 3 i cela Faza 4

> Šest koraka, strogo ovim redom. Radim sam, korisnika nema.
>
> **Posle SVAKOG koraka:** commit + dopiši red u `docs/mobile/NOCNI-LOG.md` +
> commit loga. Taj log je jedini način da se ujutru zna dokle se stiglo.

---

## Format loga

Posle svakog koraka dopiši jedan blok u `docs/mobile/NOCNI-LOG.md`:

```
## [HH:MM] KORAK N — naziv
Status: GOTOVO | DELIMIČNO | BLOKADA
Fajlovi: (putanje)
Preskočeno: (šta i zašto, pošteno)
npm run check: prolazi / puca (poruka)
```

Log se commit-uje odmah, pre nego što kreneš na sledeći korak. Ako run pukne,
poslednji blok govori gde.

---

## Pravila za sve korake

- **Ne diraj `apps/web` ni `packages/backend`** osim gde korak to izričito traži
  (korak 4 je jedini web korak).
- Dodirna meta min **44 pt**, tekst min **16 px**, safe area.
- Svaki ekran ima **prazno, učitavanje i greška** stanje.
- Postojeći primitivi iz `src/components/ui/`, bez novih varijanti.
- Paketi isključivo `npx expo install`.
- **`npm run check` mora da prolazi posle svakog koraka.** Ako pukne, popravi
  pre nego što kreneš dalje. Ne gomilaj.

### ⚠️ Zabranjeno

**Ne praviti prazne placeholder komponente da bi provera prošla.** Ako ne umeš
neki deo — ostavi ga, upiši u log pod „Preskočeno", nastavi. To je pošteno i
računa se. Prazna komponenta koja se kompajlira je gore od nedostajuće.

---

# KORAK 1 — M3.3 Tabele i prilozi

Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.4, `packages/backend/convex/pageTables.ts`,
`pageFiles.ts`, i web pandane `tables/page-table-panel.tsx`, `files/page-files-panel.tsx`.

**Tabele:**
- Zamrznuta prva kolona uz horizontalno skrolovanje ostatka
- Tap na ćeliju → bottom sheet za izmenu (ne inline)
- Paginacija redova, `MAX_TABLE_PAGE_SIZE` 200
- Limiti: `MAX_TABLE_COLUMNS` 64, `MAX_TABLE_ROWS` 5000, `MAX_TABLE_CELL_LENGTH` 2000
- Dodavanje i brisanje reda

**Prilozi:**
- Upload iz galerije (`expo-image-picker`) i kamere (`expo-camera`)
- Kategorije iz `pageFileCategoryValidator`
- Slike i PDF u aplikaciji, ostalo kroz sistemski otvarač
- Brisanje uz potvrdu

**Ispravka:** ranija verzija ovog lanca je rekla da uvoz Excela ostaje web-only —
to je protivrečilo `02-EKRANI.md` §9.4, koji je merodavan i traži uvoz i na
mobilnom. Uvoz je implementiran na mobilnom preko `xlsx` (SheetJS) + `expo-file-system`
(ne `read-excel-file`, koji na RN ne radi). Detalji su u §9.4 i u
`apps/mobile/src/lib/table-import.ts`.

---

# KORAK 2 — M3.4 Pretraga

Pročitaj `packages/backend/convex/search.ts` i `apps/web/components/workspace/search-dialog.tsx`.

- Ekran preko celog ekrana, otvara se iz ikonice u headeru
- Rezultati grupisani po tipu: stranice, zadaci, ideje, misli, poruke
- **Debounce** na unosu
- Tap na rezultat vodi na odgovarajući ekran
- Autofokus pri otvaranju
- Dva prazna stanja: pre kucanja i bez rezultata

---

# KORAK 3 — M4.1 Odobrenja

Pročitaj `apps/web/components/workspace/approvals-view.tsx` (28 KB) i
`packages/backend/convex/collaboration.ts`.

- Ekran odobrenja u tabu Više, sa badge-om za broj koji čeka
- Zahtevi za brisanje (`deletionRequests`) sa glasanjem (`deletionBallots`)
- Zahtevi za ugnježdavanje (`nestingRequests`, `pageNestingRequests`)
- Jasno: šta se traži, ko je tražio, koliko glasova fali
- Glasanje jednim tapom, sa potvrdom za nepovratne radnje

Ovo je ekran gde je mobilni **bolji** od desktopa — glasa se u pokretu. Neka
bude brz i čitljiv na prvi pogled.

---

# KORAK 4 — W4.2 Embed rute za canvas ⚠️ jedini web korak

Pročitaj `docs/mobile/00-PLAN.md` sekciju 5.2 i postojeće preview rute:
`apps/web/app/canvas-preview/`, `codex-ideas-preview/`, `codex-thought-flow-preview/`.

Napravi `apps/web/app/embed/canvas/[kind]/[id]/page.tsx`:

- Ista `@xyflow/react` komponenta, **bez** sidebara i chrome-a
- Autentikacija tokenom iz query parametra
- Touch-friendly kontrole (veći hit target, pan/zoom bez miša)
- `postMessage` protokol iz dokumenta:
  - WebView → native: `{type:"node:open", nodeId}`, `{type:"selection", ids}`
  - native → WebView: `{type:"theme", mode}`, `{type:"focus", nodeId}`

`kind` je jedno od: `thoughts`, `ideas`, `area`, `page`.

---

# KORAK 5 — M4.3 Mobilni canvas

Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.3.

- Full-screen ekran: native header + `react-native-webview` + native akcioni rail
- WebView učitava embed rutu iz koraka 4
- Tap na node → `postMessage` → native bottom sheet sa detaljem
- Rail: zoom −/+, centriraj, dugme za novi node

**Sudar gestova:** WebView uzima pan i zoom, native zadržava swipe-back.
Ako se biju, isključi swipe-back na tom ekranu i stavi dugme „nazad" u header.

---

# KORAK 6 — M4.4 Ideje i admin

**Ideje:**
- Lista ideja sa glasanjem (native, bez WebView-a)
- Canvas ideja kroz WebView iz koraka 5
- Podaci iz `packages/backend/convex/ideas.ts`

**Admin** (samo `role === "admin"`, kroz `requireAdmin`):
- Članovi tima — `startups.listMembers`
- Pozivnice — `invites.ts`, kreiranje i opoziv

Ako korisnik nije admin, stavke se ne prikazuju u tabu Više.

---

# Na kraju — `docs/mobile/NOCNI-IZVESTAJ-FAZA34.md`

```markdown
# Noćni izveštaj — Faza 3 (ostatak) i Faza 4

## Rezime
Koraka gotovo: N/6

## Po koracima
(za svaki: status, fajlovi, šta je preskočeno i zašto)

## BLOKADE
(gde mi treba Jovan. Ako nema — „nema")

## Odluke koje sam doneo sam
(gde specifikacija nije bila jasna)

## Šta Jovan mora vizuelno da proveri
(konkretna lista ekrana i šta na svakom pogledati)

## Šta bih uradio drugačije
(pošteno — gde sam nesiguran u rešenje)
```
