"use client";

import { useLayoutEffect, useRef } from "react";

import { getGsap, prefersReducedMotion, springTween } from "@/lib/motion";

/** „Leteća kopija" samo na `md` i šire (plan K07 §4.1, trenutak 3). */
const FLIGHT_QUERY = "(min-width: 768px)";
/**
 * Ako se naslov panela pojavi kasnije (hladan upit), let bi kretao usred
 * ulaza panela ili posle njega — tada ga preskačemo.
 */
const FLIGHT_MAX_DELAY_MS = 300;

function markFlown(ref: { current: string | null }, key: string) {
  ref.current = key;
}

/**
 * Trenutak 3: naslov reda „preleti" u zaglavlje panela. Klon u sloju iznad
 * panela kreće od pravougaonika naslova u redu i ide do KONAČNOG mesta
 * naslova u panelu (računa se iz konačne pozicije drawera, ne iz trenutne,
 * jer panel još ulazi s desna). Pravi naslov je nevidljiv dok klon ne stigne.
 * Klon je `aria-hidden` i ne prima fokus ni klikove. Smanjen pokret ili
 * uski ekran: bez kopije.
 */
export function useTitleFlight({
  origin,
  target,
  flightKey,
  startedAt,
}: {
  /** Naslov u redu (`[data-row-title]`) u trenutku otvaranja. */
  origin: HTMLElement | null;
  /** Naslov u zaglavlju panela (`[data-panel-title]`). */
  target: HTMLElement | null;
  /** Nov ključ = novo otvaranje (jedan let po otvaranju). */
  flightKey: string | null;
  /** `performance.now()` u trenutku otvaranja. */
  startedAt: number | null;
}) {
  const flown = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!origin || !target || flightKey === null || startedAt === null) return;
    if (flown.current === flightKey) return;
    markFlown(flown, flightKey);
    if (performance.now() - startedAt > FLIGHT_MAX_DELAY_MS) return;
    if (!origin.isConnected || prefersReducedMotion() || !window.matchMedia(FLIGHT_QUERY).matches) return;
    const panel = target.closest<HTMLElement>('[data-slot="drawer-content"]');
    if (!panel) return;

    const from = origin.getBoundingClientRect();
    const current = target.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    // Panel je `fixed right-0`: konačna leva ivica je širina prozora − širina panela.
    const finalPanelLeft = document.documentElement.clientWidth - panel.offsetWidth;
    const shift = panelRect.left - finalPanelLeft;
    const to = { left: current.left - shift, top: current.top, width: current.width };
    if (from.width === 0 || to.width === 0) return;

    const style = getComputedStyle(target);
    const fromSize = parseFloat(getComputedStyle(origin).fontSize) || 14;
    const toSize = parseFloat(style.fontSize) || 18;
    const clone = document.createElement("div");
    clone.setAttribute("aria-hidden", "true");
    clone.textContent = origin.textContent?.trim() || target.textContent?.trim() || "";
    Object.assign(clone.style, {
      position: "fixed",
      left: `${to.left}px`,
      top: `${to.top + (parseFloat(style.paddingTop) || 0)}px`,
      width: `${to.width}px`,
      paddingLeft: style.paddingLeft,
      font: style.font,
      letterSpacing: style.letterSpacing,
      color: style.color,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      transformOrigin: "0 0",
      pointerEvents: "none",
      zIndex: "60",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(clone);

    const gsap = getGsap();
    // Pravi naslov je nevidljiv dok klon ne stigne; GSAP postavlja i čisti samo neprozirnost.
    gsap.set(target, { opacity: 0 });
    const finish = () => {
      gsap.set(target, { clearProps: "opacity" });
      clone.remove();
    };
    const tween = gsap.fromTo(
      clone,
      { x: from.left - to.left, y: from.top - to.top, scale: fromSize / toSize },
      { x: 0, y: 0, scale: 1, ...springTween("smooth"), onComplete: finish },
    );
    return () => {
      tween.kill();
      finish();
    };
    // Jedan let po otvaranju: `flightKey` se menja samo pri novom otvaranju.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey, target]);
}
