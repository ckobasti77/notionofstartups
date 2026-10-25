import { describe, expect, test } from "vitest";

import { planRoll } from "./number-roll";

describe("planRoll — kotrljanje cifara", () => {
  test("isti broj: ništa se ne kotrlja", () => {
    expect(planRoll(42, 42)).toEqual([
      { key: "d2", from: "4", to: "4", animate: false, enterFromPercent: 0, exitToPercent: 0 },
      { key: "d1", from: "2", to: "2", animate: false, enterFromPercent: 0, exitToPercent: 0 },
    ]);
  });

  test("rast: kotrlja se samo cifra koja se menja, nova ulazi odozdo", () => {
    const slots = planRoll(41, 42);
    expect(slots[0]).toMatchObject({ key: "d2", animate: false });
    expect(slots[1]).toEqual({ key: "d1", from: "1", to: "2", animate: true, enterFromPercent: 100, exitToPercent: -100 });
  });

  test("pad: nova cifra ulazi odozgo, stara izlazi nadole", () => {
    expect(planRoll(5, 4)).toEqual([
      { key: "d1", from: "5", to: "4", animate: true, enterFromPercent: -100, exitToPercent: 100 },
    ]);
  });

  test("9 → 10: dodaje se pozicija desetica (ulazi iz praznog)", () => {
    expect(planRoll(9, 10)).toEqual([
      { key: "d2", from: null, to: "1", animate: true, enterFromPercent: 100, exitToPercent: -100 },
      { key: "d1", from: "9", to: "0", animate: true, enterFromPercent: 100, exitToPercent: -100 },
    ]);
  });

  test("10 → 9: pozicija desetica izlazi i ostaje bez cifre", () => {
    const slots = planRoll(10, 9);
    expect(slots[0]).toEqual({ key: "d2", from: "1", to: null, animate: true, enterFromPercent: -100, exitToPercent: 100 });
    expect(slots[1]).toMatchObject({ key: "d1", from: "0", to: "9", animate: true });
  });

  test("preko granice: 99 → 100 daje 99+, a 120 → 130 se ne kotrlja", () => {
    const slots = planRoll(99, 100);
    expect(slots.map((slot) => slot.to).join("")).toBe("99+");
    expect(planRoll(120, 130).every((slot) => !slot.animate)).toBe(true);
  });

  test("ključevi su stabilni po poziciji sa desna", () => {
    expect(planRoll(7, 1234, 9999).map((slot) => slot.key)).toEqual(["d4", "d3", "d2", "d1"]);
  });

  test("nema −0 u pomerajima (stabilno poređenje i data atributi)", () => {
    for (const slot of planRoll(3, 3)) {
      expect(Object.is(slot.enterFromPercent, 0)).toBe(true);
      expect(Object.is(slot.exitToPercent, 0)).toBe(true);
    }
  });
});
