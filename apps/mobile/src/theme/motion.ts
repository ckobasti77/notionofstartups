import {
  DURATION,
  ENTER_OFFSET_PX,
  LONG_PRESS_MS,
  reanimatedSpring,
  REDUCED_FADE_MS,
  SCALE,
  SPRING,
  STAGGER,
  STANDARD_EASE_BEZIER,
  staggerDelayMs,
  SWIPE,
  type SpringName,
} from '@devotion/shared';
import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/**
 * Motion tokeni — mali rečnik, jer je pokret u ovoj aplikaciji suzdržan.
 *
 * PRAVILA (docs/mobile/02-EKRANI.md §11 + zahtev „nikad dekorativno"):
 *  - Nijedna animacija ne sme da odloži trenutak kad korisnik može da nastavi.
 *    Sve što ulazi kroz `opacity`/`transform` je od prvog frejma dodirljivo.
 *  - Ulaz liste traje UKUPNO najviše 300ms — `STAGGER_STEP × STAGGER_MAX_INDEX +
 *    duration.item` je tačno toliko.
 *  - Kad je uključeno „smanji pokret" (`useReducedMotion`), ne skraćujemo — gasimo.
 */

/** Trajanja (ms). */
export const duration = {
  /** Izlaz sheet-a, gašenje skeletona — mora biti kraće od ulaza. */
  exit: 160,
  /** Ulazak jedne stavke liste. */
  item: 180,
  /** Crossfade skeleton → sadržaj. */
  swap: 200,
} as const;

/**
 * Spring za sheet = `smooth` iz rečnika (K19; ranije 280/26/0,9): isti spring
 * kao web `Drawer`/`ui/sheet`, kritično prigušen — bez odskoka.
 */
export const SHEET_SPRING = {
  ...reanimatedSpring(SPRING.smooth),
  overshootClamping: false,
} as const;

/** Korak zakašnjenja između susednih stavki liste (ms). */
export const STAGGER_STEP = 30;
/** Posle ove stavke se više ne kasni — inače bi dugačka lista trajala sekundama. */
export const STAGGER_MAX_INDEX = 4;

/** Zakašnjenje za `index`-tu stavku; ukupno ≤ 120 + 180 = 300ms. */
export function staggerDelay(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX_INDEX) * STAGGER_STEP;
}

/** Koliko stavka „doputuje" nagore pri ulasku (px). Namerno malo. */
export const STAGGER_TRAVEL = 8;

/** Zatamnjenje backdrop-a ispod sheet-a na punom otvaranju. */
export const BACKDROP_OPACITY = 0.5;

/* ── Rečnik ličnog nivoa (K09) — brojevi ISKLJUČIVO iz `@devotion/shared` ──
 *
 * Isti brojevi kao web GSAP (`apps/web/lib/motion/`), samo prevedeni u
 * Reanimated: spring zadat kao response/dampingRatio postaje
 * stiffness/damping/mass (`reanimatedSpring`). K19 je uskladio `SHEET_SPRING`
 * (= `smooth`); ostali exporti iznad (`duration`, `STAGGER_*`) i dalje hrane
 * `StaggerItem`/`LoadingSwap` na ekranima van obima K19 — novi kod koristi ovo
 * ispod (vidi ODLUKE K19 u `docs/LICNO-PROGRESS.md`).
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

/** Isti spring sa početnom brzinom prsta (predaja gesta animaciji, bez šava). */
export function springWithVelocity(name: SpringName, velocity: number): WithSpringConfig {
  return { ...SPRINGS[name], velocity };
}

/**
 * Spring ili ništa: pri smanjenom pokretu `null` — pozivalac tada radi samo
 * neprozirnost kroz `REDUCED_FADE` (pravilo: smanjen pokret = samo opacity).
 */
export function springFor(name: SpringName, reduced: boolean): WithSpringConfig | null {
  return reduced ? null : SPRINGS[name];
}

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

export { LONG_PRESS_MS, REDUCED_FADE_MS, STAGGER as LIST_STAGGER, staggerDelayMs, SWIPE };
