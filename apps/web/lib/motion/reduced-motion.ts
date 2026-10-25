"use client";

import { useSyncExternalStore } from "react";

import {
  FULL_MOTION_QUERY,
  isReducedMotion,
  REDUCED_MOTION_QUERY,
  subscribeReducedMotion,
} from "./gsap-setup";

export { FULL_MOTION_QUERY, REDUCED_MOTION_QUERY };

/** `prefers-reduced-motion: reduce` sada (za rukovaoce događaja i tween-ove). */
export function prefersReducedMotion(): boolean {
  return isReducedMotion();
}

function getServerSnapshot() {
  return false;
}

/** Živa vrednost `prefers-reduced-motion` (prati promenu podešavanja). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, isReducedMotion, getServerSnapshot);
}
