# Noćni lanac 2 — izveštaj

- Grana: `ui-nocni-20260809-0931`
- Početak: 2026-08-09T09:31:35+02:00
- Model: opus
- Faze: 3 (paritet) → 1 (editor) → 4 (ekrani) → 5 (redizajn) → 6 (pokret) → 7 (provera)

> Ovo piše skripta, ne agent. Ako neka faza kaže „PAO", to je stvarno pala.

---

## Faza 3 — paritet kreiranja i organizacije

- Start: 2026-08-09T09:31:35+02:00
- Izvršavanje: prošlo
- `npm run check`: **prolazi**
- `npm test`: prolazi
- Commit: `a9ea881`
- Dirnuto fajlova: 61

---

### Revizija: Faza 3 — paritet kreiranja i organizacije

Tačke 1–5 i 0.B su urađene; 0.A je nedovršena (dve `console.log` dijagnostike na
mobilnom su ostale). Commit je, međutim, `git add -A` pokupio i veliku količinu
posla van ovog prompta (redizajn, katalog, editor proba) — vidi §3.

**Provereno:** `npm run check` prolazi (izlaz 0; 2 zatečena eslint upozorenja u
`packages/backend`). `npx tsc --noEmit -p apps/mobile/tsconfig.json` prolazi.

#### 1. Tačka po tačka

| Tačka | Ocena | Dokaz |
|---|---|---|
| 0.A uklanjanje dijagnostike | **DELIMIČNO** | Web: `logDiag` i `probe:` u `fd625ae` verziji `canvas-embed.tsx` uopšte nisu postojali; ono što jeste postojalo — `postNative({type:"debug"})` blok + `useStoreApi` — obrisano je (`canvas-embed.tsx`, −21 linija). Mobilni: iz tipa poruke je izbačen `message?: string` (`canvas/[kind]/[id].tsx:179`), ali obe `__DEV__` dijagnostike stoje i dalje: `canvas/[kind]/[id].tsx:151` i `:186`. Grana za `{type:"debug"}` u `onMessage` nikad nije ni postojala. |
| 0.B Z3 u ZA-POPRAVKU | **URAĐENO** | `docs/mobile/ZA-POPRAVKU.md:171-186` — simptom / uzrok / pravilo, isti ton kao Z1 i Z2. |
| 1. `page-create-sheet` za `kind==='task'` | **URAĐENO** | `page-create-sheet.tsx:96-102` (stanje), `:230-246` red „Više opcija" koji se razvija, `:250-328` status/prioritet/rok/izvršioci/instrukcije/podzadaci, `:146-155` slanje opcionih polja u `pages.create`. Za `note` grana ne postoji (`:228`). |
| 2. Kreiranje oblasti | **URAĐENO** | `components/prostor/create-area-sheet.tsx:1-165` (`startups.createArea`, limit 100 = server), ulaz `prostor.tsx:244-250` uz listu oblasti + akcija u praznom stanju `prostor.tsx:226`. |
| 3. Deljeni `AssigneePicker` | **URAĐENO** | `components/zadatak/assignee-picker.tsx:48-156`; korisnici: `page-create-sheet.tsx:341`, `zadatak/[id].tsx:275`, `task-actions-sheet.tsx:187`. Granica nije duplirana — `MAX_TASK_ASSIGNEES` se van `task-meta.ts` pominje samo u `assignee-picker.tsx`. |
| 4. Organizacija stranice | **URAĐENO** | `components/stranica/page-actions-sheet.tsx`: premesti `:117-128`, ugnjezdi `:130-142`, izdvoji `:154-175`, poveži `:144-152`. Brava `:71,:103-106`, potvrda za izdvajanje `:156-174`, greške kroz `accessErrorMessage` `:111`. „Čeka odobrenje" se prikazuje `:139-141` i `:125-127`. Ulaz „…" u zaglavlju: `stranica/[id].tsx:171-177`. |
| 5. Hijerarhija u Prostoru | **URAĐENO** | `prostor.tsx:438-483` (`PageBranch`), `:489-513` deca se dohvataju tek kad se red razvije, `:383-391` stanje razvijenosti u `PageLevel` (živi dok se ne napusti oblast), uvlačenje `:358`, `:514`, `:596`. |
| 6. Bez nove backend funkcije | **POŠTOVANO** | `git diff fd625ae..HEAD -- packages/backend` menja samo `_generated/api.d.ts` (regeneracija; `lib/chat_channels` je iz ranijeg commita `27668e6`). |

#### 2. Nedovršeno / placeholderi u opsegu

