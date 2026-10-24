import { describe, expect, test } from "vitest";
import {
  DURATION,
  REDUCED_FADE_MS,
  SPRING,
  SPRING_NAMES,
  springDurationMs,
  springEasePath,
  STAGGER,
  STANDARD_EASE_BEZIER,
} from "@devotion/shared";

import {
  easeDefinitions,
  listStagger,
  REDUCED_FADE_S,
  reducedFade,
  SPRING_DURATION_S,
  SPRING_EASE,
  springTween,
  STANDARD_EASE,
  standardTween,
} from "./eases";

describe("krive iz shared springova", () => {
  test("svaki shared spring ima svoju krivu, imena su jedinstvena", () => {
    expect(Object.keys(SPRING_EASE).sort()).toEqual([...SPRING_NAMES].sort());
    const names = easeDefinitions().map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([STANDARD_EASE, ...SPRING_NAMES.map((name) => SPRING_EASE[name])]);
  });

  test("putanja krive je tačno shared springEasePath (bez lokalnih brojeva)", () => {
    for (const name of SPRING_NAMES) {
      const definition = easeDefinitions().find((item) => item.name === SPRING_EASE[name]);
      expect(definition?.data).toBe(springEasePath(SPRING[name]));
      expect(definition?.data.startsWith("M0,0 ")).toBe(true);
      expect(definition?.data.endsWith(" L1,1")).toBe(true);
    }
  });

  test("standardna kriva je cubic-bezier iz STANDARD_EASE_BEZIER", () => {
    const standard = easeDefinitions()[0];
    expect(standard).toEqual({ name: STANDARD_EASE, data: STANDARD_EASE_BEZIER.join(",") });
    expect(standard.data.split(",").map(Number)).toEqual([...STANDARD_EASE_BEZIER]);
  });
});

describe("trajanja", () => {
  test("spring tween traje koliko i smirivanje springa (s)", () => {
    for (const name of SPRING_NAMES) {
      expect(SPRING_DURATION_S[name]).toBe(springDurationMs(SPRING[name]) / 1000);
      expect(springTween(name)).toEqual({ ease: SPRING_EASE[name], duration: springDurationMs(SPRING[name]) / 1000 });
    }
  });

  test("brojevi springova odgovaraju planu K01 (±0,01 s)", () => {
    expect(SPRING_DURATION_S.snappy).toBeCloseTo(0.449, 2);
    expect(SPRING_DURATION_S.smooth).toBeCloseTo(0.617, 2);
    expect(SPRING_DURATION_S.gentle).toBeCloseTo(0.735, 2);
    expect(SPRING_DURATION_S.bouncy).toBeCloseTo(0.741, 2);
  });

  test("tween put koristi DURATION i standardnu krivu", () => {
    expect(standardTween("press")).toEqual({ ease: STANDARD_EASE, duration: DURATION.press / 1000 });
    expect(standardTween("quick").duration).toBe(0.16);
    expect(standardTween("base").duration).toBe(0.24);
    expect(standardTween("slow").duration).toBe(0.38);
  });

  test("smanjen pokret: samo kratka neprozirnost, ≤ 120 ms", () => {
    expect(REDUCED_FADE_S).toBe(REDUCED_FADE_MS / 1000);
    expect(reducedFade()).toEqual({ ease: STANDARD_EASE, duration: 0.12 });
    expect(reducedFade().duration * 1000).toBeLessThanOrEqual(120);
  });
});

describe("stagger liste", () => {
  test("24 ms korak, posle 6. stavke više ne kasni", () => {
    expect(listStagger(0)).toBe(0);
    expect(listStagger(1)).toBeCloseTo(0.024, 6);
    expect(listStagger(5)).toBeCloseTo(0.12, 6);
    expect(listStagger(6)).toBeCloseTo(0.12, 6);
    expect(listStagger(100)).toBeCloseTo(0.12, 6);
  });

  test("ukupan ulaz 100 stavki staje u STAGGER.maxTotalMs", () => {
    const lastStart = Math.max(...Array.from({ length: 100 }, (_, index) => listStagger(index)));
    expect(lastStart * 1000 + DURATION.quick).toBeLessThanOrEqual(STAGGER.maxTotalMs);
  });
});
