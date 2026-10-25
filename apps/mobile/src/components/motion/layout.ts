import { reanimatedSpring, SPRING } from '@devotion/shared';
import { useCallback, useMemo } from 'react';
import {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  withDelay,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import { FIRST_FILL_WINDOW_MS } from '@/components/ui/stagger';
import { DURATIONS, ENTER, REDUCED_FADE_MS, SPRINGS, staggerDelayMs, STANDARD_EASING } from '@/theme/motion';

/**
 * Layout preseti za liste (plan K01 §7.2, K07 §4.1 #8). Svi poštuju smanjen
 * pokret: tada nema pomeranja, skaliranja ni stagger-a — samo neprozirnost.
 */

/**
 * Promena redosleda / brisanje u listi: redovi „zatvaraju prazninu" springom
 * `snappy`. Smanjen pokret → `undefined` (Reanimated tada samo preskoči).
 */
export function listLayout(reduced: boolean) {
  if (reduced) return undefined;
  const { stiffness, damping, mass } = reanimatedSpring(SPRING.snappy);
  return LinearTransition.springify().stiffness(stiffness).damping(damping).mass(mass);
}

/**
 * Ulaz stavke: fade (`quick`) + 8 px nagore + scale 0,98 → 1 (`snappy`), sa
 * zakašnjenjem po redu (24 ms, kasni najviše prvih 6). Smanjen pokret: samo
 * pretapanje 120 ms, bez zakašnjenja.
 */
export function enterFadeUp(index: number, reduced: boolean): EntryExitAnimationFunction | FadeIn {
  // `Never`: Reanimated bi pri sistemskom „smanji pokret" preskočio i pretapanje.
  if (reduced) return FadeIn.duration(REDUCED_FADE_MS).reduceMotion(ReduceMotion.Never);
  const delay = staggerDelayMs(index);
  const spring = SPRINGS.snappy;
  const fade = { duration: DURATIONS.quick, easing: STANDARD_EASING };
  const offsetY = ENTER.offsetY;
  const scaleFrom = ENTER.scaleFrom;
  return () => {
    'worklet';
    return {
      initialValues: {
        opacity: 0,
        transform: [{ translateY: offsetY }, { scale: scaleFrom }],
      },
      animations: {
        opacity: withDelay(delay, withTiming(1, fade)),
        transform: [
          { translateY: withDelay(delay, withSpring(0, spring)) },
          { scale: withDelay(delay, withSpring(1, spring)) },
        ],
      },
    };
  };
}

/** Izlaz stavke: samo neprozirnost (`quick`; smanjen pokret 120 ms). */
export function exitFade(reduced: boolean) {
  return FadeOut.duration(reduced ? REDUCED_FADE_MS : DURATIONS.quick).reduceMotion(
    ReduceMotion.Never,
  );
}

/**
 * Koliko dugo posle montiranja stavka još sme da uđe animirano — ista konstanta
 * kao `StaggerGroup`: posle toga je lista „napunjena", a red koji se montira
 * usred skrola ili reaktivnog osvežavanja se prosto pojavi.
 */
export { FIRST_FILL_WINDOW_MS };

/**
 * `entering` za listu: animira samo prvo punjenje (i novo punjenje kad se
 * `resetKey` promeni — filter, grupisanje). Kasnije dodate stavke dobijaju
 * `undefined`, pa ulaze kroz `listLayout` bez stagger-a.
 */
export function useListEntering(reduced: boolean, resetKey?: string | number) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startedAt = useMemo(() => Date.now(), [resetKey]);
  return useCallback(
    (index: number) =>
      Date.now() - startedAt < FIRST_FILL_WINDOW_MS ? enterFadeUp(index, reduced) : undefined,
    [startedAt, reduced],
  );
}
