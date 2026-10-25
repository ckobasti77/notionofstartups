/**
 * Jednokratna registracija GSAP pluginova i krivih iz shared springova, plus
 * JEDAN globalni `gsap.matchMedia()` za smanjen pokret. Uvozi se samo iz
 * `"use client"` koda; na serveru je `getGsap()` bez registracije (GSAP se
 * tamo nikad ne pokreće — sve ide iz efekata).
 *
 * Zašto jedan globalni matchMedia: svaki `matchMedia().add()` napravi nov
 * `MediaQueryList` sa slušaocem koji ni `revert()` ni `kill()` ne skidaju
 * (gsap-core 3.15). Po komponenti bi to curilo pri svakom prelazu prikaza.
 */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";

import { easeDefinitions } from "./eases";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const FULL_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

let registered = false;
let reducedNow = false;
const reducedListeners = new Set<() => void>();

export function getGsap(): typeof gsap {
  if (!registered && typeof window !== "undefined") {
    registered = true;
    gsap.registerPlugin(Flip, CustomEase);
    for (const { name, data } of easeDefinitions()) CustomEase.create(name, data);
    // Handler se pokreće odmah i ponovo na svaku promenu podešavanja.
    gsap.matchMedia().add(
      { reduced: REDUCED_MOTION_QUERY, full: FULL_MOTION_QUERY },
      (context) => {
        const next = Boolean(context.conditions?.reduced);
        if (next === reducedNow) return;
        reducedNow = next;
        reducedListeners.forEach((listener) => listener());
      },
    );
  }
  return gsap;
}

/** Trenutno stanje `prefers-reduced-motion` (kroz globalni GSAP matchMedia). */
export function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  getGsap();
  return reducedNow;
}

export function subscribeReducedMotion(listener: () => void): () => void {
  getGsap();
  reducedListeners.add(listener);
  return () => {
    reducedListeners.delete(listener);
  };
}

export { Flip };
