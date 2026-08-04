import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { colorScheme as nativewindColorScheme } from 'nativewind';

import { themes, type ColorTokens, type ThemeName } from '@/theme/tokens';

/**
 * Tri stanja teme, kao na webu:
 *  - `light`  — uvek svetla
 *  - `dark`   — uvek tamna
 *  - `system` — prati podešavanje telefona (`useColorScheme` iz React Native)
 */
export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  /** Izbor korisnika (svetlo/tamno/sistemsko). */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** Razrešena tema koja se stvarno prikazuje. */
  scheme: ThemeName;
  /** Paleta boja za razrešenu temu. */
  colors: ColorTokens;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const systemScheme = useColorScheme();

  // Prosledi izbor NativeWind-u da i `dark:` klase prate temu. NativeWind podržava
  // „system" izvorno (za razliku od `Appearance.setColorScheme` koji ne prima null).
  useEffect(() => {
    nativewindColorScheme.set(preference);
  }, [preference]);

  const scheme: ThemeName =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, scheme, colors: themes[scheme] }),
    [preference, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Puni pristup temi: izbor, promena izbora, razrešena šema i paleta. */
export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useAppTheme mora biti unutar <ThemeProvider>.');
  }
  return ctx;
}

/** Prečica kad treba samo paleta boja razrešene teme. */
export function useThemeColors(): ColorTokens {
  return useAppTheme().colors;
}
