/**
 * Dizajn tokeni za mobilnu aplikaciju — redizajn (Korak 1).
 *
 * PRAVILA DIZAJN-JEZIKA (tamno je PRIMARNA tema — aplikacija se koristi uveče):
 *  - `accent` (indigo `#6366F1`) SAMO za primarnu akciju i aktivno stanje. Sav
 *    ostali chrome je sivo-skala + površine. U kôdu je akcijski indigo token
 *    `primary` (vidi „POMIRENJE IMENA").
 *  - success / warning / danger SAMO za pravi status-signal, ne kao dekoraciju.
 *  - Senke SAMO na sheet i FAB. Kartice se odvajaju bojom površine (`surface`)
 *    i 1px ivicom (`border`) — senke u tamnoj temi izgledaju blatnjavo.
 *  - Avatari su namerni izuzetak: obojena podloga izvedena iz imena (identitet),
 *    nikad generična siva ikonica čoveka.
 *
 * TIPOGRAFIJA — kanonska su ČETIRI nivoa: `text.display|title|body|meta`.
 * Sirovi `fontSize`/`fontWeight` su `@deprecated` low-level compat; migriraj na
 * `text`.
 *
 * WEB-PARITET (namerna divergencija, izuzetak po CLAUDE.md): mobilna paleta više
 * NIJE 1:1 sa `apps/web/app/globals.css`. Mobilni ima sopstveni tamno-prvi
 * near-black jezik; web se ne dira. Isti spisak boja postoji i u
 * `tailwind.config.js` (NativeWind ne može da `require`-uje TS) — menjaj na oba
 * mesta.
 *
 * POMIRENJE IMENA (nova vitka paleta ↔ legacy shadcn ključevi koje ekrani još
 * čitaju direktno; legacy ostaje kao @deprecated alias dok se ekrani ne migriraju):
 *  - brief `accent` (primarna akcija #6366F1)  → token `primary`
 *    (legacy `accent` je zauzet kao suptilni bg-tint za „selektovano" stanje)
 *  - brief `muted` (sekundarni tekst #A1A1A6)  → token `mutedForeground`
 *    (legacy `muted` je zauzet kao suptilna POZADINA za pressed/track/skeleton)
 *  - brief `surface` / `surfaceRaised` / `subtle` / `danger` → nova čista imena.
 */

export type ColorTokens = {
  // ── Nova vitka paleta (kanonski rečnik za nove primitive) ──
  /** Pozadina ekrana — skoro crna, ne siva. */
  background: string;
  /** Kartice. */
  surface: string;
  /** Sheet, popover — jedan korak iznad `surface`. */
  surfaceRaised: string;
  /** 1px ivica, suptilna. */
  border: string;
  /** Primarni tekst. */
  foreground: string;
  /** Meta/vreme/brojači — najprigušeniji tekst. */
  subtle: string;
  /** Status: uspeh. */
  success: string;
  /** Status: upozorenje. */
  warning: string;
  /** Status: greška/opasnost (= legacy `destructive`). */
  danger: string;

  // ── Legacy shadcn ključevi (@deprecated — remapirani na novu paletu) ──
  /** @deprecated koristi `surface`. */
  card: string;
  cardForeground: string;
  /** @deprecated koristi `surfaceRaised`. */
  popover: string;
  popoverForeground: string;
  /** Akcijski indigo (brief „accent"). Jedini obojeni akcenat chrome-a. */
  primary: string;
  primaryForeground: string;
  /** @deprecated sekundarna površina (dugmad/badge). */
  secondary: string;
  secondaryForeground: string;
  /** @deprecated suptilna POZADINA (pressed/track/skeleton), NIJE tekst. */
  muted: string;
  /** Sekundarni tekst (brief „muted"). */
  mutedForeground: string;
  /** @deprecated suptilni indigo-tint za „selektovano/aktivno" stanje. */
  accent: string;
  accentForeground: string;
  /** @deprecated koristi `danger`. */
  destructive: string;
  destructiveForeground: string;
  successForeground: string;
  warningForeground: string;
  /** Plava — zadržana zbog Avatara i DeadlineBadge (nije u core briefu). */
  info: string;
  infoForeground: string;
  /** Ivica polja za unos. */
  input: string;
  /** Fokus prsten. */
  ring: string;
  // Sidebar/thread: nekorišćeni na mobilnom, zadržani da tip/tailwind ostanu kompletni.
  sidebar: string;
  sidebarForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  thread: string;
};

/**
 * Tamna tema — PRIMARNA. Near-black površine, indigo akcija, dvo-nivo sivi tekst.
 */
