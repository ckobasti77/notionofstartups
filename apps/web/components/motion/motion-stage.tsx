"use client";

import { useRef, type ReactNode } from "react";
import { ENTER_OFFSET_PX } from "@devotion/shared";

import {
  listStagger,
  reducedFade,
  springTween,
  standardTween,
  useGsap,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

export const STAGE_ENTER_SELECTOR = "[data-workspace-enter]";

type MotionStageProps = {
  children: ReactNode;
  /** Ključ prikaza; promena ponovo pušta ulaz. */
  viewKey: string;
  /** Prikaz sam upravlja skrolom (kanvas, chat). */
  contained?: boolean;
  /** Smer kretanja kroz opseg: −1 nazad, 1 napred, 0 ulaz nagore. */
  direction?: -1 | 0 | 1;
  /** `main` u ljusci; `div` kad je pozornica ugnežđena (izlog). */
  as?: "main" | "div";
  className?: string;
};

/**
 * Prelaz prikaza (zamenjuje `WorkspaceStage`, isti ugovor): elementi sa
 * `data-workspace-enter` ulaze fade-om i pomerajem od 8 px (`gentle` spring,
 * stagger 24 ms). Sa `direction` ulaze bočno u smeru kretanja. Smanjen
 * pokret: samo neprozirnost 120 ms, bez pomeranja i stagger-a.
 */
export function MotionStage({
  children,
  viewKey,
  contained = false,
  direction = 0,
  as = "main",
  className,
}: MotionStageProps) {
  // `main` i `div` dele ref; koriste se samo zajednički HTMLElement API-ji.
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    ref,
    ({ gsap, reduced }) => {
      const root = ref.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(STAGE_ENTER_SELECTOR));
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
          ...standardTween("base"),
          stagger: listStagger,
          clearProps: "opacity,visibility",
        },
      );
      gsap.fromTo(
        items,
        { x: direction * ENTER_OFFSET_PX, y: direction === 0 ? ENTER_OFFSET_PX : 0 },
        { x: 0, y: 0, ...springTween("gentle"), stagger: listStagger, clearProps: "transform" },
      );
    },
    [viewKey, direction],
  );

  const classes = cn(
    contained ? "min-h-0 flex-1 overflow-hidden" : "scrollbar-thin min-h-0 flex-1 overflow-y-auto",
    // Bočni ulaz (±8 px) ne sme da napravi horizontalni skrol.
    direction !== 0 && !contained && "overflow-x-clip",
    className,
  );
  return as === "div" ? (
    <div ref={ref} className={classes}>
      {children}
    </div>
  ) : (
    <main ref={ref} className={classes}>
      {children}
    </main>
  );
}
