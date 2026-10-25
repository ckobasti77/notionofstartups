"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

type CollapseProps = {
  open: boolean;
  children: ReactNode;
  /** Za `aria-controls` na dugmetu koje otvara/zatvara. */
  id?: string;
  className?: string;
  /**
   * Zatvoren sadržaj se demontira (posle izlaza), a montira se tek pri
   * otvaranju — za sadržaj koji sam pokreće upite (stablo stranica, skupljena
   * zona), pa zatvoren ne plaća ništa. Podrazumevano ostaje montiran.
   */
  unmountWhenClosed?: boolean;
};

/**
 * Sklopiva sekcija: visina ide kroz GSAP (`height: auto` je dozvoljen samo
 * ovde i u Flip-u). Otvaranje `smooth` spring, zatvaranje brže (`base`).
 * Prekidivo: nova promena kreće od trenutne visine. Zatvoren sadržaj je
 * `inert` (van tastature i čitača ekrana). Smanjen pokret: visina se menja
 * odmah, sadržaj se samo pojavi kroz neprozirnost.
 */
export function Collapse({ open, children, id, className, unmountWhenClosed = false }: CollapseProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const settled = useRef<boolean | null>(null);
  const play = useTweenSlots();
  // Sadržaj ostaje u DOM-u dok traje zatvaranje (izvedeno stanje, bez efekta).
  const [mounted, setMounted] = useState(open || !unmountWhenClosed);
  if (open && !mounted) setMounted(true);
  // Sa `unmountWhenClosed` sadržaj se pri zatvaranju „zamrzne" kakav je bio
  // otvoren: roditelj često tada gasi upit (stablo), pa bi se usred izlaza
  // pojavio prazan red ili spiner umesto stranica koje se sklapaju.
  const [held, setHeld] = useState<ReactNode>(children);
  if (open && held !== children) setHeld(children);
  const content = open || !unmountWhenClosed ? children : held;

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
    const unmount = () => {
      if (unmountWhenClosed) setMounted(false);
    };

    play("height", ({ gsap, reduced }) => {
      if (reduced) {
        gsap.set(outer, { clearProps: "height,overflow" });
        if (!open) {
          unmount();
          return null;
        }
        return gsap.fromTo(inner, { opacity: 0 }, { opacity: 1, ...reducedFade(), clearProps: "opacity" });
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
          onComplete: open ? undefined : unmount,
        },
      );
    });

    // Sadržaj koji stiže posle otvaranja (stablo čeka svoj upit): dok otvaranje
    // traje, cilj prati stvarnu visinu — spring kreće od trenutne visine, bez
    // odsecanja i bez skoka na kraju.
    if (!open || typeof ResizeObserver === "undefined") return;
    let target = inner.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (!outer.style.height) {
        observer.disconnect();
        return;
      }
      const next = inner.offsetHeight;
      if (next === target) return;
      target = next;
      play("height", ({ gsap, reduced }) =>
        reduced
          ? null
          : gsap.to(outer, {
              height: next,
              ...springTween("smooth"),
              clearProps: "height,overflow",
              onComplete: () => observer.disconnect(),
            }),
      );
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [open, play, unmountWhenClosed]);

  return (
    <div
      ref={outerRef}
      id={id}
      inert={!open}
      className={cn(open ? undefined : "h-0 overflow-hidden", className)}
    >
      <div ref={innerRef}>{mounted ? content : null}</div>
    </div>
  );
}
