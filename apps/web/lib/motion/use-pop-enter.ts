"use client";

import { useCallback, type Ref, type RefCallback } from "react";
import { SCALE } from "@devotion/shared";

import { reducedFade, standardTween } from "./eases";
import { getGsap } from "./gsap-setup";
import { prefersReducedMotion } from "./reduced-motion";
import { tweenScaleProperty } from "./scale-property";

/**
 * Ulaz malog sloja (meni, Select, tooltip — PLAN §6, plan K07 §4.2): kad se
 * element zakači u DOM, neprozirnost + scale 0,98 → 1, oba `quick` (bez
 * prebačaja — meni koji odskoči izgleda pogrešno). Raste iz tačke okidača:
 * `transform-origin` zadaje sloj (Radix promenljiva). Izlaz je odmah — Radix
 * demontira sadržaj čim se zatvori, pa ništa ne čeka. Smanjen pokret: samo
 * neprozirnost 120 ms.
 *
 * Vraća stabilan ref callback (React 19 čišćenje): tween-ovi se ubijaju kad
 * element ode. Spoljni `ref` (iz props-a) se poziva sa istim elementom.
 */
export function usePopEnter<T extends HTMLElement>(forwarded?: Ref<T>): RefCallback<T> {
  return useCallback(
    (element: T | null) => {
      const release = assignRef(forwarded, element);
      if (!element) return release;
      const gsap = getGsap();
      const tweens = prefersReducedMotion()
        ? [gsap.fromTo(element, { opacity: 0 }, { opacity: 1, ...reducedFade(), clearProps: "opacity" })]
        : [
            gsap.fromTo(element, { opacity: 0 }, { opacity: 1, ...standardTween("quick"), clearProps: "opacity" }),
            tweenScaleProperty(gsap, element, { from: SCALE.enterFrom, to: 1, ...standardTween("quick") }),
          ];
      return () => {
        tweens.forEach((tween) => tween.kill());
        element.style.removeProperty("scale");
        release?.();
      };
    },
    [forwarded],
  );
}

/** Postavi spoljni ref (funkcija ili objekat); vraća njegovo čišćenje. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): (() => void) | undefined {
  if (!ref) return undefined;
  if (typeof ref === "function") {
    const cleanup = ref(value);
    return typeof cleanup === "function" ? cleanup : () => ref(null);
  }
  ref.current = value;
  return () => {
    ref.current = null;
  };
}
