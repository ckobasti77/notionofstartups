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
