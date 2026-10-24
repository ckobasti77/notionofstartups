"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

type CollapseProps = {
  open: boolean;
  children: ReactNode;
  /** Za `aria-controls` na dugmetu koje otvara/zatvara. */
  id?: string;
  className?: string;
};

/**
 * Sklopiva sekcija: visina ide kroz GSAP (`height: auto` je dozvoljen samo
 * ovde i u Flip-u). Otvaranje `smooth` spring, zatvaranje brže (`base`).
 * Prekidivo: nova promena kreće od trenutne visine. Zatvoren sadržaj je
 * `inert` (van tastature i čitača ekrana). Smanjen pokret: visina se menja
 * odmah, sadržaj se samo pojavi kroz neprozirnost.
 */
export function Collapse({ open, children, id, className }: CollapseProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const settled = useRef<boolean | null>(null);
  const play = useTweenSlots();

  useLayoutEffect(() => {
    if (settled.current === null) {
      settled.current = open;
      return;
    }
    if (settled.current === open) return;
    settled.current = open;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    play("height", ({ gsap, reduced }) => {
      if (reduced) {
        gsap.set(outer, { clearProps: "height,overflow" });
        return open ? gsap.fromTo(inner, { opacity: 0 }, { opacity: 1, ...reducedFade(), clearProps: "opacity" }) : null;
      }
      // Ako je prethodna animacija prekinuta, njena visina je još u stilu.
      const current = outer.style.height ? outer.getBoundingClientRect().height : open ? 0 : inner.offsetHeight;
      return gsap.fromTo(
        outer,
        { height: current, overflow: "hidden" },
        {
          height: open ? inner.offsetHeight : 0,
          ...(open ? springTween("smooth") : standardTween("base")),
          clearProps: "height,overflow",
        },
      );
    });
  }, [open, play]);

  return (
    <div
      ref={outerRef}
      id={id}
      inert={!open}
      className={cn(open ? undefined : "h-0 overflow-hidden", className)}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
