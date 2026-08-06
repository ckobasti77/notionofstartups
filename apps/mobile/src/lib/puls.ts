/**
 * Nedeljne granice, oznake i trendovi za ekran „Puls" — mobilni port
 * `apps/web/lib/puls.ts`. Datum-primitivi (`localWeekStart`, `addWeeks`,
 * `isCurrentWeek`, trendovi) su 1:1 sa webom; jedina razlika je što se meseci
 * formatiraju ručno (bez `Intl`, koji Hermes ne garantuje) preko
 * `SR_MONTHS_SHORT` iz `task-meta`.
 *
 * Ogledalo: `apps/web/lib/puls.ts`.
 */
import { daysWord } from '@/lib/deadline';
import { SR_MONTHS_SHORT } from '@/lib/task-meta';

/**
 * Nedelja teče od ponedeljka 00:00 po lokalnoj zoni. Granice računa klijent i
 * prosleđuje ih serveru — pregled tako odgovara danu koji korisnik zaista vidi.
 */
export function localWeekStart(reference: number = Date.now()): number {
  const date = new Date(reference);
  const isoWeekday = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - isoWeekday);
  return date.getTime();
}

export function normalizeToLocalWeekStart(timestamp: number): number {
  return localWeekStart(timestamp);
}

/** Pomera nedelju preko `setDate`, pa nedelje sa 23 ili 25 sati ostaju tačne. */
export function addWeeks(weekStart: number, delta: number): number {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + delta * 7);
  return date.getTime();
}

export function isCurrentWeek(weekStart: number, now: number = Date.now()): boolean {
  return weekStart === localWeekStart(now);
}

/** „12–18. maj 2026", preko meseca „28. apr – 4. maj 2026". */
export function formatWeekLabel(weekStart: number, weekEnd: number): string {
  const start = new Date(weekStart);
  const end = new Date(weekEnd - 1);
  const startMonth = SR_MONTHS_SHORT[start.getMonth()];
  const endMonth = SR_MONTHS_SHORT[end.getMonth()];
  const endYear = end.getFullYear();

  if (start.getFullYear() !== endYear) {
    return `${start.getDate()}. ${startMonth} ${start.getFullYear()} – ${end.getDate()}. ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${start.getDate()}. ${startMonth} – ${end.getDate()}. ${endMonth} ${endYear}`;
  }
  return `${start.getDate()}–${end.getDate()}. ${startMonth} ${endYear}`;
}

/** „stoji 5 dana" — koliko dugo zadatak nije pomeren. */
export function formatDaysStanding(elapsedMs: number): string {
  const days = Math.max(1, Math.floor(elapsedMs / 86_400_000));
  return `${days} ${daysWord(days)}`;
}

export type Trend = { current: number; previous: number };

export type TrendDirection = 'up' | 'down' | 'flat';

export function trendDirection(trend: Trend): TrendDirection {
  if (trend.current > trend.previous) return 'up';
  if (trend.current < trend.previous) return 'down';
  return 'flat';
}

export function trendDelta(trend: Trend): number {
  return trend.current - trend.previous;
}
