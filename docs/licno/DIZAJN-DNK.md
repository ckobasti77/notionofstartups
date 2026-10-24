# Devotion — dizajn DNK

> K03 (24.10.2026.). Zapis postojećeg vizuelnog jezika + novi sistem pokreta i čip startupa.
> Svaki UI korak runa LICNO ga čita pre crtanja (pravila: `.nocni-run/licno/rules.md`).
> Struktura prati šemu `design-dna` skilla (`.agents/skills/design-dna/references/schema.md`):
> **sistem** (merljivi tokeni), **stil** (osećaj) i **efekti** (ono što CSS sam ne izražava).
> Pun JSON profil je na kraju (§10); sekcije 1–9 su isto to, čitljivo.

Izvori istine u kodu — ovaj dokument ih opisuje, ne zamenjuje:

| Šta | Web | Telefon |
|---|---|---|
| Boje, radijusi, senka | `apps/web/app/globals.css` | `apps/mobile/src/theme/tokens.ts` |
| Pokret (brojevi) | `packages/shared/src/motion.ts` | isto |
| Pokret (motor) | `apps/web/lib/motion/`, `apps/web/components/motion/` | `apps/mobile/src/theme/motion.ts`, `src/components/motion/` (K09) |
| Ton čipa startupa | `packages/shared/src/startup-chip.ts` → `--startup-tone-1…8` | isto → `startupTones[scheme][i]` |
| Izlog (snimci) | `/izlog?ekran=pokret&tema=tamna\|svetla` | `src/app/(app)/dizajn-katalog.tsx` |

---

## 1. Ukratko

**Radni sto za mali tim, uveče, u tamnom.** Gust ali miran alat (DESIGN_VARIANCE 4, MOTION_INTENSITY 7,
VISUAL_DENSITY 6). Jedan obojeni akcenat (indigo), sve ostalo sivo-plava skala sa jedva primetnim
hladnim tonom (hue 265–268). Ivice od 1 px nose strukturu; senka je meka i retka. Pokret je fizika
(spring), kratak i prekidiv — kao na telefonu, nikad kao prezentacija.

Tri potpisna detalja:
1. **Mreža u pozadini** (`.app-canvas`) — 32 px kvadrati iz `--border`, jedva vidljivi; radna površina
   „milimetarski papir", kartice leže na njoj.
2. **Indigo akcenat** (`--primary`) — jedini zasićen ton u chrome-u: primarno dugme, aktivno stanje,
   fokus prsten, kvačica, prsten napretka.
