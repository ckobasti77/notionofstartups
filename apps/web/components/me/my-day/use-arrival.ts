"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { SCALE } from "@devotion/shared";

import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";

/** Više novih stavki odjednom (npr. novi dan) nije „dolazak", nego novo stanje. */
const MAX_ARRIVALS = 3;

/**
 * Nova stavka „uleti" na svoje mesto (plan K07 §4.1, trenutak 4): kad se u
 * listi pojavi novi ključ (brzi unos, plan dana, zadatak sa drugog uređaja),
 * susedi ispod se razmaknu (pomeraj za visinu reda, `snappy`), red ulazi
 * neprozirnošću + scale 0,98 → 1, a podloga `bg-accent` se gasi (`slow`).
 * Stavka u skupljenoj sekciji se ne animira. Prvo punjenje nije dolazak.
 * Smanjen pokret: samo neprozirnost. Granica broja redova kao za Flip (E12).
 */
export function useArrival(
  scope: RefObject<HTMLElement | null>,
  keys: ReadonlyArray<string> | null,
  { maxRows }: { maxRows: number },
): void {
  const previous = useRef<Set<string> | null>(null);
  const play = useTweenSlots();
  const signature = keys === null ? null : keys.join("|");

  useLayoutEffect(() => {
    const root = scope.current;
    if (keys === null || !root) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = new Set(keys);
    if (before === null) return;
    const added = keys.filter((key) => !before.has(key));
    if (added.length === 0 || added.length > MAX_ARRIVALS) return;

    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-flip-id]"));
    for (const key of added) {
      const row = rows.find((element) => element.dataset.flipId === key);
      if (!row || row.closest("[inert]")) continue;
      const highlight = row.querySelector<HTMLElement>("[data-arrive]");
      const height = row.getBoundingClientRect().height;
      const below = rows.slice(rows.indexOf(row) + 1).filter((element) => !element.closest("[inert]"));
      play(`arrive:${key}`, ({ gsap, reduced }) => {
        const timeline = gsap.timeline();
        if (reduced || keys.length > maxRows) {
          timeline.fromTo(row, { autoAlpha: 0 }, { autoAlpha: 1, ...reducedFade(), clearProps: "opacity,visibility" }, 0);
          return timeline;
        }
        timeline.fromTo(row, { autoAlpha: 0 }, { autoAlpha: 1, ...standardTween("quick"), clearProps: "opacity,visibility" }, 0);
        timeline.fromTo(row, { scale: SCALE.enterFrom }, { scale: 1, ...springTween("snappy"), clearProps: "transform" }, 0);
        if (below.length > 0) {
          timeline.fromTo(below, { y: -height }, { y: 0, ...springTween("snappy"), clearProps: "transform" }, 0);
        }
        if (highlight) {
          timeline.fromTo(highlight, { opacity: 1 }, { opacity: 0, ...standardTween("slow"), clearProps: "opacity" }, 0.12);
        }
        return timeline;
      });
    }
    // `signature` vrednosno pokriva `keys`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, maxRows, play]);
}
