"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { SCALE, type SpringName } from "@devotion/shared";

import { springTween, standardTween } from "./eases";
import { Flip, getGsap } from "./gsap-setup";
import { prefersReducedMotion } from "./reduced-motion";
import { useTweenSlots } from "./use-gsap";

export const FLIP_SELECTOR = "[data-flip-id]";

/**
 * Promena rasporeda kroz GSAP Flip: `capture()` pre promene stanja (npr. u
 * rukovaocu klika, pre `setState`), a posle sledećeg commit-a elementi
 * doputuju sa starog mesta na novo (`snappy` spring). Novi elementi ulaze
 * fade-om. Elementi se uparuju po `data-flip-id`.
 * Smanjen pokret: nema Flip-a, raspored se menja odmah.
 */
export function useFlip(
  scope: RefObject<HTMLElement | null>,
  { selector = FLIP_SELECTOR, spring = "snappy" }: { selector?: string; spring?: SpringName } = {},
): { capture: () => void } {
  const pending = useRef<Flip.FlipState | null>(null);
  const play = useTweenSlots();

  // Poziva se iz rukovaoca (ne u renderu), pa ref sme da se čita.
  const capture = () => {
    const root = scope.current;
    if (!root || prefersReducedMotion()) return;
    getGsap();
    pending.current = Flip.getState(root.querySelectorAll(selector));
  };

  // Bez niza zavisnosti: proverava posle svakog commit-a da li čeka snimak.
  useLayoutEffect(() => {
    const state = pending.current;
    const root = scope.current;
    if (!state || !root) return;
    pending.current = null;
    play("flip", ({ gsap, reduced }) => {
      if (reduced) return null;
      return Flip.from(state, {
        targets: root.querySelectorAll(selector),
        ...springTween(spring),
        nested: true,
        simple: true,
        prune: true,
        onEnter: (elements) =>
          gsap.fromTo(
            elements,
            { autoAlpha: 0, scale: SCALE.enterFrom },
            { autoAlpha: 1, scale: 1, ...standardTween("base"), clearProps: "opacity,visibility,transform" },
          ),
      });
    });
  });

  return { capture };
}
