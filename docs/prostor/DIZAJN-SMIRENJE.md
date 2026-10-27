# Devotion — smirivanje (dodatak na DNK)

> PROSTOR K08 (26.10.2026.), po planu K07 §1. Dopuna `docs/licno/DIZAJN-DNK.md`: tokeni, tonovi startupa i rečnik pokreta ostaju; ovde je šta se u startup ekranima **uklanja**, jedna tipografska skala, gustina i pravila teksta. Kad se dva dokumenta razilaze, **važi ovaj**.
>
> Taste za ovaj run: DESIGN_VARIANCE 3 · MOTION_INTENSITY 5 · VISUAL_DENSITY 6 (radni alat, gust, miran).

## 1. Načelo

Sadržaj je na prvom mestu, a chrome ćuti. Hijerarhija se gradi veličinom, težinom i razmakom, ne bojom.

- **Indigo** (`--primary`) je samo za primarnu radnju, izbor i fokus.
- **Ton startupa** je samo identitet (čip, pločica, logo bez slike), nikad pozadina reda ni status.
- **Statusne boje** (`destructive`, `warning`, `success`, `info`) nose samo status i hitnost.
- **Ivica od 1 px** nosi strukturu; **senka** postoji samo na plutajućem (fioka, dijalog, meni, sheet).
- **Jedan ekran** ima jedan naslov i najviše jednu indigo radnju.

## 2. Tipografska skala (četiri uloge)

| Uloga | Web (klasa) | Web px | Telefon | Tel. px | Gde |
|---|---|---|---|---|---|
| Naslov ekrana | `text-xl font-semibold tracking-[-0.02em] lg:text-2xl` | 20/28 → 24/32 | koren taba `text.display`, gurnut ekran `text.title` | 28/34 · 20/26 | jedan `h1` po ekranu; naslov stranice/zadatka je isti nivo |
| Naslov sekcije | `text-sm font-semibold` + broj `font-normal tabular-nums text-muted-foreground` | 14/20 | `{ ...text.body, fontWeight: '600' }` | 16/22 | `h2`, **normalna slova** |
| Telo | `text-sm leading-6` | 14/24 | `text.body` | 16/22 | redovi, pasusi, polja |
| Meta | `text-xs leading-5 text-muted-foreground` | 12/20 | `text.meta` + `mutedForeground` | 13/18 | ko, kad, brojevi, putanja |

- Težine: 400 (telo), 500 (naslov reda), 600 (naslovi). 700 samo u brojačima (`font-mono text-[0.625rem]`).
- U startup ekranima **nema** `uppercase`, `tracking-[0.08–0.16em]` ni `text-[0.6875rem]` (overline iz DNK §3 se ne koristi za naslove).
- Tekst editora (`.tiptap` u `apps/web/app/globals.css`) se ne dira.

Gotove komponente (web, `apps/web/components/workspace/workspace-ui.tsx`):

| Komponenta | Uloga |
|---|---|
| `ScreenHeader({ title, meta?, actions?, below? })` | `h1` + meta u istom redu, radnje desno, opcioni red kartica/filtera ispod |
| `SectionHeading({ id?, title, count?, action?, as? })` | naslov sekcije sa brojem i opcionom radnjom |
| `EmptyState({ size: "screen" \| "section", … })` | prazno stanje (§5.5) |

Telefon: `ui/screen-header.tsx` i `ui/section-header.tsx` dobijaju isto u K09 (`eyebrow` se crta ispod naslova kao meta; naslov sekcije normalnim slovima).

## 3. Razmaci i gustina

| Mera | Web | Telefon |
|---|---|---|
| Ivica ekrana | `px-4 sm:px-6 lg:px-8`, `pt-4 lg:pt-6`, `pb-16` | 16 |
| Širina | liste `max-w-6xl` (Korpa `max-w-5xl`); dokument `max-w-6xl` sa kolonama `minmax(0,46rem) 15rem` i `gap-10`; tabla `max-w-none` | ceo ekran |
| Zaglavlje → sadržaj | 20 (`mb-5`) | 16 |
| Između sekcija | 24 (`space-y-6`) | 24 |
| Naslov sekcije → prvi red | 8 (`mb-2`) | 8 |
| Red liste | `min-h-10 px-2 py-1.5 gap-3`; na dodir 44 (`globals.css`, `pointer: coarse`) | 44 (jedan red) / 56 (sa meta redom) |
| Između redova | `space-y-0.5`, bez ivice po redu | hairline samo uz swipe |
| Kartica (gde je dozvoljena) | `rounded-lg border bg-card p-3` | `radius.card`, padding 12 |

