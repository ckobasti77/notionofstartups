import { gsap } from "gsap";
import { describe, expect, test } from "vitest";
import { SCALE } from "@devotion/shared";

import { currentScaleProperty, tweenScaleProperty } from "./scale-property";

/** Najmanji „element": samo inline stil koji helper čita i piše. */
function fakeElement(scale = "") {
  const style = {
    scale,
    removeProperty(name: string) {
      if (name === "scale") style.scale = "";
      return "";
    },
  };
  return { style } as unknown as HTMLElement;
}

describe("tween CSS svojstva scale (ne transform)", () => {
  test("bez inline vrednosti trenutna je 1; inače se čita iz stila", () => {
    expect(currentScaleProperty(fakeElement())).toBe(1);
    expect(currentScaleProperty(fakeElement("0.96"))).toBe(0.96);
  });

  test("ulaz 0,96 → 1: piše međuvrednosti, a na kraju skida svojstvo", () => {
    const element = fakeElement();
    const tween = tweenScaleProperty(gsap, element, { from: SCALE.dialogFrom, to: 1, ease: "none", duration: 1 });
    expect(element.style.scale).toBe(String(SCALE.dialogFrom));
    tween.progress(0.5);
    const middle = Number(element.style.scale);
    expect(middle).toBeGreaterThan(SCALE.dialogFrom);
    expect(middle).toBeLessThan(1);
    tween.progress(1);
    expect(element.style.scale).toBe("");
    tween.kill();
  });

  test("prekid: nov tween kreće od trenutne vrednosti, ne od početka", () => {
    const element = fakeElement();
    const first = tweenScaleProperty(gsap, element, { from: 0.96, to: 1, ease: "none", duration: 1 });
    first.progress(0.5);
    first.kill();
    const reached = Number(element.style.scale);
    const second = tweenScaleProperty(gsap, element, { to: 0.9, ease: "none", duration: 1 });
    expect(Number(element.style.scale)).toBeCloseTo(reached, 6);
    second.progress(1);
    // Cilj nije 1, pa vrednost ostaje upisana.
    expect(Number(element.style.scale)).toBeCloseTo(0.9, 6);
    second.kill();
  });
});
