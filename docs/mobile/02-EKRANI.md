# Mapa ekrana mobilne aplikacije

> Osnovno pravilo: **ne prepisuj sidebar na telefon.** Desktop verzija ima
> `workspace-sidebar.tsx` od 42 KB koji drži stablo oblasti, listu startupa,
> navigaciju i pretragu odjednom. Na telefonu se to razbija na tabove i
> hijerarhijsku navigaciju, jer palac stiže do dna ekrana, ne do leve ivice.

---

## 1. Postojeće rute → mobilni ekrani

Desktop koristi client-side rute iz `components/workspace/types.ts`:

| `WorkspaceRoute` | Desktop komponenta | Gde ide na mobilnom |
|---|---|---|
| `today` | `command-center-view.tsx` | Tab **Danas** (početni) |
| `my-tasks` | `tasks-view.tsx` | Tab **Danas** → segment „Moji zadaci" |
| `home` | `home-view.tsx` | Tab **Danas** → segment „Pregled" |
| `activity` | `activity-view.tsx` | Tab **Više** → Aktivnost |
| `approvals` | `approvals-view.tsx` | Tab **Više** → Odobrenja (sa badge-om) |
| `puls` | `puls-view.tsx` | Tab **Više** → Puls |
| `ideas` | `ideas-view.tsx`, `ideas-canvas-view.tsx` | Tab **Više** → Ideje |
| `thoughts` | `thoughts-canvas-view.tsx` | Tab **Više** → Misli |
| `area` | `area-view.tsx`, `area-canvas-view.tsx` | Tab **Prostor** → detalj oblasti |
| `page` | `page-editor-view.tsx`, `page-workspace-view.tsx` | Tab **Prostor** → detalj stranice |
| — | — | Tab **Chat** (novo) |

---

## 2. Navigaciona struktura

```
Root
├── (auth)                    ← nije ulogovan
│   ├── prijava
│   ├── registracija-pozivom  ← deep link iz invite email-a
│   └── bootstrap-admin
│
└── (app)                     ← ulogovan
    ├── [startup switcher]    ← u headeru, ne kao ekran
    │
    ├── (tabs)
    │   ├── danas             ← 🏠 početni
    │   ├── prostor           ← 📁 oblasti i stranice
    │   ├── chat              ← 💬 sa unread badge-om
    │   ├── obavestenja       ← 🔔 sa unread badge-om
    │   └── vise              ← ⋯
    │
    ├── stranica/[id]         ← full-screen, van tabova
    ├── zadatak/[id]          ← full-screen
    ├── canvas/[kind]/[id]    ← full-screen, WebView
    ├── razgovor/[id]         ← full-screen
    └── podesavanja/*
```

**Pet tabova, ne više.** Šesti tab niko ne pritisne.

**Zašto Obaveštenja imaju svoj tab, a ne ikonicu u headeru:** ceo poslovni model
aplikacije se vrti oko toga da te obaveštenje dovede unutra. Ako je zakopano u
header, gubi se.

---

## 3. Globalni elementi

### Header (svaki tab)

```
┌────────────────────────────────────────┐
│  [logo] Startup ▾           [🔍]  [👤] │
└────────────────────────────────────────┘
```

- **Startup switcher** — tap otvara bottom sheet sa listom startupa. Podaci:
  `startups.listForCurrent`. Prebacivanje menja ceo kontekst.
- **Pretraga** — otvara `convex/search.ts` ekran preko celog ekrana
- **Avatar** — profil, tema, odjava

### Bottom sheet umesto dijaloga

Sve što je na desktopu `Dialog` postaje bottom sheet, preko `@gorhom/bottom-sheet`.
U `components/workspace/` ih ima preko deset — `create-page-dialog`,
`create-area-dialog`, `admin-dialog`, `profile-dialog`, `workspace-item-dialog`,
`search-dialog`, `idea-discussion-dialog`, `thought-conversion-dialog`,
`thought-editor-dialog`, `table-import-dialog`, `note-table-import-dialog`,
`note-link-dialog`, `file-viewer-dialog` — plus birači `assignee-picker` i
`thought-destination-picker`.

