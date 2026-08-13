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
- IZVRŠI: završeno 2026-08-13

### 1. Nalazi — dokaz fajl:linija

| # | Tvrdnja | Dokaz PRE | Šta je urađeno | Dokaz POSLE |
|---|---|---|---|---|
| B4 | Diskusija nad idejom ne postoji na mobilnom | `components/zadatak/discussion-link.tsx:48,63` — `anchorType: 'page'` tvrdo | Komponenta premeštena u `components/chat/` i uopštena u diskriminisanu uniju; montirana na ekranu ideje | `apps/mobile/src/components/chat/discussion-link.tsx:25` (`DiscussionAnchor`), `:65` + `:82` (`anchorType: anchor.type`); mount `app/(app)/ideja/[id].tsx:266` |
| B4 | Sekcija „Diskusija" na ekranu ideje je zapravo bila lista doprinosa | `ideja/[id].tsx:252` | Preimenovana u „Predlozi izmena" (isti naziv koji web koristi, `ideas-view.tsx:635`/`:807`); chat je zaseban red ispod | `ideja/[id].tsx:255` (naslov), `:260` (`ContributionThread`), `:266` (`DiscussionLink`) |
| B4 | Stari lanci ne smeju da puknu | `stranica/[id].tsx:147`, `zadatak/[id].tsx:307` | Prevedeni na nov prop | `stranica/[id].tsx:147`, `zadatak/[id].tsx:307` |
| B6 | `chat.setChannelMembers` ne postoji | `grep -rn "setChannelMembers" packages/backend` → 0 | Nov upit + nova mutacija | `packages/backend/convex/chat.ts:1104` (`channelMembers`), `:1616` (`setChannelMembers`) |
| B6 | Mobilni ne šalje članove pri kreiranju | `new-conversation-sheet.tsx:117` — `{startupId, name, isPrivate}` | Lista sa čekiranjem + pretraga u koraku „Novi kanal" | `new-conversation-sheet.tsx:148` (`memberProfileIds`), `:286` (pretraga), `:306` (`toggleMember`) |
| B6 | Netačan tekst „članove dodaje administrator na webu" | `new-conversation-sheet.tsx:238` | Zamenjen istinitim uputstvom na stvarno mesto | `new-conversation-sheet.tsx:316-320` |
| B6 | Ćorsokak je bio i na WEBU (članovi samo pri kreiranju) | `conversation-pane.tsx:222-251` — meni ima samo obaveštenja i arhiviranje | Nov dijalog + stavka u istom meniju | `apps/web/components/workspace/chat/channel-members-dialog.tsx`, ulaz `conversation-pane.tsx:246-252`, mount `:291` |
| B6 | Izmena članstva je upis bez inverza | — | Nova grana „Poništi" | `apps/mobile/src/lib/undo.ts:202`, `components/undo-bar.tsx:299`, poziv `channel-members-sheet.tsx:123` |
| D | Mobilni uzima samo prvi fajl | `message-composer.tsx:323`, `:343` (`assets[0]`) | Višestruki izbor + red čekanja (jedan upload → jedna poruka, redom) | `message-composer.tsx:410` (`allowsMultipleSelection`), `:436` (`multiple: true`), `:375` (`enqueue`) |
| D | Nema videa iz galerije | `message-composer.tsx:320` `mediaTypes: ['images']` | Galerija prima i video; kamera namerno ostaje jedna slika | `message-composer.tsx:409` vs `:407` |
| D | Pomen `@` briše sve posle kursora | `message-composer.tsx:106` (`lastIndexOf`), `:195` (`slice(0, start) + …`) | `findMentionQuery` portovan sa weba (traži unazad OD KURSORA) + praćenje kursora | `apps/mobile/src/lib/chat.ts:221`, kompozer `:222` (memo), `:540` (`onSelectionChange`); test `src/lib/chat.mention.test.ts` (8 tvrdnji) |
| D | Poruka sa prilogom se ne može izmeniti | `message-actions-sheet.tsx:46` (`kind === 'text'`) | Uslov obrisan (kao web `message-row.tsx:59`); prazan caption dozvoljen pri izmeni | `message-actions-sheet.tsx:54`, kompozer `:258-259` |
| D | Istek prozora izmene se ćuti (red nestane) | `message-actions-sheet.tsx:47` | Red ostaje, dodir van prozora daje objašnjenje doslovno kao web | `message-actions-sheet.tsx:57-63`, poziv `:107` |
| D | Tekst poruke se ne može kopirati | `message-bubble.tsx:193` bez `selectable` | Red „Kopiraj tekst" u akcionom sheet-u (ne `selectable` — obrazloženje u §3) | `message-actions-sheet.tsx:98`, implementacija `message-list.tsx:120`, mount `:369` |
| D | Nema pretrage članova pri otvaranju DM-a | web `new-conversation.tsx:154` | Deljeno polje, montirano na tri mesta | `components/chat/member-search-input.tsx`, uvozi `new-conversation-sheet.tsx:230` i `:286`, `channel-members-sheet.tsx` |
| A.1 | `CHAT_EDIT_WINDOW_MS` dupliran na oba klijenta | `message-actions-sheet.tsx:11`, `message-row.tsx:23` | Oba uvoze serversku konstantu | `message-actions-sheet.tsx:10`, `message-row.tsx:16`; `grep -rn "15 \* 60" apps/` → **0 pogodaka** |
| A.2 | `generateUploadUrl` bez granica | `chat.ts:1751` — samo `requireChannelAccess` | Obavezni `name`/`contentType`/`size`, provera pre izdavanja URL-a | `chat.ts:2003`; klijenti `message-composer.tsx:327`, `use-attachment-sender.ts:93` |
| A.2 | Odbijen blob se ne briše | `chat.ts:833-836` (zapisano u kodu) | `sendMessage` vraća uniju; grana odbijanja briše blob i transakcija commituje | `chat.ts:1321` (`returns`), `:943` (`storage.delete`), klijenti `message-composer.tsx:353`, `use-attachment-sender.ts:121` |
| A.2 | Brisanje ne sme da pogodi tuđ blob | — | `requireUnattachedBlob` pre svake grane koja briše + nov indeks | `chat.ts:878`, `schema.ts:1289` (`by_attachmentStorageId`) |

