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
- Trajanje: 60 min

## P5 - Struktura: ugnjezdavanje, premestanje, putanja, doprinosi

**Cilj:** Sa telefona se stranica moze smestiti bilo gde u stablu, a iz putanje se moze skociti na roditelja.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `opus` | `high` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-13T03:47:18
- PLAN: napisan
- IZVRŠI: završeno 2026-08-13

### 1. Nalazi — dokaz fajl:linija

**Backend JESTE menjan** (jedna mutacija + tri testa). Razlog je u tabeli ispod, red C10.

| # | Tvrdnja | Dokaz PRE | Šta je urađeno | Dokaz POSLE |
|---|---|---|---|---|
| C10 | „Web to radi u jednom potezu (`workspace-shell.tsx:488-500`)" | **NETAČNO.** `areasV2.ts` je za promenu oblasti + `targetParent !== null` bacao „Premeštanje u drugu oblast je dozvoljeno samo u koren oblasti." — web je pokušavao, server odbijao. Rupa je bila **serverska, na obe platforme** | `movePage` komponuje `movePageAcrossAreasWithSidecars` + `moveWithinArea` u istoj transakciji, uz ponovno čitanje dokumenta između koraka | `packages/backend/convex/areasV2.ts:3732-3771` |
| C10 | Ustajao dokument posle selidbe grane | — | `ctx.db.get("pages", page._id)` pre drugog koraka; bez toga kartica sleti u STARU oblast | `areasV2.ts:3754-3758`; nova zamka `ZA-POPRAVKU.md` §Z12 |
| C10 | Mobilni uvek šalje `targetParentPageId: null` | `page-actions-sheet.tsx` `moveTo` | Drugi korak `moveTarget`: red „U koren oblasti" + `PageTargetPicker` nad ciljnom oblašću | `page-actions-sheet.tsx:508-541`; `SheetView` proširen `:37`, `VIEW_TITLE` `:39-45` (nepromenjeno) |
| C9 | Kandidati za ugnježdavanje su samo korenske stranice | `page-actions-sheet.tsx` `nestCandidates` (`listChildren` sa `parentPageId: null`, `initialNumItems: 50`) | `nestCandidates` obrisan; `PageTargetPicker` sa stablom bilo koje dubine | `components/stranica/page-target-picker.tsx` (nov); mount `page-actions-sheet.tsx:544` |
| C9/C10 | Premeštanje i ugnježdavanje pišu u bazu bez „Poništi" | `lib/undo.ts` bez člana za mesto stranice | Nov član `pageReparent` (svesno drugo ime od `pageMove`, koji znači koordinate na kanvasu) | `lib/undo.ts:235`; `undo-bar.tsx:321` (`case 'pageReparent'` → `movePage`); pozivalac `page-actions-sheet.tsx:153` (`pushPlaceUndo`) |
| C11 | Putanja je nedodirljiv `Text`; posle dubokog linka nema puta ka roditelju | `breadcrumbs-eyebrow.tsx` `EyebrowText`, komentar „segmenti NISU dodirljivi" | Nov `PathSheet`: red OBLASTI + red po pretku; linija ostaje ista, ali je cela JEDNA meta | `breadcrumbs-eyebrow.tsx:125` (`PathSheet`), `:150` (oblast → `/prostor`), `:200` (predak → `/zadatak/[id]` ili `/stranica/[id]`); mount `stranica/[id].tsx:118`, `zadatak/[id].tsx:353` |
| C11 | Meta eyebrow-a je ~32pt | `ui/screen-header.tsx` `hitSlop={{top: 8, …}}` | `top: 20` → 20 + `minHeight: 20` + 4 = **44pt**, bez ijednog piksela vizuelne promene | `ui/screen-header.tsx:96` |
| C7 | `prostor.tsx` nema nijedan filter | grep `OptionChip` u `prostor.tsx` → 0 | `KindFilterRow` (Sve + 4 vrste) iznad liste; filter ide u korenski `listChildren` | `components/prostor/kind-filter-row.tsx` (nov); mount `prostor.tsx:540`, upit `:528`, napomena `:541-549`, prazno stanje `:900-921` |
| C13 | `ContributionThread` sa `task_checkpoint` metom nema nijednog pozivaoca | union član postojao od početka, mrtva grana tipa | Nov sheet, ulaz ikonica u redu koraka (prva u nizu, kao web) | `components/zadatak/checkpoint-contributions-sheet.tsx` (nov); dugme `task-checkpoint-list.tsx:376`, mount `:441` |
| C14 | Oblast ima samo brifing | `prostor.tsx` — samo `AreaBriefingSection` | Kolapsibilna sekcija „Potpisani doprinosi" ispod brifinga + `area` član unije + traka „Poništi" na Nivou 2 | `components/prostor/area-contributions-section.tsx` (nov); mount `prostor.tsx:255`; `contribution-thread.tsx:54` (`area`); `prostor.tsx:288` (`UndoBar bottomOffset={72}`) |
| C13/C14 | Brisanje doprinosa u sheet-u ostavlja „Poništi" ispod modala | — | Nov opcioni `onDeleted` na `ContributionThread`, zove ga samo DIREKTNO brisanje | `contribution-thread.tsx:62` (prop), `:156` (poziv); potrošač `checkpoint-contributions-sheet.tsx` |

### 2. Lanac uvoza — dokaz da nije mrtvo

