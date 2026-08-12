# Devotion - lanac 6: potpun funkcionalni paritet

- Pocetak: 2026-08-12T23:24:23
- Grana: `paritet6-20260812-2324`
- Jak model (plan, revizija, teske faze): `opus`
- Slabiji model (mehanicke faze): `sonnet`
- Zastavica za effort: `--effort`
- Osnova: `docs/mobile/PARITET-REVIZIJA-12-08.md`


## P1 - Preimenovanje, pozivnica kao link, mrtav kod

**Cilj:** Sa telefona mozes da preimenujes bilo sta, a pozivnica se kopira kao link koji se otvara.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `sonnet` | `high` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-12T23:24:23
- PLAN: napisan
- IZVRŠI: završeno 2026-08-13

### 1. Nalazi — dokaz fajl:linija

| # | Tvrdnja | Dokaz PRE | Šta je urađeno | Dokaz POSLE |
|---|---|---|---|---|
| B2 | Zadatak se ne može preimenovati | `zadatak/[id].tsx:168` čist tekst | Red „Preimenuj" u meniju `PageActionsSheet` + pod-prikaz `rename` | `apps/mobile/src/components/stranica/page-actions-sheet.tsx:355-366` (red), `:395-432` (pod-prikaz), `:183-227` (`renameSubmit`) |
| B3 | Tabela/Prilozi se ne mogu preimenovati | `stranica/[id].tsx:77` čist tekst | Isti red kao B2, uslov `page.kind !== 'note'` | `page-actions-sheet.tsx:349-367` |
| B5 | `inviteLinkUrl` uvezen i nikad pozvan | `pozivnice.tsx:33` uvoz, `:258` (staro) kopira goli kod | `submit()` sada zove `inviteLinkUrl`, Alert nosi link, dugmad „Podeli"/„Kopiraj link" | `apps/mobile/src/app/(app)/pozivnice.tsx:286-327` |
| C17 | Kod pozivnice živi samo u jednokratnom Alert-u | `pozivnice.tsx:253-267` (staro) | Nov modul-store `lib/invite-codes.ts` (sesijski, NE na disk) + `Share2` dugme u redu | `apps/mobile/src/lib/invite-codes.ts` (ceo fajl), `pozivnice.tsx:77-96` (`useInviteCodes`, `shareInviteCode`), `:203-210` (dugme u redu), `:285` (`rememberInviteCode` poziv) |
| 4 | `CHAT_PRESENCE_REFRESH_MS` mrtav export | `validators.ts:189` izvezen, niko ne uvozi | Nov list-modul bez uvoza `packages/backend/convex/lib/chatPresence.ts`; oba hooka i `chat.ts` ga uvoze | `chatPresence.ts` (ceo fajl), `chat.ts:34`, `apps/web/components/workspace/chat/use-chat-presence.ts:8,47`, `apps/mobile/src/hooks/use-chat-presence.ts:7,39` |
| 5 | Mrtvi uvozi (6 nalaza) | skript §6.5 plana | Svih 6 rešeno (1 pozvan, 5 uklonjenih) — tabela ispod | vidi §3 |

### 2. Lanac uvoza — dokaz da nije mrtvo

**`chatPresence.ts` (backend):**
- Web: `lib/chatPresence.ts` → `use-chat-presence.ts:8` (uvoz) → `:47` (poziv `window.setInterval`) → montiran u `conversation-pane.tsx` → `chat-view.tsx` → workspace chat. Živo.
- Mobilni: `lib/chatPresence.ts` → `hooks/use-chat-presence.ts:7` (uvoz) → `:39` (poziv `setInterval`) → montiran u `app/(app)/razgovor/[id].tsx` → tab „Chat". Živo.
- Backend: `lib/chatPresence.ts` → `chat.ts:34` (uvoz `CHAT_PRESENCE_TTL_MS`) → `chat.ts:1517` (`setPresence` upotreba TTL-a). Živo.
- Grep dokaz: `CHAT_PRESENCE_REFRESH_MS` → 2 pogotka na webu (uvoz + poziv), 2 na mobilnom (uvoz + poziv). Potvrđeno.

