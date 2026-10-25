"use client";

import type { RefObject } from "react";
import { ENTER_OFFSET_PX, SCALE } from "@devotion/shared";

import { listStagger, reducedFade, springTween, standardTween } from "./eases";
import { useGsap } from "./use-gsap";

export const ENTER_SELECTOR = "[data-motion-enter]";

/**
 * Ulaz liste (PLAN §6, tačka 8): fade + 8 px nagore + scale 0.98 → 1, 24 ms
 * stagger (najviše 6 stavki kasni). Ponovo se pušta kad se promeni `key`.
 * Smanjen pokret: samo neprozirnost, bez stagger-a.
 */
export function useEnter(
  scope: RefObject<HTMLElement | null>,
  { selector = ENTER_SELECTOR, key }: { selector?: string; key: unknown },
): void {
  useGsap(
    scope,
    ({ gsap, reduced }) => {
      const root = scope.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(selector));
      if (items.length === 0) return;
      if (reduced) {
        gsap.fromTo(
          items,
          { autoAlpha: 0 },
          { autoAlpha: 1, ...reducedFade(), clearProps: "opacity,visibility" },
        );
        return;
      }
      gsap.fromTo(
        items,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          ...standardTween("quick"),
          stagger: listStagger,
          clearProps: "opacity,visibility",
        },
      );
      gsap.fromTo(
        items,
        { y: ENTER_OFFSET_PX, scale: SCALE.enterFrom },
        { y: 0, scale: 1, ...springTween("snappy"), stagger: listStagger, clearProps: "transform" },
      );
    },
    [key, selector],
  );
}