### 2. Lanac uvoza — dokaz da nije mrtvo

**`components/chat/discussion-link.tsx` (uopšten)**
→ `app/(app)/ideja/[id].tsx:22` (uvoz) → `:266` (mount, unutar `ScrollView`)
→ ruta `/ideja/[id]` → `app/(app)/ideje.tsx` (`router.push`) → ruta `/ideje`
→ tab „Više" → red „Ideje" → tap na ideju.
Drugi ulazi u istu rutu: `idea-edge-sheet.tsx`, `canvas/idea-node-sheet.tsx`.
Stari lanci nedirnuti: `stranica/[id].tsx:17`→`:147` (tab „Prostor"),
`zadatak/[id].tsx:35`→`:307` (tab „Danas"/„Zadaci").

**`components/chat/channel-members-sheet.tsx`**
→ `components/chat/conversation-header.tsx:27` (uvoz) → `:268` (mount)
→ otvara ga JEDINI ulaz: red „Članovi kanala" u `⋯` meniju (`:233-249`)
→ `app/(app)/razgovor/[id].tsx:152` (`<ConversationHeader canManageMembers={…}>`, `:160`)
→ ruta `/razgovor/[id]` → tab „Chat" → tap na kanal → `⋯`.
Red se vidi samo kad je `profile.role === 'admin' && channel.kind === 'custom'`
(`razgovor/[id].tsx:160`) — klijentsko ogledalo serverskog gejta (`chat.ts:1634`, `:1640`).

**`components/chat/member-search-input.tsx`**
→ `new-conversation-sheet.tsx:6` → `:230` (korak „Direktna poruka") i `:286`
(korak „Novi kanal") → tab „Chat" → ikonica „Nova poruka";
→ `channel-members-sheet.tsx` → isti lanac kao gore.

**`lib/undo.ts` grana `channelMembers`**
→ `components/undo-bar.tsx:299` (`case`) → `app/(app)/razgovor/[id].tsx:26` (uvoz)
→ `:204` (`<UndoBar bottomOffset={…} />`, **novo — ranije ga na tom ekranu nije bilo**)
→ traka se vidi posle „Sačuvaj" u sheet-u članova (`channel-members-sheet.tsx:123`).

**`lib/chat.ts` `findMentionQuery`**
→ `message-composer.tsx:37` (uvoz) → `:222` (memo koji pali autocomplete)
→ `razgovor/[id].tsx:185` (`<MessageComposer>`) → tab „Chat" → razgovor;
→ i `src/lib/chat.mention.test.ts` (kapija).

**`components/workspace/chat/channel-members-dialog.tsx` (web)**
→ `conversation-pane.tsx:21` (uvoz) → `:292` (mount) → ulaz `:246-252`
(`DropdownMenuItem` „Članovi kanala") → `view=chat` → izbor kanala → `⋯`.

**Backend** — tri potrošača napisana u istoj fazi:
`api.chat.channelMembers` → `channel-members-sheet.tsx:45`, `channel-members-dialog.tsx`;
`api.chat.setChannelMembers` → `channel-members-sheet.tsx`, `undo-bar.tsx`, `channel-members-dialog.tsx`.
`MAX_CHAT_CHANNEL_MEMBERS` → uvoze ga `new-conversation-sheet.tsx:13` i
`channel-members-sheet.tsx:14` (nije mrtav export, nalaz A.1).

### 3. Odstupanja od plana (i zašto)

| Plan | Urađeno | Razlog |
|---|---|---|
| Izmena 2: „vlasnik se ne uklanja nikad" | vlasnik **i pozivalac** ostaju članovi | Piker ne nudi sopstveni red (kao web `NewChannelDialog`), pa bi doslovna primena spiska izbacila admina iz sopstvenog kanala — nov ćorsokak umesto zatvorenog. Pozivalac se čuva SAMO ako je već aktivan član; admin koji nije unutra se ne ubacuje tiho (`chat.ts:1663-1671`) |
| Izmena 4: „skeleton dok bilo koji upit nije stigao" | `SkeletonRow leading="circle" subtitle` × 4 | Isti oblik reda koji ga smenjuje (`ui/skeletons.tsx` konvencija) |
| Izmena 4: hidracija sheet-a kroz `useEffect` + `hydrated` ref | `draft ?? initial` bez ijednog efekta | `react-hooks/set-state-in-effect` je **greška**, ne upozorenje — lint je pao na web verziji. Isti obrazac primenjen i na mobilnom radi doslednosti. Zapisano kao `ZA-POPRAVKU` **Z11** |
| Izmena 4: pretraga nije bila predviđena u sheet-u članova | dodata | Ista `MemberSearchInput` komponenta; tim ide do 50 ljudi, lista bez filtera je neupotrebljiva |
| Izmena 7: „`replyTo` važi samo za prvu poruku serije, isto kao web" | `replyTo` važi za **sve** poruke serije | Plan je pogrešno opisao web: `use-attachment-sender.ts` hvata `replyTo` u `useCallback` zavisnosti i `sendFiles` ga zamrzava za ceo red — sve poruke iz jednog puštanja nose isti `replyToMessageId`. Zadržan **stvarni** web ugovor, ne opisani |
| Izmena 7 nije predviđala brojač upload-a | `uploads` brojač umesto `uploading` boolean-a | Sa redom čekanja bi `setUploading(false)` posle svakog fajla oborio indikator između dva upload-a. Brojač se podiže za CELU seriju (`message-composer.tsx:375-386`) |
| Izmena 9: „predprovera pre uploada" (samo redosled poziva) | mobilni **prvo** čita `blob`, pa traži URL | Galerija ume da ne vrati `fileSize`; bez `blob.size` predprovera ne bi imala šta da proveri (`message-composer.tsx:320-327`). Usput je popravljena i glasovna poruka koja je slala `size: null` |
| Izmena 9 nije predviđala izmenu šeme | nov indeks `chatMessages.by_attachmentStorageId` | Bez njega provera „blob je već zakačen" traži skeniranje tabele, što `.claude/rules/convex.md` izričito zabranjuje (`schema.ts:1289`) |
| Izmena 9: „mobilni `:232` (tekst) dobija proveru `result.ok`" | tekstualni put NE proverava | `sendMessage` bez `attachmentStorageId` vraća `{ok:true}` bezuslovno (`chat.ts:1351`, `:1384`) — grana `!ok` na tom putu je nedostižna, a mrtva grana je isti greh kao mrtva komponenta |
| Izmena 10: `ZA-POPRAVKU` samo dopuna A.1 | dopuna + nova sekcija **§11** + nova zamka **Z11** | §11 nosi zatvorenu duplikaciju i pravilo za sledeću konstantu; Z11 je naučen na lintu ove faze |

### 4. Gejtovi

```
apps/mobile   npx tsc --noEmit                                    → 0 grešaka
apps/web      npx tsc --noEmit                                    → 0 grešaka
packages/backend  npx tsc -p convex/tsconfig.json --noEmit        → 0 grešaka
npm run lint                                                      → 0 grešaka, 0 upozorenja
npm test      Test Files 43 passed (43) | Tests 379 passed (379)  (baseline P2: 42/367 → +1 fajl, +12 testova)
npm run build → Next.js build uspešan, sve rute kompajlirane
```

Novih 12 testova: 8 u `apps/mobile/src/lib/chat.mention.test.ts`, 4 u
`packages/backend/convex/chat.test.ts` (`setChannelMembers` ×2, predprovera
`generateUploadUrl` ×1, „odbijanje ne briše tuđ blob" ×1). Postojeći test
„nepodržan tip se odbija" je prepisan u „odbijen prilog se VRAĆA, a blob se briše"
— tvrdi jače nego pre (`rejects` → `{ok:false}` **plus** `_storage` red je `null`).

> `npm run lint` **ne pokriva `apps/mobile/**`** (`eslint.config.mjs:25`) — „lint
> čist" za mobilni znači `tsc`, ne ESLint. Ista ograda kao u svakoj fazi
> (`ZA-POPRAVKU` §5.12).

**`apps/mobile/package.json` NIJE menjan** — `expo-clipboard`, `expo-image-picker`
i `expo-document-picker` su već bili zavisnosti. Native build zato nije obavezan;
`NATIVE-BUILD.md` se ne dopunjuje.

### 5. Šta NIJE provereno — iskreno

- **Ništa nije pokrenuto na uređaju ni u emulatoru.** Verifikacija je `tsc` +
  `npm test` + `lint` + `build`. Ne tvrdim da sam video kako se bira član prstom.
- **Nov indeks `chatMessages.by_attachmentStorageId` nije deployovan.** Na `convex
  deploy` Convex ga gradi nad postojećim redovima; to nije mereno.
- **`selectionLimit: 10` nije isprobano na uređaju** — svesna granica, ne serverska.
  Ako se pokaže premalo, menja se jedna konstanta (`message-composer.tsx:111`).
- **Kontrolisan `selection` na Androidu** (`pendingCaret`) je poznata škakljiva
  tačka RN-a. Rešenje ga drži jedan tick i pušta na prvi `onChangeText`/
  `onSelectionChange`, ali to nije izmereno prstom. Ako zaškripi: izbaci `selection`
  prop — kursor tada ode na kraj, **ali tekst posle kursora se i dalje NE briše**,
  što je i bio bag.
- **Web „Poništi" za članove ne postoji** — namerno, zapisano i u `02-EKRANI.md`.
  Reverzija na webu je otvoriti dijalog, odčekirati, sačuvati.
- **Video se i dalje ne renderuje u mehuriću ni na jednoj platformi.** Slanje jeste
  rupa pariteta i zatvorena je; prikaz nije rupa nego nova funkcija za obe platforme.
- **Merni gejt `ZA-POPRAVKU` §2 ostaje otvoren** (agent nema uređaj), a **§0 plana
  P3 se prenosi kao otvorena stavka**: `editor-web/inline.mjs:44` koristi
  `String.replace(string, string)`, koji izvršava `$`-obrasce — commitovani
  `note-editor-html.ts` je zato po nalazu revizije P2 neispravan JavaScript. P3 to
  nije dirala (nije chat, a popravka nosi regeneraciju ~660 KB artefakta).

### 6. Provera prstom (čeka korisnika)

| # | Šta | Očekivano |
|---|---|---|
| T1 | „Više" → „Ideje" → ideja | Dve sekcije: **„Predlozi izmena"** (doprinosi) i red **„Započni diskusiju"** (chat) |
| T2 | „Započni diskusiju" → prva poruka | Red postane „Diskusija, 1 poruka"; tap vodi u `/razgovor/[id]` |
| T3 | Ista ideja na webu | `EntityDiscussionPanel` pokazuje **istu** poruku — dokaz da je isti `anchorId`, ne paralelni kanal |
| T4 | Beleška i zadatak (regresija) | Diskusija radi kao pre |
| T5 | „Chat" → „Nova poruka" → „Novi kanal" (admin) | Polje pretrage + lista članova sa kvačicama ispod prekidača „Privatan" |
| T6 | Kucanje u pretragu | Lista se smanjuje; prazan rezultat ima svoj tekst |
| T7 | Kreiraj privatan kanal sa čekiranim članom | **Drugi nalog** (web, taj član) vidi kanal u listi |
| T8 | Razgovor → `⋯` | Red „Članovi kanala" postoji za admina nad custom kanalom; **ne postoji** u „Opšte" ni za ne-admina |
| T9 | Ukloni člana → „Sačuvaj" | Traka „Poništi" iznad kompozera; tap vraća člana (proveriti na webu) |
| T10 | Web: `view=chat` → custom kanal → `⋯` → „Članovi kanala" → odčekiraj → Sačuvaj | Mobilnom tom članu kanal nestane iz liste |
| T11 | Spajalica → „Galerija" → izaberi 3 slike | **3 poruke** redom kojim su izabrane, ne jedna |
| T12 | Galerija → video | Poruka sa imenom fajla; web otvara isti prilog |
| T13 | Napiši „posle podne", vrati kursor iza „posle", kucaj `@Ime` | „ podne" **ostaje** u poruci |
| T14 | Dugi pritisak na poruku → „Kopiraj tekst" | Nalepi u kompozer — isti tekst |
| T15 | Pošalji sliku sa tekstom → dugi pritisak → „Izmeni" | Prilog se uređuje; brisanje teksta se sačuva prazno |
| T16 | Poruka starija od 15 min → „Izmeni" | Red **postoji**, tap daje „Poruka se može izmeniti samo u prvih 15 minuta." |

- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `tsc backend`: prolazi
- `lint`: prolazi (0 grešaka, 0 upozorenja)
- `test`: prolazi (43 fajla, 379 testova)
- `build`: prolazi
- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
- Trajanje: 66 min

## P4 - Ideje i misli: doslednost i kanvas prikaz

**Cilj:** Ideje imaju sve sto imaju misli, a kanvas prikazuje boju i oznaku veze koje korisnik unosi.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `sonnet` | `xhigh` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-13T02:47:18
- PLAN: napisan
- IZVRŠI: završeno 2026-08-13

### 1. Nalazi — dokaz fajl:linija

Backend nije menjan — sve funkcije koje su trebale (`create.color`, `create.parentIdeaId`,
`update.color`, `edge.label`, `node.color`, `isApproved`) su već postojale (plan §1).

| # | Tvrdnja | Dokaz PRE | Šta je urađeno | Dokaz POSLE |
|---|---|---|---|---|
| C3 | Boja ideje se ne bira pri kreiranju | `idea-create-sheet.tsx:56` — `create({startupId,title,text})` bez `color` | `ColorRow` preseljen u deljen primitiv; sheet dobija `color` state + red kružića | `components/ui/color-row.tsx:12` (definicija); `idea-create-sheet.tsx:49` (`color` state), `:140` (mount), `create({…, color})` |
| C3 | Izmena prosleđuje staru boju bez izbora | `ideja/[id].tsx` stari komentar „mobilni još nema piker boje ideje" | `draftColor` state, `ColorRow` u edit sheet-u, komentar ispravljen | `ideja/[id].tsx:94` (`draftColor`), `:390` (mount), `:132` (`saveEdit` šalje `draftColor`) |
| C4 | `ideas.duplicate` ne postoji ni na mobilnom ni u backendu | `grep "Dupliraj" idea-actions-sheet.tsx` → 0 pogodaka | Red „Dupliraj" duplira kroz postojeći `ideas.create` (kao web), apsolutna pozicija + `+36` ofset | `idea-actions-sheet.tsx:124` (`createIdea`), `:169` (`duplicate()`), `:252` (red) |
| C4 | Nema undo za novu ideju | `lib/undo.ts` bez `ideaCreate` člana | Nov član `ideaCreate`, inverz `ideas.archive` | `lib/undo.ts` (`ideaCreate` član), `undo-bar.tsx` (`case 'ideaCreate'` → `archiveIdea`) |
| C5 | Oznaka veze se upisuje ali se ne vidi na kanvasu | `canvas-embed.tsx` mapiranje ivica bez `label` (ideje `:1353`, misli `:1723` iz revizije) | Sve četiri grane ivica (ideje, misli, oblast/stranica, — checkpoint nema `label` u šemi) sada nose `label` | `canvas-embed.tsx:1359`, `:1731`, `:2454` (`label: edge.label ?? undefined`); CSS `:2700-2705` |
| C6 | Boja čvora stiže do klijenta ali se ne crta | `embed-node.tsx` `EmbedNodeData` bez `color` polja | Nov `EmbedNodeColor` union + `embedNodeColor()` čuvar + tačka pored naslova | `embed-node.tsx:46` (tip), `:58` (funkcija), `:74` (polje), `:213` (render); `canvas-embed.tsx:1351`, `:1723` (popunjavanje) |
| C8 | Nema filtera u idejama ni mislima | `ideje.tsx`/`misli.tsx` bez `TextInput`-a | Deljen `SearchField`, klijentski filter (doslovno web) nad naslovom/tekstom | `components/ui/search-field.tsx`; `ideje.tsx:109` (`filteredNodes`), `:205` (mount); `misli.tsx:101`, `:210` |
| C16 | `isApproved` skriven uslov, red se pojavljuje/nestaje bez objašnjenja | `idea-actions-sheet.tsx` stari uslov `target.isApproved && !target.convertedPageId` | Status vidljiv (`Badge`) na listi i detalju; red „Pretvori u stranicu" se više ne sakriva, prikazuje se onemogućen sa razlogom | `ideje.tsx:419` (`Badge`); `ideja/[id].tsx:227-233` (`Badge` + meta linija); `idea-actions-sheet.tsx` (uslov `!target.convertedPageId`, `disabled={… || !target.isApproved}`) |
| sitno | Datum kreiranja ideje ne stoji u listi | `IdeaItem` bez `createdAt` | `IdeaItem.createdAt` + `formatDayHeading(startOfLocalDay(...))` u podnožju | `ideje.tsx` (`IdeaItem` tip, `IdeaRow` podnožje) |
| sitno | „Nova grana ideje" traži dva odvojena poteza | `IdeaCreateSheet` bez `parent` prop-a | Opcioni `parent` prop; `parentIdeaId` + apsolutna pozicija roditelja (`+300/+40`) | `idea-create-sheet.tsx:41` (prop), `:85` (`pushUndo`); ulaz `idea-actions-sheet.tsx:261` („Nova grana ideje…"); `ideje.tsx`/`ideja/[id].tsx:312` (`onBranch`) |
| sitno | „Nova povezana misao" traži dva odvojena poteza | `ThoughtCreateSheet` bez `connectFrom` prop-a | Opcioni `connectFrom` prop; `createNode` pa `createEdge` sa rollback-om (`archiveNodes`) ako ivica pukne | `thought-create-sheet.tsx:37` (prop), `:89-98` (rollback + `pushUndo`); ulaz `thought-actions-sheet.tsx:281`; `misli.tsx:91` (`connectFrom` state) |

### 2. Lanac uvoza — dokaz da nije mrtvo

**`components/ui/color-row.tsx`** (preseljen iz `thought-node-sheet.tsx`)
→ `thought-node-sheet.tsx` (mount, nedirnuto ponašanje) → kanvas misli → tap na čvor;
→ `thought-create-sheet.tsx:5` (uvoz, putanja promenjena) → „Misli" → FAB „Nova misao";
→ **novo:** `idea-create-sheet.tsx:6` → „Ideje" → kanvas → rail „Nova ideja" (i „Nova
grana ideje…", vidi niže) → `ideja/[id].tsx:19` → ⋯ → „Izmeni ideju".

**`idea-actions-sheet.tsx` red „Dupliraj"**
→ `ideje.tsx:18` (uvoz, postojeći) → mount `:300` (dugi pritisak na karticu) →
tab „Više" → „Ideje" → dugi pritisak; → `ideja/[id].tsx:26` → mount `:281` (ikonica
„Akcije ideje" u zaglavlju). `ideaCreate` (undo) → `undo-bar.tsx` `case` →
`<UndoBar>` već montiran na oba ekrana.

**`idea-actions-sheet.tsx` red „Nova grana ideje…" → `idea-create-sheet.tsx` sa `parent`**
→ `onBranch` prop na `IdeaActionsSheet` → `ideje.tsx` (`branchParent` state `:101`,
handler `:307`) i `ideja/[id].tsx` (`branchParent` state, handler `:312`) → oba
montiraju `<IdeaCreateSheet parent={branchParent}>` (`ideje.tsx:326-329`) → jedini
ulaz je red u akcionom sheet-u, koji je već dostupan (dugi pritisak / ikonica
„Akcije ideje").

**`thought-actions-sheet.tsx` red „Nova povezana misao…" → `thought-create-sheet.tsx` sa `connectFrom`**
→ `onCreateConnected` prop → `misli.tsx:91` (`connectFrom` state) → mount
`ThoughtCreateSheet` sa `open={createOpen || connectFrom !== null}` (`:325-330`) →
jedini ulaz je red u `ThoughtActionsSheet`, otvoren dugim pritiskom na red misli.

**`components/ui/search-field.tsx`** (izvučen iz `pretraga.tsx`)
→ `ideje.tsx:32` → `ScreenHeader below` (`:205`) → tab „Više" → „Ideje";
→ `misli.tsx:21` → `ScreenHeader below` (`:210`) → tab „Više" → „Misli".
Dva mounta, oba na ekranu koji se otvara u dva tapa; `pretraga.tsx` nedirnut
(zaseban primitiv, plan §5.6).

**`lib/canvas-position.ts` `absoluteNodePosition`**
→ `idea-actions-sheet.tsx` (`duplicate`, `:169`) → `ideje.tsx`/`ideja/[id].tsx`
(`onBranch`) → `misli.tsx` (`onCreateConnected`). Plus `canvas-position.test.ts`
(6 tvrdnji, `npx vitest run` provereno pojedinačno pre nastavka faze).

**`embed-node.tsx` `embedNodeColor` / `color` polje**
→ `canvas-embed.tsx` (uvoz `:52-60`) → dva pozivaoca (`:1351` ideje, `:1723` misli)
→ ruta `/embed/canvas/[kind]/[id]` → mobilni WebView (`canvas/[kind]/[id].tsx`) →
„Ideje"/„Misli" → ikonica kanvasa. Dokazano i `npx tsc --noEmit` u `apps/web` (čisto)
i `npm run build` (ruta `/embed/canvas/[kind]/[id]` kompajlirana, izlaz build-a niže).

**`edge.label` u mapiranju ivica (C5)** — nema nove jedinice, izmena je u postojećem
mapiranju koje `EmbedFlow` već crta (`edges={edges}`). Dokaz da nije mrtvo: naziv
veze se upisuje sa telefona (`idea-edge-sheet.tsx:145`) i posle ove izmene se vidi
na istom kanvasu (`canvas-embed.tsx` + `EmbedStyles` CSS `:2700-2705`).

### 3. Odstupanja od plana (i zašto)

| Plan | Urađeno | Razlog |
|---|---|---|
| Meta stil u `idea-create-sheet.tsx`/`thought-create-sheet.tsx` nije precizirao token | `fontSize: fontSize.xs` (12) umesto magičnog broja | Oba fajla već isključivo koriste `fontSize` skalu iz `theme/tokens.ts` (ne `text.*`) — dosledno lokalnoj konvenciji fajla, ne uvodi drugi sistem stilova u isti fajl |
| Plan nije eksplicitno rekao da li `pushUndo` za OBIČNO (ne-connected) kreiranje misli treba da postoji | `ThoughtCreateSheet` NE zove `pushUndo` kad `connectFrom` nije zadat | Plan §7 test-tabela testira „Poništi" samo za POVEZANU misao; obična „Nova misao" sa rail-a/FAB-a nije bila u opsegu C3-C16/sitno spiska i dodavanje undo tamo bi bio scope creep van onoga što je zadatak tražio |
| Ostalo | Sprovedeno bukvalno po planu | — |

Plan je unapred zapisao dva **svesna** odstupanja od weba (izmena 6 tačka 1, izmena 8
tačka 3) — oba su sprovedena kako je opisano:
- „Nova grana ideje" DOBIJA pozicioniranu koordinatu pored roditelja
  (`x: parent.x + 300, y: parent.y + 40`) kad je poznata, dok web pušta granu bez
  pozicije (server randomizuje ±150). Bez ovoga reč „grana" nema smisla na malom ekranu.
- Red „Pretvori u stranicu" na mobilnom OSTAJE VIDLJIV ali onemogućen kad ideja nije
  odobrena (sa razlogom u podnaslovu); web ga i dalje sakriva. Objašnjenje umesto
  tihog pojavljivanja/nestajanja je bio izričit zahtev C16.

### 4. Gejtovi

```
apps/mobile       npx tsc --noEmit                              → 0 grešaka
apps/web          npx tsc --noEmit                               → 0 grešaka
packages/backend  npx tsc -p convex/tsconfig.json --noEmit       → 0 grešaka (nula izmena u backendu)
npm run lint                                                     → 0 grešaka, 0 upozorenja
npm test          Test Files 44 passed (44) | Tests 385 passed (385)  (baseline P3: 43/379 → +1 fajl, +6 testova)
npm run build     → Next.js build uspešan; /embed/canvas/[kind]/[id] kompajlirana ruta
```

Novi test: `apps/mobile/src/lib/canvas-position.test.ts` (6 tvrdnji — top-level,
jedan nivo ugnježdenja, dva nivoa, roditelj van liste, ciklus, nepoznat id).

> `npm run lint` **ne pokriva `apps/mobile/**`** (`eslint.config.mjs:25`) — „lint
> čist" za mobilni znači `tsc`, ne ESLint. Ista ograda kao u svakoj prethodnoj fazi
> (`ZA-POPRAVKU` §5.12).

**`apps/mobile/package.json` NIJE menjan** — nema novih zavisnosti (svi novi fajlovi
koriste postojeće pakete: `lucide-react-native`, `convex/react`). Native build zato
nije obavezan; `NATIVE-BUILD.md` se ne dopunjuje.

### 5. Šta NIJE provereno — iskreno

- **Ništa nije pokrenuto na uređaju ni u emulatoru.** Verifikacija je isključivo
  `tsc` (mobile/web/backend) + `npm test` + `npm run lint` + `npm run build`. Nijedan
  novi red, sheet ili tačka boje na kanvasu nije viđen kako radi na ekranu.
- **Boja čvora i oznaka veze na kanvasu (izmene 11-12) nisu vizuelno provereni.**
  `npm run build` dokazuje da ruta `/embed/canvas/[kind]/[id]` kompajlira i da `tsc`
  ne vidi grešku tipa, ali ne dokazuje da tačka ima očekivanu boju na ekranu niti da
  je tekst veze čitljiv na tamnoj temi (rizik iz plana §4, red „Oznaka veze nečitljiva").
- **`ColorRow` seljenje nije provereno prstom** — dokaz je isključivo da `tsc` ne baca
  grešku na jedini spoljni uvoz (`thought-create-sheet.tsx`) i da postojeći testovi
  prolaze; vizuelni izgled nedirnut po dizajnu (kopija koda, ne prepis).
- **Rollback „povezane misli" (createEdge pukne → archiveNodes)** nije izazvan —
  grana `catch` postoji (`thought-create-sheet.tsx:89-98`), ali test scenario koji bi
  je aktivirao (npr. server odbija vezu) nije simuliran ni testom ni ručno.
- **Apsolutna pozicija za dupliranje/granu/povezanu misao nad STVARNO ugnježdenim
  čvorom** nije provereno na uređaju — pokriveno je isključivo jedinstvenim testom
  `canvas-position.test.ts` nad sintetičkim podacima, ne nad pravim Convex upitom.
- **Merni gejt `ZA-POPRAVKU` §2 ostaje otvoren** (agent nema uređaj) — nepromenjen
  ovom fazom, prenosi se dalje.
- **`inline.mjs:44` (`String.replace` sa `$`-obrascima)** — prenosi se dalje po plan §0,
  van opsega ove faze (nije ideja ni misao).

### 6. Provera prstom (čeka korisnika)

| # | Šta | Očekivano |
|---|---|---|
| T1 | „Ideje" → kanvas → „Nova ideja" → izaberi `rose` → Dodaj | Kartica na kanvasu i u listi ima `rose` boju; na webu (`ideas-view` → Otvori) ista boja |
| T2 | Detalj ideje → ⋯ → „Izmeni ideju" → promeni boju → Sačuvaj → ponovo otvori | Nova boja zatečena, naslov/tekst nedirnuti |
| T3 | Lista ideja → dugi pritisak → „Dupliraj" | Nova kartica sa istim naslovom u listi; traka „Poništi" uklanja je; na kanvasu kopija je POKRAJ originala, ne preko njega |
| T4 | Ugnjezdi ideju A u B → dupliraj A | Kopija je pored VIDLJIVOG položaja A, ne u koordinatnom početku (0,0) |
| T5 | Detalj ideje → ⋯ → „Nova grana ideje…" → naslov + opis → Dodaj | Detalj originala u „Veze" pokazuje novu ideju; na webu kanvas prikazuje liniju između njih |
| T6 | Rail kanvasa → „Nova ideja" → Dodaj | Traka „Poništi" se pojavljuje (ranije nije postojala za obično kreiranje) |
| T7 | „Misli" → dugi pritisak → „Nova povezana misao…" → Dodaj | Red izvora pokazuje „+1 veza"; „Poništi" uklanja i misao i vezu |
| T8 | Ideja sa više glasova protiv | Lista i detalj pokazuju „U razmatranju"; ⋯ → red „Pretvori u stranicu" postoji, ONEMOGUĆEN, sa razlogom |
| T9 | Dodaj glas za dok je ideja otvorena na detalju | Status i red se menjaju BEZ ponovnog ulaska (živa pretplata) |
| T10 | Ideja napravljena danas vs. starija | Lista pokazuje „Danas" vs. „7. avgust" |
| T11 | „Ideje" → kucaj dve reči u pretragu | Lista se skuplja; `eyebrow` piše „2 od 9"; nepostojeći pojam daje „Nema rezultata za …" sa dugmetom koje briše pretragu |
| T12 | „Misli" sa > 50 učitanih i aktivnim filterom | Footer poruka „Pretraga važi nad učitanih N misli — skroluj za još"; skrol dovlači još i lista raste |
| T13 | Ideja obojena u T1 → otvori kanvas ideja (WebView) | Tačka u boji na kartici; ista boja kao desktop kanvas (`localhost:3000`, isti startup) |
| T14 | Detalj ideje → „Veze" → veza → upiši naziv → Sačuvaj → otvori kanvas ideja | Naziv veze stoji na liniji; isto za misli i za kanvas oblasti (veza između dve stranice) |
| T15 | Veza BEZ naziva | Nema ni pravougaonik ni prazan tekst — izgleda kao pre P4 |
| T16 | Kanvas misli → tap na čvor → sheet detalja | Red kružića za boju i dalje postoji i bira se (regresija posle seljenja `ColorRow`) |

- IZVRSI: prošlo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `tsc backend`: prolazi (nula izmena)
- `lint`: prolazi (0 grešaka, 0 upozorenja)
- `test`: prolazi (44 fajla, 385 testova)
- `build`: prolazi
- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
