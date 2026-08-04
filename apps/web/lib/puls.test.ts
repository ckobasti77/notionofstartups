import { describe, expect, test } from "vitest";

import {
  addWeeks,
  formatDaysStanding,
  formatWeekLabel,
  isCurrentWeek,
  localWeekStart,
  normalizeToLocalWeekStart,
  trendDelta,
  trendDirection,
} from "./puls";

function local(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

describe("granice nedelje", () => {
  test("nedelja počinje u ponedeljak 00:00 lokalno", () => {
    // 29. jul 2026. je sreda → nedelja počinje u ponedeljak 27.
    expect(localWeekStart(local(2026, 7, 29))).toBe(local(2026, 7, 27, 0));
    // Nedelja (dan) pripada nedelji koja je počela prethodnog ponedeljka.
    expect(localWeekStart(local(2026, 8, 2, 23))).toBe(local(2026, 7, 27, 0));
    // Ponedeljak sam sebi je početak.
    expect(localWeekStart(local(2026, 7, 27, 0))).toBe(local(2026, 7, 27, 0));
  });

  test("normalizacija bilo kog trenutka daje njegov ponedeljak", () => {
    expect(normalizeToLocalWeekStart(local(2026, 7, 31, 18))).toBe(
      local(2026, 7, 27, 0),
    );
  });

  test("addWeeks radi u oba smera i preko meseca", () => {
    const start = local(2026, 7, 27, 0);
    expect(addWeeks(start, 1)).toBe(local(2026, 8, 3, 0));
    expect(addWeeks(start, -1)).toBe(local(2026, 7, 20, 0));
    expect(addWeeks(start, -4)).toBe(local(2026, 6, 29, 0));
  });

  test("isCurrentWeek prepoznaje tekuću nedelju", () => {
    const now = local(2026, 7, 29);
    expect(isCurrentWeek(local(2026, 7, 27, 0), now)).toBe(true);
    expect(isCurrentWeek(local(2026, 7, 20, 0), now)).toBe(false);
  });
});

describe("oznaka nedelje", () => {
  function labelFor(weekStart: number) {
    return formatWeekLabel(weekStart, addWeeks(weekStart, 1));
  }

  test("unutar istog meseca spaja dane", () => {
    expect(labelFor(local(2026, 5, 11, 0))).toBe("11–17. maj 2026");
  });

  test("preko meseca ispisuje oba meseca", () => {
    expect(labelFor(local(2026, 4, 27, 0))).toBe("27. apr – 3. maj 2026");
  });

  test("preko godine ispisuje obe godine", () => {
    const label = labelFor(local(2025, 12, 29, 0));
    expect(label).toContain("2025");
    expect(label).toContain("2026");
  });
});

describe("trajanje i trend", () => {
  test("formatDaysStanding koristi srpsku pluralizaciju i nikad ne pokazuje nulu", () => {
    expect(formatDaysStanding(0)).toBe("1 dan");
    expect(formatDaysStanding(86_400_000)).toBe("1 dan");
    expect(formatDaysStanding(2 * 86_400_000)).toBe("2 dana");
    expect(formatDaysStanding(5 * 86_400_000)).toBe("5 dana");
    expect(formatDaysStanding(21 * 86_400_000)).toBe("21 dan");
  });

  test("smer i razlika trenda", () => {
    expect(trendDirection({ current: 5, previous: 3 })).toBe("up");
    expect(trendDirection({ current: 2, previous: 6 })).toBe("down");
    expect(trendDirection({ current: 4, previous: 4 })).toBe("flat");
    expect(trendDelta({ current: 5, previous: 3 })).toBe(2);
    expect(trendDelta({ current: 1, previous: 4 })).toBe(-3);
  });
});
