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
- Commit: `d4789a1`
- Dirnuto fajlova: 21

---

### Revizija: Faza 4 — ekrani koji fale

Sve sedam tačaka je obrađeno: šest native, sedma (`workspace-history`) odbijena i
zapisana kao izuzetak, što prompt izričito dozvoljava. Dva pravila iz podnožja
prompta su prekršena: dva nova zaglavlja su sklopljena ručno umesto kroz `Row`, a
pet novih akcija ima tekst na 14px.

**Provereno:** `npm run check` prolazi (izlaz 0), `npx tsc --noEmit -p apps/mobile/tsconfig.json`
prolazi (izlaz 0). Ništa nije pokrenuto na uređaju ni emulatoru.

#### 1. Tačka po tačka

| Tačka | Ocena | Dokaz |
|---|---|---|
| 1. `home-view` → početni pregled | **URAĐENO** | `components/danas/day-summary.tsx:28-117` (pozdrav + 3 brojača sa skeletom), render `danas.tsx:365-370`, brojači `danas.tsx:187-203`. Odluka („proširuje se Danas, ne pravi se nov ekran") je obrazložena u telu commita `aadc176` i u `02-EKRANI.md:146-160` sa tabelom gde je koji deo `home-view` otišao. `command-center-view` je već pokriven tabom Danas iz Faze 2. |
| 2. `area-briefing-dock` → brifing oblasti | **URAĐENO** | `components/prostor/area-briefing-section.tsx:40-195`, ulaz `prostor.tsx:175-176`. Čita `areasV2.getAreaCanvasByArea → scope.briefing`, upisuje `areasV2.updateAreaBody` sa `expectedRevision` (`:106-111`) — isti model kao web (`area-briefing-dock.tsx:46`). Snima na blur (`:165`) i dugmetom (`:185-192`), read-only grana za ne-kreatora (`:130-147`), limit 20.000 se poklapa sa `areasV2.ts:89`. |
| 3. `workload-strip` → opterećenje tima | **URAĐENO** | `components/danas/workload-strip.tsx:34-114`, render `danas.tsx:329-337`. Brojači se računaju iz svih otvorenih zadataka (`danas.tsx:121-166`), filter samo u segmentu „Pregled" (`:188-198`), reset na promenu startupa (`:206-208`), prazno stanje sa „Prikaži sve" (`:341-348`). Traka je van skrola liste, kako doc i tvrdi. Ponašanje se poklapa sa web `workload-strip.tsx:49-79`. |
| 4. `page-relations` → veze između stranica | **URAĐENO** | `components/stranica/relations-section.tsx:34-217`; ulaz na stranici `stranica/[id].tsx:93-98`, na zadatku `zadatak/[id].tsx:257-264`. Otvaranje druge strane `:158-164`, brisanje/glasanje po serverskim dozvolama `:70-103` (`areasV2.deleteRelation` / `collaboration.requestDeletion` sa `page_relation`). Pravljenje veze nije duplirano — `PageActionsSheet` je dobio `initialView` (`page-actions-sheet.tsx:35,60-80`) i otvara se pravo na koraku `relate`. |
| 5. `workspace-history` → istorija kretanja | **URAĐENO (izuzetak)** | `02-EKRANI.md:602-637` — nov §13 sa tri razloga (nema `keydown` okidača, nema proizvođača jer canvasi na mobilnom nisu za preuređivanje, stek nije trajan) i onim što mobilni radi umesto toga. Prompt dozvoljava ovaj ishod. Tvrdnje su tačne: `workspace-history.tsx` je zaista undo/redo stek na `window.addEventListener("keydown")`, ne istorija navigacije. |
| 6. `profile-dialog` → profil | **URAĐENO** | `app/(app)/profil.tsx:44-285`; ruta `_layout.tsx:49-50`, ulazi `vise.tsx:58` i `app-header.tsx:99-101` (avatar u zaglavlju je dotad bio mrtvo dugme sa praznim `onPress`). Galerija + kamera `:126-160`, upload `:101-124` (`storage.generateAvatarUploadUrl` → `setAvatar`), uklanjanje slike `:162-178`, ime `:88-99`, email/uloga kroz `Row` `:264-275`. |
| 7. `idea-discussion-dialog` → diskusija na ideji | **URAĐENO** | `app/(app)/ideja/[id].tsx:40-150` + `components/ideja/contribution-thread.tsx:41-335`. Sve mutacije koje web koristi osim `restoreOwnContribution` (svesno izostavljen jer nema toast-undo — `02-EKRANI.md:511-512`). Moderacija `:235-252`, status po tekstu `:193-197`, uređivanje `:200-225`, brisanje/glasanje `:102-135`. Dva ulaza: `ideje.tsx:120` i `idea-node-sheet.tsx:103`. |
| Bez nove backend funkcije | **POŠTOVANO** | `git diff 90008a4..HEAD -- packages/backend` je prazan — ni `_generated`. Dva nedostajuća podatka su zapisana u `ZA-POPRAVKU.md:181` (agregatni brojači za „Napredak %") i `:205` (jeftin upit za brifing). |

#### 2. Napravljeno a nije traženo

- `components/ideja/vote-buttons.tsx` (137 linija) — dugmad za glasanje izvučena iz
  `ideje.tsx` i `idea-node-sheet.tsx`; te dve kopije su obrisane (−54 i −44 linije).
  Neto je manje koda, ali refaktor nije bio u promptu.
- Kartica ideje u listi je postala tapljiva (`ideje.tsx:118-127`) — obrnuta odluka iz
  ranije faze („kartica je namerno nedodirljiva jer nema ekrana detalja"), sada
  ispravna jer ekran postoji.
- Dugme „Diskusija" u sheet-u čvora na canvasu (`idea-node-sheet.tsx:97-115`).
- `initialView` u `PageActionsSheet` + `useEffect` reset koraka na svako otvaranje
  (`page-actions-sheet.tsx:76-80`).
- Red „Uloga" na profilu (`profil.tsx:270-275`) — web `profile-dialog` ga nema.
- `ErrorBoundary` na oba nova ekrana (`profil.tsx:319-338`, `ideja/[id].tsx:186-205`).

#### 3. Nedovršeno (placeholderi, TODO, `return null`)

Nema ničega. Nijedan `TODO`/`FIXME`, nijedna prazna komponenta, nijedan stub u
diffu. Jedini `return null` je `danas.tsx:188` (brojači dok zadaci stižu) — čuvar
za skeleton, ne stub. Jedini `placeholder` je prop `TextInput`-a
(`contribution-thread.tsx:300`).

#### 4. Pravilo „svaki novi red kroz `components/ui/row.tsx`"

**Dva kršenja**, oba istog oblika koji je već prijavljen u reviziji Faze 3
(`subpages-section.tsx`) — dodirno zaglavlje kolapsibilne sekcije sklopljeno ručno:

- `area-briefing-section.tsx:52-66` (stil `:201-207`) — strelica + ikonica + naslov.
- `relations-section.tsx:112-132` (stil `:223-229`) — isto, plus pilula sa brojem.

`Row` pokriva oba oblika bez izmene: `leading` (strelica), `icon`, `title`,
`value` (pilula), `showChevron={false}` — `row.tsx:24,29,43,49`.

Ostale nove `flexDirection:'row'` pojave nisu redovi liste: čipovi trake
(`workload-strip.tsx:185`), kolone brojača (`day-summary.tsx:132`), par dugmadi
(`profil.tsx:391`, `contribution-thread.tsx:418`), zaglavlja ekrana
(`profil.tsx:352`, `ideja/[id].tsx:219`), glava kartice doprinosa
(`contribution-thread.tsx:382`), omotač reda veze (`relations-section.tsx:251`,
`Row` + dugme za uklanjanje). Tamo gde red liste zaista postoji, `Row` je
upotrebljen: `relations-section.tsx:151`, `profil.tsx:264,270`.

#### 5. Pravilo „tekst min 16px osim meta"

Prekršeno na akcijama, ne na meta tekstu. `Button size="sm"` renderuje label na
**14px** (`ui/button.tsx:47`), a novi kod ga koristi za prave akcije:
„Sačuvaj brifing" (`area-briefing-section.tsx:188`), „Iz galerije" / „Slikaj"
(`profil.tsx:204,211`), „Otkaži" / „Sačuvaj" / „Objavi" / „Učitaj još"
(`contribution-thread.tsx:214,219,290,308,317`).

Objašnjenja u telu teksta su na 13px (`text.meta`), što je ivica pravila:
`profil.tsx:277-280` (dva reda proze o emailu i ulozi), `:251`, `ideja/[id].tsx:142-144`,
`area-briefing-section.tsx:142-144`. Web na istim mestima koristi `text-xs`, pa je
paritet zadržan — ali „osim meta" ovo ne pokriva.

#### 6. Ostale primedbe

- **Uvodna kartica se ne vidi kad nema zadataka.** `DaySummary` je unutar grane sa
  listom (`danas.tsx:365`), a prazan dan ide u `EmptyState` (`:349-357`) — pozdrav i
  brojači `0/0/0` tada nestanu. Web `home-view` zaglavlje uvek stoji.
- **„Spisak tima" iz `home-view` nije pun pandan.** Tabela u `02-EKRANI.md:154`
  upućuje na „Više → Članovi", a ta stavka je `adminOnly: true` (`vise.tsx:59`) — običan
  član tim vidi samo kroz traku opterećenja (ime + avatar, bez emaila i „Admin" oznake).
- **Tim veći od 50 ljudi tiho gubi brojače.** `startups.listMembers` se zove sa
  `limit: 50` (`danas.tsx:83`), a zadatak dodeljen članu van tog spiska se odbacuje
  (`danas.tsx:150-153`) — ne uđe ni u jedan čip, pa ni u „Nedodeljeno". Web ima isti
  limit, ali mobilni na osnovu njega još i računa.
- **`members` je sada stalna pretplata** na tabu Danas (ranije samo kad se otvori meni
  akcije, `danas.tsx:−226`). Obrazloženo u komentaru, ali je to nova pretplata na
  najčešće otvaranom ekranu.
- **Naslov veze bez razlikovanja duplikata.** Web `page-relations.tsx:324`
  (`occurrenceLabel`) razlikuje dve veze istog naslova; mobilni ne.
- Dok `startups.get` stiže, veza iz druge oblasti se ispisuje kao „druga oblast"
  (`relations-section.tsx:68`) — kozmetički, ispravi se sam.
- `profil.tsx:330` koristi `colors.destructive`, ostatak fajla `colors.danger` —
  nedoslednost u tokenima (oba postoje).
- Trajanje: nije mereno u ovoj reviziji.
- Trajanje: 36 min

## Faza 5 — redizajn ekrana

- Start: 2026-08-09T11:15:23+02:00
- Izvršavanje: prošlo
- `npm run check`: **prolazi**
- `npm test`: prolazi
- Commit: `7bd5783`
- Dirnuto fajlova: 42

### Revizija: Faza 5 — redizajn ekrana

Faza je uradila ono što je traženo po sve tri serije, ali je **prekršila zabranu
diranja backenda**: dodata je nova Convex funkcija `pages.childCounts`
(`packages/backend/convex/pages.ts:319`) da bi red u Prostoru dobio broj
podstranica. Opseg: `f607afd..7bd5783`, 3 commita + merge poruka.

**Provere koje sam sam pokrenuo:** `npm run check` prolazi; `tsc --noEmit` u
`apps/mobile` prolazi; `tsc -p convex/tsconfig.json` prolazi.

#### Tačka po tačka

**SERIJA 1 — ljuska**

1. **Spoji dva zaglavlja — URAĐENO.** Stack više ne crta zaglavlje
   (`app/(app)/_layout.tsx:20` → `headerShown: false`, obrisano 16
   `Stack.Screen` override-a). `TabScreen` sada sam montira `AppHeader`
   (`components/tab-screen.tsx:23`), a `AppHeader` je prepisan na novi primitiv
   `ScreenHeader` (`components/app-header.tsx:67`). Naslov je `display` levo
   (`ui/screen-header.tsx:167` → `...text.display`), pretraga i avatar desno
   (`app-header.tsx:77-88`), prebacivač startupa iza avatara
   (`app-header.tsx:82-88` otvara `StartupSwitcher`, koji je dobio i red „Moj
   profil" — `startup-switcher.tsx:74-86`).
   *Odstupanje:* ime startupa nije nestalo — ostalo je kao `eyebrow` linija
   iznad naslova (`app-header.tsx:70`), visine 20pt. Nije druga traka, ali nije
   ni „samo iza avatara".
2. **Tab bar aktivna accent / neaktivne prigušene — URAĐENO.**
   `(tabs)/_layout.tsx:20-28` (`focused ? colors.primary : colors.subtle`,
   `strokeWidth` 2.4/1.8) i `:35` `tabBarInactiveTintColor: colors.subtle`.

**SERIJA 2 — liste**

3. **Gustina — URAĐENO** na svih osam ekrana. Dokazi: `prostor.tsx:789`
   (`gap` 24→16), `:793` (`gap` 8→4), `:886` (`minHeight: 52` na redu stabla);
   `ideje.tsx:204-212` (`gap` 10→8, `padding` 14→12); `odobrenja.tsx:339-347`;
   `clanovi.tsx:150-160` (niz kartica → jedna kartica sa vlas-linijama);
   `pozivnice.tsx:307`; `pretraga.tsx:412-420`; `aktivnost.tsx:190-196`
   (`minHeight` 60→56); `puls.tsx:764-766`.
4. **Prostor: jedna strelica + meta podatak — URAĐENO.** Desna strelica ugašena
   (`prostor.tsx:648` `showChevron={false}`), ostaje samo „razvij" strelica levo
   (`:652-672`). Meta desno: status zadatka i broj podstranica
   (`prostor.tsx:691-708`). Broj podstranica dolazi iz **nove backend funkcije**
   — vidi tačku 8.
5. **Ideje: tiši glasovi — URAĐENO.** `ideja/vote-buttons.tsx:87-89` — aktivan
   glas je tint podloga `${tint}1F` (12%) + obojena ikonica i broj, umesto pune
   `activeBg` trake. `flex: 1` je skinut sa `sm` varijante i prebačen na `md`
   (`:117-134`), pa u listi glasovi više ne zauzimaju pola kartice; stoje u
   podnožju desno od autora (`ideje.tsx:154-172`).
6. **Avatari sa inicijalima umesto sivih ikonica čoveka — URAĐENO.** `Avatar`
   je dobio `empty` prop (isečkan krug bez glifa, `ui/avatar.tsx:62-75`) i
   zamenio `UserRound` na tri mesta: `danas/assignee-stack.tsx:35`,
   `danas/workload-strip.tsx:90`, `puls.tsx:573`. Novi avatari:
   `ideje.tsx:159`, `pozivnice.tsx:144`, `clanovi.tsx:95`. U `apps/mobile/src`
   nije ostala nijedna siva ikonica osobe kao zamena za avatar (jedina dva
   preostala `UserRound`-a su stavka menija `vise.tsx:58` i ilustracija praznog
   stanja `profil.tsx:77`).

**SERIJA 3 — detalji**

7. **URAĐENO za pet od šest; „tabela" je samo prelazak na tokene.**
   - stranica: `stranica/[id].tsx:56-71` (`ScreenHeader`, `eyebrow` = vrsta
     stranice, naslov u 2 reda, akcije kroz `IconButton`).
   - zadatak: `zadatak/[id].tsx:152-170` (isto + `eyebrow` = status).
   - prilozi: `stranica/files-panel.tsx:239-245` — ručni FAB zamenjen
     primitivom `FAB` sa novim `busy` propom; gustina `:318-345`.
   - kanvas rail: `canvas/canvas-rail.tsx:133-151` — samo radijusi i `text.body`.
   - chat: `chat/message-bubble.tsx`, `conversation-row.tsx`,
     `conversation-header.tsx` — samo tipografski tokeni; zaglavlje razgovora
     **namerno ostaje nisko i jednoredno** (obrazloženo u
     `conversation-header.tsx:61-64`), nije `ScreenHeader`.
   - tabela: `stranica/table-panel.tsx` — izmena je isključivo
     `fontSize: 16` → `...text.body` i `radius.md` → `radius.control`. Nijedna
     izmena gustine ili rasporeda.

**PRAVILA**

8. **Min 16px osim `meta` — URAĐENO.** Jedina nova sirova veličina u diffu je
   `fontSize: 11` za labelu tab bara (`(tabs)/_layout.tsx:40`) — nasleđena
   vrednost, sistemska traka. Sve ostalo ide kroz `text.*`
   (`display` 28/34/700, `title` 20/26/600, `body` 16/22/400, `meta` 13/18/500 —
   `theme/tokens.ts:207-213`, poklapa se sa briefom).
9. **Dodirna meta min 44pt — DELIMIČNO.** `IconButton` i `back` u zaglavlju su
   44 (`ui/icon-button.tsx:31`, `screen-header.tsx:148`), ali **`eyebrow` traka
   je dodirljiva sa 20pt visine + hitSlop 8/4** (`screen-header.tsx:135`, `:91`)
   → efektivno ~32pt. Ista akcija postoji i na avataru (44pt), pa nije
   nedostupna, ali je meta ispod pravila.
10. **Safe area — URAĐENO.** `ScreenHeader` uračunava `insets.top` na jednom
    mestu (`screen-header.tsx:76`), a svi konvertovani ekrani su izbacili
    sopstveni `insets.top`; jedini preostali su namerni izuzeci (canvas,
    razgovor) i dva dev ekrana — vidi „Nedovršeno".
11. **Koristi postojeće primitive — URAĐENO.** Iskorišćeni `Row`, `Pill`,
    `SectionHeader`, `IconButton`, `Skeleton`, `Avatar`, `FAB`. Napravljen je
    **jedan** nov primitiv, `ui/screen-header.tsx` (nije postojao ekvivalent —
    zamenjuje ~9 ručno sklopljenih zaglavlja), i eksportovan iz `ui/index.ts:21`.
    `Avatar` i `FAB` su prošireni propom (`empty`, `busy`), nisu klonirani.

#### Napravljeno a nije traženo

- **`pages.childCounts`** — nova Convex query funkcija
  (`packages/backend/convex/pages.ts:319-359`) + hook `useChildCounts`
  (`prostor.tsx:377-390`). Prekršaj zabrane iz tačke 6 zadatka.
- **Brisanje breadcrumb navigacije i „Lista / Canvas" prekidača u Prostoru**
  (`prostor.tsx:−724..−758` i `−760..−795`). Prekidač je sveden na jednu
  ikonicu; `jumpTo` je obrisan. Traženo je bilo samo uklanjanje duple ikonice.
- **`FAB.busy`** (`ui/fab.tsx:22,50-54`) i prelazak `files-panel` na `FAB`.
- **`StartupSwitcher` je postao „nalog + startupi"** — dodat red profila i
  `SectionHeader` (`startup-switcher.tsx:74-88`). Sledi iz „prebacivač iza
  avatara", ali je više od preseljenja.
- **Brojači u `eyebrow`-u i dve nove funkcije za srpsku množinu** —
  `ideasWord` (`ideje.tsx:31-38`), `membersWord` (`clanovi.tsx:25-32`).
- **Skraćen tekst u odobrenjima**: „Fali još N glasova ZA za brisanje" →
  pilula „fali još N ZA" (`odobrenja.tsx:102`, `:286`).
- **„Označi sve" iz teksta u ikonicu** (`obavestenja.tsx:23-25`).
- **`AppHeader` se sada montira po ekranu** (pet tabova + Nivo 2 Prostora)
  umesto jednom u Stack-u — pet instanci `startups.listForCurrent` i
  `profiles.getCurrent` umesto jedne. Convex dedupe ublažava, ali je promena
  arhitekture, ne stila.

#### Nedovršeno / placeholder-i

- `obavestenja.tsx:23` — „Označi sve kao pročitano" je `onPress={() => {}}`.
  Zatečeno stanje, ali je faza dirala tu liniju i ostavila je praznu. Ceo tab je
  i dalje skelet Faze 0 (samo `EmptyState`, `:33-37`).
- `app/(app)/dizajn-katalog.tsx:358` i `app/(app)/editor-spike.tsx:77` — i
  dalje ručno zaglavlje sa `insets.top + 6`. Zadatak kaže „SVE ekrane"; ova dva
  su dev-only, ali nisu ni pomenuta kao izuzetak. Katalog uz to ne prikazuje
  novi `ScreenHeader`.
- `pages.childCounts` nema test (`grep childCounts packages/backend` → samo
  definicija) i nema web potrošača; izuzetak od pravila „i web i mobilni" je
  zapisan u komentaru (`pages.ts:307-312`), što je u skladu sa CLAUDE.md.
- Funkcija koja vraća samo `null`: nijedna nova. `UnreadIndicator`
  (`conversation-row.tsx:102`) je zatečena i legitimna.
- TODO/FIXME komentara u diffu: nema.

#### Ručni `flexDirection: 'row'` (tačka 5)

Sedam novih linija, nijedna ne zaobilazi `Row`:

- `prostor.tsx:837` (`rowMeta`) i `:842` (`statusTag`) — raspored **unutar**
  `value` slota `Row`-a, ne red liste.
- `ideje.tsx:223` (`footer`) — podnožje kartice ideje (autor + glasovi).
- `odobrenja.tsx:374` (`metaRow`) — meta linija unutar kartice odobrenja.
- `ui/screen-header.tsx:131`, `:144`, `:163` — sam novi primitiv zaglavlja.

Zatečeni ručni redovi (`files-panel.tsx:324`, `prostor.tsx` skelet oblasti)
nisu dirani i i dalje zaobilaze `Row`.

#### Backend (tačka 6)

**PREKRŠENO.** `packages/backend/convex/pages.ts:319` — nova `query childCounts`
(+55 linija). Sama funkcija je korektno napisana: `requireStartupMember` +
`requirePageArea` (`:333-336`), `.take(CAP + 1)` umesto `.collect().length`,
dvostruko ograničenje (50 roditelja, cap 9), postojeći indeks
`by_areaId_and_parentPageId_and_archivedAt_and_position` (`schema.ts:277`).
Ali zadatak je bio čist redizajn i nije tražio nove podatke — broj podstranica
je bio odluka faze, ne zahtev.
- Trajanje: 69 min

## Faza 6 — pokret

- Start: 2026-08-09T12:24:44+02:00
- Izvršavanje: prošlo
- `npm run check`: **prolazi**
- `npm test`: prolazi
- Commit: `b141c6d`
- Dirnuto fajlova: 73

### Revizija: Faza 6 — pokret

Faza je uradila najveći deo traženog, ali tri tačke nisu završene: stagger je
pokvaren na tri liste (animira usred skrola, suprotno od onoga što sopstveni
komentar tvrdi), ekran razgovora je preskočen u celini, i pull-to-refresh fali
na četiri liste.

Opseg: `git diff 08d7b2e..HEAD` — 73 fajla, svi u `apps/mobile`.

#### Tačka po tačku

**1. Sheet-ovi: spring ulaz/izlaz, postepen backdrop, gest nadole — URAĐENO.**
Novi primitiv `components/ui/sheet.tsx`: spring ulaz (`:101`, `SHEET_SPRING` u
`theme/motion.ts:23`), kraći `withTiming` izlaz (`:122`), backdrop kao rampa
vezana za `progress` i za pomeraj prsta (`:157-160`), pan sa pragom 88px /
900px/s (`:30-32, :141-155`). `GestureHandlerRootView` unutar `Modal`-a (`:199`)
i jedan u korenu (`app/_layout.tsx:80`). Primitiv koristi 22 fajla; jedini
preostali sirovi `Modal` je `stranica/file-preview.tsx:43` (pun ekran, ne sheet,
i sam gasi animaciju pod reduced-motion na `:45`).

**2. Liste: staggered fade+slide, max 300ms — DELIMIČNO.**
Primitiv postoji i budžet je ispoštovan: `ui/stagger.tsx` + `motion.ts:36`
(4 × 30ms + 180ms = 300ms), pomeraj 8px (`motion.ts:41`).

Ali: u `ui/stagger.tsx:62` uslov je
`!reduced && (group === null || Date.now() - group.startedAt < 450)`. Kad
`StaggerGroup` nije postavljen, `group === null` i **animacija je uvek uključena**.
Tri liste koriste `StaggerItem` bez grupe:
- `app/(app)/(tabs)/chat.tsx:121` (FlatList)
- `app/(app)/aktivnost.tsx:101` (SectionList, paginirana)
- `app/(app)/(tabs)/prostor.tsx:462` (FlatList, paginirana)

Posledica je tačno ono što komentar u `chat.tsx:117-119` tvrdi da se ne dešava —
redovi koje `FlatList` montira lenjo tokom skrola ulaze uz fade, a na paginiranim
listama svaka doučitana strana ponovo animira. Komentar je netačan.

Liste bez staggera uopšte: `puls.tsx`, `podesavanja-obavestenja.tsx`,
`subpages-section.tsx`, `files-panel.tsx`, `table-panel.tsx`,
`relations-section.tsx`, `task-checkpoint-list.tsx`, `contribution-thread.tsx`.
`message-list.tsx` je izuzet uz obrazloženje (inverted lista).

**3. Skeleton u obliku sadržaja + crossfade, na SVAKU listu — DELIMIČNO.**
Urađeno: `ui/skeletons.tsx` (232 linije oblika — red, kartica zadatka, kartica
ideje, mehur poruke, pasus; mere usklađene sa `ui/row.tsx`, `:174-181`),
`ui/loading-swap.tsx` crossfade sa `pointerEvents="none"` na skeletonu (`:80`),
deljeni puls u `ui/skeleton.tsx:29`.

Nije urađeno:
- `app/(app)/razgovor/[id].tsx:97` — ekran razgovora nije ni dirnut u ovom
  commit-u; prvo učitavanje je i dalje goli `ActivityIndicator`. To je jedan od
  najkorišćenijih ekrana.
- `app/(app)/(tabs)/prostor.tsx:589` — `LoadingFirstPage` ugnježdenih podstranica
  je spiner, ne skeleton.

Crossfade fali tamo gde se skeleton vraća kroz rani `return` (skok, ne prelaz):
`zadatak/[id].tsx:100-107`, `stranica/[id].tsx:47`, `ideja/[id].tsx:91`,
`profil.tsx:68`, `table-panel.tsx:60`.

Ostali `ActivityIndicator`-i (`aktivnost.tsx:119`, `subpages-section.tsx:136`,
`table-panel.tsx:309`, `contribution-thread.tsx:317`, `prostor.tsx:486`) su
podnožja paginacije — legitimno.

**4. Haptika (light / success / warning / error) — URAĐENO.**
`lib/haptics.ts:21-54` — `tap` = `ImpactFeedbackStyle.Light` (`:23`), `success`
(`:41`), `warning` (`:47`), `error` (`:53`). Korišćeno u 45 fajlova; mapiranje
provereno na uzorku: destruktivno → `warning` (`vise.tsx`, `pozivnice.tsx:…`,
`message-actions-sheet.tsx`), neuspeh mutacije → `error`
(`zadatak/[id].tsx:93`). `haptics.ts:15` izričito kaže da reduced-motion ne gasi
haptiku — tačno, to je podešavanje za vizuelni pokret.

**5. Native stack sa gestom nazad, osim na kanvasu — URAĐENO.**
`hooks/use-stack-animation.ts:20-30` (`ios_from_right` + `gestureEnabled: true`,
`animation: 'none'` pod reduced-motion), primenjeno u sva tri layouta
(`app/_layout.tsx:41`, `(app)/_layout.tsx:22`, `(auth)/_layout.tsx:6`). Kanvas je
jedini izuzetak: `(app)/_layout.tsx:26` `gestureEnabled: false`, uz dugme „nazad"
u zaglavlju (`canvas/[kind]/[id].tsx:426-435`).

**6. Pull-to-refresh na svakoj realtime listi — DELIMIČNO.**
`hooks/use-list-refresh.tsx` + `refreshControl` na 9 lista: `chat`, `danas`,
`prostor` (obe), `aktivnost`, `clanovi`, `ideje`, `odobrenja`, `pozivnice`,
`puls`. Fali na: `razgovor/[id].tsx` (ekran nije dirnut), `pretraga.tsx`,
`podesavanja-obavestenja.tsx`, `profil.tsx`. `message-list.tsx:165` je izuzet uz
obrazloženje (inverted lista — spiner bi bio na dnu).

**7. Reduced-motion, jedan hook svuda — URAĐENO.**
`hooks/use-reduced-motion.ts` — `useSyncExternalStore` nad
`AccessibilityInfo.isReduceMotionEnabled` + `reduceMotionChanged` (`:32-33`),
jedan pretplatnik za celu aplikaciju. Koristi ga 8 mesta: `sheet`, `stagger`,
`skeleton`, `loading-swap`, `use-stack-animation`, `collapsible`,
`animated-icon`, `file-preview`. Nigde nije nađen drugi izvor istine.

#### Provera 5 — `flexDirection: 'row'` mimo `ui/row.tsx`

Čisto. Novih 10 linija sa `flexDirection: 'row'`: 5 u `ui/skeletons.tsx`
(oblici skeletona), 2 u `table-panel.tsx` (skeleton zaglavlja/reda), po 1 u
`pretraga.tsx` (`skeletonRow`), `area-briefing-section.tsx` (`skeletonRow`) i
`task-checkpoint-list.tsx` (`skeletonRow`). Nijedan nije ručno sklopljen red
liste — svi su skeleton oblici ili toolbar.

#### Provera 6 — `packages/backend`

Čisto. `git diff 08d7b2e..HEAD --name-only` ne dodiruje ni `packages/backend` ni
`apps/web`. Nula novih Convex funkcija.

#### Urađeno a nije traženo

- `haptics.select()` i `haptics.threshold()` (`lib/haptics.ts:28, :34`) — dva
  semantička kanala preko traženih četiri.
- Haptika na promenu taba (`(tabs)/_layout.tsx:33`).
- `GestureHandlerRootView` u korenu (`app/_layout.tsx:80`) — nužan preduslov za
  gest sheet-a, ali je dodatna promena strukture.
- Prepisivanje ~20 postojećih modala na novi `Sheet` (npr. `cell-edit-sheet.tsx`
  −273/+…, `conversation-header.tsx` −83, `startup-switcher.tsx` −178). Sledi iz
  tačke 1, ali je po obimu veće od dodavanja pokreta.
- Barrel eksporti u `ui/index.ts` (+14 linija).
- `use-list-refresh.tsx:8` — veštački minimum od 450ms za spiner. Ne blokira
  dodir, ali je jedina animacija u fazi koja namerno traje duže nego posao.

#### Placeholder-i, TODO, prazne komponente

Nijedan nov. `grep` po diff-u ne nalazi `TODO`/`FIXME`; jedini `return null;`
(`odobrenja.tsx`) je prazna sekcija u listi, ne nedovršena funkcija. Zatečeni
placeholder van opsega: `razgovor/[id].tsx:85-90` `openAnchor()` javlja „Uskoro —
stiže uz ekrane stranice i zadatka", a ti ekrani postoje od Faze 2/3.

#### Napomena o verifikaciji

`npm run check` = `eslint && next build` (root `package.json`). ESLint **ignoriše
ceo `apps/mobile`** (`eslint --debug` → „File ignored because of a matching
ignore pattern"), a `next build` gradi samo `apps/web`, koji u ovom commit-u nije
dirnut. Drugim rečima, prijavljeno „`npm run check` prolazi" ne kaže ništa o kodu
ove faze. Revizija je zato pokrenula `npx tsc --noEmit -p apps/mobile/tsconfig.json`
— **prolazi (exit 0)**. Runtime ponašanje (spring, gest, stagger) nije izvršavano.
- Trajanje: 81 min

## Faza 7 — završna provera

- Start: 2026-08-09T13:46:12+02:00
- Izvršavanje: prošlo
- `npm run check`: **prolazi**
- `npm test`: prolazi
- Commit: `421ee35`
- Dirnuto fajlova: 60

### Revizija: Faza 7 — završna provera

Faza je uradila ono što je traženo, sa jednim izuzetkom: tačka 3 nije izvršena
kako je napisana jer traženi skill ne postoji — to je zamenjeno ručnom revizijom
i zapisano.

#### Tačka po tačka

**1. parity-check nad celim `apps/web` vs `apps/mobile` — URAĐENO.**
Rezultat postoji u oba smera. IZUZECI: `docs/mobile/02-EKRANI.md:641` (uređivanje
layouta kanvasa), `:668` (izbor članova privatnog kanala), `:685`
(drag-and-drop premeštanje stranica). PROPUSTI popravljeni — npr. tab Obaveštenja
je bio prazan skelet, sada je pun ekran (`apps/mobile/src/app/(app)/(tabs)/obavestenja.tsx:53`
paginirani `notifications.list`, `:135` `markAllRead`, `:182` `SectionList`);
Odobrenja su dobila četiri segmenta kao web (`odobrenja.tsx:57`, `:139`
`withdrawDeletion`); ulančavanje checkpointa (`task-checkpoint-list.tsx:67-68`);
`chat` „Nova poruka" više nije prazan `onPress` (`(tabs)/chat.tsx` →
`new-conversation-sheet.tsx`, 307 novih linija); bedževi nepročitanog u tab baru
(`(tabs)/_layout.tsx:98`, `:108`). PROPUSTI koji nisu popravljeni su nabrojani
(vidi tačku 5). **Ograničenje dokaza:** iz diff-a se ne može dokazati da je
poređenje bilo iscrpno — dokazuje se samo da je rezultat širok i klasifikovan.

**2. rn-review nad izmenama u `apps/mobile` — URAĐENO.** Nalazi su vidljivi kao
izmene koje nemaju veze sa paritetom: dodirna meta „twisty" strelice
(`(tabs)/prostor.tsx:976`, bila 28pt široka), `Button` prešao sa `height` na
`minHeight` + `numberOfLines={2}` (`ui/button.tsx:46-49`, `:99`), `IconButton`
sada prevodi `disabled` u a11y stanje (`ui/icon-button.tsx:26`), curenje tajmera
u `use-list-refresh.tsx:29-36`, `ErrorBoundary` na „Više" i „Podešavanja
obaveštenja", dev alat sakriven iza `__DEV__` (`(tabs)/vise.tsx:211`).

**3. Skill `design:accessibility-review` — NIJE URAĐENO (skill ne postoji).**
Provereno: nema ga ni u `.claude/skills/` ni u `~/.claude/skills/`. Faza to
izričito piše (`docs/mobile/ZA-POPRAVKU.md:231-236`) i umesto njega radi ručnu
WCAG reviziju. Rezultat te revizije je stvaran: nov `primaryText` token
(`theme/tokens.ts:130`, `:179`), `primary` `#6366F1 → #4F46E5`, izolacija fokusa
u deljenom sheet primitivu (`ui/sheet.tsx:172`), rotor-akcije umesto svajp-gestova
(`danas/task-card.tsx:131-139`, `chat/message-bubble.tsx:151-164`). Verdikt je
NIJE URAĐENO zato što se tražena radnja nije izvršila, ne zato što je izostao
rezultat.

**4. Popravka PROPUSTA bez novih backend funkcija — URAĐENO.**
`git diff 3791d54..HEAD -- packages/` je **prazan**. Sve nove mutacije su
postojeće (`taskCheckpoints.setAllChained`, `pageTables.moveColumn`,
`pageFiles.rename`, `collaboration.withdrawDeletion`, `areasV2.withdrawNesting`,
`chat.unreadSummary`) — potvrđeno i time što `tsc` protiv `_generated/api` prolazi.
IZUZECI su u `02-EKRANI.md`, kako je traženo.

**5. `ZA-POPRAVKU.md` — URAĐENO.** Nova sekcija `ZA-POPRAVKU.md:226-424`, 12
podtačaka sa razlogom, uključujući i ono što je neprijatno: brisanje stranice sa
telefona (`:255`, čeka odluku iz `00-PLAN.md` §9.4), admin ekran (`:271`),
`convertToIdeas` (`:299`), šta NIJE provereno (`:404`).

#### Provera tvrdnji o verifikaciji

Sve tri prijavljene komande sam pokrenuo: `npm run check` **exit 0**, `npm test`
**exit 0** (37 fajlova, 321 test), `npx tsc --noEmit -p apps/mobile/tsconfig.json`
**exit 0**. Ali kao i u Fazi 6: nijedna od prve dve ne dodiruje kod ove faze.
`vitest.config.ts` navodi projekte `apps/web` i `packages/backend` — `apps/mobile`
nije među njima, pa 321 test ne pokriva nijednu izmenjenu liniju; `npm run check`
je `eslint && next build`, a `apps/web` u ovom commit-u nije dirnut. Jedina prava
provera je `tsc`. Ništa nije pokrenuto na uređaju — faza to i sama piše
(`ZA-POPRAVKU.md:404`).

#### Napravljeno a nije traženo

- **Obrisana četiri nekorišćena fajla** — `components/external-link.tsx`,
  `hint-row.tsx`, `web-badge.tsx`, `ui/collapsible.tsx`. Provereno: nijedan se
  nigde ne uvozi (pogoci na `ExternalLink` su lucide ikonica). Čišćenje mrtvog
  koda, nije traženo.
- **Promena globalne palete** — `primary`, `subtle`, `success`, `warning`,
  `danger`, `destructive` u `theme/tokens.ts` i `tailwind.config.js`. Motiv je
  kontrast, ali posledica je da se **menja izgled cele aplikacije**, ne samo
  nalaza. Faza to priznaje (`ZA-POPRAVKU.md:414-418`).
- **`ui/date-picker-sheet.tsx` — 254 linije novog kalendara.** Nije popravka nego
  nova komponenta; opravdana paritetom (rok van četiri preseta), ali je najveći
  neprijavljeni komad.
- **Nova navigaciona veza Puls → Prostor** sa parametrima (`puls.tsx:95-102`,
  `prostor.tsx:123-130`) — parity-motivisano, ali novi mehanizam prosleđivanja
  stanja kroz rutu.

#### Placeholderi, TODO, prazne funkcije

Novih nema — nijedan dodat red ne sadrži `TODO`/`FIXME`, nema komponente koja
vraća `null` kao stub (`inviteLinkUrl` vraća `null` samo kad `EXPO_PUBLIC_WEB_URL`
nije podešen, `AreasSection` kad je lista prazna — oba namerna). Zatečeni
`TODO(Faza 3, §5.1)` u `vise.tsx:210` je ostao, ali je blok sada iza `__DEV__`.

Dve neistinite/neuredne sitnice:

- `canvas/page-create-sheet.tsx:52` — komentar tvrdi „proizvoljan datum nosi
  `DatePickerSheet`", a taj fajl `DatePickerSheet` **ne uvozi**. Pravljenje
  stranice sa proizvoljnim rokom i dalje ne postoji; komentar zavodi.
- `danas/task-actions-sheet.tsx:278-279` — `fontSize` podignut na 16, a
  `lineHeight` ostao 16. Tekst od dva reda će se lepiti.

#### Tačka 5 provere — ručni `flexDirection: 'row'` umesto `ui/row.tsx`

**Prošlo.** Deset novih pojava, nijedna nije red liste: `obavestenja.tsx`
(skeleton), `ideja/[id].tsx` (dugmad izmene), `new-conversation-sheet.tsx`,
`rename-area-sheet.tsx`, `files-panel.tsx` (redovi dugmadi u sheet-u),
`date-picker-sheet.tsx` ×4 (navigacija meseca, zaglavlje dana, mreža, dugmad),
`task-checkpoint-list.tsx` („Poveži sve" dugme). Svi novi redovi liste idu kroz
`Row` — `obavestenja.tsx`, `odobrenja.tsx`, `ideja/[id].tsx`,
`new-conversation-sheet.tsx` ga uvoze.

#### Tačka 6 provere — nove funkcije u `packages/backend`

**Prošlo.** Nula izmena: `git diff 3791d54..HEAD --stat -- packages/` ne vraća
nijedan fajl.
