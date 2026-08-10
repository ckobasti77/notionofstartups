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

### Uvodna kartica („Zdravo, …") — pandan web `home-view`

Web ima dve odvojene rute za isti trenutak: `home` (pozdrav, brojači, mreža
oblasti, tim) i `today` (trijaža). Na telefonu se **ne pravi šesti ekran** —
`home-view` se svodi na uvodnu karticu na vrhu taba „Danas", jer je sve ostalo iz
njega već negde:

| Deo `home-view` | Gde je na mobilnom |
|---|---|
| Pozdrav + naziv startupa | `DaySummary` — vrh taba „Danas" |
| Brojači (otvoreno / kasni / hitno) | `DaySummary` |
| Mreža oblasti | Tab **Prostor**, Nivo 1 |
| „Sledeći zadaci" | sama lista taba „Danas" |
| Spisak tima | traka opterećenja tima (ispod) i **Više → Članovi** |

Kartica skroluje sa listom, pa ne uzima stalan prostor, i broji **isti skup**
zadataka koji je u listi (segment „Moji zadaci" sužava i nju).

### Opterećenje tima — pandan web `workload-strip`

Horizontalno skrolabilna traka čipova između segmenata i liste, samo u segmentu
„Pregled": **Svi**, pa svaki član, pa (kad postoji posao bez izvršioca)
**Nedodeljeno**. Čip nosi avatar, ime i brojače `otvoreno / kasni / hitno`. Tap
filtrira listu, ponovni tap na aktivni čip gasi filter — isto ponašanje kao na
webu.

Traka **stoji van skrola liste**: kad filter isprazni listu, dugme kojim se filter
gasi mora ostati na ekranu. Prazno stanje tada glasi „Za izabranog člana nema
otvorenih zadataka." sa akcijom „Prikaži sve".

Brojači po članu se računaju iz **svih** otvorenih zadataka, ne iz filtriranih, da
se ne menjaju dok se filter prebacuje. Zadatak sa više izvršilaca ulazi u
opterećenje svakog od njih, pa je zbir po članovima veći od broja zadataka (isto
kao web).

U segmentu „Moji zadaci" trake nema — filter po članu nad listom koja je već
svedena na jednog čoveka ne znači ništa.

**Izuzetak — „Napredak (%)" se ne prenosi.** Procenat traži i završene zadatke, a
`tasks.commandCenter` vraća samo otvorene. Web ga računa iz prvih 100 zadataka
(`tasks.listForStartup`) i sam ga označava zvezdicom kao procenu; druga paginirana
pretplata na telefonu ne zaslužuje približan broj. Traži se agregatni upit —
zapisano u `ZA-POPRAVKU.md`.

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

### Brifing oblasti — pandan web `area-briefing-dock`

Iznad liste stranica stoji kolapsibilna sekcija **„Brifing oblasti"** (na webu je
to dock zakucan na vrh `area-view`). Sadržaj i dozvola dolaze iz
`areasV2.getAreaCanvasByArea` → `scope.briefing`; upis ide kroz
`areasV2.updateAreaBody` sa istom `expectedRevision` zaštitom od konflikta.

Razlike koje mobilni nameće:

- **Skupljena je podrazumevano**, a telo se montira tek na razvijanje — jedini
  postojeći upit vraća ceo canvas payload oblasti, što je preskupa pretplata za
  jedno tekstualno polje. (Jeftin upit je tražen u `ZA-POPRAVKU.md`.)
- Snima se na izlazak iz polja **i** dugmetom „Sačuvaj brifing" — na telefonu se
  fokus gubi nevidljivo, pa dugme mora da postoji.
- Ko ne sme da uređuje (svi osim kreatora startupa) dobija tekst za čitanje, ne
  zaključano polje.

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

### Moj profil — pandan web `profile-dialog`

Ruta `/profil`, dva ulaza: avatar u zaglavlju (`AppHeader`) i **Više → Moj
profil**. Na telefonu je **ekran, ne sheet** — biranje slike ionako otvara
sistemski birač preko celog ekrana, pa bi sheet ispod njega bio suvišan sloj.

- Slika: `expo-image-picker` iz galerije **ili** kamerom (web ima samo `<input
  type=file>`), kvadratno kadriranje, pa `storage.generateAvatarUploadUrl` →
  upload → `storage.setAvatar`. Granica od 5 MB se proverava i na klijentu, da se
  velika slika ne pošalje pa odbije na serveru.