export const darkColors: ColorTokens = {
  background: '#0B0B0C',
  surface: '#151517',
  surfaceRaised: '#1D1D20',
  border: '#26262A',
  foreground: '#F5F5F6',
  subtle: '#6E6E76',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',

  // Legacy aliasi → nova paleta
  card: '#151517', // = surface
  cardForeground: '#F5F5F6',
  popover: '#1D1D20', // = surfaceRaised
  popoverForeground: '#F5F5F6',
  primary: '#6366F1', // akcijski indigo (brief „accent")
  primaryForeground: '#FFFFFF',
  secondary: '#1D1D20',
  secondaryForeground: '#F5F5F6',
  muted: '#232327', // suptilna pozadina (pressed/track/skeleton)
  mutedForeground: '#A1A1A6', // sekundarni tekst (brief „muted")
  accent: '#1E2140', // suptilni indigo-tint za aktivno/selektovano
  accentForeground: '#C7C9FF',
  destructive: '#F87171', // = danger
  destructiveForeground: '#450A0A',
  successForeground: '#04160E',
  warningForeground: '#3A2A05',
  info: '#60A5FA',
  infoForeground: '#06122A',
  input: '#303036',
  ring: '#818CF8',
  sidebar: '#0F0F11',
  sidebarForeground: '#F5F5F6',
  sidebarAccent: '#1E2140',
  sidebarAccentForeground: '#C7C9FF',
  sidebarBorder: '#26262A',
  thread: '#6366F1',
};

/**
 * Svetla tema — iste uloge, invertovani neutralci. Semantičke boje
 * (accent/success/warning/danger) u kontrastno-ispravnoj nijansi (ne doslovna
 * per-kanal inverzija — inverzija indiga bi promenila ton). Bez novih uloga.
 */
export const lightColors: ColorTokens = {
  background: '#F4F4F5',
  surface: '#FCFCFD',
  surfaceRaised: '#FFFFFF',
  border: '#E4E4E7',
  foreground: '#18181B',
  subtle: '#8A8A90',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',

  // Legacy aliasi → nova paleta
  card: '#FCFCFD', // = surface
  cardForeground: '#18181B',
  popover: '#FFFFFF', // = surfaceRaised
  popoverForeground: '#18181B',
  primary: '#6366F1',
  primaryForeground: '#FFFFFF',
  secondary: '#E9E9EC',
  secondaryForeground: '#18181B',
  muted: '#ECECEE', // suptilna pozadina (pressed/track/skeleton)
  mutedForeground: '#52525B', // sekundarni tekst
  accent: '#E8E9FD', // suptilni indigo-tint za aktivno/selektovano
  accentForeground: '#3730A3',
  destructive: '#DC2626', // = danger
  destructiveForeground: '#FFFFFF',
  successForeground: '#FFFFFF',
  warningForeground: '#FFFFFF',
  info: '#2563EB',
  infoForeground: '#FFFFFF',
  input: '#D4D4D8',
  ring: '#6366F1',
  sidebar: '#EDEDEF',
  sidebarForeground: '#18181B',
  sidebarAccent: '#E8E9FD',
  sidebarAccentForeground: '#3730A3',
  sidebarBorder: '#E4E4E7',
  thread: '#6366F1',
};

/**
 * Radijusi (px). Semantički (redizajn): kartica 12, kontrola (dugme/polje) 10,
 * pilula/avatar 999. Sirova skala `sm..2xl,full` je legacy compat.
 */
export const radius = {
  // Semantički (redizajn)
  card: 12,
  control: 10,
  pill: 9999,
  // @deprecated sirova skala (legacy compat)
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  '2xl': 18,
  full: 9999,
} as const;

/**
 * Kanonska tipografija — ČETIRI nivoa. Spread u `StyleSheet` tekst stil:
 * `{ ...text.title, color: colors.foreground }`.
 */
export const text = {
  /** Naslov ekrana. */
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  /** Naslov sekcije i kartice. */
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  /** Sve što se čita. */
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  /** Badge, vreme, brojači. */
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
} as const;

/**
 * @deprecated Sirova skala veličina fonta (low-level compat). Nova pravila:
 * koristi `text.display|title|body|meta`.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

/** Težine fonta kao string vrednosti koje React Native prihvata. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Razmak — 4pt mreža, ISKLJUČIVO 4/8/12/16/24/32. Ništa između.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const;

/**
 * @deprecated Legacy skala razmaka (ima korake van 4pt mreže, npr. `5:20`).
 * Nova pravila: koristi `spacing`. Zadržano za par postojećih ekrana.
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

/** Minimalna dodirna meta (iOS smernica; važi i za Android). */
export const MIN_TOUCH_TARGET = 44;

/**
 * Boja senke (iOS `shadow*`). Senka je uvek crna u obe teme — Android je crta
 * kroz `elevation` (bez boje), pa je konstanta, ne token po temi. Senka se sme
 * koristiti SAMO na sheet i FAB (vidi pravila na vrhu).
 */
export const SHADOW_COLOR = '#000000';

export type ThemeName = 'light' | 'dark';

export const themes: Record<ThemeName, ColorTokens> = {
  light: lightColors,
  dark: darkColors,
};
