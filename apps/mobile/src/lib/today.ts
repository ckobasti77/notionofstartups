/**
 * Današnji dan za lični nivo — ČISTO (vitest), par web `apps/web/lib/today.ts`.
 * Upiti ne čitaju sat: klijent šalje `dayKey` (lokalni dan) i `doneSince`
 * (lokalna ponoć), a argumenti moraju ostati isti ceo dan da se Convex
 * pretplata ne obnavlja na svaki render (plan K07, E3).
 */
import { dayKeyOf, nextLocalMidnight, startOfDay, type DayKey } from '@devotion/shared';

export type Today = {
  /** Trenutak poslednjeg osvežavanja (ms) — za oznake rokova i pozdrav. */
  now: number;
  dayKey: DayKey;
  /** Lokalna ponoć današnjeg dana (ms) — `myDay.overview.doneSince`. */
  doneSince: number;
};

export function todayOf(now: number, zone?: string): Today {
  return { now, dayKey: dayKeyOf(now, zone), doneSince: startOfDay(now, zone) };
}

/** Koliko ms do sledeće lokalne ponoći (najmanje 1 s, da tajmer ne „vrti"). */
export function msUntilNextDay(now: number, zone?: string): number {
  return Math.max(1_000, nextLocalMidnight(now, zone) - now);
}

/**
 * Isti dan i svež sat → isti objekat (pretplata ostaje); novi dan ili sat
 * stariji od minut → novi objekat (rokovi „danas/sutra" se preračunaju).
 */
export function nextToday(previous: Today, now: number, zone?: string): Today {
  const next = todayOf(now, zone);
  return next.dayKey === previous.dayKey && now - previous.now < 60_000 ? previous : next;
}
