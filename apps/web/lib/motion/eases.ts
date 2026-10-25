/**
 * Prevod rečnika pokreta (`@devotion/shared` motion.ts) u GSAP jezik — ČISTO,
 * bez uvoza `gsap`-a, da bi se testiralo u vitest-u. Registraciju krivih radi
 * `gsap-setup.ts` iz `easeDefinitions()`.
 *
 * Spring na webu = GSAP tween sa `CustomEase` krivom uzorkovanom iz istog
 * springa i trajanjem = vreme smirivanja (PLAN §6, P10).
 */
import {
  DURATION,
  REDUCED_FADE_MS,
  sampleSpring,
  SPRING,
  SPRING_NAMES,
  springDurationMs,
  springEasePath,
  staggerDelayMs,
  STANDARD_EASE_BEZIER,
  type DurationName,
  type SpringName,
} from "@devotion/shared";

/** Imena `CustomEase` krivih koje `getGsap()` registruje. */
export const SPRING_EASE = {
  snappy: "spring-snappy",
  smooth: "spring-smooth",
  gentle: "spring-gentle",
  bouncy: "spring-bouncy",
} as const satisfies Record<SpringName, string>;

/** Tween put (ease-out) iz `STANDARD_EASE_BEZIER`. */
export const STANDARD_EASE = "devotion-standard";

/** Trajanje tween-a koji crta spring (s) = vreme smirivanja. */
export const SPRING_DURATION_S = Object.fromEntries(
  SPRING_NAMES.map((name) => [name, springDurationMs(SPRING[name]) / 1000]),
) as Record<SpringName, number>;

/** Smanjen pokret: samo neprozirnost, ovoliko (s). */
export const REDUCED_FADE_S = REDUCED_FADE_MS / 1000;

export type EaseDefinition = { name: string; data: string };

/** Sve krive za `CustomEase.create(name, data)`, redom: standard pa springovi. */
export function easeDefinitions(): EaseDefinition[] {
  return [
    { name: STANDARD_EASE, data: STANDARD_EASE_BEZIER.join(",") },
    ...SPRING_NAMES.map((name) => ({
      name: SPRING_EASE[name],
      data: springEasePath(SPRING[name]),
    })),
  ];
}

/** `{ ease, duration }` za GSAP tween koji se ponaša kao spring `name`. */
export function springTween(name: SpringName): { ease: string; duration: number } {
  return { ease: SPRING_EASE[name], duration: SPRING_DURATION_S[name] };
}

/** `{ ease, duration }` za tween put iz `DURATION` (press/quick/base/slow). */
export function standardTween(name: DurationName): { ease: string; duration: number } {
  return { ease: STANDARD_EASE, duration: DURATION[name] / 1000 };
}

/** Smanjen pokret: kratka promena neprozirnosti. */
export function reducedFade(): { ease: string; duration: number } {
  return { ease: STANDARD_EASE, duration: REDUCED_FADE_S };
}

/**
 * Stagger za GSAP (`stagger: listStagger`): 24 ms korak, posle 6. stavke se
 * više ne kasni — ukupno ostaje ispod `STAGGER.maxTotalMs`.
 */
export function listStagger(index: number): number {
  return staggerDelayMs(index) / 1000;
}

// --- CSS (samo gde pokret vodi tuđa biblioteka, npr. sonner toastovi) ------

function cssNumber(value: number) {
  const rounded = Math.round(value * 10_000) / 10_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/**
 * Isti spring kao CSS `linear()` kriva (trajanje = `springDurationMs`). Za
 * elemente koje animira tuđ CSS (sonner): broj i oblik krive ostaju iz rečnika,
 * a element i dalje animira samo jedna biblioteka. Pregledač bez `linear()`
 * odbaci vrednost i ostane na podrazumevanoj krivi.
 */
export function springLinearEasing(name: SpringName, samples = 40): string {
  const points = sampleSpring(SPRING[name], samples);
  const stops = points.map(([t, x], index) =>
    index === 0 || index === points.length - 1 ? cssNumber(x) : `${cssNumber(x)} ${cssNumber(t * 100)}%`,
  );
  return `linear(${stops.join(", ")})`;
}

/** Tween put (`STANDARD_EASE_BEZIER`) kao CSS `cubic-bezier(...)`. */
export function standardCubicBezier(): string {
  return `cubic-bezier(${STANDARD_EASE_BEZIER.join(", ")})`;
}
