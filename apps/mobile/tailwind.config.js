/**
 * NativeWind / Tailwind konfiguracija za mobilnu aplikaciju.
 *
 * Boje, radijusi i tipografska skala su preslikani iz `apps/web/app/globals.css`
 * (svetla = `:root`, tamna = `.dark`). Web koristi `oklch(...)`; ovde su vrednosti
 * konvertovane u sRGB hex jer React Native ne renderuje `oklch`. Isti spisak je i
 * u `src/theme/tokens.ts` (izvor istine za komponente koje stilizuju kroz
 * StyleSheet); menjaj boje na oba mesta.
 */

// Svetla tema — `:root` iz globals.css.
const light = {
  background: '#f6f8fc',
  foreground: '#121723',
  card: '#fdfeff',
  'card-foreground': '#121723',
  popover: '#fdfeff',
  'popover-foreground': '#121723',
  primary: '#4a42d8',
  'primary-foreground': '#fbfcff',
  secondary: '#e9edf6',
  'secondary-foreground': '#242b3d',
  muted: '#eceff5',
  'muted-foreground': '#535b6c',
  accent: '#e0e6ff',
  'accent-foreground': '#2c2e6f',
  destructive: '#d42325',
  'destructive-foreground': '#fbfcff',
  success: '#14844a',
  'success-foreground': '#fbfcff',
  warning: '#cf8700',
  'warning-foreground': '#351a00',
  info: '#006aaa',
  'info-foreground': '#fbfcff',
  border: '#d8dce6',
  input: '#d1d6e1',
  ring: '#5f62e9',
  sidebar: '#edf0f8',
  'sidebar-foreground': '#181e2c',
  'sidebar-accent': '#dbe2fc',
  'sidebar-accent-foreground': '#2b2d74',
  'sidebar-border': '#d2d7e3',
  thread: '#9aa4d7',
};

// Tamna tema — `.dark` iz globals.css (border/input nose alfa kanal).
const dark = {
  background: '#090c15',
  foreground: '#e4e8f0',
  card: '#0f131e',
  'card-foreground': '#e4e8f0',
  popover: '#121722',
  'popover-foreground': '#e4e8f0',
  primary: '#8d98ff',
  'primary-foreground': '#0a0d21',
  secondary: '#1b202d',
  'secondary-foreground': '#dde1eb',
  muted: '#1a1e29',
  'muted-foreground': '#9198a8',
  accent: '#202542',
  'accent-foreground': '#ccd5ff',
  destructive: '#f05653',
  'destructive-foreground': '#f9fafd',
  success: '#4caf73',
  'success-foreground': '#011207',
  warning: '#e0a536',
  'warning-foreground': '#241100',
  info: '#5cb4ef',
  'info-foreground': '#021322',
  border: '#353a489e',
  input: '#414857b8',
  ring: '#838dff',
  sidebar: '#0c101a',
  'sidebar-foreground': '#d3d7e1',
  'sidebar-accent': '#202542',
  'sidebar-accent-foreground': '#ccd5ff',
  'sidebar-border': '#303543a6',
  thread: '#6a72ac',
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      // Semantički tokeni (svetla tema) + eksplicitni `light-*` / `dark-*`
      // pristup za `dark:` varijante.
      colors: {
        ...light,
        light,
        dark,
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        lg: ['18px', '28px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '36px'],
        '4xl': ['36px', '40px'],
      },
    },
  },
  plugins: [],
};