**`lib/invite-codes.ts` (mobilni):**
- `rememberInviteCode` → `pozivnice.tsx:285`, poziv unutar `CreateInviteSheet.submit`, PRE Alert-a.
- `useInviteCodes` → `pozivnice.tsx:77`, `PozivniceScreen` telo.
- Oba stižu do ekrana `/pozivnice`, ulaz `(tabs)/vise.tsx` stavka „Pozivnice" (`adminOnly: true`). Ekran postoji i otvara se danas.

**`inviteLinkUrl`:**
- `lib/embed-url.ts:64` → `pozivnice.tsx:34` (uvoz) → `:81` (poziv u `shareInviteCode`) → `:286` (poziv u `submit`). 3 upotrebe, nijedna mrtva.

**`pageRename` (undo):**
- `undo.ts` (nov član unije) → `undo-bar.tsx:298` (`case 'pageRename'`, poziva `updatePage`) → `UndoBar` montiran na `stranica/[id].tsx` i `zadatak/[id].tsx` — isti ekran koji radnju pokreće.
- `page-actions-sheet.tsx:206-215` (`pushUndo` poziv u `renameSubmit`) → ista traka.

### 3. Mrtvi uvozi — ishod po svakom

| Fajl:linija | Ime | Ishod |
|---|---|---|
| `app/(app)/pozivnice.tsx:33` (staro) | `inviteLinkUrl` | **POZVAN** (izmene 2 i 3), nije brisan |
| `app/(app)/canvas/[kind]/[id].tsx:57` | `fontWeight` | Uklonjen iz uvoznog bloka `@/theme/tokens` |
| `app/(app)/dizajn-katalog.tsx:46` | `useThemeColors` | Uklonjen iz `@/theme/theme-provider` |
| `app/(app)/puls.tsx:36` | `Id` | Cela linija `import type { Id } …` obrisana |
| `app/(app)/razgovor/[id].tsx:4` | `Alert` | Uklonjen iz bloka `react-native` |
| `lib/notifications/use-notification-target.ts:3` | `useRef` | Uklonjen iz `import { useEffect, useRef } from 'react'` |

Ponovljen skript iz §6.5 posle svih izmena: **`NEMA mrtvih uvoza.`**

### 4. Gejtovi

```
apps/mobile   npx tsc --noEmit                                    → 0 grešaka
packages/backend  npx tsc -p convex/tsconfig.json --noEmit        → 0 grešaka
apps/web      npx tsc --noEmit                                    → 0 grešaka
npm run lint                                                      → 0 grešaka, 0 upozorenja
npm test      Test Files 41 passed (41) | Tests 351 passed (351)  (baseline: 40/350 — +1 fajl, +1 test = nov chatPresence.test.ts)
npm run build → Next.js build uspešan (webpack), sve rute kompajlirane
```

### 5. T1–T14 (provera prstom na emulatoru)

**Nije provereno prstom** — emulator nije bio dostupan u ovoj sesiji. Spisak T1–T14
iz plana ostaje neproveren; ništa iz te tabele nije čekirano. Kod je proveren kroz
tsc/lint/test/build i grep lance uvoza (§2), ali ishod na uređaju (raspored dugmadi
u Alert-u, ponašanje tastature u `rename` pod-prikazu, sistemski share sheet)
ostaje da se potvrdi na sledećem prolazu sa emulatorom.

### 5b. Web regresija (izmena 1d, §6.4 plana)

