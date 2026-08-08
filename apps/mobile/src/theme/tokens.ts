/**
 * Dizajn tokeni za mobilnu aplikaciju.
 *
 * Boje su 1:1 preslikane iz `apps/web/app/globals.css` (`:root` = svetla,
 * `.dark` = tamna tema). Web koristi `oklch(...)`; React Native pouzdano
 * renderuje samo sRGB, pa su vrednosti konvertovane u hex (isti algoritam kao
 * CSS `oklch` → sRGB, sa gamut clamp-om). Radijusi i tipografska skala takođe
 * prate web (`--radius` = 0.625rem = 10px; Tailwind podrazumevana skala fontova).
 *
 * Isti spisak tokena postoji i u `tailwind.config.js` (NativeWind ne može da
 * `require`-uje TS), pa ako se boje menjaju — menjaj na oba mesta.
 */

export type ColorTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  info: string;
  infoForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  thread: string;
};

/** Svetla tema — preslikava `:root` iz `apps/web/app/globals.css`. */
export const lightColors: ColorTokens = {
  background: '#f6f8fc',
  foreground: '#121723',
  card: '#fdfeff',
  cardForeground: '#121723',
  popover: '#fdfeff',
  popoverForeground: '#121723',
  primary: '#4a42d8',
  primaryForeground: '#fbfcff',
  secondary: '#e9edf6',
  secondaryForeground: '#242b3d',
  muted: '#eceff5',
  mutedForeground: '#535b6c',
  accent: '#e0e6ff',
  accentForeground: '#2c2e6f',
  destructive: '#d42325',
  destructiveForeground: '#fbfcff',
  success: '#14844a',
  successForeground: '#fbfcff',
  warning: '#cf8700',
  warningForeground: '#351a00',
  info: '#006aaa',
  infoForeground: '#fbfcff',
  border: '#d8dce6',
  input: '#d1d6e1',
  ring: '#5f62e9',
  sidebar: '#edf0f8',
  sidebarForeground: '#181e2c',
  sidebarAccent: '#dbe2fc',
  sidebarAccentForeground: '#2b2d74',
  sidebarBorder: '#d2d7e3',
  thread: '#9aa4d7',
};

/** Tamna tema — preslikava `.dark` iz `apps/web/app/globals.css`. */
export const darkColors: ColorTokens = {
  background: '#090c15',
  foreground: '#e4e8f0',
  card: '#0f131e',
  cardForeground: '#e4e8f0',
  popover: '#121722',
  popoverForeground: '#e4e8f0',
  primary: '#8d98ff',
  primaryForeground: '#0a0d21',
  secondary: '#1b202d',
  secondaryForeground: '#dde1eb',
  muted: '#1a1e29',
  mutedForeground: '#9198a8',
  accent: '#202542',
  accentForeground: '#ccd5ff',
  destructive: '#f05653',
  destructiveForeground: '#f9fafd',
  success: '#4caf73',
  successForeground: '#011207',
  warning: '#e0a536',
  warningForeground: '#241100',
  info: '#5cb4ef',
  infoForeground: '#021322',
  // border/input u tamnoj temi imaju alfa kanal (#RRGGBBAA) kao na webu.
  border: '#353a489e',
  input: '#414857b8',
  ring: '#838dff',
  sidebar: '#0c101a',
  sidebarForeground: '#d3d7e1',
  sidebarAccent: '#202542',
  sidebarAccentForeground: '#ccd5ff',
  sidebarBorder: '#303543a6',
  thread: '#6a72ac',
};

/** Radijusi u px — `--radius: 0.625rem` (10px) plus izvedeni koraci. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  '2xl': 18,
  full: 9999,
} as const;

/**
 * Tipografska skala (px) — Tailwind podrazumevana skala. Osnovni tekst je 16px
 * (`base`), što je i mobilni minimum iz `docs/mobile/02-EKRANI.md` sekcije 11.
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

export const lineHeight = {
  xs: 16,
  sm: 20,
  base: 24,
  lg: 28,
  xl: 28,
  '2xl': 32,
  '3xl': 36,
  '4xl': 40,
} as const;

/** Težine fonta kao string vrednosti koje React Native prihvata. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Razmaci u px (4px baza), za doslednost padding-a/gap-a među komponentama. */
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
 * kroz `elevation` (bez boje), pa je konstanta, ne token po temi. Ovde da se
 * `#000` ne bi hardkodovao po komponentama.
 */
export const SHADOW_COLOR = '#000000';

export type ThemeName = 'light' | 'dark';

export const themes: Record<ThemeName, ColorTokens> = {
  light: lightColors,
  dark: darkColors,
};