### FAB — brzo dodavanje

Plutajuće dugme dole desno na tabovima Danas i Prostor. Long-press otvara meni:

- Nova beleška
- Novi zadatak
- **Glasovna beleška** (Faza 5)
- **Slikaj** (Faza 5)

---

## 4. Tab 1 — Danas

Najvažniji ekran. Odgovara na „šta me čeka", isto kao desktop `command-center-view`.

```
┌────────────────────────────────────────┐
│  [logo] Acme ▾              [🔍]  [👤] │
├────────────────────────────────────────┤
│  ┌─ Pregled ─┬─ Moji zadaci ─┐         │  ← segmented control
│                                        │
│  ⚠️  2 prekoračena roka                │  ← crveno, uvek prvo
│                                        │
│  DANAS                                 │
│  ┌──────────────────────────────────┐  │
│  │ 🔴 Redizajn landinga             │  │
│  │    Dev · danas 17:00 · [MJ][AP]  │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ 🟡 Poziv sa investitorom         │  │
│  │    Sales · danas                 │  │
│  └──────────────────────────────────┘  │
│                                        │
│  SLEDEĆE                               │
│  ...                                   │
│                                        │
│  BLOKIRANO (2)                     ▸   │
│                                        │
│                              [+]       │
└────────────────────────────────────────┘
```

**Podaci:** `dashboard.ts`, `tasks.ts`, `taskAssignees.ts`. Statusi iz
`OPEN_TASK_STATUSES` = `backlog`, `next`, `in_progress`, `blocked`.

**Gestovi na kartici zadatka:**

| Gest | Radnja |
|---|---|
| Tap | Otvara detalj zadatka |
| Svajp desno | Označi kao `done` — sa haptikom |
| Svajp levo | Meni: status, prioritet, rok, izvršilac |
| Long press | Brzi izbor statusa |

**Ovde nema kanbana.** Kanban sa četiri kolone i drag-and-drop-om na telefonu ne
radi. Umesto toga: grupisana lista sa svajpom. Isti podaci, upotrebljiv oblik.

---

## 5. Tab 2 — Prostor

Hijerarhijska navigacija kroz oblasti i stranice. Zamena za
`workspace-sidebar.tsx` + `page-tree.tsx`.

### Nivo 1 — oblasti

```
┌────────────────────────────────────────┐
│  Prostor                          [🔍] │
├────────────────────────────────────────┤
│  📂 Dev notes                      12 ▸│
│  📂 Marketing notes                 5 ▸│
│  📂 Sales notes                     8 ▸│
│  📂 Other notes                     3 ▸│
│                                        │
│  ── Nedavno ──────────────────────     │
│  📄 Q3 strategija        pre 2h        │
│  ✅ Redizajn landinga    juče          │
│                              [+]       │
└────────────────────────────────────────┘
```

Oblasti iz `AREA_DEFINITIONS` (`dev`, `marketing`, `sales`, `other`) plus
prilagođene iz `startupAreas`.

### Nivo 2 — sadržaj oblasti

Lista stranica iz `pages.ts`, sa ikonom po `kind`:

| `kind` | Ikona | Otvara |
|---|---|---|
| `note` | 📄 | Editor stranice |
| `task` | ✅ | Detalj zadatka |
| `file` | 📎 | Pregled fajla |
| `table` | 📊 | Pregled tabele |

Gore desno: prekidač **Lista / Canvas**. Canvas otvara WebView (sekcija 9).

Ugnježdene stranice se otvaraju sve dublje — `parentPageId` lanac. Header prikazuje
breadcrumb koji se skraćuje: `Dev › … › Redizajn`.

Nazad koristi `pageBackRoute` logiku koja već postoji.

---

## 6. Tab 3 — Chat

Detalji modela u `04-CHAT.md`. Ovde samo UI.

