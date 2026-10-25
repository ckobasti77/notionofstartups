import { describe, expect, test } from "vitest";
import {
  DURATION,
  REDUCED_FADE_MS,
  SPRING,
  SPRING_NAMES,
  sampleSpring,
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
  springLinearEasing,
  springTween,
  STANDARD_EASE,
  standardCubicBezier,
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

describe("CSS krive za tuđe animacije (sonner, K19)", () => {
  /** "linear(0, 0.12 2.5%, …, 1)" → [[x, procenat|null], …]. */
  function stops(easing: string): Array<[number, number | null]> {
    const body = easing.replace(/^linear\(/, "").replace(/\)$/, "");
    return body.split(", ").map((stop) => {
      const [value, percent] = stop.split(" ");
      return [Number(value), percent === undefined ? null : Number(percent.replace("%", ""))];
    });
  }

  test("spring kao linear(): počinje u 0, završava tačno u 1, procenti rastu", () => {
    for (const name of SPRING_NAMES) {
      const parsed = stops(springLinearEasing(name));
      expect(parsed[0]).toEqual([0, null]);
      expect(parsed.at(-1)).toEqual([1, null]);
      const percents = parsed.slice(1, -1).map(([, percent]) => percent ?? Number.NaN);
      for (let index = 1; index < percents.length; index += 1) {
        expect(percents[index]).toBeGreaterThan(percents[index - 1]);
      }
      expect(Math.min(...percents)).toBeGreaterThan(0);
      expect(Math.max(...percents)).toBeLessThan(100);
    }
  });

  test("tačke su iste kao shared kriva (isti spring na GSAP-u i u CSS-u)", () => {
    const samples = 40;
    const parsed = stops(springLinearEasing("snappy", samples));
    const reference = sampleSpring(SPRING.snappy, samples);
    expect(parsed).toHaveLength(reference.length);
    reference.slice(1, -1).forEach(([t, x], index) => {
      const [value, percent] = parsed[index + 1];
      expect(value).toBeCloseTo(x, 3);
      expect(percent).toBeCloseTo(t * 100, 2);
    });
  });

  test("bouncy prelazi 1 (odskok), smooth nikad", () => {
    const peak = (name: "bouncy" | "smooth") => Math.max(...stops(springLinearEasing(name)).map(([value]) => value));
    expect(peak("bouncy")).toBeGreaterThan(1);
    expect(peak("smooth")).toBeLessThanOrEqual(1);
  });

  test("standardna kriva kao cubic-bezier iz shared brojeva", () => {
    expect(standardCubicBezier()).toBe(`cubic-bezier(${STANDARD_EASE_BEZIER.join(", ")})`);
  });
});
