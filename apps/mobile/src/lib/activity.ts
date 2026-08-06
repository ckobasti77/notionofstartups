/**
 * Grupisanje aktivnosti po danu i formatiranje vremena za ekran „Aktivnost".
 * Bez `Intl` (Hermes ga ne garantuje) — meseci se pišu ručno. Poređenje po danu
 * ide preko lokalne ponoći (`startOfLocalDay`), isto kao tab „Danas".
 */
import type { FunctionReturnType } from 'convex/server';

import type { api } from '@/convex/_generated/api';
import { startOfLocalDay } from '@/lib/deadline';

/** Jedan red aktivnosti iz `activity.listPaginated` (sa zakačenim akterom). */
export type ActivityItem =
  FunctionReturnType<typeof api.activity.listPaginated>['page'][number];

/** Aktivnosti jednog dana, u redosledu u kom su stigle (najnovije prvo). */
export type ActivityDaySection = {
  /** Stabilan string ključ za `SectionList` (rezervisano polje `key`). */
  key: string;
  /** Ponoć dana — za poređenje pri grupisanju. */
  dayStart: number;
  title: string;
  data: ActivityItem[];
};

const SR_MONTHS_LONG = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
];

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** „14:22" — vreme jedne aktivnosti (dan nosi zaglavlje sekcije). */
export function formatActivityTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Naslov sekcije dana: „Danas" / „Juče", inače „7. avgust" (uz godinu kada nije
 * tekuća). `dayStart` je već lokalna ponoć dana.
 */
export function formatDayHeading(dayStart: number, now: number): string {
  const today = startOfLocalDay(now);
  const oneDay = 86_400_000;
  if (dayStart === today) return 'Danas';
  if (dayStart === today - oneDay) return 'Juče';

  const date = new Date(dayStart);
  const base = `${date.getDate()}. ${SR_MONTHS_LONG[date.getMonth()]}`;
  return date.getFullYear() === new Date(now).getFullYear()
    ? base
    : `${base} ${date.getFullYear()}`;
}

/**
 * Deli hronološku (opadajuću) listu na sekcije po danu, čuvajući redosled.
 * Pretpostavlja da su ulazi već sortirani najnovije-prvo (kako stiže sa servera).
 */
export function groupActivitiesByDay(
  items: readonly ActivityItem[],
  now: number,
): ActivityDaySection[] {
  const sections: ActivityDaySection[] = [];
  let current: ActivityDaySection | null = null;

  for (const item of items) {
    const dayStart = startOfLocalDay(item.createdAt);
    if (current === null || current.dayStart !== dayStart) {
      current = {
        key: String(dayStart),
        dayStart,
        title: formatDayHeading(dayStart, now),
        data: [],
      };
      sections.push(current);
    }
    current.data.push(item);
  }

  return sections;
}