### Lista razgovora

```
┌────────────────────────────────────────┐
│  Chat                          [✏️]    │
├────────────────────────────────────────┤
│  [ Kanali ][ Direktne ][ Praćeno ]     │
│                                        │
│  # dev                            ● 3  │
│  Marko: pushovao sam fix...     14:22  │
│                                        │
│  # marketing                           │
│  Ana: ok, šaljem do petka       12:05  │
│                                        │
│  🧵 Redizajn landinga             ● 1  │
│  Petar: da li ide novi font?    11:40  │
│                                        │
│  👤 Marko Jovanović               ● 2  │
│  vidimo se u 5                  10:15  │
└────────────────────────────────────────┘
```

Tri segmenta:

- **Kanali** — po oblastima (`dev`, `marketing`, `sales`, `other`) + prilagođeni
- **Direktne** — DM sa članovima iz `startupMembers`
- **Praćeno** — threadovi zakačeni za zadatke, stranice i ideje koje pratiš

### Ekran razgovora

Standardni chat: mehurići, avatar, grupisanje po autoru i vremenu, „danas /
juče" separatori, indikator kucanja, reakcije na long-press, odgovor na poruku
svajpom desno.

**Za threadove header nosi kontekst:**

```
┌────────────────────────────────────────┐
│  ‹  🧵 Redizajn landinga               │
│     ✅ zadatak · Dev · rok danas   [▸] │  ← tap vodi na zadatak
├────────────────────────────────────────┤
```

To je cela poenta hibridnog modela — razgovor nikad nije odvojen od posla.

**Ulaz:** tekst, prilog (galerija/kamera/fajl), glasovna poruka (Faza 5),
`@` pominjanje sa autocomplete-om iz članova startupa.

---

## 7. Tab 4 — Obaveštenja

Direktan prevod `notifications-panel.tsx`, ali na ceo ekran.

```
┌────────────────────────────────────────┐
│  Obaveštenja        [Označi sve] [⚙️]  │
├────────────────────────────────────────┤
│  ● 🔴 Rok je prošao                    │
│    Redizajn landinga · pre 2h          │
│                                        │
│  ● 👤 Marko ti je dodelio zadatak      │
│    Poziv sa investitorom · pre 3h      │
│                                        │
│  ● 🗳️ Traži se tvoj glas               │
│    Brisanje: Stara strategija · juče   │
│                                        │
│    💡 Ana je glasala za tvoju ideju    │
│    pre 2 dana                          │
└────────────────────────────────────────┘
```

Deset postojećih tipova iz `notificationTypeValidator`:

| Tip | Ikona | Vodi na (`targetType`) |
|---|---|---|
| `task_assigned` | 👤 | `page` |
| `task_status_changed` | 🔄 | `page` |
| `task_due_soon` | 🟡 | `page` |
| `task_due_today` | 🟠 | `page` |
| `task_overdue` | 🔴 | `page` |
| `idea_voted` | 💡 | `ideas` |
| `idea_converted` | ✨ | `ideas` |
| `vote_requested` | 🗳️ | `approvals` |
| `request_resolved` | ✔️ | `approvals` |
| `puls_ready` | 📊 | `puls` |

Plus tri nova iz chata: `chat_message`, `chat_mention`, `chat_dm`.