**Nije provereno prstom** — isti razlog kao §5 (nema dostupnog browsera/dva naloga
u ovoj sesiji za unakrsnu proveru „tab u prvom planu ne dobija obaveštenje").
`use-chat-presence.ts` menja samo IZVOR konstante (vrednost ostaje `15_000`,
`CHAT_PRESENCE_REFRESH_MS` iz `chatPresence.ts`), pa je rizik regresije nizak, ali
nije potvrđen na ekranu.

### 6. `EXPO_PUBLIC_WEB_URL` — uslov puštanja

`inviteLinkUrl`/`embedCanvasUrl`/`embedNoteUrl` vraćaju `null` bez ove promenljive,
pa mobilni pada na kod-samo tok (isti kao pre ove faze). Produkcijski build MORA
imati javnu adresu web aplikacije da bi pozivni link i canvas/note embed radili
van emulatora. `.env.example` već ima komentar o ovome — nije nova napomena, samo
potvrda da P1 ne menja taj uslov.

### 7. `docs/mobile/PARITET-REVIZIJA-12-08.md`

Ažurirane 4 stavke (`B2`, `B3`, `B5`, `C17`) i „tri nalaza koje je lanac propustio"
stavka 1 (`CHAT_PRESENCE_REFRESH_MS`) — svaka sa „REŠENO (lanac 6, P1)" i pokazivačem
na kod. `docs/mobile/PARITET.md` **nije menjan**: to je dokument api.*-poziv-diff-a
(mobilni vs. web), a nijedna izmena ove faze ne uvodi NOVI Convex poziv koji mobilni
ranije nije zvao (`areasV2.updatePage` je mobilni već zvao iz `note-editor.tsx` i
`zadaci.tsx`; `invites.create`/`list` su već zvani). Nema reda za dodavanje.

### 8. Odstupanja od plana

Nema u samim izmenama 1–5. Dodatno, posle sprovedenog plana pušten je `rn-review`
nad `pozivnice.tsx` i `page-actions-sheet.tsx` (nije bio eksplicitno tražen u planu,
ali je konvencija repoa za svaki mobilni ekran) i našao STVARAN bag, popravljen
odmah:

- **Bag:** efekat koji resetuje `renameTitle`/`renameError` je bio uslovljen samo
  sa `view === 'rename'`, pa je svaka promena `page.title` (živ upit — npr. neko
  drugi je u međuvremenu preimenovao stranicu) tiho brisala draft korisnika USRED
  kucanja, ne samo pri ulasku u pod-prikaz. Popravka: `previousViewRef` prati
  PRETHODNI `view`, reset se dešava samo na tranziciju U `rename`
  (`page-actions-sheet.tsx:93-105`).
- **Sitnica:** rename `Input` nije nosio `invalid` prop iako komponenta to
  podržava (crven obrub) — dodato (`:412`).
- Preostala dva nalaza (tastatura može da „skoči" pri ulasku u `rename` — već
  pokriveno u §4 plana kao poznat rizik; nedostatak `accessibilityLabel` na email
  polju u `CreateInviteSheet` — PRETHODI ovoj fazi, van opsega) nisu menjana.

tsc i lint ponovo pušteni posle popravke — oba čista.

Jedino odstupanje od samog teksta plana je tumačenje tačke 7 (PARITET.md nema
odgovarajuće redove za ove UI-nivo nalaze, pa je umesto toga ažuriran izvorni
dokument nalaza, `PARITET-REVIZIJA-12-08.md`).
- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
- Trajanje: 58 min

## P2 - Editor beleske: tabela, slika, prilog, kod

**Cilj:** Beleska koja sadrzi tabelu, sliku, prilog ili blok koda moze da se uredjuje sa telefona.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `opus` | `max` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-13T00:21:58
- PLAN: napisan
- IZVRŠI: završeno 2026-08-13

### 1. Nalazi — dokaz fajl:linija

| # | Tvrdnja | Dokaz PRE | Šta je urađeno | Dokaz POSLE |
|---|---|---|---|---|
| B1 | Beleška sa tabelom/prilogom/blokom koda je read-only | `note-editor.tsx:167` `bodyEditable = canEditBody && unsupported.length === 0` | Sopstveni web bundle sa istom Tiptap šemom kao web; `bodyEditable = canEditBody` | `apps/mobile/src/components/stranica/note-editor.tsx:185` (`bodyEditable`), `:390` (`customSource`), `:386` (`bridgeExtensions`) |
| B1 | Šemi fale 4 ekstenzije | `TenTapStartKit` nema `table`, `codeBlock`, `horizontalRule`, `noteFile` | `NoteTableBridge`, `NoteCodeBlockBridge`, `NoteFileBridge` (+ `Gapcursor`, `HorizontalRule`, `TrailingNode` kao deps) | `apps/mobile/src/lib/note-editor-bridges.ts:224` (tabela), `:321` (kod), `:363` (prilog), `:408` (`NOTE_BRIDGES`) |
| B1 | Gubitak sadržaja pri round-tripu | — | Test: JSON pre = JSON posle; mobilni JSON = web JSON; čuvar puca kad se ekstenzija izbaci | `apps/mobile/src/lib/note-content.roundtrip.test.ts` (16 testova, svi zeleni) |
| B1 | Nema zaštite ako bundle zaostane | `unsupportedNoteBlocks()` = lista poznatog | Čuvar koji MERI gubitak i gasi autosave | `apps/mobile/src/lib/note-content.ts:59` (`noteBlockSignature`), `:71` (`noteSignatureLoss`); `note-editor.tsx:313` (`checkLoss`) |
| B7 | Traka nema slike/priloge/tabelu | `note-toolbar.tsx:85` — 16 dugmadi, sve tekstualno | Dugme „Dodaj…" (prvo u traci) + 6 alatki tabele (samo u tabeli) + „Blok koda" | `apps/mobile/src/components/stranica/note-toolbar.tsx:101` („Dodaj…"), `:220` (blok koda), `:230-270` (tabela) |
| B7 | Nema ubacivanja slike/priloga/tabele | nema | Sheet „Dodaj u belešku": galerija, kamera, prilog, tabela 3×3, uvoz CSV/XLSX, blok koda | `apps/mobile/src/components/stranica/note-insert-sheet.tsx` (ceo fajl), `note-editor.tsx:743` (mount) |
| B7 | Upload iz tela beleške | `files-panel.tsx:83` postoji samo za `kind: 'file'` | `uploadAndInsert` — isti tok, pa `insertNoteFile` sa 4 atributa iz `attach` odgovora | `note-editor.tsx:599` (`uploadAndInsert`) |
| B7 | Slika u telu se ne vidi | — | Plain-DOM node view: `category === 'image'` + poznat URL → `<img>`, inače čip „📎 ime · veličina" | `note-editor-bridges.ts:137` (`addNodeView`), `note-editor.tsx:195` (`useQuery` sa `skip`), `:334`/`:435` (`setNoteFileUrls`) |
| — | `<hr>` bi nestao (revizija ga NIJE našla) | web StarterKit ima `HorizontalRule`, mobilni ne | `HorizontalRule` u `tiptapExtensionDeps` `NoteFileBridge`-a | `note-editor-bridges.ts:372` |

**Backend: nula izmena.** `pageFiles.attach` već vraća tačno četiri atributa koje
`noteFile` čvor traži, a `requireAttachmentPage` (`pageFiles.ts:61`) već prima i
`note` stranice. Nova funkcija bi bila izmišljen posao.

### 2. Lanac uvoza — dokaz da nije mrtvo

**`note-editor-bridges.ts` — DVA potrošača (to je i poenta modula):**
1. `note-editor.tsx:40` (uvoz) → `:386` `bridgeExtensions: NOTE_BRIDGES` → `stranica/[id].tsx:151` `<NoteEditor>` → ruta `/stranica/[id]` → tab „Prostor" → tap na belešku.
2. `editor-web/index.ts:25` (uvoz) → `useTenTap({ bridges: NOTE_BRIDGES })` → `npm run editor:build` → `src/lib/note-editor-html.ts`.
3. (tipovi) `note-toolbar.tsx:33` — `NoteEditorBridge` / `NoteEditorState`.

**`note-editor-html.ts` (generisan bundle):** → `note-editor.tsx:41` (uvoz) → `:390`
`customSource: NOTE_EDITOR_HTML`. Bundle koji se ne učita = prazan editor, vidi se odmah.

**`note-insert-sheet.tsx`:** → `note-editor.tsx:21` (uvoz) → `:743` (mount, pored
`NoteLinkSheet`). Jedini ulaz je dugme „Dodaj…" iz trake, koje je u ISTOM commit-u
(`note-toolbar.tsx:101` → `onRequestInsert` prop `:89` → poziv `:104` → prosleđeno iz
`note-editor.tsx:700`).

**`note-table.ts`:** → `note-editor-bridges.ts:31` (`noteTableContent`, koristi ga web
strana bridge-a) i `note-insert-sheet.tsx:23` (granice + procena dužine).

**`noteBlockSignature` / `noteSignatureLoss`:** → `note-editor.tsx:31-37` (uvoz) →
`:183` (`loadSignature`), `:313` (`checkLoss`) → `:330` (`handleFirstHtml`) →
`pullHtml` i `primeEditor`. Oba puta vode do `RichText onLoad`/`onChange`.

**`noteEditorCss` (proširen):** → `note-editor.tsx:214` → `injectCSS` na `:422`/`:428`.

**Obrisano, ne ostavljeno mrtvo:** `unsupportedNoteBlocks`, `unsupportedNoteBlocksSentence`,
`UNSUPPORTED_PATTERNS`, `UNSUPPORTED_LABEL`, `UnsupportedNoteBlock` — jedini potrošač je bio
`note-editor.tsx`. `grep -rn "unsupportedNoteBlock\|UNSUPPORTED_" apps/mobile/src` → **jedan**
pogodak, i to u docstring-u `note-content.ts:21` koji objašnjava čime su zamenjeni. Nijedna
deklaracija, nijedan poziv.

### 3. Odstupanja od plana (i zašto)

| Plan | Urađeno | Razlog |
|---|---|---|
| Izmena 3: alias `@10play/tentap-editor` → `lib-web/index.mjs` | alias → `src/webEditorUtils/index.ts` (IZVOR paketa) | `lib-web/index.mjs` je unapred izgrađen sa **ugrađenim** `@tiptap/core` i ProseMirror-om (`src/webEditorUtils/vite.config.ts:18` externalizuje samo react/react-dom; u fajlu nema nijednog `@tiptap` importa). Naš `TableKit`/`CodeBlock`/`NoteFile` bi radio nad DRUGOM šemom — tačno onaj tihi kvar od koga plan brani. Iz izvora se sve razrešava na jednu hoistovanu `3.29.2` (`npm ls @tiptap/core` → jedna verzija) |
| Izmena 1: `vite-plugin-singlefile` kao rezerva | nije trebalo | `lib`+`iife` je dao tačno jedan `.js` |
| Izmena 5: `generateJSON`/`generateHTML` iz `@tiptap/html` | dve pomoćne funkcije u testu (`getSchema` + `DOMParser`/`DOMSerializer`) | paket `@tiptap/html` nije instaliran u repou; funkcije su doslovan port onoga što on radi |
| Izmena 11 (CSV/XLSX) — „sme da otpadne" | **urađeno** | `parseSpreadsheet`/`normalizeTableMatrix` već postoje, a poruka je išla kroz isti bridge — jeftinije nego drugi ciklus build-a bundle-a |
| Izmena 10 (slika se vidi) — „sme da otpadne" | **urađeno** | bez toga se ubačena slika vidi samo kao čip; node view je plain DOM i ne dira serijalizaciju |
| Novo, nije u planu | `editor-web/expo-constants-absent.cjs` | vidi ZA-POPRAVKU Z10 — bez toga build pada, a da nije pao, traka alata bi tiho nestala |

### 4. Gejtovi

```
apps/mobile   npx tsc --noEmit                                    → 0 grešaka
apps/web      npx tsc --noEmit                                    → 0 grešaka
npm run lint                                                      → 0 grešaka, 0 upozorenja
npm test      Test Files 42 passed (42) | Tests 367 passed (367)  (baseline P1: 41/351 — +1 fajl, +16 testova)
npm run build → Next.js build uspešan, sve rute kompajlirane
packages/backend  npx tsc -p convex/tsconfig.json --noEmit        → 0 grešaka (backend nije diran)
npm run editor:build --workspace @devotion/mobile → 678 KB, provera markera prošla
```

> `expo lint` **ne pokriva** `apps/mobile/src` (root `eslint.config.mjs:25` ignoriše
> `apps/mobile/**`, a `expo lint` je pokvaren) — „lint čist" za mobilni znači `tsc`,
> ne ESLint. Ista ograda kao u svakoj prethodnoj fazi.

### 5. Šta NIJE provereno — iskreno

- **Ništa nije pokrenuto na uređaju ni u emulatoru.** Verifikacija je `tsc` + `npm test`
  + čitanje izgrađenog bundle-a. Ne tvrdim da sam video tabelu kako se uređuje prstom.
- **Živi `new Editor(...)` nije testiran** — `EditorView` u jsdom-u traži `getClientRects`.
  Test dokazuje ŠEMU (`generateJSON`/`generateHTML` ekvivalent), ne ponašanje WebView-a.
  To je zapisano i u samom testu.
- **Merni gejt (`ZA-POPRAVKU` §2) ostaje otvoren.** Bundle je porastao (~600 → ~680 KB),
  a u aplikaciji su sada oba stringa (tentap svoj statički uvozi u `RichText.tsx:9`;
  patchovanje paketa nije rađeno). Merenje na jeftinom Androidu je sada važnije.
- **`TrailingNode` i „lažna izmena" pri otvaranju** — po kodu ne bi trebalo da se desi
  (`appendTransaction` se okida samo na transakciju sa `docChanged`, a učitavanje sadržaja
  pri kreiranju editora nije transakcija), a i web ima istu ekstenziju kroz StarterKit.
  Ali **nije izmereno na uređaju**: ako se ispostavi da se desi, znak je „Sačuvano →
  Izmene čekaju → Sačuvano" odmah po otvaranju beleške koja se ne završava pasusom.

### 6. Provera prstom (čeka korisnika)

| # | Šta | Očekivano |
|---|---|---|
| T1 | „Prostor" → beleška napravljena na webu sa tabelom + prilogom + blokom koda | Otvara se **za uređivanje**, ne u režimu čitanja; nema trake o gubitku |
| T2 | Kucanje u ćeliju tabele | „Sačuvano"; povratak i ponovno otvaranje pokazuje izmenu; web osveži istu stranicu — tabela je cela |
| T3 | Kursor u ćeliju | Pojavi se 6 dugmadi tabele u traci; „Dodaj red" → red se vidi i posle reload-a ekrana |
| T4 | Tastatura gore → „Dodaj…" | Sheet sa 6 redova |
| T5 | „Iz galerije" → slika | Slika se VIDI u telu (ne samo čip); panel „Prilozi" iste stranice ima isti fajl; web prikazuje sliku u telu |
| T6 | „Uvezi tabelu (CSV/XLSX)" sa 3×3 fajlom | Alert sa dimenzijama → „Prvi red je zaglavlje" → tabela u telu |
| T7 | „Blok koda" | `<pre>` blok sa monospace fontom i okvirom |
| T8 | Beleška sa `<hr>` | Crta ostaje posle snimanja sa telefona |
| T9 | Tamna/svetla tema dok je editor otvoren | Tabela i blok koda menjaju boje bez reload-a |
- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
- Trajanje: 80 min

## P3 - Chat: diskusija nad idejom, clanovi kanala, prilozi

**Cilj:** Chat na telefonu radi sve sto radi na webu: diskusija uz ideju, clanovi privatnog kanala, vise fajlova, video, kopiranje teksta.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `opus` | `max` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-13T01:41:42
- PLAN: napisan
