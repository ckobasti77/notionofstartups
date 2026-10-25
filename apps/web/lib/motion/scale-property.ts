/**
 * Tween CSS svojstva `scale` (a ne `transform`). Uvozi se samo iz
 * `"use client"` koda.
 *
 * Zašto ne GSAP `scale`: GSAP pri parsiranju transformacije spoji Tailwind
 * `translate-*` (svojstvo `translate`) u `transform` u pikselima. Dijalog koji
 * je centriran sa `-translate-x-1/2 -translate-y-1/2` bi se tada pomerio čim mu
 * se tokom ulaza promeni visina (sadržaj stigne). Svojstvo `scale` se slaže sa
 * `translate` i `transform` bez spajanja, oko istog `transform-origin`.
 */
import type { gsap as Gsap } from "gsap";

/** Trenutna (inline) vrednost svojstva `scale`; 1 kad nije postavljeno. */
export function currentScaleProperty(element: HTMLElement): number {
  const value = Number.parseFloat(element.style.scale);
  return Number.isFinite(value) ? value : 1;
}

/**
 * Pomeri `scale` od `from` (ili od trenutne vrednosti — prekidivo) do `to`.
 * Kad stigne na 1, svojstvo se skida (element ostaje bez inline stila).
 */
export function tweenScaleProperty(
  gsap: typeof Gsap,
  element: HTMLElement,
  { from, to, ease, duration }: { from?: number; to: number; ease: string; duration: number },
): gsap.core.Tween {
  const state = { value: from ?? currentScaleProperty(element) };
  const write = () => {
    element.style.scale = String(state.value);
  };
  write();
  return gsap.to(state, {
    value: to,
    ease,
    duration,
    onUpdate: write,
    onComplete: () => {
      if (to === 1) element.style.removeProperty("scale");
    },
  });
}