**Podaci:** `notifications.list` (paginirano), `notifications.unreadCount`
(kapiran na 100 → prikaz „99+"), `notifications.markRead`, `markAllRead`.

**⚙️ vodi na podešavanja zvukova** — najvažniji ekran u aplikaciji za tebe.
Detalji u `03-NOTIFIKACIJE.md`.

---

## 8. Tab 5 — Više

```
┌────────────────────────────────────────┐
│  Više                                  │
├────────────────────────────────────────┤
│  🗳️  Odobrenja                    ● 2  │
│  📊  Puls                              │
│  💡  Ideje                             │
│  🧠  Misli                             │
│  📈  Aktivnost                         │
│  ─────────────────────────             │
│  👥  Članovi tima                      │
│  ✉️  Pozivnice                    admin│
│  ⚙️  Podešavanja                       │
│  🔔  Obaveštenja i zvuci               │
│  🎨  Tema                              │
└────────────────────────────────────────┘
```

**Odobrenja** je najvažnija stavka — `deletionRequests`, `deletionBallots`,
`nestingRequests`, `pageNestingRequests`. Glasanje na telefonu je zapravo bolje
nego na desktopu, jer se glasa u pokretu.

**Članovi** koristi `startups.listMembers`. **Pozivnice** (`invites.ts`) i
administracija članova (`startups.addMember`, `removeMember`) samo za
`role === "admin"` (`requireAdmin`).

---

## 9. Teški ekrani

### 9.1 Editor stranice

```
┌────────────────────────────────────────┐
│  ‹  Q3 strategija              [⋯]     │
├────────────────────────────────────────┤
│                                        │
│   Sadržaj stranice...                  │
│   (tentap / Tiptap u WebView-u)        │
│                                        │
├────────────────────────────────────────┤
│  B  I  •  1.  ▦  🔗  📎        [Gotovo]│  ← native toolbar iznad tastature
└────────────────────────────────────────┘
```

- `@10play/tentap-editor` sa tvojim Tiptap ekstenzijama
- Autosave preko `pages.updateBody`, ista `revision` konflikt-zaštita
- **Kritično:** toolbar mora da bude iznad tastature (`KeyboardAvoidingView`),
  inače je editor neupotrebljiv
- `[⋯]` meni: premesti u oblast, poveži stranicu, prilozi, arhiviraj

### 9.2 Detalj zadatka

Native ekran, bez WebView-a — najčešće korišćen, mora da bude brz.

```
┌────────────────────────────────────────┐
│  ‹  Redizajn landinga          [⋯]     │
├────────────────────────────────────────┤
│  Status     [ U toku ▾ ]               │
│  Prioritet  [ Visok ▾ ]                │
│  Rok        [ danas 17:00 ]            │
│  Izvršioci  [MJ] [AP] [+]              │
├────────────────────────────────────────┤
│  ▸ Instrukcije                         │
├────────────────────────────────────────┤
│  CHECKPOINTI                    3/7    │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░                    │
│  ☑ Wireframe                           │
│  ☑ Paleta boja                         │
│  ☐ Hero sekcija                        │
├────────────────────────────────────────┤
│  💬 Diskusija (4)                   ▸  │  ← thread iz chata
└────────────────────────────────────────┘
```

**Podaci:** `tasks.ts`, `taskCheckpoints.ts`, `taskAssignees.ts`
(max 10 izvršilaca, max 100 checkpointa).

Checkpoint tap = odmah `toggle` + haptika. Nema „sačuvaj" dugmeta.

### 9.3 Canvasi

Full-screen WebView nad embed rutom (vidi `00-PLAN.md` sekcija 5.2).

```
┌────────────────────────────────────────┐
│  ‹  Ideje — Q3                  [⊕][⛶] │
├────────────────────────────────────────┤
│                                        │
│         [ WebView: @xyflow ]           │
│                                        │
├────────────────────────────────────────┤
│  [🔍−] [🔍+] [⌂]         [+ Nova ideja]│  ← native rail
└────────────────────────────────────────┘
```

Tri canvasa: `thoughts`, `ideas`, `area`/`page`.

**Podela odgovornosti:**

- WebView: pan, zoom, selekcija, crtanje grafa
- Native: header, akcioni rail, otvaranje detalja node-a, kreiranje

Tap na node šalje `postMessage` u native, koji otvara bottom sheet sa detaljem —
tako se editovanje sadržaja radi native, a samo layout ostaje u WebView-u.

`[⛶]` rotira u landscape za više prostora.

### 9.4 Tabele

`pageTableColumns` / `pageTableRows`, do 64 kolone i 5.000 redova. Na telefonu:

- **Pregled:** horizontalno skrolovanje sa zamrznutom prvom kolonom
- **Editovanje ćelije:** tap → bottom sheet, ne inline
- **Uvoz iz Excela:** zadržano, preko `expo-document-picker` + `xlsx` (SheetJS).
  `read-excel-file` (koji koristi web) traži DOM `File` / Node `Buffer` — ničeg od
  toga nema u React Native, pa se na mobilnom parsira `xlsx`-om iz base64
  (`expo-file-system`). Tok: izbor fajla → parsiranje → **pregled** (koliko redova ×
  kolona nastaje, koja su zaglavlja) → tek na potvrdu upis kroz `pageTables.importRows`.
  Limiti (64 kolone / 5.000 redova) se proveravaju pre upisa.

### 9.5 Prilozi (fajlovi)

`pageFiles` — upload iz galerije, kamere i sistemskog birača dokumenata; slika i
PDF se pregledaju u aplikaciji, ostalo kroz sistemski otvarač.

- **Galerija i dokumenti:** `expo-image-picker` / `expo-document-picker`.
- **Kamera:** koristi se `expo-image-picker` (`launchCameraAsync`), **ne**
  `expo-camera` kako je prvobitna specifikacija predviđala. `launchCameraAsync`
  otvara sistemsku kameru za jedan snimak i vraća ga spreman za upload — bez
  custom preview sloja i lifecycle-a koje `expo-camera` nosi. Lakše i dovoljno za
  „uslikaj prilog".
  **Posledica:** snimanje **videa** iz aplikacije nije moguće (samo fotografija);
  video se i dalje može priložiti iz galerije.

---

## 10. Prazna stanja i greške

Svaki ekran mora da ima sva tri stanja. Desktop ih ima — mobilni ih ne sme
izgubiti.

| Ekran | Prazno stanje |
|---|---|
| Danas | „Nema zadataka za danas." + dugme za novi |
| Prostor | „Ova oblast je prazna." + dugme za prvu stranicu |
| Chat | „Još niko nije pisao. Budi prvi." |
| Obaveštenja | „Sve je čisto." |
| Odobrenja | „Nema zahteva koji čekaju." |

**Offline:** traka na vrhu „Nema veze — prikazuje se poslednje učitano". Convex
sam ponovo poveže i sinhronizuje.

---

## 11. Vizuelni jezik

Preuzima se iz `app/globals.css` (14 KB tokena) — iste boje, isti radijusi, ista
tipografska skala. Svetla i tamna tema kao na webu, plus **System** opcija koja
prati telefon.

Razlike koje mobilni nameće:

- Minimalna dodirna meta **44×44 pt** (iOS smernica, važi i za Android)
- Osnovni tekst minimum **16 px** — ispod toga iOS zumira pri fokusu polja
- Safe area obavezna gore i dole (notch, home indicator)
- Animacije preko `react-native-reanimated`, ne Framer Motion
- `prefers-reduced-motion` ekvivalent: `AccessibilityInfo.isReduceMotionEnabled`

---

## 12. Redosled izgradnje ekrana

| # | Ekran | Faza |
|---|---|---|
| 1 | Prijava + startup switcher | 0 |
| 2 | Skelet tabova | 0 |
| 3 | Lista razgovora | 1 |
| 4 | Ekran razgovora | 1 |
| 5 | Obaveštenja + podešavanja zvukova | 1 |
| 6 | Danas | 2 |
| 7 | Detalj zadatka | 2 |
| 8 | Puls | 2 |
| 9 | Prostor — oblasti i lista | 3 |
| 10 | Editor stranice | 3 |
| 11 | Tabele i prilozi | 3 |
| 12 | Pretraga | 3 |
| 13 | Odobrenja | 4 |
| 14 | Canvasi (WebView) | 4 |
| 15 | Ideje | 4 |
| 16 | Admin: članovi, pozivnice | 4 |