- `stranica/[id].tsx:110-127` — `NotePlaceholder`: beleška i dalje nema editor
  („Editor stiže uskoro"). Namerno, čeka merni gejt iz ZA-POPRAVKU §2.
- `vise.tsx:195` — `TODO(Faza 3, §5.1)`: privremeni ulaz u mernu probu editora.
- ZA-POPRAVKU §2, tabela „Brojevi" — sva polja i dalje `—`; merenje na uređaju
  nije obavljeno.
- `dizajn-katalog.tsx:263` i `vise.tsx:158-171` — stavke sa oznakom „uskoro".
- Funkcija koja vraća samo `null` u novom kodu nema; `embedNoteUrl` (`lib/embed-url.ts:33`)
  vraća `null` samo kad `EXPO_PUBLIC_WEB_URL` nije podešen — to je čuvar, ne stub.

#### 3. Napravljeno a nije traženo

Skripta commituje sa `git add -A`, pa je u ovaj commit ušlo i sve što je zateklo
neispraćeno. Van prompta faze 3:

- **Redizajn:** `theme/tokens.ts` (+281/−…), `tailwind.config.js`, `babel.config.js`.
- **Novi UI primitivi:** `ui/row.tsx`, `ui/pill.tsx`, `ui/fab.tsx`, `ui/option-chip.tsx`,
  `ui/section-header.tsx`, `ui/index.ts` (`row.tsx` jeste preduslov za pravilo iz prompta,
  ostali nisu).
- **Prestilizovano ~15 ekrana/komponenti** koje faza 3 ne pominje: `aktivnost`, `clanovi`,
  `ideje`, `pretraga`, `puls`, `pozivnice`, `podesavanja-obavestenja`, `chat/*`,
  `files-panel`, `task-card`, `empty-state`, `avatar`/`badge`/`button`/`card`.
- **`dizajn-katalog.tsx` (485 linija)** + ruta u `_layout.tsx:52` + ulaz u `vise.tsx`.
- **Editor proba:** `apps/web/app/embed/note/[id]/*` (3 nova fajla), prepisan
  `editor-spike.tsx`, `embedNoteUrl` u `lib/embed-url.ts`.
- **Infrastruktura lanca:** `nocni-lanac-2.sh` (450 linija), `promptovi/faza-1-editor.txt`,
  `faza-4/5/6/7.txt`.
- **`.expo/devices.json`** — lokalni artefakt, ne bi trebalo da je u repou.

#### 4. Pravilo „svaki novi red kroz `row.tsx`"

Jedno kršenje: `subpages-section.tsx:62-81` (stil `:165-171`) — zaglavlje
„Podstranice" je dodirni red sklopljen ručno preko `flexDirection:'row'`, iako
`Row` pokriva isti oblik (`page-create-sheet.tsx:230-246` radi upravo to za
„Više opcija" sa `leading` strelicom).

Ostalih 20 novih `flexDirection:'row'` nisu redovi liste: parovi dugmadi
(`create-area-sheet.tsx:157`, `page-create-sheet.tsx:489`), omotač čipova
(`page-create-sheet.tsx:484`), unos + dugme (`checkpoint-draft-list.tsx:151`),
sami primitivi (`row.tsx:197`, `pill.tsx`, `option-chip.tsx`, `section-header.tsx`)
i 6 u `dizajn-katalog.tsx`.

#### 5. Ostale primedbe

- **Tekst ispod 16px na pravim akcijama** (pravilo iz prompta):
  `subpages-section.tsx:213` („Učitaj još", 14), `:228` („Nova podstranica", 14),
  `page-create-sheet.tsx:467` (Beleška/Zadatak segment, 14), `prostor.tsx:882`
  (Lista/Canvas, 14). To nisu badge ni vreme.
- **Uže od weba:** kandidati za ugnježđavanje su samo stranice u korenu oblasti
  (`page-actions-sheet.tsx:85-91`). Razlog je zapisan u komentaru, ali paritet nije pun.
- `NATIVE-BUILD.md` nije napravljen — `apps/mobile/package.json` nije menjan, pa
  pravilo nije ni bilo aktivirano. Menjan je `babel.config.js`, što traži čist
  Metro keš (ne nov native build).
- Trajanje: 29 min

## Faza 1 — editor beleški

- Start: 2026-08-09T10:01:25+02:00
- Izvršavanje: prošlo
- `npm run check`: **prolazi**
- `npm test`: prolazi
- Commit: `36627c9`
- Dirnuto fajlova: 9

### Revizija: Faza 1 — editor beleški

Faza je isporučila editor, ali **ne i ceo traženi minimum: blok koda ne postoji**
(tačka 2), a beleška koja sadrži tabelu, prilog ili blok koda se uopšte ne može
uređivati na telefonu — otvara se samo za čitanje. Sve ostalo iz prompta je
urađeno i provereno.

#### 1. Tačka po tačka

**1. Pun editor za `kind === 'note'`, isti Convex model i format, autosave sa
debounce-om, tolerancija na gubitak veze — URAĐENO.**
- Grana `note` više nije placeholder: `stranica/[id].tsx:88-98`.
- Isti model kao web: `areasV2.updatePage` + `expectedRevision` + `KONFLIKT_IZMENA`
  (`note-editor.tsx:207-232`) — web radi isto (`page-editor-view.tsx:142,289-294,331`).
  Telo je HTML iz Tiptap-a, bez konverzije (`lib/note-content.ts:1-16`).
- Debounce 250 + 450 ms (`note-editor.tsx:53-55`) prema 650 ms na webu
  (`page-editor-view.tsx:349`).
- Gubitak veze: nacrt je u refovima i ne briše se (`note-editor.tsx:100-110`),
  neuspeh se ponavlja na 5 s do 5 puta (`note-editor.tsx:57-59,338-342`), izlaz sa
  ekrana i odlazak u pozadinu šalju poslednju izmenu (`note-editor.tsx:349-402`),
  mutacije idu kroz red čekanja (`note-editor.tsx:125-134`).
- Ograničenje: nacrt nije upisan na disk, pa gašenje aplikacije u offline stanju
  i dalje gubi nesnimljeno. Nije traženo, ali nije ni pokriveno.

**2. Minimum za paritet — DELIMIČNO. Blok koda NIJE isporučen.**
- Podebljano `note-toolbar.tsx:85-92`, kurziv `:93-100`, H1–H3 `:140-163`,
  liste `:165-180`, čekirana lista `:181-188`, link `:117-138` + `note-link-sheet.tsx`.
- Blok koda ne postoji. U traci je samo *inline* `kod`
  (`note-toolbar.tsx:109-116` → `toggleCode`, ne `toggleCodeBlock`). Uzrok je
  potvrđen: `grep -c codeBlock` nad
  `node_modules/@10play/tentap-editor/src/simpleWebEditor/build/editorHtml.js`
  vraća **0** (za `taskList`, `heading`, `bulletList`, `blockquote`, `link` vraća 1).
- Posledica šira od jednog dugmeta: telo sa `<pre>`, `<table>` ili `data-note-file`
  se **ne otvara u editoru nego u prikazu za čitanje**
  (`lib/note-content.ts:28-32`, `note-editor.tsx:143-147,481-503`). Za takve
  beleške mobilni i dalje nema uređivanje — samo je poruka lepša nego ranije.
- Web za poređenje: takođe ima samo inline `code` u traci
  (`rich-text-editor.tsx:340-342`), ali StarterKit mu ostavlja `codeBlock` čvor
  (`rich-text-editor.tsx:177-183`), pa ``` na webu pravi blok koda koji mobilni
  posle ne ume da otvori.

**3. Traka prati tastaturu — URAĐENO (nije provereno na uređaju).**
- Traka je apsolutno pozicionirana u `KeyboardAvoidingView` (`note-editor.tsx:484-492`,
  `styles.toolbarWrap:718-723`) i sakriva se kad tastature nema
  (`note-toolbar.tsx:43-57,82`). `keyboardShouldPersistTaps="always"`
  (`note-toolbar.tsx:241`) da prvi dodir primeni alat.
- `behavior="padding"` na Androidu (obrazloženje: edge-to-edge razbija
  `adjustResize`) je odluka koja se ne može potvrditi bez uređaja.

**4. Ne gubi fokus na svaki autosave — URAĐENO po konstrukciji, nemereno.**
- Nacrt je u refovima, kucanje ne menja stanje (`note-editor.tsx:99-110`), a
  `setSaveState('dirty')` iz `dirty` React odbacuje bez rendera (`:160-165`).
- `useBridgeState` (osvežava se na svaku promenu selekcije) je u traci, ne u
  editoru (`note-toolbar.tsx:65-78`) — `RichText` se zbog toga ne prerenderuje.
- Nepokriveno: ciklus snimanja ipak menja stanje (`dirty→saving→saved`,
  `:205,226`), pa se `RichText` prerenderuje, a tentap `source` gradi inline
  (`node_modules/@10play/tentap-editor/src/RichText/RichText.tsx:54-59`). Po RN
  diff-u nested propova to ne bi trebalo da izazove reload, ali nije isprobano.

**Zahtev o mernom gejtu (sekcija „VAŽNO O MERENJU") — URAĐENO.**
`docs/mobile/ZA-POPRAVKU.md` §2 sada eksplicitno kaže da je editor izgrađen PRE
merenja, da gejt ostaje otvoren, i opisuje plan B (markdown u `TextInput` +
`NoteReader`). Nijedan izmišljen broj nije upisan — tabela „Brojevi" je i dalje
prazna. Nema tvrdnje da je merenje obavljeno.

#### 2. Napravljeno, a nije traženo

- `note-reader.tsx` — verno čitanje HTML tela u `WebView` bez JS-a, linkovi u
  sistemski pregledač.
- `note-link.ts` + `note-link-sheet.tsx` — sopstvena normalizacija adrese bez
  `URL` (RN nema pun polyfill) i sheet za unos.
- Detekcija nepodržanih blokova i pad na čitanje (`note-content.ts:28-53`).
- Traka širi od minimuma: precrtano, citat, uvlačenje/izvlačenje stavke,
  poništi/ponovi (`note-toolbar.tsx:101-108,189-227`).
- Banner za konflikt sa „Kopiraj nacrt" u clipboard (`note-editor.tsx:404-422,516-565`).
- Indikator snimanja sa 7 stanja i ručnim ponavljanjem (`note-editor.tsx:567-636`).
- CSS teme za editor i čitanje (`note-content.ts:111-244`).
- `UnexpectedKind` prazno stanje za `task` na ovom ekranu (`stranica/[id].tsx:112-131`).

#### 3. Nedovršeno (placeholderi, TODO, `return null`)

- Nema nijednog `TODO`/`FIXME` ni prazne komponente u diffu.
- `return null` postoji 2 puta i oba su namerna: traka se sakriva bez tastature
  (`note-toolbar.tsx:82`), indikator se ne prikazuje kad korisnik ne sme da menja
  (`note-editor.tsx:588`).
- Otvoreno, ali zapisano: blok koda, ubacivanje slika/priloga u telo (web ima
  `note-file-node`), uređivanje tabela — sve tri rupe su nabrojane u
  `ZA-POPRAVKU.md` §2, tačke 1–3.
- `editor-spike.tsx` i ulaz u „Više" i dalje stoje (namerno — gejt je otvoren).
  Web ruta `/embed/note/[id]` je sada bez korisnika, jer je izabran tentap.
- `NATIVE-BUILD.md` i dalje ne postoji. `package.json` nije menjan, pa pravilo
  nije aktivirano, ali napomena da tentap ima native deo (moguć nov dev build)
  završila je u `ZA-POPRAVKU.md`, ne u `NATIVE-BUILD.md`.

#### 4. `flexDirection: 'row'` mimo `components/ui/row.tsx`

6 novih pojava, nijedna nije red liste, pa `Row` nije mogao da se upotrebi:
`note-editor.tsx:643` (naslov + indikator), `:659` (indikator), `:671` (traka
napomene), `:699` i `:704` (par dugmadi u banneru), `note-link-sheet.tsx:196`
(par dugmadi). `note-toolbar.tsx` nema nijednu — koristi horizontalni `ScrollView`.
Prekršaja nema.

#### 5. Backend

`git diff --name-only 26a1680..HEAD -- packages/backend` je **prazan**. Nijedna
nova funkcija, nijedna izmena šeme. Editor koristi postojeći `areasV2.updatePage`.

#### 6. Ostale primedbe

- **Naslov se vidi dvaput**: u zaglavlju ekrana (`stranica/[id].tsx:134-190`,
  vrednost sa servera) i kao `TextInput` u editoru (`note-editor.tsx:458-467`,
  lokalni nacrt). Dok se kuca, dva prikaza se razilaze.
- Provereno lokalno: `npm run check` prolazi, `tsc --noEmit -p apps/mobile/tsconfig.json`
  prolazi (izlaz 0). Tvrdnje iz izveštaja faze o proverama su tačne.
- Ništa od isporučenog nije pokrenuto na uređaju ni emulatoru — ni u fazi, ni u
  ovoj reviziji.
- Trajanje: 37 min

## Faza 4 — ekrani koji fale

- Start: 2026-08-09T10:39:09+02:00
- Izvršavanje: prošlo
- `npm run check`: **prolazi**
- `npm test`: prolazi
