import { describe, expect, test } from "vitest";

import { msUntilNextDay, nextToday, todayOf } from "./today";

const ZONE = "Europe/Belgrade";
// 24.10.2026. 23:59:30 i 25.10.2026. 00:00:30 u Beogradu (letnje vreme, UTC+2).
const BEFORE_MIDNIGHT = Date.UTC(2026, 9, 24, 21, 59, 30);
const AFTER_MIDNIGHT = Date.UTC(2026, 9, 24, 22, 0, 30);

describe("današnji dan za lični nivo", () => {
  test("dayKey i doneSince su lokalni dan i lokalna ponoć", () => {
    const today = todayOf(BEFORE_MIDNIGHT, ZONE);
    expect(today.dayKey).toBe("2026-10-24");
    expect(today.doneSince).toBe(Date.UTC(2026, 9, 23, 22, 0, 0));
    expect(today.now).toBe(BEFORE_MIDNIGHT);
  });

  test("do ponoći ostaje tačno koliko treba, najmanje 1 s", () => {
    expect(msUntilNextDay(BEFORE_MIDNIGHT, ZONE)).toBe(30_000);
    expect(msUntilNextDay(Date.UTC(2026, 9, 24, 21, 59, 59, 900), ZONE)).toBe(1_000);
  });

  test("isti dan u istom minutu vraća isti objekat (stabilni argumenti upita)", () => {
    const first = todayOf(BEFORE_MIDNIGHT - 20_000, ZONE);
    expect(nextToday(first, BEFORE_MIDNIGHT, ZONE)).toBe(first);
  });

  test("posle ponoći ili posle minuta nastaje novi dan, odnosno novo „sada“", () => {
    const first = todayOf(BEFORE_MIDNIGHT, ZONE);
    const afterMidnight = nextToday(first, AFTER_MIDNIGHT, ZONE);
    expect(afterMidnight).not.toBe(first);
    expect(afterMidnight.dayKey).toBe("2026-10-25");
    const earlier = todayOf(BEFORE_MIDNIGHT - 600_000, ZONE);
    const later = nextToday(earlier, BEFORE_MIDNIGHT - 500_000, ZONE);
    expect(later).not.toBe(earlier);
    expect(later.dayKey).toBe("2026-10-24");
    expect(later.now).toBe(BEFORE_MIDNIGHT - 500_000);
  });
});
