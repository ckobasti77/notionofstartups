"use client";

import { useRef, type ReactNode } from "react";
import { ENTER_OFFSET_PX } from "@devotion/shared";

import { reducedFade, springTween, standardTween, useGsap } from "@/lib/motion";
import { cn } from "@/lib/utils";

type ScopeSwapProps = {
  /** Ključ opsega („me" ili id startupa); promena pušta ulaz novog menija. */
  scopeKey: string;
  /** Smer kretanja kroz traku (+1 niže, −1 više, 0 nepoznato). */
  direction: -1 | 0 | 1;
  children: ReactNode;
  className?: string;
};

/**
 * Smena menija pri promeni opsega (PLAN §6, trenutak 2; plan K07 §4.1): novi
 * meni ulazi neprozirnošću (`quick`) i pomerajem od 8 px u smeru kretanja kroz
 * traku (`snappy`). Stari meni nestaje odmah — dva menija nikad nisu u DOM-u
 * istovremeno (fokus, id-jevi). Prvi prikaz bez animacije. Smanjen pokret:
 * samo neprozirnost 120 ms.
 */
export function ScopeSwap({ scopeKey, direction, children, className }: ScopeSwapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previousKey = useRef<string | null>(null);

  useGsap(
    ref,
    ({ gsap, reduced }) => {
      const root = ref.current;
      const previous = previousKey.current;
      previousKey.current = scopeKey;
      if (!root || previous === null || previous === scopeKey) return;
      if (reduced) {
        gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, ...reducedFade(), clearProps: "opacity,visibility" });
        return;
      }
      const sign = direction === 0 ? 1 : direction;
      gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, ...standardTween("quick"), clearProps: "opacity,visibility" });
      gsap.fromTo(root, { y: sign * ENTER_OFFSET_PX }, { y: 0, ...springTween("snappy"), clearProps: "transform" });
    },
    [scopeKey],
  );

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
