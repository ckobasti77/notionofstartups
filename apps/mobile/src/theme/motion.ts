import {
  DURATION,
  ENTER_OFFSET_PX,
  LONG_PRESS_MS,
  reanimatedSpring,
  REDUCED_FADE_MS,
  SCALE,
  SPRING,
  STANDARD_EASE_BEZIER,
  staggerDelayMs,
  SWIPE,
  type SpringName,
} from '@devotion/shared';
import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/**
 * Motion tokeni — mali rečnik, jer je pokret u ovoj aplikaciji suzdržan.
 *
 * PRAVILA (docs/mobile/02-EKRANI.md §11, DIZAJN-SMIRENJE §8):
 *  - Nijedna animacija ne sme da odloži trenutak kad korisnik može da nastavi.
 *    Sve što ulazi kroz `opacity`/`transform` je od prvog frejma dodirljivo.
 *  - Brojevi dolaze ISKLJUČIVO iz `@devotion/shared` (`motion.ts`). Stari lokalni
 *    brojevi (stagger 30 ms / ulaz 180 ms / zamena 200 ms) su uklonjeni u PROSTOR
 *    K21 — ulaz liste je `enterFadeUp`/`useListEntering` (24 ms, ≤ 6 stavki).
 *  - Smanjen pokret (`useReducedMotion`): samo neprozirnost, ≤ `REDUCED_FADE_MS`.
 */

/**
 * Spring za sheet = `smooth` iz rečnika (K19; ranije 280/26/0,9): isti spring
 * kao web `Drawer`/`ui/sheet`, kritično prigušen — bez odskoka.
 */
export const SHEET_SPRING = {
  ...reanimatedSpring(SPRING.smooth),
  overshootClamping: false,
} as const;

/** Zatamnjenje backdrop-a ispod sheet-a na punom otvaranju. */
export const BACKDROP_OPACITY = 0.5;

/* ── Rečnik (LICNO K09, PROSTOR K19/K21) — brojevi ISKLJUČIVO iz `@devotion/shared` ──
 *
 * Isti brojevi kao web GSAP (`apps/web/lib/motion/`), samo prevedeni u
 * Reanimated: spring zadat kao response/dampingRatio postaje
 * stiffness/damping/mass (`reanimatedSpring`).
 */

function toSpring(name: SpringName): WithSpringConfig {
  return { ...reanimatedSpring(SPRING[name]), overshootClamping: false };
}

/** Reanimated springovi: `snappy` UI odgovor, `smooth` sheet/prsten, `gentle` prelaz, `bouncy` samo uspeh. */
export const SPRINGS: Readonly<Record<SpringName, WithSpringConfig>> = {
  snappy: toSpring('snappy'),
  smooth: toSpring('smooth'),
  gentle: toSpring('gentle'),
  bouncy: toSpring('bouncy'),
};

export const DURATIONS = DURATION;
export const PRESS_SCALE = SCALE.press;
export const TAB_BOUNCE_FROM = SCALE.tabBounceFrom;
export const ENTER = { offsetY: ENTER_OFFSET_PX, scaleFrom: SCALE.enterFrom } as const;

/** Tween put (ease-out) — ista kriva kao web `devotion-standard`. */
export const STANDARD_EASING = Easing.bezier(...STANDARD_EASE_BEZIER);

/** Tween sa standardnom krivom za trajanje iz rečnika. */
export function standardTiming(name: keyof typeof DURATION): WithTimingConfig {
  return { duration: DURATION[name], easing: STANDARD_EASING };
}

/**
 * Pretapanje pri smanjenom pokretu. `ReduceMotion.Never` jer Reanimated po
 * podrazumevanom (System) skače na kraj kad je podešavanje uključeno — a
 * pravilo traži kratko pretapanje, ne skok.
 */
export const REDUCED_FADE: WithTimingConfig = {
  duration: REDUCED_FADE_MS,
  reduceMotion: ReduceMotion.Never,
};

export { LONG_PRESS_MS, REDUCED_FADE_MS, staggerDelayMs, SWIPE };
