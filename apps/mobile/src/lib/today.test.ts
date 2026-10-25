import { describe, expect, test } from 'vitest';

import { msUntilNextDay, nextToday, todayOf } from './today';

const ZONE = 'Europe/Belgrade';

describe('današnji dan (telefon)', () => {
  test('dan i lokalna ponoć', () => {
    // subota 24.10.2026. 09:30 u Beogradu (CEST, UTC+2)
    const now = Date.UTC(2026, 9, 24, 7, 30);
    expect(todayOf(now, ZONE)).toEqual({
      now,
      dayKey: '2026-10-24',
      doneSince: Date.UTC(2026, 9, 23, 22, 0),
    });
  });

  test('vreme do ponoći, i preko kraja letnjeg vremena (25 h)', () => {
    expect(msUntilNextDay(Date.UTC(2026, 9, 24, 21, 59, 30), ZONE)).toBe(30_000);
    // 25.10.2026. 00:30 CEST → sledeća ponoć je 26.10. 00:00 CET.
    const start = Date.UTC(2026, 9, 24, 22, 30);
    expect(msUntilNextDay(start, ZONE)).toBe(24.5 * 3_600_000);
    // Najmanje 1 s, da tajmer ne „vrti".
    expect(msUntilNextDay(Date.UTC(2026, 9, 24, 21, 59, 59, 999), ZONE)).toBe(1_000);
  });

  test('isti dan i svež sat → isti objekat; novi dan → novi', () => {
    const first = todayOf(Date.UTC(2026, 9, 24, 7, 30), ZONE);
    expect(nextToday(first, first.now + 10_000, ZONE)).toBe(first);
    const stale = nextToday(first, first.now + 61_000, ZONE);
    expect(stale).not.toBe(first);
    expect(stale.dayKey).toBe(first.dayKey);
    const tomorrow = nextToday(first, Date.UTC(2026, 9, 24, 22, 0, 5), ZONE);
    expect(tomorrow.dayKey).toBe('2026-10-25');
  });
});