- Ime: `profiles.updateCurrent`, snima se na blur/`done` i dugmetom.
- Email i uloga su samo za čitanje, sa objašnjenjem zašto — na webu je email
  onemogućeno polje bez ijedne reči.

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

**Povezane stavke — pandan web `page-relations`.** Kolapsibilna sekcija ispod
„Podstranica" (i na ekranu zadatka, unutar kartice): spisak veza ka drugim
stranicama, tap otvara drugu stranu, dugme desno uklanja vezu. Svoju vezu brišeš
odmah (`areasV2.deleteRelation`), za tuđu se pokreće glasanje
(`collaboration.requestDeletion`, `page_relation`) — server šalje `canDelete` /
`canRequestDeletion`, klijent ih samo poštuje.

**Pravljenje veze se NE duplira**: već postoji u „…" meniju („Poveži sa…"), pa
dugme u podnožju sekcije otvara isti sheet direktno na tom koraku. Web padajući
izbornik kandidata sa grupama po oblasti ostaje sheet sa listom — na telefonu je
lista čitljivija od `Select`-a sa sto stavki.

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

### 9.3.1 Ekran ideje i diskusija — pandan web `idea-discussion-dialog`

Ruta `/ideja/[id]`. Ulazi: tap na karticu u listi **Ideje** i dugme „Diskusija" u
sheet-u čvora na canvasu. Dotad ideja na telefonu nije imala detalj, pa se
diskusija tima nije videla nigde.

Ekran, ne sheet: nit ima kompozer i uređivanje teksta, a tastatura i sheet nad
WebView-om se tuku za istu polovinu ekrana.

- Ideja se čita iz `ideas.list` — iste pretplate koju lista i canvas već drže, pa
  detalj ne košta nov upit.
- Nit: `collaboration.listContributionsPaginated` (+ `addContribution`,
  `updateContribution`, `moderateContribution`, `deleteOwnContribution`,
  `requestDeletion`). Status moderacije (Odobreno / Odbijeno / Na čekanju) stoji uz
  svaki tekst, kao na webu.
- **Razlika 1:** web sam doučitava sve strane u `useEffect`-u; mobilni ima dugme
  „Učitaj još" — tiho povlačenje stotina poruka troši bateriju i podatke.
- **Razlika 2:** web briše odmah pa nudi „Undo" u toast-u; mobilni **pita pre
  brisanja**, jer toast koji se sam skloni na telefonu promakne. Zato se
  `collaboration.restoreOwnContribution` na mobilnom ne koristi.
- Tekst se čuva kao HTML (nastao na webu) i prikazuje kroz `noteHtmlToText` —
  mobilni ne renderuje HTML izvan editora.

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

---

## 13. Izuzeci — web prikazi koji NEMAJU mobilni pandan

Pravilo iz `CLAUDE.md` je da svaka funkcija postoji na oba klijenta, a izuzetak se
**izričito zapisuje**. Ovo je taj spisak. Nije lista zaostalog posla — ovo su
odluke da se nešto ne pravi, sa razlogom.

### `workspace-history.tsx` — undo/redo stek

**Šta je na webu.** Uprkos imenu, ovo nije istorija kretanja kroz aplikaciju.
`WorkspaceHistoryProvider` drži dva steka u memoriji kartice i vezuje globalni
`window.addEventListener("keydown")` na **Ctrl/Cmd+Z**, **Ctrl+Shift+Z** i
**Ctrl+Y**. Svaki unos je par `{ undo, redo }` — dve suprotne Convex mutacije koje
pozivaoc sam upisuje.

**Zašto se ne prenosi.**

1. **Nema okidača.** Ceo prikaz je prečica na tastaturi. Na telefonu nema
   `keydown`-a; RN nema `window`. Ostalo bi dugme „nazad-radnja" koje niko ne traži
   jer ga u mobilnim aplikacijama nema.
2. **Nema proizvođača.** `pushHistory` zovu isključivo canvas prikazi
   (`area-canvas-view`, `ideas-canvas-view`, `thoughts-canvas-view`, `ideas-view`)
   — premeštanje čvorova, povezivanje, brisanje ivica. Na mobilnom canvasi žive u
   WebView embed-u, koji je po `00-PLAN.md` §5.2 namerno **za pregled, navigaciju i
   dodavanje**, ne za preuređivanje layouta. Stek bi ostao prazan.
