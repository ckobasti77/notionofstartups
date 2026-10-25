"use client";

import { useLayoutEffect, useRef } from "react";
import { formatCount } from "@devotion/shared";

import { reducedFade, springTween, useNumberRoll, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

type NumberRollProps = {
  value: number;
  /** Iznad ovoga piše „cap+" (bedž: 99+). */
  cap?: number;
  className?: string;
  /** Tekst za čitač ekrana; podrazumevano sam broj. */
  "aria-label"?: string;
};

/**
 * Broj koji se menja „kotrljanjem" cifara (PLAN §6, tačka 5): cifra koja se
 * menja izlazi u smeru promene, nova ulazi sa suprotne strane (`snappy`).
 * Nepromenjene cifre miruju. Smanjen pokret: samo pretapanje neprozirnošću.
 */
export function NumberRoll({ value, cap = 99, className, "aria-label": ariaLabel }: NumberRollProps) {
  const { slots, version } = useNumberRoll(value, cap);
  const rootRef = useRef<HTMLSpanElement>(null);
  const play = useTweenSlots();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (version === 0 || !root) return;
    play("roll", ({ gsap, reduced }) => {
      const timeline = gsap.timeline();
      for (const slot of root.querySelectorAll<HTMLElement>("[data-roll-slot]")) {
        const enter = slot.querySelector<HTMLElement>("[data-roll-to]");
        const exit = slot.querySelector<HTMLElement>("[data-roll-from]");
        const enterFrom = Number(slot.dataset.enterFrom);
        const exitTo = Number(slot.dataset.exitTo);
        if (reduced) {
          if (enter) timeline.fromTo(enter, { opacity: 0 }, { opacity: 1, ...reducedFade() }, 0);
          if (exit) timeline.to(exit, { opacity: 0, ...reducedFade() }, 0);
          continue;
        }
        if (enter) {
          timeline.fromTo(
            enter,
            { yPercent: enterFrom, opacity: 0 },
            { yPercent: 0, opacity: 1, ...springTween("snappy") },
            0,
          );
        }
        if (exit) timeline.to(exit, { yPercent: exitTo, opacity: 0, ...springTween("snappy") }, 0);
      }
      return timeline;
    });
  }, [version, play]);

  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span ref={rootRef} aria-hidden="true" className="relative inline-flex">
        {slots.map((slot) => {
          const exitOnly = slot.to === null;
          return (
            <span
              key={exitOnly ? `${slot.key}-izlaz` : slot.key}
              data-roll-slot=""
              data-enter-from={slot.enterFromPercent}
              data-exit-to={slot.exitToPercent}
              className={cn(
                "relative inline-grid overflow-hidden",
                // Cifra koja nestaje ne zauzima mesto: broj se odmah skupi.
                exitOnly && "absolute right-full top-0",
              )}
            >
              {slot.animate && slot.from !== null ? (
                <span key={`${version}-od`} data-roll-from="" className="col-start-1 row-start-1">
                  {slot.from}
                </span>
              ) : null}
              {slot.to !== null ? (
                <span
                  key={slot.animate ? `${version}-do` : "mir"}
                  data-roll-to={slot.animate ? "" : undefined}
                  className="col-start-1 row-start-1"
                >
                  {slot.to}
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
      <span className="sr-only">{ariaLabel ?? formatCount(value, cap)}</span>
    </span>
  );
}