3. **Čip startupa** — mala pločica (zaobljenje 30 %, „squircle") sa inicijalima i tonom izvedenim iz
   imena; isti startup ima istu boju svuda (traka, red zadatka, poruke) i na obe platforme.

---

## 2. Boje

### 2.1 Web tokeni (oklch → sRGB, izmereno skriptom K03)

| Token | Svetla | Tamna | Uloga |
|---|---|---|---|
| `--background` | `#F6F8FC` | `#090C15` | pozadina ekrana (ispod mreže) |
| `--foreground` | `#121723` | `#E4E8F0` | primarni tekst |
| `--card` | `#FDFEFF` | `#0F131E` | kartice |
| `--popover` | `#FDFEFF` | `#121722` | popover, drawer |
| `--primary` | `#4A42D8` | `#8D98FF` | akcija, aktivno, kvačica |
| `--primary-foreground` | `#FBFCFF` | `#0A0D21` | tekst na `--primary` |
| `--secondary` | `#E9EDF6` | `#1B202D` | sekundarno dugme |
| `--muted` | `#ECEFF5` | `#1A1E29` | podloga (track, skeleton, hover reda) |
| `--muted-foreground` | `#535B6C` | `#9198A8` | sekundarni tekst, meta |
| `--accent` | `#E0E6FF` | `#202542` | izabrano/aktivno (tint) |
| `--accent-foreground` | `#2C2E6F` | `#CCD5FF` | tekst na `--accent` |
| `--destructive` | `#D42325` | `#F05653` | greška, „kasni" |
| `--success` | `#14844A` | `#4CAF73` | status „završeno" |
| `--warning` | `#CF8700` | `#E0A536` | status „u toku/blokirano" (tačka, podloga) |
| `--info` | `#006AAA` | `#5CB4EF` | informacija |
| `--border` | `#D8DCE6` | `#353A48` @ 62 % | ivica 1 px |
| `--input` | `#D1D6E1` | `#414857` @ 72 % | ivica polja |
| `--ring` | `#5F62E9` | `#838DFF` | fokus prsten (2 px, offset 2 px) |
| `--sidebar` | `#EDF0F8` | `#0C101A` | bočna traka |
| `--thread` | `#9AA4D7` | `#6A72AC` | „nit" (linije veza, markeri lista) |

Kontrast (WCAG): `--foreground` na pozadini 16,9 / 15,9; `--muted-foreground` na kartici 6,8 / 6,4;
`--primary` kao tekst na kartici 6,8 / 7,1; tekst na `--primary` 6,7 / 7,4; `--success` 4,7 / 6,8;
`--destructive` 5,1 / 5,4. **`--warning` kao tekst u svetloj temi je 2,9:1 — samo tačka/podloga,
nikad tekst.**

### 2.2 Tonovi startupa (novo u K03)

`startupTone(name)` (FNV-1a, 0–7) bira indeks; boja je token. Dva načina upotrebe, oba proverena na AA:

| Ton | Svetla | Tamna | Nijansa |
|---|---|---|---|
| `--startup-tone-1` | `oklch(0.48 0.13 250)` `#0C60A3` | `oklch(0.78 0.11 250)` `#80BDFB` | plava |
| `--startup-tone-2` | `oklch(0.48 0.15 305)` `#7241A0` | `oklch(0.78 0.12 305)` `#C9A3F5` | ljubičasta |
| `--startup-tone-3` | `oklch(0.5 0.17 350)` `#A42C71` | `oklch(0.78 0.12 350)` `#F197C2` | roze |
| `--startup-tone-4` | `oklch(0.5 0.14 45)` `#A14206` | `oklch(0.78 0.12 45)` `#F79E75` | narandžasta |
| `--startup-tone-5` | `oklch(0.49 0.1 85)` `#7A5B01` | `oklch(0.8 0.11 85)` `#DEB866` | oker |
| `--startup-tone-6` | `oklch(0.48 0.12 145)` `#286F2F` | `oklch(0.78 0.12 145)` `#85CC87` | zelena |
| `--startup-tone-7` | `oklch(0.48 0.08 185)` `#116C63` | `oklch(0.78 0.09 185)` `#6FCABF` | tirkizna |
| `--startup-tone-8` | `oklch(0.48 0.08 220)` `#17687D` | `oklch(0.78 0.1 220)` `#65C6E4` | petrolej |

- **Tint (podrazumevano, u redovima):** `bg-startup-tone-N/15 text-startup-tone-N` — tekst na tintu
  ≥ 4,88:1 (svetla), ≥ 6,57:1 (tamna).
- **Pun (traka, veći čip bez loga):** `bg-startup-tone-N text-background` — ≥ 5,84:1 / ≥ 9,25:1.
- Tailwind klase moraju biti napisane cele (statički niz od 8 stringova, kao u izlogu), ne
  sklapane iz `${tone}` — inače ih Tailwind ne generiše.
- Ton nikad ne nosi značenje statusa (crveni ton ≠ „kasni"); uz čip uvek ide ime ili `aria-label`.

---

## 3. Tipografija

Geist (sans) + Geist Mono; `font-feature-settings: "cv02","cv03","cv04","cv11"`; `antialiased`.
Bez novih fontova. Hijerarhija iz težine + veličine + tracking-a zajedno; negativan tracking raste sa
veličinom (Apple pravilo).

| Uloga | Web | Težina | Tracking | Leading |
|---|---|---|---|---|
| display (naslov prikaza) | `text-2xl sm:text-3xl` (24/30 px) | 700 | −0,035 do −0,04 em | podrazumevano |
| h1 u panelu/izlogu | `text-lg` (18 px) | 700 | −0,02 em | 1,55 |
| h2 sekcije | `text-lg` / `text-base` | 600–700 | −0,02 do −0,025 em | — |
| body | `text-sm` (14 px) | 400 | 0 | `leading-6` (24 px) |
| body small / meta | `text-xs` (12 px) | 400–500 | 0 | `leading-5` |
| caption | `text-[0.6875rem]` (11 px) | 400–500 | 0 | — |
| overline (oznaka sekcije) | `text-[0.6875rem] uppercase font-bold` | 700 | +0,09 do +0,16 em | — |
| brojevi | `tabular-nums`; bedž `font-mono text-[0.625rem]` | 700 | — | `leading-4` |

Telefon (`tokens.ts` `text`): display 28/34 700 · title 20/26 600 · body 16/22 400 · meta 13/18 500.
Osnovni tekst na telefonu je **16**, na webu **14** (gust desktop alat) — namerno.

---

## 4. Razmaci, raspored, oblik, dubina

**Razmaci.** Tailwind 4 px skala; najčešće `gap-2` (8), `gap-3` (12), `gap-1.5` (6), `p-2/p-3/p-4/p-5`.
Kartica `p-4 sm:p-5`, red liste `px-2 py-1.5` (min 44 px visine za dodir), grupe `space-y-0.5`.
Telefon: samo 4/8/12/16/24/32.

**Ritam rasporeda.** Ljuska: bočna traka `18.5rem` (lg+) + glavni prostor `flex-1`; sadržaj u
`max-w-7xl` (prikazi) ili `max-w-2xl/3xl` (čitanje). Sekcije 20–24 px razmaka; mreža kartica
`gap-4`; jedna kolona ispod `md`, 2 na `md`, 3 na `xl` (izlog). Na 390 px sve u jednu kolonu, bez
horizontalnog skrola; zaglavlje kartice slaže kod/etiketu iznad naslova.

**Radijusi** (`--radius` = 10 px): `rounded-sm` 6 · `md` 8 · `lg` 10 (dugme/polje) · `xl` 14 (red,
pločica) · `2xl` 18 (kartica) · `3xl` 24 (velika prazna stanja) · `full` (bedž, tačka, kvačica).
Čip startupa `rounded-[30%]`. Telefon: kartica 12, kontrola 10, pilula 9999.

**Ivice.** 1 px `--border` svuda gde je struktura; isprekidana ivica = prazno stanje; `divide-y` u listama.

**Dubina.** `--shadow-desk` = `0 1px 2px oklch(0.2 0.03 268 / 4%), 0 12px 36px oklch(0.2 0.03 268 / 6%)`
(klasa `.desk-surface`) — jedina „prava" senka za kartice i panele. `shadow-xs/sm` samo na dugmadi
(shadcn). Overlay dijaloga/panela `bg-black/50` (isti scrim kao `ui/dialog.tsx` i `ui/sheet.tsx`).
Telefon: senka samo na sheet i FAB.

**Ikone.** `lucide-react` (web) / `lucide-react-native` (telefon), stroke 2, veličine `size-3.5`
(gusto), `size-4` (podrazumevano), `size-5` (prazna stanja). Ikonica bez teksta ima `aria-label`.

---

## 5. Pokret

**Ličnost:** premium i fluidno (iOS osećaj). Springovi umesto krivih sa fiksnim trajanjem; sve kreće
od trenutne vrednosti na ekranu; ništa ne blokira unos; izlaz je brži od ulaza i ide istim putem.

### 5.1 Rečnik (`packages/shared/src/motion.ts`)

| Ime | Vrednost | Za šta |
|---|---|---|
| `DURATION.press` | 90 ms | pritisak (scale 0,97) |
| `DURATION.quick` | 160 ms | mikro odgovor, ulaz stavke, iscrtavanje kvačice |
| `DURATION.base` | 240 ms | standardni prelaz, izlaz panela, precrt |
| `DURATION.slow` | 380 ms | prelaz stranice/opsega (tween put) |
| `REDUCED_FADE_MS` | 120 ms | smanjen pokret: samo neprozirnost |
| `STANDARD_EASE_BEZIER` | `0.22, 1, 0.36, 1` | tween put (ease-out) |
| `STAGGER` | 24 ms korak, kasni najviše 6 stavki, ukupno ≤ 320 ms | ulaz liste |
| `SCALE` | press 0,97 · enterFrom 0,98 · dialogFrom 0,96 · tabBounceFrom 0,9 | |
| `ENTER_OFFSET_PX` | 8 | koliko stavka „doputuje" |

| Spring | response | ζ | stiffness | damping | smirivanje | prebačaj | Za šta |
|---|---|---|---|---|---|---|---|
| `snappy` | 0,32 s | 0,86 | 385,5 | 33,77 | 449 ms | ≈ 0,5 % | indikator, Flip, kotrljanje broja, povratak pritiska, ulaz liste (transform) |
| `smooth` | 0,42 s | 1 | 223,8 | 29,92 | 617 ms | nema | drawer, sheet, sklapanje, prsten |
| `gentle` | 0,50 s | 1 | 157,9 | 25,13 | 735 ms | nema | prelaz prikaza/opsega |
| `bouncy` | 0,45 s | 0,7 | 195,0 | 19,55 | 741 ms | ≈ 4,6 % | **samo** trenuci uspeha (kvačica) |

### 5.2 Kako se isti brojevi pretvaraju u pokret

- **Web (GSAP 3.15):** `getGsap()` jednom registruje `Flip` i `CustomEase` i pravi krive
  `spring-snappy|smooth|gentle|bouncy` iz `springEasePath()` + `devotion-standard` iz bezier-a.
  Spring = tween sa tom krivom i trajanjem = vreme smirivanja (`springTween(name)`).
  Tween put = `standardTween("quick"|…)`. Stagger = `listStagger` (funkcija, kapira na 6).
- **Telefon (Reanimated 4):** `withSpring(v, reanimatedSpring(SPRING[name]))` — isti
  stiffness/damping/mass (K09 dodaje `SPRINGS`/`springFor` u `theme/motion.ts`).

### 5.3 Web primitivi (K03)

| Primitiv | Šta radi | Smanjen pokret |
|---|---|---|
| `useGsap(scope, setup, deps)` | `gsap.context()` ograničen na `scope`; `reduced` iz jednog globalnog `gsap.matchMedia()`; `revert` na promenu `deps`, promenu podešavanja i unmount | grana `reduced` |
| `useTweenSlots()` | imperativni tween-ovi po ključu; nov ubija stari tamo gde je stao (prekid), sve se ubija na unmount | — |
| `useEnter(scope, {key})` | `[data-motion-enter]`: opacity (quick) + y 8 → 0, scale 0,98 → 1 (snappy), stagger 24 ms | samo opacity 120 ms |
| `useFlip(scope)` → `capture()` | snimi pre `setState`, posle commit-a Flip (`[data-flip-id]`, snappy); novi elementi fade | bez Flip-a |
| `usePress()` (ref) | pointer-down → 0,97 za 90 ms, otpuštanje → snappy; i Space/Enter | bez skaliranja |
| `useNumberRoll` + `NumberRoll` | cifra koja se menja izlazi u smeru promene, nova ulazi (snappy); „99+" | pretapanje |
| `useRailIndicator(container, key)` | indikator klizi do `[data-rail-key]` (snappy); resize bez animacije | skok |
| `MotionStage` | zamena za `WorkspaceStage`, isti ugovor `[data-workspace-enter]`; opacity (base) + 8 px (gentle), bočno uz `direction` | opacity 120 ms |
| `AnimatedCheck` | `role="checkbox"`, meta 24 px (44 na dodir), ivica `muted-foreground/70` (≥ 3:1); krug se puni od centra (bouncy), kvačica se iscrtava (quick); poništavanje quick | opacity |
| `Collapse` | visina kroz GSAP (smooth otvaranje, base zatvaranje), zatvoren = `inert` | visina odmah, sadržaj fade |
| `ProgressRing` | `role="progressbar"` + `valueText` (`aria-valuetext`), luk se puni (smooth), na nuli sakriven | vrednost odmah |
| `Drawer` | Radix Dialog + `forceMount`; ulaz s desna (smooth), izlaz istim putem (base); fokus zarobljen, posle izlaza se vraća na dugme koje ga je otvorilo (ako ga korisnik nije pomerio); izlazni sloj ne hvata klikove | opacity |

### 5.4 Potpisni trenuci (PLAN §6) — ko ih pravi

1. Završi zadatak — `AnimatedCheck` + precrt (base, sleva) + posle smirivanja kvačice (≈ 741 ms) Flip u „Završeno" (demo u izlogu; ekrani K10/K11/K17).
2. Promena opsega — `useRailIndicator` + `MotionStage direction` (K08).
3. Panel zadatka — `Drawer` (K11); Flip naslova u zaglavlje je K19.
4. Brzi unos — dijalog iz 0,96 snappy + Flip nove stavke (K10).
5. Brojevi — `NumberRoll`, `ProgressRing` (K08/K10/K14).
6–7. Swipe i tab bar — telefon (K09/K12).
8. Liste — `useEnter` + `useFlip` (svi koraci sa listama).

### 5.5 Pravila

- Animira se `transform` i `opacity`; visina samo kroz `Collapse`/Flip; indikator trake menja i
  širinu/visinu apsolutnog elementa (ne utiče na raspored drugih).
- Svaka animacija je prekidiva i kreće od trenutne vrednosti; posle mount-a vizuelno stanje drži GSAP
  (React postavlja stil samo pri prvom renderu — `useState(initial)`), da render ne bi „preskočio" tween.
- Nema `pointer-events: none` na sadržaju koji korisnik koristi, nema čekanja `onComplete` pre sledeće
  radnje. Jedini izuzetak: **odlazeći** overlay/panel dobija `pointer-events: none` da ne bi hvatao klik.
- Element koji animira GSAP ne nosi `tw-animate-css` klase (`animate-in`, `fade-in-0`…) ni `motion.*`.
- `clearProps` čisti samo ono što je tween postavio (`"opacity,visibility"`, `"transform"`), nikad `"all"`.
- GSAP samo u `"use client"` kodu, iz efekata; `@gsap/react` se ne koristi.
- Nikad `gsap.matchMedia()` po komponenti: svaki `add()` ostavlja `MediaQueryList` slušaoca koji se ne skida. Smanjen pokret čitaj kroz `useReducedMotion()` / `prefersReducedMotion()` (jedan globalni matchMedia u `gsap-setup.ts`).
- Kad se red pomera iz liste u listu (demontira/montira), vrati fokus na isti kontrol na novom mestu i najavi promenu kroz `aria-live`.
- Smanjen pokret: nema pomeranja, skaliranja, Flip-a ni stagger-a — samo neprozirnost ≤ 120 ms.

---

## 6. Stil (osećaj)

- **Raspoloženje:** smireno, sabrano, precizno, toplo-hladno (hladna siva + topli tonovi startupa).
- **Metafora:** radni sto na milimetarskom papiru; kartice su listovi, nit (`--thread`) ih povezuje.
- **Žanr:** produktivni alat za mali tim (Linear/Things/Notion porodica), ne marketinški sajt.
- **Hijerarhija:** težina + veličina; boja samo za akciju i status. Levo poravnanje, sadržaj gore-levo.
- **Gustina:** srednje-gusto; redovi 40–44 px, meta tekst 11–12 px, brojevi tabularni.
- **Interakcija:** odgovor na pritisak odmah (pointer-down), hover kao blagi `bg-muted/60`, fokus
  prsten uvek vidljiv; nijedan beskonačan „ukrasni" pokret.
- **Glas:** srpski latinicom, „ti" oblik, kratko, glagol na dugmetu („Završi", „Isplaniraj dan",
  „Prebaci u startup"). Prazno stanje = jedna rečenica + jedna radnja. Greška kaže šta da uradiš.

---

## 7. Efekti

Lagan nivo (`performance_tier: lightweight`), motor GSAP; bez WebGL-a, čestica i shadera.

- **Pozadina:** `.app-canvas` — dve linearne gradijent-linije (32 px, `--border` 32 % / 24 %); statična.
- **Staklo:** samo lepljiva zaglavlja (`bg-background/85–90 backdrop-blur-xl`); nikad staklo na staklu.
- **SVG:** iscrtavanje kvačice (`pathLength=1`, `strokeDashoffset`), luk prstena napretka.
- **Bez:** paralakse, scroll-trigger otkrivanja, kursora, efekata teksta, generativne pozadine.

---

## 8. Mapiranje web ↔ telefon

Paleta telefona je **namerno drugačija** (near-black, tamno je primarno; vidi zaglavlje `tokens.ts`):
ista uloga, drugačija vrednost. Nov token se uvek dodaje na **oba** mesta i u **obe** teme.

| Web | Telefon | Napomena |
|---|---|---|
| `--background` | `background` | tel: `#0B0B0C` / `#F4F4F5` |
| `--card` | `surface` (alias `card`) | |
| `--popover` | `surfaceRaised` (alias `popover`) | sheet na telefonu |
| `--foreground` | `foreground` | |
| `--muted-foreground` | `mutedForeground` | tel. ima i `subtle` (najprigušeniji meta tekst) |
| `--primary` (podloga i tekst) | `primary` (podloga) + `primaryText` (tekst) | web tamna: svetao indigo sa tamnim tekstom; tel: `#4F46E5` sa belim |
| `--primary-foreground` | `primaryForeground` | |
| `--secondary` / `-foreground` | `secondary` / `secondaryForeground` | |
| `--muted` | `muted` | podloga, ne tekst |
| `--accent` / `-foreground` | `accent` / `accentForeground` | izabrano |
| `--destructive` | `danger` (alias `destructive`) | |
| `--success` / `--warning` / `--info` | `success` / `warning` / `info` | |
| `--border` / `--input` / `--ring` | `border` / `input` / `ring` | |
| `--sidebar*` | `sidebar*` | tel. ih ne koristi |
| `--thread` | `thread` | |
| `--startup-tone-1…8` | `startupTones[scheme][0…7]` | **isti** sRGB (identitet startupa) |
| `--radius` 10 / `rounded-2xl` 18 | `radius.control` 10 / `radius.card` 12 | |
| `--shadow-desk` | `SHADOW_COLOR` (samo sheet, FAB) | |
| `text-2xl/3xl` · `text-lg` · `text-sm` · overline 11 px | `text.display` · `text.title` · `text.body` · `text.meta` | body 14 web / 16 tel. |
| `lib/motion` (GSAP) | `theme/motion.ts` (Reanimated) | isti brojevi iz shared |
| `usePress`, `AnimatedCheck`, `NumberRoll`, `ProgressRing`, `Drawer` | `PressableScale`, `AnimatedCheck`, `NumberRoll`, `ProgressRing`, sheet (K09) | |

---

## 9. Radi / ne radi

**Radi**
- Boje samo kroz tokene (`bg-primary`, `text-muted-foreground`, `bg-startup-tone-3/15`).
- Jedan akcenat (indigo) za akciju i aktivno; status boje samo za status.
- Kartica = `desk-surface rounded-2xl border bg-card`; redovi bez kartice, sa `hover:bg-muted/60`.
- Overline oznake sekcija (`text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground`).
- `tabular-nums` za sve brojeve koji se menjaju; `NumberRoll` za bedževe i brojače.
- Pokret iz `@/lib/motion` i `@/components/motion`; spring imena umesto ručnih trajanja.
- Prazno, učitavanje i greška stanje u svakom prikazu podataka; snimak u izlogu u obe teme, 390 i 1440.
- Dodir ≥ 44 px (globalno pravilo za `pointer: coarse`), fokus prsten 2 px `--ring`.

**Ne radi**
- `#fff`, `rgb(...)`, Tailwind paleta (`bg-indigo-500`) u novom kodu; `--warning` kao tekst u svetloj temi.
- Novi fontovi, Phosphor ili emodžiji (savet skilla gubi od pravila repoa).
- „AI dashboard": neonski sjaj, gradijentni tekst, ljubičasti gradijenti, 3 jednake kartice kao ukras.
- Beskonačne/ukrasne animacije, odskok (`bouncy`) van trenutka uspeha, animacija duža od smirivanja springa.
- Dve biblioteke na istom elementu (GSAP + `tw-animate-css` ili Framer Motion).
- `pointer-events: none` ili čekanje kraja animacije pre sledeće radnje.
- `clearProps: "all"`, animacija `width/height/top/left` za pomeranje.
- Ton startupa kao signal statusa; čip bez imena ili `aria-label`.

---

## 10. JSON profil (šema design-dna)

```json
{
  "meta": {
    "name": "Devotion",
    "description": "Privatni radni prostor za mali tim koji vodi više startupa: lični nivo Ja + startupi, web (Next.js) i telefon (Expo).",
    "source_references": ["apps/web/app/globals.css", "apps/web/app/layout.tsx", "apps/web/components/workspace/*", "apps/mobile/src/theme/tokens.ts", "packages/shared/src/motion.ts", "docs/LICNO-PLAN.md §6–7"],
    "created_at": "2026-10-24"
  },
  "design_system": {
    "color": {
      "palette_type": "monochromatic (hladna siva hue 265–268) + jedan indigo akcenat + 8 tonova identiteta",
      "primary": { "hex": "#4A42D8 / tamna #8D98FF", "role": "akcija, aktivno stanje, fokus, kvačica, prsten" },
      "secondary": { "hex": "#E9EDF6 / tamna #1B202D", "role": "sekundarna dugmad i podloge" },
      "accent": { "hex": "#E0E6FF / tamna #202542", "role": "izabrano/aktivno (tint), tekst #2C2E6F / #CCD5FF" },
      "neutral": { "scale": ["#FDFEFF", "#F6F8FC", "#ECEFF5", "#D8DCE6", "#535B6C", "#121723"], "usage": "pozadina, kartice, ivice, sekundarni i primarni tekst; tamna tema obrnuto (#090C15 … #E4E8F0)" },
      "semantic": { "success": "#14844A / #4CAF73", "warning": "#CF8700 / #E0A536 (nikad tekst u svetloj)", "error": "#D42325 / #F05653", "info": "#006AAA / #5CB4EF" },
      "surface": { "background": "#F6F8FC / #090C15 + mreža 32 px", "card": "#FDFEFF / #0F131E", "elevated": "#FDFEFF / #121722 (popover, drawer)" },
      "contrast_strategy": "visok kontrast teksta (≥ 6,4:1 za sekundarni), boja samo za akciju i status; tonovi startupa ≥ 4,88:1 kao tekst na sopstvenom tintu"
    },
    "typography": {
      "type_scale": {
        "display": { "size": "24px → 30px (sm)", "weight": "700", "line_height": "1.2–1.25", "tracking": "-0.035em do -0.04em" },
        "heading_1": { "size": "18px", "weight": "700", "line_height": "1.55", "tracking": "-0.02em" },
        "heading_2": { "size": "16–18px", "weight": "600–700", "line_height": "1.5", "tracking": "-0.02em do -0.025em" },
        "heading_3": { "size": "11px uppercase (overline sekcije)", "weight": "700", "line_height": "1.4", "tracking": "+0.12em" },
        "body": { "size": "14px (telefon 16px)", "weight": "400", "line_height": "24px", "tracking": "0" },
        "body_small": { "size": "12px", "weight": "400–500", "line_height": "20px", "tracking": "0" },
        "caption": { "size": "11px", "weight": "400–500", "line_height": "16px", "tracking": "0" },
        "overline": { "size": "11px", "weight": "700", "line_height": "16px", "tracking": "+0.09em do +0.16em" }
      },
      "font_families": { "heading": "Geist", "body": "Geist", "mono": "Geist Mono" },
      "font_style_notes": "geometrijski grotesk sa humanističkim alternativama (cv02–cv11); negativan tracking raste sa veličinom; tabularni brojevi"
    },
    "spacing": {
      "base_unit": "4px",
      "scale": [4, 6, 8, 10, 12, 16, 20, 24, 32],
      "content_density": "comfortable-compact (VISUAL_DENSITY 6)",
      "section_rhythm": "20–24px između sekcija, 16px između kartica, 2–6px između redova liste"
    },
    "layout": {
      "grid_system": "ljuska: bočna traka 18.5rem + fluidni glavni prostor; mreže kartica CSS grid",
      "max_content_width": "max-w-7xl (1280px) za prikaze, max-w-2xl/3xl za čitanje",
      "columns": "1 (<768) · 2 (md) · 3 (xl)",
      "gutter": "16px (gap-4)",
      "breakpoints": { "sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px" },
      "alignment_tendency": "levo poravnato, strogo po mreži"
    },
    "shape": {
      "border_radius": { "small": "6–8px", "medium": "10px (dugme, polje)", "large": "14px red / 18px kartica", "pill": "9999px" },
      "border_usage": "subtle 1px svuda gde je struktura",
      "divider_style": "1px --border, divide-y u listama; isprekidano za prazna stanja"
    },
    "elevation": {
      "shadow_style": "soft diffused, retko",
      "levels": { "low": "shadow-xs (dugme)", "medium": "--shadow-desk: 0 1px 2px 4% + 0 12px 36px 6% (kartica, panel)", "high": "scrim bg-black/50 + panel (drawer, dijalog)" },
      "depth_cues": "ivice od 1px, razlika površina (card/popover), mreža u pozadini, blur lepljivih zaglavlja"
    },
    "iconography": { "style": "outline", "stroke_weight": "2", "size_scale": ["14px", "16px", "20px"], "preferred_set": "lucide-react / lucide-react-native" },
    "motion": {
      "easing": "spring (CustomEase iz springa: snappy/smooth/gentle/bouncy) + devotion-standard cubic-bezier(0.22,1,0.36,1)",
      "duration_scale": { "micro": "90ms (pritisak) / 160ms", "normal": "240ms; springovi 449–617ms smirivanja", "macro": "380ms; gentle 735ms" },
      "entrance_pattern": "fade + 8px nagore + scale 0.98→1, stagger 24ms (najviše 6), kreće od trenutne vrednosti",
      "exit_pattern": "brže od ulaza (base 240ms), istim putem kojim je ušlo, bez hvatanja klikova",
      "philosophy": "fizički, prekidiv, kratak — kao OS telefona; odskok samo za uspeh; smanjen pokret = samo neprozirnost ≤ 120ms"
    },
    "components": {
      "button_style": "shadcn dugme: rounded-md 8px, h-9, indigo podloga za primarno, outline/ghost za ostalo, pritisak 0.97",
      "input_style": "1px --input ivica, rounded-md, fokus prsten 2px --ring",
      "card_style": "desk-surface rounded-2xl border bg-card p-4/p-5",
      "navigation_pattern": "web: bočna traka + (K08) uska traka Ja/startupi sa kliznim indikatorom; telefon: 5 tabova",
      "modal_style": "Radix Dialog centriran (dialog) ili desni Drawer (panel zadatka), scrim bg-black/50",
      "list_style": "redovi bez kartice, min 44px, hover bg-muted/60, kvačica levo, meta desno",
      "component_notes": "čip startupa (rounded 30%, inicijali, ton iz imena) je potpisni element; bedževi font-mono tabular; prazna stanja isprekidana ivica + jedna radnja"
    }
  },
  "design_style": {
    "aesthetic": {
      "mood": ["smireno", "sabrano", "precizno", "toplo u detaljima"],
      "visual_metaphor": "radni sto na milimetarskom papiru; listovi povezani nitima",
      "era_influence": "savremeni produktivni alati (2024–2026), iOS pokret",
      "genre": "produktivni SaaS alat za mali tim",
      "personality_traits": ["pouzdan", "brz", "nenametljiv", "pažljiv"],
      "adjectives": ["gust", "miran", "oštar", "fluidan"]
    },
    "visual_language": {
      "complexity": "moderate",
      "ornamentation": "subtle accents (mreža, nit, čipovi)",
      "whitespace_usage": "funkcionalan — dovoljno za grupisanje, ne za luksuz",
      "visual_weight_distribution": "gore-levo; naslov prikaza i primarna radnja nose težinu",
      "focal_strategy": "jedna primarna radnja po prikazu (indigo), ostalo neutralno",
      "contrast_level": "visok za tekst, nizak za strukturu",
      "texture_usage": "samo mreža u pozadini"
    },
    "composition": {
      "hierarchy_method": "tipografska hijerarhija + težina; boja samo za akciju/status",
      "balance_type": "asimetrično, levo poravnato",
      "flow_direction": "odozgo nadole, sleva nadesno",
      "grouping_strategy": "kartice za celine, overline oznake i razmak za grupe, divide-y za redove",
      "negative_space_role": "odvaja grupe; nikad prazna dekoracija"
    },
    "imagery": {
      "photo_treatment": "samo avatari i logoi (rounded-lg / full)",
      "illustration_style": "nema",
      "graphic_elements": "ikonice u pločicama (bg-accent), čipovi startupa, nit",
      "pattern_usage": "mreža 32px u pozadini",
      "image_shape": "zaobljen kvadrat (logo), krug (avatar), squircle 30% (čip)"
    },
    "interaction_feel": {
      "feedback_style": "trenutno na pointer-down, potvrda na uspehu (kvačica, toast Poništi)",
      "hover_behavior": "blaga podloga bg-muted/60 ili bg-accent, bez podizanja",
      "transition_personality": "snappy spring, prekidiv",
      "loading_style": "skeleton u obliku sadržaja; spinner samo za celu aplikaciju",
      "microinteraction_density": "srednja — na akcijama i promenama stanja, nikad ambijentalno"
    },
    "brand_voice_in_ui": {
      "tone": "direktan, prijateljski, kratak",
      "formality": "neformalno („ti")",
      "cta_style": "direct imperative (Završi, Isplaniraj dan, Prebaci u startup)",
      "empty_state_approach": "jedna rečenica + jedna radnja",
      "error_tone": "smiren, kaže šta da uradiš; serverske greške u „ti" obliku"
    }
  },
  "visual_effects": {
    "overview": { "effect_intensity": "subtle-accent", "performance_tier": "lightweight", "fallback_strategy": "prefers-reduced-motion → samo neprozirnost ≤ 120ms; bez JS-a sadržaj ostaje vidljiv", "primary_technology": "GSAP (Flip, CustomEase) na webu, Reanimated na telefonu" },
    "background_effects": { "type": "static grid (pattern-fill)", "description": "mreža 32px iz --border (32% / 24%) ispod svega", "technology": "CSS linear-gradient", "params": { "color_palette": ["--border"], "speed": "statično", "density": "32px", "opacity": "24–32%", "blend_mode": "normal" } },
    "particle_systems": { "enabled": false, "type": "none", "description": "nema", "technology": "none", "params": { "count": 0, "shape": "none", "size_range": "none", "movement_pattern": "none", "color_behavior": "none", "interaction": "none", "spawn_area": "none" } },
    "3d_elements": { "enabled": false, "type": "none", "description": "nema", "technology": "none", "params": { "renderer": "none", "lighting": "none", "camera": "none", "materials": "none", "geometry": "none", "post_processing": [], "interaction_model": "none" } },
    "shader_effects": { "enabled": false, "type": "none", "description": "nema", "technology": "none", "params": { "uniforms": "none", "vertex_manipulation": "none", "fragment_output": "none", "noise_type": "none", "distortion": "none" } },
    "scroll_effects": {
      "parallax": { "enabled": false, "layers": "0", "depth_range": "none", "speed_curve": "none" },
      "scroll_triggered_animations": { "enabled": false, "trigger_points": "none", "animation_type": "none", "scrub_behavior": "none" },
      "scroll_morphing": { "enabled": false, "description": "nema" }
    },
    "text_effects": { "type": "none (precrt završenog zadatka je transform linije, ne efekat teksta)", "description": "precrt prolazi sleva nadesno 240ms", "technology": "GSAP scaleX", "params": { "split_strategy": "none", "animation_per_unit": "none", "stagger": "none", "effect_style": "strike sweep" } },
    "cursor_effects": { "enabled": false, "type": "none", "description": "nema", "params": { "shape": "none", "size": "none", "blend_mode": "none", "trail": "none", "interaction_zone": "none" } },
    "image_effects": { "type": "none", "description": "nema", "technology": "none", "params": { "filter_pipeline": "none", "hover_transform": "none", "reveal_animation": "none", "distortion_type": "none" } },
    "glassmorphism_neumorphism": { "enabled": true, "style": "frosted-layers (samo lepljiva zaglavlja)", "params": { "blur_radius": "24px (backdrop-blur-xl)", "transparency": "85–90% --background", "border_treatment": "1px --border/70 dole", "shadow_type": "none", "light_source_angle": "none" } },
    "canvas_drawings": { "enabled": false, "type": "none (kanvasi ideja/misli su @xyflow, van ovog DNK)", "description": "nema", "technology": "none", "params": { "draw_method": "none", "animation_loop": "none", "color_scheme": "none", "responsiveness": "none", "interaction": "none" } },
    "svg_animations": { "enabled": true, "type": "path-draw", "description": "iscrtavanje kvačice i punjenje prstena napretka", "params": { "animation_method": "GSAP strokeDashoffset (pathLength=1)", "path_morphing": "none", "stroke_animation": "quick 160ms (kvačica), smooth spring (prsten)", "filter_effects": "none" } },
    "composite_notes": "Efekti su namerno tihi: mreža + jedan akcenat + springovi. Sve što se kreće objašnjava stanje (uspeh, promena rasporeda, opseg, panel). Telefon koristi iste brojeve kroz Reanimated; kanvasi i editor nisu deo ovog sloja."
  }
}
```
