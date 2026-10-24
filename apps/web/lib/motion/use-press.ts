"use client";

import { useCallback, type RefCallback } from "react";
import { SCALE } from "@devotion/shared";

import { springTween, standardTween } from "./eases";
import { getGsap } from "./gsap-setup";
import { prefersReducedMotion } from "./reduced-motion";

function isDisabled(element: HTMLElement) {
  return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
}

/**
 * Pritisak: na pointer-down (ne na otpuštanje) element se skupi na 0.97 za
 * 90 ms, pa se vrati `snappy` springom od trenutne vrednosti. Isto za
 * Space/Enter sa tastature. Smanjen pokret: bez skaliranja (boje pritiska
 * ostaju iz CSS-a). Slušaoci i tween-ovi se čiste kad element ode.
 */
export function usePress<T extends HTMLElement>(): RefCallback<T> {
  return useCallback((element: T | null) => {
    if (!element) return;
    const gsap = getGsap();
    // Povratak samo posle stvarnog pritiska (pointerleave/blur bez pritiska ne prave tween).
    let pressed = false;

    const press = () => {
      if (prefersReducedMotion() || isDisabled(element)) return;
      pressed = true;
      gsap.to(element, { scale: SCALE.press, ...standardTween("press"), overwrite: "auto" });
    };
    const release = () => {
      if (!pressed) return;
      pressed = false;
      gsap.to(element, {
        scale: 1,
        ...springTween("snappy"),
        overwrite: "auto",
        clearProps: "transform",
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) press();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.repeat && (event.key === " " || event.key === "Enter")) press();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") release();
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointerup", release);
    element.addEventListener("pointerleave", release);
    element.addEventListener("pointercancel", release);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("keyup", onKeyUp);
    element.addEventListener("blur", release);

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointerup", release);
      element.removeEventListener("pointerleave", release);
      element.removeEventListener("pointercancel", release);
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("keyup", onKeyUp);
      element.removeEventListener("blur", release);
      gsap.killTweensOf(element);
      gsap.set(element, { clearProps: "transform" });
    };
  }, []);
}
