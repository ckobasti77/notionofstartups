"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type DependencyList,
  type RefObject,
} from "react";
import type { gsap as Gsap } from "gsap";

import { getGsap } from "./gsap-setup";
import { prefersReducedMotion, useReducedMotion } from "./reduced-motion";

export type MotionApi = {
  gsap: typeof Gsap;
  /** `prefers-reduced-motion: reduce` — samo neprozirnost, bez pomeranja. */
  reduced: boolean;
};

export type DeclarativeMotionApi = MotionApi & {
  /**
   * Omotava rukovaoce događaja tako da animacije koje naprave pripadnu
   * kontekstu i očiste se sa njim.
   */
  contextSafe: <Args extends unknown[]>(
    handler: (...args: Args) => void,
  ) => (...args: Args) => void;
};

/**
 * Deklarativna animacija vezana za `deps` (ulaz prikaza, ulaz liste).
 * `gsap.context()` ograničen na `scope` pusti `setup` sa `reduced` granom
 * (stanje dolazi iz jednog globalnog `gsap.matchMedia()`, vidi gsap-setup) i
 * sve vrati (`revert`) pri promeni `deps`, promeni podešavanja smanjenog
 * pokreta i unmount-u.
 */
export function useGsap(
  scope: RefObject<HTMLElement | null>,
  setup: (api: DeclarativeMotionApi) => void | (() => void),
  deps: DependencyList,
): void {
  // Hook samo okida ponovno pokretanje kad se podešavanje promeni; vrednost se
  // čita u efektu (pri hidraciji hook još vraća serversku vrednost `false`).
  const reducedSetting = useReducedMotion();
  useLayoutEffect(() => {
    const root = scope.current;
    if (!root) return;
    const gsap = getGsap();
    const context = gsap.context((_self, contextSafe) => {
      const safe = <Args extends unknown[]>(handler: (...args: Args) => void) =>
        contextSafe ? (contextSafe(handler) as (...args: Args) => void) : handler;
      return setup({ gsap, reduced: prefersReducedMotion(), contextSafe: safe });
    }, root);
    return () => context.revert();
    // `deps` je ugovor pozivaoca (kao kod useEffect) + promena smanjenog
    // pokreta; `scope` i `setup` se čitaju iz poslednjeg rendera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reducedSetting]);
}

// Globalni GSAP namespace (tipovi paketa ga deklarišu globalno).
type Animation = gsap.core.Animation;

/**
 * Imperativni, prekidivi tween-ovi (promena stanja, rukovaoci). Svaki ključ
 * ima najviše jednu živu animaciju: nova ubija prethodnu tamo gde je stala,
 * pa sledeća kreće od trenutne vrednosti na ekranu. Sve se ubija na unmount-u.
 */
export function useTweenSlots(): (
  key: string,
  factory: (api: MotionApi) => Animation | null | void,
) => void {
  const slotsRef = useRef<Map<string, Animation> | null>(null);

  useLayoutEffect(() => {
    const slots = new Map<string, Animation>();
    slotsRef.current = slots;
    return () => {
      slots.forEach((animation) => animation.kill());
      slots.clear();
      slotsRef.current = null;
    };
  }, []);

  return useCallback((key, factory) => {
    const slots = slotsRef.current;
    slots?.get(key)?.kill();
    const animation = factory({ gsap: getGsap(), reduced: prefersReducedMotion() });
    if (!slots) {
      animation?.kill();
      return;
    }
    if (animation) slots.set(key, animation);
    else slots.delete(key);
  }, []);
}