**`components/stranica/page-target-picker.tsx` (`PageTargetPicker`)**
→ `page-actions-sheet.tsx:15` (uvoz), dva mounta: `:527` (korak „Mesto u oblasti")
i `:544` (korak „Ugnjezdi pod…") → `<PageActionsSheet>` je već montiran na
`stranica/[id].tsx:111` i `zadatak/[id].tsx:346` → ekran „Stranica"/„Zadatak" → „…"
→ „Ugnjezdi pod…" ili „Premesti u oblast" → (druga oblast) → stablo.

**`breadcrumbs-eyebrow.tsx` `PathSheet`**
→ `stranica/[id].tsx:8` (uvoz) → mount `:118`, otvara ga `onEyebrowPress` `:88`;
→ `zadatak/[id].tsx:25` (uvoz) → mount `:353`, otvara ga `onEyebrowPress` `:181`.
`onEyebrowPress` je prop koji `ScreenHeader` već podržava (`ui/screen-header.tsx:88-98`)
i koji je do sada koristio samo `app-header.tsx`. **Ovo je tačka na kojoj faza pada
ako se preskoči** (pouka K4 / `inviteLinkUrl`) — zato su oba mounta u tabeli iznad.

**`components/prostor/kind-filter-row.tsx` (`KindFilterRow`)**
→ `prostor.tsx:38` (uvoz) → mount `:540` unutar `PageLevel` → tab „Prostor" → tap na
oblast → chip red iznad liste. Stanje `kindFilter` je u `PageLevel`, koji već ima
`key={frameKey}` (`:261`), pa promena oblasti sama resetuje filter.

**`components/prostor/area-contributions-section.tsx` (`AreaContributionsSection`)**
→ `prostor.tsx:36` (uvoz) → mount `:255` (odmah ispod `AreaBriefingSection`) → tab
„Prostor" → tap na oblast → red „Potpisani doprinosi" → razvij. Traka „Poništi" za
brisanje: `prostor.tsx:41` (uvoz `UndoBar`) → mount `:288`.

**`components/zadatak/checkpoint-contributions-sheet.tsx` (`CheckpointContributionsSheet`)**
→ `task-checkpoint-list.tsx:19` (uvoz) → mount `:441`, otvara ga dugme `:367-377`
(`MessageSquareText`, `accessibilityLabel={`Doprinosi: ${item.text}`}`) →
`<TaskCheckpointList>` je već montiran na `zadatak/[id].tsx:301` → ekran „Zadatak"
→ red koraka → ikonica „Doprinosi".

**`lib/undo.ts` `pageReparent`**
→ `undo-bar.tsx:321` (`case`, poziva `api.areasV2.movePage`) → `<UndoBar/>` već
montiran na `stranica/[id].tsx:128` i `zadatak/[id].tsx:363` → traka se pojavi odmah
posle premeštanja, na istom ekranu (sheet se zatvori, ekran ostaje). Pozivalac koji
je puni: `page-actions-sheet.tsx:153` (`pushPlaceUndo`), zvan iz `moveTo` (`:187`) i
`nestInto` (`:212`).

**`areasV2.movePage` (backend)**
→ `useMutation(api.areasV2.movePage)` u `page-actions-sheet.tsx:91` (postojeće) i
**novo** u `undo-bar.tsx` → oba već u lancu iznad. Grana `targetParent !== null` uz
promenu oblasti se prvi put poziva iz `moveTarget` koraka.

Mehanička provera (§6.3 plana) — svaki nov simbol ima ≥ 2 pogotka, drugi je potrošač:

```
PageTargetPicker            page-target-picker.tsx (1) + page-actions-sheet.tsx (3)
PathSheet                   breadcrumbs-eyebrow.tsx (2) + stranica (2) + zadatak (2)
KindFilterRow               kind-filter-row.tsx (1) + prostor.tsx (2)
AreaContributionsSection    area-contributions-section.tsx (1) + prostor.tsx (2)
CheckpointContributionsSheet checkpoint-contributions-sheet.tsx (1) + task-checkpoint-list.tsx (2)
pageReparent                undo.ts (2) + undo-bar.tsx (1) + page-actions-sheet.tsx (1)
onEyebrowPress              screen-header.tsx (5) + app-header.tsx (1) + stranica (1) + zadatak (1)
onDeleted                   contribution-thread.tsx (3) + checkpoint-contributions-sheet.tsx (2)
UndoBar u prostor.tsx       uvoz :41 + mount :288
```

### 3. Odstupanja od plana (i zašto)

| Plan | Urađeno | Razlog |
|---|---|---|
| §4c: posle uspešnog `moveTo`/`nestInto` prikazati `Alert` sa porukom („Stranica je premeštena u „X" i ugnježdena pod „Y".") | **Alert se prikazuje SAMO za `pending` ugnježdavanje u istoj oblasti** (jedini ishod bez „Poništi"). Za sve ostalo poruku nosi traka „Poništi": `Premešteno u „X" pod „Y".`, odnosno `Premešteno u „X"; ugnježdavanje pod „Y" čeka odobrenje autora.` | Alert je native modal — stoji IZNAD trake i pojede joj 8 sekundi, pa „Poništi" istekne dok korisnik čita dijalog. To je ista greška koju plan sam navodi kao razlog za `onDeleted` (traka ispod modala = mrtav kod). Postojeći obrazac u istom fajlu (`renameSubmit`) već radi ovako: `pushUndo` bez Alert-a |
| §Izmena 3: picker ima jednu praznu poruku („Nema stranica na ovom nivou.") | Dodat prop `rootEmpty` — koren ima punu poruku („U ovoj oblasti nema druge stranice pod koju bi se ugnjezdila." / „Ova oblast još nema nijednu stranicu — koristi „U koren oblasti"."), dublji nivoi kratku | Poruka na korenu je jedina koju korisnik vidi kad stablo NEMA ništa; kratka verzija tamo zvuči kao greška učitavanja, a i regresirala bi tekst koji je `nest` već imao |
| §Izmena 5: `TrailBoundary fallback` = sheet sa samo redom oblasti | Fallback je red oblasti **plus** jedna `meta` linija: „Preci se ne mogu učitati — neki roditelj je u međuvremenu arhiviran." | Tiho izostavljanje predaka izgleda kao „nemaš roditelja"; pravilo faze traži i stanje GREŠKE, ne samo prazno |
| §Izmena 8: filter i lista u istoj komponenti | `PageLevel` razdvojen na `PageLevel` (chip red + grananje prazno/lista) i `PageLevelList` (sama lista) | `LoadingSwap` zamenjuje CELO svoje dete skeletonom; da je chip red ostao unutra, treperio bi sa skeletonom i nestajao pri promeni filtera — što je tačno ono što plan zabranjuje („van `LoadingSwap`-a") |
| Ostalo | Sprovedeno bukvalno po planu | — |

Plan je unapred zapisao dva **svesna izuzetka** i oba su sprovedena kako je opisano:
kanvas NE dobija drugi ulaz u nit koraka (Izmena 11), a podstranice se NE filtriraju
po vrsti (Izmena 8, jer `pages.childCounts` broji svu decu pa bi brojač lagao).

### 4. Gejtovi

```
apps/mobile       npx tsc --noEmit                              → 0 grešaka
apps/web          npx tsc --noEmit                              → 0 grešaka
packages/backend  npx tsc -p convex/tsconfig.json --noEmit      → 0 grešaka
npm run lint                                                    → 0 grešaka, 0 upozorenja
npm test          Test Files 44 passed (44) | Tests 389 passed (389)   (baseline P4: 44/385 → +4 testa)
npm run build     → Next.js build uspešan
git diff --stat -- apps/web                                     → PRAZAN (uslov iz plana §4)
```

Novi testovi (4):
- `areasV2.test.ts` — „premeštanje u drugu oblast pod svoju stranicu sleti tačno tamo"
  (tvrdi `areaId` **i** `parentPageId` **i** placement `areaId`+`rootPageId` — treća
  tvrdnja je jedina koja hvata ustajao dokument, Z12)
- `areasV2.test.ts` — „premeštanje pod TUĐU stranicu u drugoj oblasti seli oblast i traži odobrenje"
- `areasV2.test.ts` — „roditelj iz treće oblasti se odbija"
- `pages.test.ts` — `describe("pages.listChildren")` → „kind filtrira samo traženu vrstu na nivou"
  (grana `kind` do sada nije imala nijednog živog potrošača)

> `npm run lint` **ne pokriva `apps/mobile/**`** — „lint čist" za mobilni znači `tsc`,
> ne ESLint. Ista ograda kao u svakoj prethodnoj fazi (`ZA-POPRAVKU` §5.12).

**`apps/mobile/package.json` NIJE menjan** — nema novih zavisnosti (svi novi fajlovi
koriste postojeće pakete). Native build nije obavezan; `NATIVE-BUILD.md` se ne dopunjuje.

### 5. Šta NIJE provereno — iskreno

- **Ništa nije pokrenuto na uređaju ni u emulatoru.** Verifikacija je isključivo
  `tsc` (mobile/web/backend) + `npm test` + `npm run lint` + `npm run build`. Nijedan
  nov sheet, chip ni red putanje nije viđen kako radi na ekranu.
- **Ceo T-spisak (§6, dole) čeka proveru prstom.** Nijedan red nije čekiran.
- **Promena ponašanja WEBA nije proverena u browseru.** Prevlačenje kartice iz oblasti
  A na stranicu u oblasti B je do sada završavalo crvenim toast-om; posle backend
  izmene treba da uspe. Kod `apps/web` nije dirnut (`git diff` prazan), ali to i
  znači da niko nije potvrdio da web put stvarno prolazi kroz novu granu.
- **`hitSlop` eyebrow-a nije izmeren na uređaju.** Računica je 20 + 20 + 4 = 44pt nad
  `minHeight: 20`; ako se ispostavi da meta otima tap sa „Nazad", vraća se na
  `top: 12` (36pt) i to se zapisuje kao neispunjeno pravilo, ne prećutkuje.
- **Četiri dugmeta u redu koraka su 36pt + `hitSlop={6}` (48pt efektivno), ne 44pt
  fizički.** Podizanje sva četiri na 44 prelama red na uskom telefonu; odluka je o
  REDU, ne o funkciji C13, i ostaje zapisana ovde i u `task-checkpoint-list.tsx:44-48`.
- **Dve razvijene sekcije istovremeno na Nivou 2 taba „Prostor" nisu viđene.**
  „Brifing oblasti" (do 220pt) i „Potpisani doprinosi" (do 42% ekrana) mogu zajedno
  da stisnu listu stranica na par redova. Obe su skupljene podrazumevano i obe imaju
  svoj skrol, pa ništa nije nedostupno — ali raspored u tom stanju nije proveren.
- **Merni gejt `ZA-POPRAVKU` §2 ostaje otvoren** (agent nema uređaj) — nepromenjen.
- **Nije tvrđeno da je C10 „vraćen na paritet sa webom"** — web to nije ni imao; ovo
  je NOVA funkcionalnost na obe platforme.

### 6. Provera prstom (čeka korisnika)

| # | Radnja | Očekivano |
|---|---|---|
| T1 | Prostor → oblast → stranica → „…" → „Ugnjezdi pod…" | Stablo; strelica levo razvija podstranice; red stranice koja se seli se **ne vidi** |
| T2 | T1 → razvij red → tapni **podstranicu** (dubina 2) | Sheet se zatvori, traka „Poništi" piše „Ugnježdeno pod „X"." |
| T3 | T2 → „Poništi" | Stranica je opet tamo gde je bila (proveri kroz „Podstranice" starog roditelja) |
| T4 | „…" → „Premesti u oblast" → druga oblast | Otvara se korak „Mesto u oblasti — <Oblast>" sa prvim redom „U koren oblasti" |
| T5 | T4 → „U koren oblasti" | Kao pre P5 (jedan tap više) + traka „Poništi" |
| T6 | T4 → tapni **svoju** stranicu u toj oblasti | Traka: „Premešteno u „Oblast" pod „X"."; stranica je u drugoj oblasti POD tom stranicom |
| T7 | T4 → tapni **tuđu** stranicu | Traka: „Premešteno u „Oblast"; ugnježdavanje pod „X" čeka odobrenje autora." (oblast JESTE promenjena) |
| T8 | T6 → „Poništi" | Vraća se u staru oblast i pod starog roditelja |
| T9 | Otvori stranicu preko obaveštenja (deep link) → tapni putanju u zaglavlju | Sheet „Putanja" sa redom oblasti i precima |
| T10 | T9 → red pretka | Otvara se roditelj (`/stranica` ili `/zadatak` po vrsti) |
| T11 | T9 → red „Oblast" | Tab Prostor otvoren na toj oblasti |
| T12 | Prostor → oblast → chip „Zadatak" | Lista prikazuje samo zadatke; ispod chipova stoji „Filter važi za koren oblasti." |
| T13 | T12 u oblasti bez zadataka | „Nema stranica vrste Zadatak u ovoj oblasti." + dugme „Prikaži sve" |
| T14 | Prostor → oblast → „Potpisani doprinosi" → razvij → „Dodaj tekst" → Objavi | Tekst se pojavi sa imenom i vremenom |
| T15 | T14 → obriši svoj tekst | Traka „Poništi" **vidljiva** iznad FAB-a i tab bara → vraća tekst |
| T16 | Zadatak → red koraka → ikonica „Doprinosi" | Sheet sa niti; kompozer iznad tastature |
| T17 | T16 → obriši svoj tekst | Sheet se zatvori, traka „Poništi" na ekranu zadatka vraća tekst |
| T18 | Zaglavlje: tapni tačno na liniju putanje (13px tekst) | Sheet se otvara iz prvog pokušaja (44pt meta) |
| T19 | Otvori stranicu čiji je roditelj arhiviran → tapni putanju | Sheet ima red oblasti + poruku „Preci se ne mogu učitati…", ekran NE pada |
| T20 | (web, `localhost:3000`) prevuci karticu iz oblasti A na stranicu u oblasti B | Uspeva umesto crvenog toast-a — promena ponašanja weba bez izmene web koda |

- IZVRSI: prošlo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `tsc backend`: prolazi
- `lint`: prolazi (0 grešaka, 0 upozorenja)
- `test`: prolazi (44 fajla, 389 testova)
- `build`: prolazi
- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
- Trajanje: 65 min

## P6 - Pamcenje stanja, undo/redo, kontrola push-a

**Cilj:** Tema i aktivan startup prezive restart, ponistavanje ide vise koraka unazad, i push se moze iskljuciti sa uredjaja.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `sonnet` | `xhigh` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-13T04:51:59
- PLAN: napisan
- IZVRSI: **PAO** (kod 1)
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
- Trajanje: 75 min

## P7 - Ostatak sitnog, revizija cele liste, zatvaranje

**Cilj:** Svaka stavka iz sekcija B, C i D je ili uradjena ili zapisana kao odluka sa razlogom - nijedna necuta.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `opus` | `xhigh` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-13T06:06:41
- PLAN: napisan
- IZVRŠI: završeno 2026-08-13
- `tsc mobilni`: prolazi (exit 0)
- `tsc web`: prolazi (exit 0)
- `tsc backend`: prolazi (exit 0)
- `lint`: prolazi (exit 0, nijedna linija ispisa)
- `test`: prolazi (50 fajlova / 434 testa)
- `build`: prolazi
- `rn-review`: pušten, 7 nalaza — 4 popravljena, 3 zapisana sa razlogom (§7)

### 0. Baseline (izmereno PRE ijedne izmene)

```
apps/mobile   npx tsc --noEmit   → exit 0, nijedna linija ispisa
npm test                         → Test Files 46 passed (46) | Tests 402 passed (402)
```

### 1. Nalazi — dokaz fajl:linija

Osam kodnih stavki. **Ovde su samo P7 stavke;** pun spisak svih 44 (B, C, D) sa
ishodom je u `docs/mobile/PARITET-REVIZIJA-12-08.md`, nova sekcija **G**.

| # | Tvrdnja | Dokaz PRE | Šta je urađeno | Dokaz POSLE |
|---|---|---|---|---|
| D11 | Prilozi stranice idu jedan po jedan | `files-panel.tsx:116` i `:153` uzimaju `assets[0]`; nema `allowsMultipleSelection` ni `multiple: true` | Galerija i birač dokumenata primaju seriju; red čekanja jedan-za-drugim; predprovera imenuje odbijene | `components/stranica/files-panel.tsx:167-168` (galerija), `:215` (`multiple: true`), `:125` (`enqueue`), `:144` (`startPicks`); nov `lib/page-file-picks.ts` |
| D12 | Kanal oblasti izgleda kao svaki drugi | `conversation-header.tsx:296` uvek `Hash`; `:52-67` `subtitle()` vraća golo „Kanal oblasti"; `conversation-row.tsx:65` isto | Ikonica + boja oblasti i naziv u podnaslovu — i u zaglavlju i u listi | `conversation-header.tsx:312` (ikonica), `:61` (podnaslov), `conversation-row.tsx:78` (lista); nov `components/ui/area-icon.tsx`, `lib/area-meta.ts`, `lib/chat.ts` (`findChannelArea`) |
| D13 | Rok pri kreiranju ima samo 4 preseta | `page-create-sheet.tsx:53-58`; komentar na `:52` je TVRDIO da „proizvoljan datum nosi `DatePickerSheet`", a sheet u tom fajlu **nije bio ni uvezen ni montiran** | Peti čip „Neki drugi dan…" otvara postojeći `DatePickerSheet` kao BRATA; stanje prešlo sa `dueDays` na `dueAt` (ms) | `page-create-sheet.tsx:396-400` (čip), `:466` (mount kao brat), `:129` (`dueAt`), `:74` (`presetFor`) |
| D14 | Sadržaj beleške se ne može upisati pri kreiranju | `page-create-sheet.tsx:141-159` nikad ne šalje `content` | Polje „Sadržaj (opciono)" + prevod u Tiptap HTML | `page-create-sheet.tsx:307` (polje), `:189` (`content: noteTextToHtml(...)`); nov `noteTextToHtml` u `lib/note-content.ts` |
| D15 | Oblast se pri kreiranju ne vidi ni ne bira | nigde u `page-create-sheet.tsx` | **Piker NIJE dodat** (odluka, plan §5.1) — dodata linija koja kaže u kojoj oblasti se stavka pravi | `page-create-sheet.tsx:251` |
| D16 | Video/audio prilog izlazi iz aplikacije; nema „Preuzmi" | `file-preview.tsx:21` `kind: 'image' \| 'pdf'`; `files-panel.tsx:171` šalje ostalo u sistemski browser; nula stanja greške | Plejer u aplikaciji + dugme „Preuzmi" + oba stanja greške koja web ima | `file-preview.tsx:28` (tip), `:42` (`mediaDocument`), `:106` (memoizovan `source`, Z1), `:148` („Preuzmi"), `:160` i `:166` (stanja); grana dostupna preko `files-panel.tsx:234` |
| D17 | Nema kanban „Tabla" | `zadaci.tsx` je vertikalna lista | **NIJE URAĐENO — odluka sa tri dokaza** (`ZA-POPRAVKU.md` §14) | vidi sekciju G revizije, red D17 |
| D18 | Puls nema „Sastav nedelje" | `grep PulseBar apps/mobile/src` → 0 pogodaka | Nov primitiv + mount unutar zaglavlja nedelje, sa skeletonom iste visine | nov `components/ui/pulse-bar.tsx`; `app/(app)/puls.tsx:165` (mount), `:123` (segmenti) |
| D19 | Ne-admin ne može da vidi spisak tima | `vise.tsx:69` red je bio `adminOnly: true`, filtriran na `:105` | Ulaz otvoren svima; admin RADNJE gejtovane unutra | `vise.tsx:72` (red bez `adminOnly`); `clanovi.tsx:116` (ulaz „Dodaj člana"), `:191` (dugme za uklanjanje), `:231` (mount `AddMemberSheet` iza `isAdmin`) |
| D20 | Odsecanje na 100 zahteva se ne kaže | `odobrenja.tsx:124` čita `listNestingInbox`, `grep truncated` → 0 | Poruka u OBA segmenta (serverski `truncated` pokriva incoming i outgoing) | `odobrenja.tsx:562` (`TruncationNote`), pozvano na `:338` i `:417`; `grep -c truncated` → **6** (bilo 0) |

**Backend NIJE menjan.** `git diff --stat -- packages/backend` je prazan; nijedna
od osam stavki nije tražila novu funkciju (razlozi po stavci: plan §1.3). Isto i
`git diff --stat -- apps/web` → prazan.

**`apps/mobile/package.json` NIJE menjan** → `NATIVE-BUILD.md` se ne dopunjuje i
nov development build **nije** postao obavezan zbog P7.

### 2. Lanac uvoza — dokaz da nije mrtvo

Pet novih modula u P7. Lanci nisu prepisani iz plana nego **izmereni skriptom
dostupnosti** (obrnut graf uvoza nad `apps/mobile/src`, cilj je bilo koji fajl u
`src/app/`):

```
lib/html.ts            → components/stranica/file-preview.tsx
                       → components/stranica/files-panel.tsx
                       → app/(app)/stranica/[id].tsx
lib/page-file-picks.ts → components/stranica/files-panel.tsx → app/(app)/stranica/[id].tsx
lib/area-meta.ts       → components/ui/area-icon.tsx
                       → components/chat/conversation-header.tsx
                       → app/(app)/razgovor/[id].tsx
components/ui/area-icon.tsx  → components/chat/conversation-header.tsx → app/(app)/razgovor/[id].tsx
components/ui/pulse-bar.tsx  → app/(app)/puls.tsx
```

Drugi potrošači (isti moduli, druga površina), takođe izmereni:
`lib/html.ts` → `lib/note-content.ts` (`noteTextToHtml`) → `components/canvas/page-create-sheet.tsx`;
`components/ui/area-icon.tsx` → `components/chat/conversation-row.tsx` → `app/(app)/(tabs)/chat.tsx`.

**Nov potrošač postojećeg modula:** `components/ui/date-picker-sheet.tsx` →
`components/canvas/page-create-sheet.tsx` → `app/(app)/(tabs)/prostor.tsx`. Do P7
je taj sheet imao pozivaoce samo iz zadatka; sada i iz kreiranja.

**Prvi klijentski čitalac serverskog polja:** `areasV2.listNestingInbox.truncated`
→ `app/(app)/odobrenja.tsx:338` i `:417`.

Do korisnika prstom (jedan primer po stavci, ostali u T-listi):
tab „Prostor" → oblast → fajl-oblačić → tap na video prilog → plejer i „Preuzmi";
tab „Chat" → kanal oblasti → ikonica i „Kanal oblasti · Dev";
tab „Više" → „Puls" → traka ispod navigacije nedelje;
tab „Više" → „Članovi tima" (i kao ne-admin);
tab „Prostor" → oblast → FAB → „Zadatak" → „Više opcija" → Rok → „Neki drugi dan…".

### 2b. Lov na mrtav kod za CEO lanac 6 (zahtev 3 zadatka)

Dve nezavisne mehaničke provere nad `apps/mobile/src`, obe puštene u P7:

**(a) Mrtvi uvozi** (skript iz `planovi/p1.md` §6.5, spread-aware), 206 fajlova:

```
NEMA mrtvih uvoza.
```

Ovo je provera koja bi uhvatila slučaj `inviteLinkUrl` (uvezen, nikad pozvan).

**(b) Dostupnost do ekrana** — za svaki fajl koji je lanac 6 DODAO
(`git diff --name-status 4ff8484 HEAD | grep '^A'`, mobilni izvorni fajlovi) traži
se najkraći lanac uvoza do `src/app/`. Ishod: **SVI LANCI POSTOJE**, nula mrtvih.

| Dodat fajl (lanac 6) | Lanac do ekrana |
|---|---|
| `app/(app)/istorija.tsx` | sam je ekran (ulaz: `vise.tsx`, red „Istorija radnji") |
| `components/canvas/idea-node-sheet-actions.tsx` | → `app/(app)/canvas/[kind]/[id].tsx` |
| `components/canvas/thought-node-sheet-actions.tsx` | → `app/(app)/canvas/[kind]/[id].tsx` |
| `components/chat/channel-members-sheet.tsx` | → `conversation-header.tsx` → `app/(app)/razgovor/[id].tsx` |
| `components/chat/member-search-input.tsx` | → `new-conversation-sheet.tsx` → `app/(app)/(tabs)/chat.tsx` |
| `components/prostor/area-contributions-section.tsx` | → `app/(app)/(tabs)/prostor.tsx` |
| `components/prostor/kind-filter-row.tsx` | → `app/(app)/(tabs)/prostor.tsx` |
| `components/stranica/note-insert-sheet.tsx` | → `note-editor.tsx` → `app/(app)/stranica/[id].tsx` |
| `components/stranica/page-target-picker.tsx` | → `page-actions-sheet.tsx` → `app/(app)/stranica/[id].tsx` |
| `components/ui/color-row.tsx` | → `app/(app)/ideja/[id].tsx` |
| `components/ui/search-field.tsx` | → `app/(app)/ideje.tsx` |
| `components/zadatak/checkpoint-contributions-sheet.tsx` | → `task-checkpoint-list.tsx` → `app/(app)/zadatak/[id].tsx` |
| `hooks/use-chat-presence.ts` | → `app/(app)/razgovor/[id].tsx` |
| `hooks/use-undo-runner.ts` | → `app/(app)/istorija.tsx` |
| `lib/canvas-position.ts` | → `app/(app)/ideja/[id].tsx` |
| `lib/device-prefs.ts` | → `context/active-startup.tsx` → `app/(app)/(tabs)/chat.tsx` |
| `lib/invite-codes.ts` | → `app/(app)/pozivnice.tsx` |
| `lib/note-editor-bridges.ts` | → `note-editor.tsx` → `app/(app)/stranica/[id].tsx` |
| `lib/note-editor-html.ts` | → `note-editor.tsx` → `app/(app)/stranica/[id].tsx` |
| `lib/note-table.ts` | → `note-insert-sheet.tsx` → `note-editor.tsx` → `app/(app)/stranica/[id].tsx` |
| `lib/html.ts` *(P7)* | → `file-preview.tsx` → `files-panel.tsx` → `app/(app)/stranica/[id].tsx` |
| `lib/page-file-picks.ts` *(P7)* | → `files-panel.tsx` → `app/(app)/stranica/[id].tsx` |
| `lib/area-meta.ts` *(P7)* | → `area-icon.tsx` → `conversation-header.tsx` → `app/(app)/razgovor/[id].tsx` |
| `components/ui/area-icon.tsx` *(P7)* | → `conversation-header.tsx` → `app/(app)/razgovor/[id].tsx` |
| `components/ui/pulse-bar.tsx` *(P7)* | → `app/(app)/puls.tsx` |

Van grafa i namerno: `apps/mobile/editor-web/**` (web bundle editora, gradi se
`npm run editor:build` i ulazi kao `lib/note-editor-html.ts`), `*.test.ts`,
`vitest.config.ts`, i `apps/web` / `packages/backend` dodaci (drugi graf).

**Skript (b) — ponovljiv.** Upisan ovde, a ne ostavljen u temp folderu, jer je to
**jedina kapija koja bi uhvatila pad tipa K4** (kod se kompajlira, lint je čist, a
funkcionalnost nedostupna). Sačuvaj kao `.mjs` bilo gde i pusti iz KORENA repoa sa
putanjama kao argumentima:

```js
// node <ovaj-fajl>.mjs apps/mobile/src/lib/nesto.ts [još putanja...]
import fs from 'node:fs';
import path from 'node:path';
const SRC = 'apps/mobile/src';
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name).split(path.sep).join('/');
  if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) files.push(p); } };
walk(SRC);
function resolve(spec, fromFile) {
  let base;
  if (spec.startsWith('@/convex')) return null;            // backend, van grafa
  if (spec.startsWith('@/')) base = `${SRC}/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = path.posix.normalize(`${path.posix.dirname(fromFile)}/${spec}`);
  else return null;                                        // node_modules
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`])
    if (files.includes(c)) return c;
  return null;
}
const importers = new Map();                               // uvezeni → [ko ga uvozi]
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  const t = resolve(m[1], f); if (t === null) continue;
  if (!importers.has(t)) importers.set(t, []); importers.get(t).push(f);
}
const isScreen = (f) => f.startsWith(`${SRC}/app/`);
function chainToScreen(target) {                           // BFS: najkraći lanac do ekrana
  const seen = new Set([target]); let frontier = [[target]];
  while (frontier.length > 0) { const next = [];
    for (const chain of frontier) for (const imp of importers.get(chain[chain.length - 1]) ?? []) {
      if (seen.has(imp)) continue; seen.add(imp); const nc = [...chain, imp];
      if (isScreen(imp)) return nc; next.push(nc);
    } frontier = next; }
  return null;
}
const short = (f) => f.replace(`${SRC}/`, '');
let bad = 0;
for (const t of process.argv.slice(2)) {
  const target = t.split(path.sep).join('/');
  if (!files.includes(target)) { console.log('NEMA FAJLA  ', target); bad += 1; continue; }
  if (isScreen(target)) { console.log('EKRAN       ', short(target)); continue; }
  const c = chainToScreen(target);
  if (c === null) { console.log('MRTAV!      ', short(target)); bad += 1; }
  else console.log('OK          ', c.map(short).join(' -> '));
}
console.log(bad === 0 ? '\nSVI LANCI POSTOJE.' : `\nBEZ LANCA: ${bad}`);
```

Spisak fajlova za proveru daje:
`git diff --name-status <baza> HEAD -- apps/mobile/src | grep '^A'`.

**Šta ove dve provere NE vide** — pošteno: montiranu komponentu čiji prop nikad
nije prosleđen, pa se red ne renderuje (tačan oblik pada faze K4). Za P7 je to
pokriveno drugačije: sva tri nova propa su **obavezna** (`area` na
`ConversationHeader` i `ConversationRow`), pa je `tsc` kapija koju K4 nije imao —
a `truncated`/`openFile`/peti čip su provereni grep-om na broj pogodaka.

### 3. Odstupanja od plana (i zašto)

Šest odstupanja, sva zapisana i u samom planu (`planovi/p7.md` §9). Najvažnije:

1. **`areaIconFor` je razdvojen** na čist `areaIconNameFor` (`lib/area-meta.ts`) +
   `<AreaIcon>` (`components/ui/area-icon.tsx`). Plan je tražio test koji je
   **nemoguć**: `lucide-react-native` vuče `react-native` (Flow), pa test pada sa
   `SyntaxError: Unexpected token 'typeof'`. Izmereno, ne pretpostavljeno.
2. **`PulseBar` nema animaciju ni `pulseTone`.** Jedini potrošač (Puls) na webu
   šalje `pulseTone={null}`, pa bi otkucaj bio kod koji nijedan pozivalac ne može
   da uključi — mrtav kod, tj. tačno ono što lanac lovi.
3. **`PreviewFile.url` je `string | null`.** Bez toga stanje „Fajl više nije
   dostupan u skladištu." (koje plan traži) nije dostižno, jer je `openFile` za
   prazan URL prikazivao `Alert` i uopšte ne otvarao pregled.
4. **Rizik R5 (čitanje bloba radi veličine) ne postoji ovde** —
   `pageFiles.generateUploadUrl` ne prima `size` (za razliku od chata), server ga
   meri iz metapodataka bloba. Fajl bez poznate veličine se PRIHVATA (test T5).
5. **`ChannelArea`/`findChannelArea` su u `lib/chat.ts`**, ne po ekranu — dva mesta
   bi mogla da se raziđu u tome šta znači „oblast nije poznata".
6. **Round-trip test je normalizovan po redovima** — `noteHtmlToText` svaki tag
   menja RAZMAKOM, pa svaki red vraća vodeći razmak. To je zatečeno ponašanje koje
   jednako važi za pravo Tiptap telo sa weba, pa **nije menjano** (modul ima 16
   postojećih testova); test to izričito dokumentuje.

### 4. Gejtovi

```
apps/mobile        npx tsc --noEmit                      → exit 0, nijedna linija
apps/web           npx tsc --noEmit                      → exit 0
packages/backend   npx tsc -p convex/tsconfig.json       → exit 0
npm run lint                                             → exit 0, nijedna linija (0 grešaka, 0 upozorenja)
npm test                                                 → Test Files 50 passed (50) | Tests 434 passed (434)
npm run build                                            → uspešno (Compiled in 5.7s, TypeScript 16.3s, 6/6 stranica)
git diff --stat -- apps/web                              → PRAZNO
git diff --stat -- packages/backend                      → PRAZNO
skript za mrtve uvoze (p1 §6.5, 206 fajlova)             → „NEMA mrtvih uvoza."
skript dostupnosti do ekrana (25 modula lanca 6)         → „SVI LANCI POSTOJE."
```

Testovi: **46 fajlova / 402 testa → 50 / 434** (+4 fajla, +32 testa). Sva četiri
nova fajla su P7:

| Fajl | Tvrdnji |
|---|---|
| `apps/mobile/src/lib/html.test.ts` | 7 |
| `apps/mobile/src/lib/area-meta.test.ts` | 5 |
| `apps/mobile/src/lib/page-file-picks.test.ts` | 10 |
| `apps/mobile/src/lib/note-content.text.test.ts` | 10 |

> **Ograda koja MORA da stoji:** `npm run lint` **ne pokriva `apps/mobile/**`**
> (`eslint.config.mjs:25`). „Lint čist" za mobilni znači `tsc` i ništa više. Ista
> ograda stoji u svakoj fazi ovog lanca (`ZA-POPRAVKU.md` §5.12).

**Jedna napomena o merenju testova.** Prvi prolaz `npm test` (pušten paralelno sa
`apps/web tsc`) dao je 8 padova, svi „Test timed out in 5000ms" u
`packages/backend`. Ponovni prolaz sam, bez paralelnog posla: 50/50 i 434/434.
Backend u ovoj fazi nije diran (`git diff --stat` prazan), pa je uzrok bio
zauzetost mašine, ne kod. Zapisano jer bi „8 failed" u logu inače izgledalo kao
prećutana greška.

### 5. Šta NIJE provereno — iskreno

- **Ništa nije pokrenuto na uređaju ni u emulatoru.** Verifikacija je `tsc` +
  `lint` + `npm test` + `build` + dve skripte za mrtav kod. Nov `PulseBar`, plejer
  videa u `WebView`-u, kalendar u sheet-u kreiranja, serija priloga — nijedno nije
  viđeno kako radi.
- **Video u `WebView`-u je najveći nemereni rizik ove faze.** `<video controls>`
  u `source={{html}}` je izbor koji izbegava da Android WebView pokrene
  preuzimanje umesto plejera, ali da li kontrole rade i da li se HEVC snimak sa
  iPhone-a dekodira **nije provereno**. Ako ne radi: `onError` grana pokazuje
  poruku i „Preuzmi", pa korisnik nije u ćorsokaku — a odluka se menja zasebnim
  zadatkom sa native buildom (`ZA-POPRAVKU.md` §15). `expo-video` nije dodat
  namerno (plan §5.3).
- **Merni gejt `ZA-POPRAVKU.md` §2 (editor beleške na jeftinom Androidu) ostaje
  otvoren.** Agent nema uređaj. P7 ga nije pomerio ni u jednom smeru.
- **Ponašanje tastature u sheet-u kreiranja sa novim `multiline` poljem** nije
  provereno na uređaju. `Sheet` ima `avoidKeyboard`, a polje je u `ScrollView`-u
  sa `keyboardShouldPersistTaps="handled"` — isti obrazac kao „Instrukcije" koji
  već radi, ali „isti obrazac" nije merenje.
- **Dva `Modal`-a (kalendar iznad sheeta kreiranja)** — obrazac „brat, ne dete" je
  isti koji `AssigneePickerSheet` već koristi u istom fajlu, ali sistemsko „nazad"
  na Androidu nije isprobano.

### 6. Provera prstom (čeka korisnika) — NIJE ČEKIRANO

| # | Radnja | Očekivano |
|---|---|---|
| T1 | Prostor → oblast → fajl-oblačić → tap na video prilog | Plejer sa kontrolama U APLIKACIJI (ne sistemski browser) |
| T2 | T1 → „Preuzmi" | Sistemski browser preuzima fajl; povratak vraća na pregled |
| T3 | Fajl-oblačić → FAB → „Iz galerije" → izaberi 3 fajla | Tri priloga, redom kojim su izabrani; indikator na FAB-u ne trepće između njih |
| T4 | T3 sa dokumentom > 50 MB | Alert imenuje BAŠ taj fajl kao odbijen; ostali prođu |
| T5 | Fajl-oblačić → FAB → „Iz dokumenata" → izaberi 2 | Oba priloga prođu (`multiple: true`) |
| T6 | Chat → kanal oblasti „Dev" | Ikonica `Code2` u boji oblasti; podnaslov „Kanal oblasti · Dev" |
| T7 | Chat lista | Isti kanal ima istu ikonicu i u redu liste |
| T8 | Više → Puls | Traka ispod navigacije nedelje; udeli odgovaraju karticama ispod |
| T9 | Puls, nedelja bez posla | Siva traka; čitač ekrana kaže „Nedelja bez zabeleženog posla" |
| T10 | Prijava kao NE-admin → tab „Više" | Red „Članovi tima" POSTOJI; „Pozivnice"/„Lozinke"/„Administracija" NE |
| T11 | T10 → „Članovi tima" | Lista se vidi; **nema** ikonica za brisanje ni „Dodaj člana" |
| T12 | Prostor → oblast → FAB → „Zadatak" → „Više opcija" → Rok → „Neki drugi dan…" | Kalendar; izabran datum stoji na čipu I u sažetku; posle kreiranja rok je tačan |
| T13 | Isti FAB → „Beleška" → upiši sadržaj → Dodaj | Beleška se otvara sa TIM tekstom; web pokazuje isti tekst kao pasuse |
| T14 | Sheet kreiranja, bilo koja vrsta | Ispod naslova piše „U oblasti „X"." i to je oblast iz koje si ušao |
| T15 | > 100 zahteva za ugnježdavanje | „Prikazano je najnovijih 100 zahteva." u OBA segmenta („Čeka" i „Moji") |
| T16 | Kalendar otvoren iznad sheeta → sistemsko „nazad" | Zatvara SAMO kalendar, sheet kreiranja ostaje sa unetim podacima |
| T17 | Sheet kreiranja → upiši naslov → „Otkaži" → otvori ponovo | Obrazac je PRAZAN (ne nosi prethodni nacrt) |

### 7. `rn-review` — nalazi i ishod

Agent `rn-review` pušten nad svih 13 izmenjenih/novih fajlova. Sedam nalaza, svi
sa ishodom:

| Nalaz | Ocena | Ishod |
|---|---|---|
| `page-create-sheet.tsx` — `closeAll` ne poziva `reset()`, pa otkazan nacrt (naslov, novo polje „Sadržaj", nov datum) iskače pri sledećem otvaranju, i to pod DRUGIM zaglavljem i drugom oblašću | vredi popraviti | **POPRAVLJENO** (`page-create-sheet.tsx:175`, uz komentar zašto). Dodatna provera koju agent nije imao: **web RESETUJE** — `workspace-shell.tsx:1100` daje dijalogu `key` koji sadrži `open` i ceo `target`, pa se stanje briše na svako zatvaranje. Dakle nije stvar ukusa nego razlike od weba. Cena (dodir po backdrop-u gubi nacrt) zapisana u komentaru |
| `file-preview.tsx` — PDF grana `WebView`-a nema `onError`/`onHttpError`, za razliku od video/audio grane; PDF koji se ne učita daje belu površinu bez poruke | vredi popraviti | **POPRAVLJENO** (`file-preview.tsx:191-192`). Nedoslednost je bila moja — `failed` stanje je uvedeno u P7, pa je grana koja ga ne postavlja bila pola posla |
| `PreviewNotice` nema „Pokušaj ponovo", za razliku od svakog drugog greška-stanja u repou | sitno | **POPRAVLJENO** (`file-preview.tsx:171` prosleđen `onRetry`, `:244-252` dugme). Dugme ide SAMO uz grešku koja može da prođe na drugi pokušaj; za „blob više nije u skladištu" ponovni pokušaj ne menja ništa, pa se ne prikazuje |
| `clanovi.tsx` — `isAdmin` dolazi iz `profiles.getCurrent`, koji nije bio u `loading` gejtu; admin bi prvo video listu BEZ admin kontrola | sitno | **POPRAVLJENO** (`clanovi.tsx:81`). `profiles.getCurrent` je deljena pretplata (ceo tab „Više" je već drži), pa gejt praktično ne dodaje čekanje |
| Ikonica oblasti „trepne": `startups.get` nije u `loading` gejtu chata, pa kanal prvo dobije generički `Hash` pa obojenu ikonicu | sitno | **NIJE POPRAVLJENO, svesno.** Gejtovanje CELE liste razgovora (ili celog zaglavlja) na treći upit zarad ikonice znači da poruke čekaju metapodatak — pogrešna trampa. `startups.get` je ista pretplata koju `prostor`/`danas`/`zadaci` već drže, pa je u praksi topla; a `findChannelArea` vraća `null` dok ne stigne, što je isto što web radi (`channel-list.tsx:118` `?.key` → `undefined`) |
| Linija „U oblasti X" iskoči sa zakašnjenjem i pomeri sadržaj sheeta | sitno | **NIJE POPRAVLJENO, svesno.** Rezervisanje visine za jedan red teksta koji se u 99% slučajeva pojavi odmah (upit je topao) dodaje prazan prostor u svakom drugom slučaju. Sadržaj ispod je u `ScrollView`-u, pa pomeranje ne otima tap |
| Slika u pregledu nema indikator učitavanja (video/PDF/audio imaju `startInLoadingState`) | sitno | **NIJE POPRAVLJENO, zatečeno.** `expo-image` ima `transition={150}` i P7 tu granu nije dirao osim `onError`-a. Kandidat za fazu koja dira `expo-image` širom aplikacije |

**Nalaz koji je `rn-review` PROPUSTIO, a ja sam ga sam uveo** — zapisan jer je
istog roda kao njegov PDF nalaz, samo teži: `onError`/`onHttpError` na `WebView`-u
**ne hvataju neuspeh samog medija.** Dokument video/audio grane je inline HTML, pa
za njega nema ni navigacije ni HTTP odgovora koji bi pukao — 404 na potpisanom URL-u
bi dao plejer sa kontrolama koje ništa ne puštaju i nula objašnjenja. Zatvoreno
mostom: `<video onerror="…postMessage('media-error')">` u `mediaDocument`
(`file-preview.tsx:65` + `:68-70`) i `onMessage` na `WebView`-u (`:222`). Pouka: „dodao sam
`onError`" nije dokaz da se greška vidi — treba pitati **koja** greška kojim putem
stiže.

Agent izričito nije našao nalaze u: `files-panel.tsx` (dodirne mete, tastatura,
safe area, tri stanja novog reda čekanja), `odobrenja.tsx`, `puls.tsx`,
`pulse-bar.tsx`, `area-icon.tsx`, `vise.tsx`. Web API-ja (`window`, `document`,
`localStorage`, `navigator`) nema ni u jednom fajlu.
- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
