import * as SecureStore from 'expo-secure-store';

import type { Id } from '@/convex/_generated/dataModel';

/**
 * Sitna podešavanja koja moraju da prežive restart aplikacije (PARITET-REVIZIJA
 * C1/C2/C15): izbor teme, poslednji izabran startup po korisniku, i da li je
 * push isključen na ovom uređaju. `expo-secure-store` je već zavisnost (token
 * Convex Auth-a ide kroz nju, `lib/convex.ts`) — jedan modul umesto tri
 * raštrkana poziva.
 *
 * Svaki poziv je u `try/catch`, isto što web radi za `localStorage`
 * (`apps/web/components/theme-provider.tsx`) — skladište koje ne radi ne sme
 * da obori aplikaciju.
 */

const THEME_KEY = 'devotion.theme';
const PUSH_OPT_OUT_KEY = 'devotion.pushOptOut';
const ACTIVE_STARTUP_PREFIX = 'devotion.activeStartup.';

function read(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    SecureStore.setItem(key, value);
  } catch {
    // Izbor važi bar za ovu sesiju (u memoriji); disk je najbolji napor.
  }
}

export type ThemePreferenceValue = 'light' | 'dark' | 'system';

/** Zapamćen izbor teme, ili `'system'` ako ništa nije sačuvano ili je vrednost neispravna. */
export function readThemePreference(): ThemePreferenceValue {
  const value = read(THEME_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export function writeThemePreference(next: ThemePreferenceValue): void {
  write(THEME_KEY, next);
}

/**
 * `SecureStore` dozvoljava samo `[A-Za-z0-9._-]` u ključu — Convex Id ne sadrži
 * druge znakove, ali sanitizacija je jeftina odbrana ako se to ikad promeni.
 */
function sanitizeKeyPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '');
}

/**
 * Zapamćen startup je PO PROFILU — dva naloga na istom telefonu ne dele izbor.
 * NE validira članstvo (samo oblik); server proverava pre upotrebe
 * (`startups.isCurrentMember`, `context/active-startup.tsx`).
 */
export function readActiveStartupId(profileId: Id<'profiles'>): Id<'startups'> | null {
  const value = read(ACTIVE_STARTUP_PREFIX + sanitizeKeyPart(profileId));
  if (value === null || value.length === 0) return null;
  return value as Id<'startups'>;
}

export function writeActiveStartupId(profileId: Id<'profiles'>, startupId: Id<'startups'>): void {
  write(ACTIVE_STARTUP_PREFIX + sanitizeKeyPart(profileId), startupId);
}

const PROSTOR_SEGMENT_KEY = 'devotion.prostorSegment';

export type ProstorSegmentValue = 'komandni-centar' | 'oblasti';

/**
 * Poslednji segment taba Prostor (plan K07, E14). Prvi put (ništa sačuvano)
 * otvara se Komandni centar — navika iz vremena kad je on bio tab „Danas".
 */
export function readProstorSegment(): ProstorSegmentValue {
  return read(PROSTOR_SEGMENT_KEY) === 'oblasti' ? 'oblasti' : 'komandni-centar';
}

export function writeProstorSegment(next: ProstorSegmentValue): void {
  write(PROSTOR_SEGMENT_KEY, next);
}

/** Da li je korisnik svesno isključio push na OVOM uređaju (`lib/notifications/register.ts`). */
export function readPushOptOut(): boolean {
  return read(PUSH_OPT_OUT_KEY) === '1';
}

export function writePushOptOut(off: boolean): void {
  write(PUSH_OPT_OUT_KEY, off ? '1' : '0');
}

// --- Moj dan i brzi unos (K12) ----------------------------------------------
// Isto što web pamti u `localStorage` (`apps/web/lib/me/last-area.ts`,
// `devotion:me-today:grouping`); `SecureStore` ne prima `:` u ključu, pa su
// imena ključeva ovde sa tačkom, a pravila i oblik vrednosti iz shared paketa.

const MY_DAY_GROUPING_KEY = 'devotion.myDay.grouping';
const QUICK_ADD_DESTINATION_KEY = 'devotion.quickAdd.destination';
const QUICK_ADD_AREA_PREFIX = 'devotion.quickAdd.area.';

export type MyDayGroupingValue = 'time' | 'startup';

/** Prekidač „Po vremenu / Po startupu" (plan K07 §1.2); podrazumevano po vremenu. */
export function readMyDayGrouping(): MyDayGroupingValue {
  return read(MY_DAY_GROUPING_KEY) === 'startup' ? 'startup' : 'time';
}

export function writeMyDayGrouping(next: MyDayGroupingValue): void {
  write(MY_DAY_GROUPING_KEY, next);
}

/** Poslednje odredište brzog unosa (P8) — sirov zapis; tumači ga `parseStoredDestination`. */
export function readQuickAddDestinationRaw(): string | null {
  return read(QUICK_ADD_DESTINATION_KEY);
}

export function writeQuickAddDestinationRaw(value: string): void {
  write(QUICK_ADD_DESTINATION_KEY, value);
}

/** Poslednja oblast po startupu (P8). */
export function readQuickAddArea(startupId: string): string | null {
  const value = read(QUICK_ADD_AREA_PREFIX + sanitizeKeyPart(startupId));
  return value === null || value.length === 0 ? null : value;
}

export function writeQuickAddArea(startupId: string, areaId: string): void {
  write(QUICK_ADD_AREA_PREFIX + sanitizeKeyPart(startupId), areaId);
}
