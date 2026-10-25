"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

import { springTween } from "./eases";
import { frameWithin, framesDiffer, type Frame } from "./rail-indicator";
import { useTweenSlots } from "./use-gsap";

export const RAIL_ITEM_ATTRIBUTE = "data-rail-key";

/**
 * Indikator izabrane stavke koji klizi kroz traku (`snappy`, PLAN §6 tačka 2).
 * Stavke nose `data-rail-key`; kontejner je `position: relative`, a vraćeni
 * ref ide na apsolutno pozicioniran `<span>` u njemu. Prvi položaj i promena
 * veličine kontejnera se postavljaju bez animacije. Smanjen pokret: skok.
 */
export function useRailIndicator(
  container: RefObject<HTMLElement | null>,
  activeKey: string | null,
): RefObject<HTMLSpanElement | null> {
  const indicator = useRef<HTMLSpanElement>(null);
  const lastFrame = useRef<Frame | null>(null);
  const play = useTweenSlots();

  useLayoutEffect(() => {
    const root = container.current;
    const marker = indicator.current;
    if (!root || !marker) return;

    const measure = (): Frame | null => {
      if (activeKey === null) return null;
      const item = Array.from(root.querySelectorAll<HTMLElement>(`[${RAIL_ITEM_ATTRIBUTE}]`)).find(
        (candidate) => candidate.getAttribute(RAIL_ITEM_ATTRIBUTE) === activeKey,
      );
      if (!item) return null;
      // Apsolutni indikator se meri od unutrašnje ivice okvira (padding box).
      const box = root.getBoundingClientRect();
      const inner = { left: box.left + root.clientLeft, top: box.top + root.clientTop, width: box.width, height: box.height };
      return frameWithin(inner, item.getBoundingClientRect(), {
        left: root.scrollLeft,
        top: root.scrollTop,
      });
    };

    const place = (animate: boolean) => {
      const frame = measure();
      // Isti cilj = ništa (ResizeObserver javi i odmah po `observe`, dok
      // indikator još klizi — ne sme da prekine živ tween).
      if (frame && !framesDiffer(lastFrame.current, frame)) return;
      const first = lastFrame.current === null;
      lastFrame.current = frame;
      play("indicator", ({ gsap, reduced }) => {
        if (!frame) return gsap.set(marker, { autoAlpha: 0 });
        if (!animate || first || reduced) return gsap.set(marker, { ...frame, autoAlpha: 1 });
        return gsap.to(marker, { ...frame, autoAlpha: 1, ...springTween("snappy") });
      });
    };

    place(true);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(root);
    return () => observer.disconnect();
  }, [activeKey, container, play]);

  return indicator;
}