3. **Stek nije trajan.** Živi u memoriji kartice; refresh ga briše. Na telefonu se
   ekrani odmontiraju i aplikacija ode u pozadinu češće nego što se stek napuni, pa
   bi „Poništi" ponekad radilo, a ponekad ne — gore od toga da ga nema.

**Šta mobilni radi umesto toga.** Zaštita ide **pre** radnje, ne posle:
destruktivne akcije traže potvrdu (`Alert`), a brisanje tuđeg sadržaja ionako ide
kroz glasanje tima (`deletionRequests`), koje se povlači (`withdrawDeletion`).

**Kad bi imalo smisla.** Ako se jednog dana doda uređivanje canvasa na telefonu,
ispravan mobilni oblik nije globalan stek nego **snackbar „Poništi" odmah posle
radnje** (po radnji, par sekundi). To traži obrnutu mutaciju po pozivaocu — isto
što web provider već dobija — ali ne i ovaj prikaz.

---

### Uređivanje layouta kanvasa — pomeranje, veličina, ivice, viewport

**Šta je na webu.** `area-canvas-view`, `ideas-canvas-view` i `thoughts-canvas-view`
nude pun `@xyflow` uređivač: prevlačenje čvorova (`updatePositions`, `moveNodes`,
`movePages`), promena veličine kartice (`resizePage`, `updateLayout`,
`resetLayoutSize`, `resetNodeLayoutSize`), povlačenje ivica (`connect`,
`disconnect`, `createEdge`, `updateEdgeLabel`, `connectPages`, `disconnectPages`,
`taskCheckpointCanvasEdges.*`) i pamćenje pan/zoom-a (`saveViewport`).

**Zašto se ne prenosi.** Ovo je **ergonomska** odluka, ne tehnička prepreka —
kaže je `00-PLAN.md` §5.2: mobilni kanvas je za **pregled, navigaciju i dodavanje
čvora**. Ista odluka je i sprovedena, ne samo zapisana: embed renderuje ReactFlow
sa `nodesDraggable={false}` i `nodesConnectable={false}`
(`apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx`), i **ne zove nijednu
mutaciju** — samo upite. Precizno preuređivanje grafa prstom na 6 inča daje lošiji
rezultat od nikakvog: čvor se pomeri slučajno, a tim to vidi kao stvarnu izmenu.

**Šta mobilni radi umesto toga.** Rail na dnu: uvećaj/umanji, centriraj sve,
otvori čvor, dodaj čvor. Sadržaj čvora (naslov, tekst, boja, glasovi, brisanje)
menja se **native**, u sheet-u — samo raspored ostaje web-only.

**Kad bi imalo smisla.** Ako se ikad doda, ispravan mobilni oblik nije slobodno
prevlačenje nego **„pomeri u pravcu" na izabranom čvoru** (isti obrazac koji je
kolona tabele dobila u ovoj reviziji: dva dugmeta umesto drag-a).

---

### Izbor članova privatnog kanala pri kreiranju

**Šta je na webu.** `chat/new-conversation.tsx` u istom dijalogu nudi naziv,
prekidač „privatan" i listu članova za izbor (`createChannel.memberProfileIds`).

**Zašto se ne prenosi u celini.** Mobilni `NewConversationSheet` pravi kanal sa
nazivom i privatnošću, ali bez izbora članova — to bi bio treći korak u sheet-u
za radnju koja se u životu tima izvede nekoliko puta ukupno. Kanal se pravi
prazan; članovi se dodaju na webu.

**Ograničenje koje treba znati.** Privatan kanal napravljen sa telefona vidi samo
onaj ko ga je napravio dok mu se članovi ne dodaju. Sheet to i piše na licu mesta
(„Članove privatnog kanala za sada dodaje administrator na webu"), da niko ne
otkrije tek posle.

---

### Drag-and-drop premeštanje stranica

**Šta je na webu.** `page-tree.tsx` i `workspace-shell.tsx` premeštaju stranicu u
drugu oblast ili pod drugog roditelja prevlačenjem.

**Zašto se ne prenosi.** Nijedna **sposobnost** ne fali — `areasV2.movePage`,
`requestNesting` i `detachPage` postoje na mobilnom, u `PageActionsSheet`. Fali
samo **gest**, a drag-and-drop kroz ugnježdene skrol-liste na telefonu se tuče sa
skrolom i sa swipe-back gestom sistema. Meni ciljeva je pouzdaniji i dostupan
čitaču ekrana, što drag nikad nije.
