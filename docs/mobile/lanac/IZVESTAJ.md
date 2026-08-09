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