## 4. Šta se uklanja (P17)

| # | Obrazac | Primeri iz koda pre runa (fajl:red @ `16a33c9`) | Zamena |
|---|---|---|---|
| U1 | **Nadnaslov** iznad naslova (ime startupa ili kategorija u `text-[0.6875rem] uppercase tracking-[…]`, često `text-primary`) | `command-center-view.tsx:352`, `tasks-view.tsx:215`, `puls-view.tsx:122`, `activity-view.tsx:14`, `area-view.tsx:197,325`, `page-workspace-view.tsx:196`, `area-briefing-dock.tsx:84`, `workspace-sidebar.tsx:269,599`; telefon `odobrenja.tsx:287`, `misao/[id].tsx:118`, `puls.tsx:143`, `admin-startup.tsx:264`, `ideje.tsx:195` | ništa (startup je u traci i meniju); broj ide uz naslov kao meta |
| U2 | Naslovi sekcija i zona **velikim slovima** | `command-center-view.tsx:490`, `tasks-view.tsx:264,360`, `me/section-header.tsx:44`, `me/task-panel/panel-parts.tsx:128`; telefon `ui/section-header.tsx:106-112`, `prostor.tsx:1236-1243`, `zadaci.tsx:396` | naslov sekcije (§2) |
| U3 | **Sjaj, gradijent, obojena senka** kao ukras | `home-view.tsx:58-59,96`, `workspace-shell.tsx:1475`, `canvases/connected-canvas.module.css:9-10`; telefon `undo-bar.tsx:104-171`, `connection-banner.tsx:70-74` | ivica; senka samo `desk-surface` (web) / `SHADOW_COLOR` (telefon) na plutajućem |
| U4 | **Kartica u kartici** | `approvals-view.tsx:90,265` (obrisan u K08), `page-editor-view.tsx:1057→1366`, `area-signed-contributions.tsx:132→164`, `ideas-view.tsx:514→662`, `tasks-view.tsx:261` (K08 uklonio); telefon `zadatak/[id].tsx:317`, `ideja/[id].tsx:217-260`, `vise.tsx:169` | jedna površina; unutra redovi sa razmakom |
| U5 | **Boje mimo tokena** / boja kao ukras | `workspace-ui.tsx:31-39` (`AREA_TINTS`, K08 neutralno), `lib/workspace.ts:21-24` (prioritet, K08 tokeni), `area-briefing-dock.tsx:80`, `ideas-view.tsx:431,714`, `workspace-ui.tsx:123` (`bg-primary` za logo, K08 ton startupa); telefon `${tint}22` u `prostor.tsx:541,579` | oblast: ikonica `text-muted-foreground` bez pločice; prioritet: hitno `bg-destructive`, visok `bg-warning`, srednji `bg-muted-foreground`, nizak `bg-muted-foreground/40` |
| U6 | **Marketinške i objašnjavajuće rečenice** | `home-view.tsx:65`, `workspace-sidebar.tsx:419` („Tim u jednom toku", K08 uklonio), `workspace-shell.tsx:1569` (K08), `tasks-view.tsx:218` (K08), `command-center-view.tsx:78,355`, `puls-view.tsx:129`, `ideas-view.tsx:437`; telefon `ideja/[id].tsx:233,275`, `page-contributions-section.tsx:38-40`, `contribution-thread.tsx:220` | ukloniti; objašnjenje ide samo u prazno stanje, jednom rečenicom |
| U7 | **Engleske reči** | `lib/workspace.ts:2,4,11` (Dev, Sales, Backlog), `ideas-view.tsx:390,938,1007` (Task/Note/Parent), „Checkpoint" (`task-checkpoint-list.tsx:303`), „Briefing" (`area-briefing-dock.tsx:103`); telefon „Canvas" (`canvas/[kind]/[id].tsx:877`, `stranica/[id].tsx:97`) | rečnik §6 |
| U8 | **Organski i orbitalni oblici** | `workspace-ui.tsx:92-94` (K08 uklonio), `canvases/orbital-node.module.css`, `area-flow-node.tsx:385-565`, `idea-flow-node.tsx:228-316` | `rounded-md` pločica; pravougaona kartica Mape (K15) |
| U9 | **Ilustrovano prazno stanje** | `workspace-ui.tsx:190-196` (`min-h-56`, ikonica u pločici `bg-accent`; K08 promenio) | §5.5 |
| U10 | **Ukrasni pokret** | `layoutId="sidebar-active"` (`workspace-sidebar.tsx:199-203`, K08 uklonio), `PulseBar` (`command-center-view.tsx:367`, K19), stagger 30/180 ms na telefonu (`theme/motion.ts`, K21) | rečnik pokreta iz `packages/shared/src/motion.ts`, samo trenuci iz plana K07 §8 |

## 5. Pravila

### 5.1 Zaglavlje ekrana
Jedan red: `h1` + meta (npr. broj) … sekundarne radnje (`ghost`/`outline`, ikonica bez teksta ima `aria-label`) + najviše jedna primarna. Ispod je opcioni red kartica ili filtera — za kartice ekrana `TabsList variant="line"` (podvučene), za prekidač prikaza (Lista · Tabla) postojeći `pill`. **Nema podnaslova-rečenice.**

Putanja (breadcrumb) je dozvoljena samo kao navigacija u gornjem redu (`text-xs text-muted-foreground`, normalna slova). Nikad nije obojena ni velikim slovima. Na telefonu putanja ide ISPOD naslova kao meta red koji se dodiruje.

### 5.2 Liste
- **Red:** [ikona vrste 16 / kvačica] naslov (1 red, `truncate`) · meta desno ili ispod (ko · kad · rok). Najviše jedan sporedni red.
- **Stanja reda:** hover `bg-muted/60`, izabran `bg-accent`, bez ivice po redu. Radnje se pojavljuju na hover/fokus i uvek postoje i u „…" (dostupne tastaturom).
- **Brojevi** su `tabular-nums`.
- **Učitavanje:** 5 skeleton redova iste visine.
- **Telefon:** jedini red je `ui/row.tsx` (izuzetak je `TaskRow` sa swipe-om, LICNO).

### 5.3 Tabele i table (board)
- **Tabela:** zaglavlje `text-xs font-medium text-muted-foreground`, normalna slova, lepljivo, `border-b`. Redovi `h-10`, bez zebre, brojevi desno. Ispod `md` tabela postaje lista. Horizontalni skrol je dozvoljen samo za korisničku tabelu stranice, unutar njenog okvira.
- **Tabla:** kolona nije kartica — naslov sekcije + broj, `bg-muted/30 rounded-lg`, bez ivice. Kartica u koloni je `rounded-lg border bg-card p-3`. Kartica koja se prevlači dobija `desk-surface`.

### 5.4 Kartice
Kartice su dozvoljene samo za:
- stavku na tabli;
- karticu na Mapi;
- plutajuću površinu (fioka, dijalog, meni, popover, sheet);
- jedan istaknut blok po ekranu (npr. Puls nedelje).

Sekcija ekrana nije kartica: to je naslov + sadržaj. **Nikad kartica u kartici.** `ui/card.tsx` je bez `shadow-sm` (K08).

### 5.5 Prazna stanja, učitavanje, greška
- **Prazan ekran:** `EmptyState size="screen"` — isprekidan okvir `rounded-xl`, `min-h-40`, ikonica 20 px `text-muted-foreground` bez pločice, jedna rečenica (naslov), opciono jedna dopuna, jedna radnja.
- **Prazna sekcija:** `EmptyState size="section"` — jedan red `text-sm text-muted-foreground` + dugme-link, bez okvira.
- **Bez rezultata filtera:** „Nema rezultata za ovaj filter." + „Poništi filter" (ili „Prikaži sve").
- **Zabranjeno:** ilustracije, emodžiji, „Budi prvi", obećanja koja sistem ne drži (npr. „30 dana" u Korpi).
- **Učitavanje:** skeleton u obliku sadržaja; spinner samo u dugmetu koje radi.
- **Greška:** „<Šta> nije učitano." + „Pokušaj ponovo" (ponovo montira blok). Poruka servera ide kroz `accessErrorMessage`, nikad sirov `error.message`. Blok koji padne ne obara susede.

### 5.6 Tekst
- Srpski latinicom, „ti" oblik, glagol na dugmetu („Vrati", „Pošalji", „Sredi rokove").
- Toast u prošlom vremenu, kratak („Vraćeno: „X”.").
- Za radnju koja se vraća: „Poništi" umesto potvrde. Potvrda samo za radnju koja ceo tim pogađa bez povratka u istom toku („Vrati ovu verziju", „Prepiši", uklanjanje člana).
- Datumi i „pre N" isključivo kroz shared (`formatEditTime`, `formatTrashAge`, `trashMetaLabel`, `formatDayRelative`, `describeDueForRow`).

### 5.7 Boje i ikone
- Samo tokeni iz `globals.css` / `theme/tokens.ts`. Nov token ide u obe teme i na oba klijenta.
- Ton startupa (`startupSolidToneClass`, `StartupChip`) je samo identitet.
- Ikone su `lucide`, 16 px u redovima i meniju, 20 px u praznim stanjima.

## 6. Rečnik (staro → novo)

| Staro | Novo |
|---|---|
| Kanvas / Canvas (u UI-ju) | Mapa |
| Checkpoint | Korak |
| Briefing | Opis oblasti |
| Potpisani doprinos / prilog / unos, Predlozi izmena | Komentari |
| Zatraži brisanje, glasanje o brisanju | Obriši (ide u Korpu) |
| Odobrenja | Korpa |
| Moje misli / Misli | Beleške |
| Parent, „u Parent" | „Ugnezdi u…", „nadređena stavka" |
| Task / Note | Zadatak / Beleška |
| Dev / Sales (`AREA_META`) | Razvoj / Prodaja |
| Backlog | Neplanirano (K20) |
| Početna | Komandni centar |
| „Radni prostor" (podnaslov) | — |
| Odobrena / U razmatranju | Predlog · Razmatra se · Odobreno · Postalo zadatak · Odbijeno |

„Inbox" ostaje naziv (PLAN ga koristi; K07 E8).

## 7. Grep definicija nadnaslova (provera za K21)

**Startup ekrani:**
- web: `apps/web/components/workspace/**`, `apps/web/components/collab/**`, `apps/web/components/me/notes/**`;
- telefon: `apps/mobile/src/app/(app)/**` (bez `dizajn-katalog.tsx`) i `apps/mobile/src/components/{prostor,oblast,korpa,collab,komandni-centar,stranica,zadatak,ideja,misli,ui}/**`.

**Ne sme ostati:**
- web: `uppercase` u istoj klasi sa `tracking-\[0\.(0[6-9]|1[0-9])em\]`;
- telefon: `textTransform: 'uppercase'` u stilu teksta i prop `eyebrow=` na `ScreenHeader` (posle K09).

**Izuzeci:** `Kbd`, brojači `font-mono`, izlog (`apps/web/app/izlog/**`) i Dizajn katalog.

## 8. Pokret (sažetak; pun spisak u planu K07 §8)
- Brojevi samo iz `packages/shared/src/motion.ts`.
- Ulaz liste samo pri prvom punjenju ekrana (`useEnter` / `useListEntering`).
- Flip samo za premeštanje (vraćanje iz Korpe, faza ideje, trijaža).
- Bez ukrasnog pokreta (`layoutId`, pulsevi, orbite).
- Smanjen pokret = samo neprozirnost ≤ 120 ms.
- Isti element ne animiraju dve biblioteke; animacija nikad ne blokira unos.
