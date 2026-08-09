/**
 * NativeWind / Tailwind konfiguracija za mobilnu aplikaciju.
 *
 * REDIZAJN: boje su tamno-prvi near-black jezik i NAMERNO divergiraju od web
 * `apps/web/app/globals.css` (mobilni se koristi uveče). Isti spisak je i u
 * `src/theme/tokens.ts` (izvor istine za komponente koje stilizuju kroz
 * StyleSheet) — menjaj boje na oba mesta. Web se ne dira.
 */

// Svetla tema — iste uloge, invertovani neutralci.
const light = {
  background: '#F4F4F5',
  foreground: '#18181B',
  surface: '#FCFCFD',
  'surface-raised': '#FFFFFF',
  subtle: '#8A8A90',
  danger: '#DC2626',
  card: '#FCFCFD',
  'card-foreground': '#18181B',
  popover: '#FFFFFF',
  'popover-foreground': '#18181B',
  primary: '#6366F1',
  'primary-foreground': '#FFFFFF',
  secondary: '#E9E9EC',
  'secondary-foreground': '#18181B',
  muted: '#ECECEE',
  'muted-foreground': '#52525B',
  accent: '#E8E9FD',
  'accent-foreground': '#3730A3',
  destructive: '#DC2626',
  'destructive-foreground': '#FFFFFF',
  success: '#059669',
  'success-foreground': '#FFFFFF',
  warning: '#D97706',
  'warning-foreground': '#FFFFFF',
  info: '#2563EB',
  'info-foreground': '#FFFFFF',
  border: '#E4E4E7',
  input: '#D4D4D8',
  ring: '#6366F1',
  sidebar: '#EDEDEF',
  'sidebar-foreground': '#18181B',
  'sidebar-accent': '#E8E9FD',
  'sidebar-accent-foreground': '#3730A3',
  'sidebar-border': '#E4E4E7',
  thread: '#6366F1',
};

// Tamna tema — PRIMARNA. Near-black površine, indigo akcija.
const dark = {
  background: '#0B0B0C',
  foreground: '#F5F5F6',
  surface: '#151517',
  'surface-raised': '#1D1D20',
  subtle: '#6E6E76',
  danger: '#F87171',
  card: '#151517',
  'card-foreground': '#F5F5F6',
  popover: '#1D1D20',
  'popover-foreground': '#F5F5F6',
  primary: '#6366F1',
  'primary-foreground': '#FFFFFF',
  secondary: '#1D1D20',
  'secondary-foreground': '#F5F5F6',
  muted: '#232327',
  'muted-foreground': '#A1A1A6',
  accent: '#1E2140',
  'accent-foreground': '#C7C9FF',
  destructive: '#F87171',
  'destructive-foreground': '#450A0A',
  success: '#34D399',
  'success-foreground': '#04160E',
  warning: '#FBBF24',
  'warning-foreground': '#3A2A05',
  info: '#60A5FA',
  'info-foreground': '#06122A',
  border: '#26262A',
  input: '#303036',
  ring: '#818CF8',
  sidebar: '#0F0F11',
  'sidebar-foreground': '#F5F5F6',
  'sidebar-accent': '#1E2140',
  'sidebar-accent-foreground': '#C7C9FF',
  'sidebar-border': '#26262A',
  thread: '#6366F1',
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
        // Semantički (redizajn)
        card: '12px',
        control: '10px',
        pill: '9999px',
        // Legacy skala
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
      },
      fontSize: {
        // Kanonska 4-nivo skala (redizajn)
        display: ['28px', '34px'],
        title: ['20px', '26px'],
        body: ['16px', '22px'],
        meta: ['13px', '18px'],
        // Legacy skala
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
