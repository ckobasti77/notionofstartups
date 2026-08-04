import { daysWord } from "./deadline";

/**
 * Nedelja teče od ponedeljka 00:00 po lokalnoj zoni korisnika. Granice računa
 * klijent i prosleđuje ih serveru — tako pregled uvek odgovara danu koji
 * korisnik zaista vidi, bez pretpostavki o zoni servera.
 */
export function localWeekStart(reference: Date | number = new Date()) {
  const date = reference instanceof Date ? new Date(reference) : new Date(reference);
  const isoWeekday = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - isoWeekday);
  return date.getTime();
}

export function normalizeToLocalWeekStart(timestamp: number) {
  return localWeekStart(timestamp);
}

/** Pomera nedelju preko `setDate`, pa nedelje sa 23 ili 25 sati ostaju tačne. */
export function addWeeks(weekStart: number, delta: number) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + delta * 7);
  return date.getTime();
}

export function isCurrentWeek(weekStart: number, now: number = Date.now()) {
  return weekStart === localWeekStart(now);
}

const MONTH_FORMAT = new Intl.DateTimeFormat("sr-Latn-RS", { month: "short" });

/** „12–18. maj 2026”, preko meseca „28. apr – 4. maj 2026”. */
export function formatWeekLabel(weekStart: number, weekEnd: number) {
  const start = new Date(weekStart);
  const end = new Date(weekEnd - 1);
  const startMonth = MONTH_FORMAT.format(start);
  const endMonth = MONTH_FORMAT.format(end);
  const endYear = end.getFullYear();

  if (start.getFullYear() !== endYear) {
    return `${start.getDate()}. ${startMonth} ${start.getFullYear()} – ${end.getDate()}. ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${start.getDate()}. ${startMonth} – ${end.getDate()}. ${endMonth} ${endYear}`;
  }
  return `${start.getDate()}–${end.getDate()}. ${startMonth} ${endYear}`;
}

/** „stoji 5 dana” — koliko dugo zadatak nije pomeren. */
export function formatDaysStanding(elapsedMs: number) {
  const days = Math.max(1, Math.floor(elapsedMs / 86_400_000));
  return `${days} ${daysWord(days)}`;
}

export type Trend = { current: number; previous: number };

export type TrendDirection = "up" | "down" | "flat";

export function trendDirection(trend: Trend): TrendDirection {
  if (trend.current > trend.previous) return "up";
  if (trend.current < trend.previous) return "down";
  return "flat";
}

export function trendDelta(trend: Trend) {
  return trend.current - trend.previous;
}
