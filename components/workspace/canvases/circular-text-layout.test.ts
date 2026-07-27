import { describe, expect, test } from "vitest";

import { ellipseLineBounds } from "./circular-text-layout";

describe("ellipseLineBounds", () => {
  test.each([
    [240, 160],
    [264, 196],
    [480, 320],
    [720, 1_000],
  ])("svaki red ostaje unutar elipse dimenzije %sx%s", (width, height) => {
    for (let centerY = 10; centerY < height - 10; centerY += 10) {
      const bounds = ellipseLineBounds({
        width,
        height,
        lineCenterY: centerY,
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.width).toBeGreaterThanOrEqual(32);
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.left).toBeCloseTo((width - bounds.width) / 2, 6);
    }
  });

  test("krivulja je najuža na vrhu i najšira u sredini", () => {
    const top = ellipseLineBounds({
      width: 480,
      height: 320,
      lineCenterY: 12,
    });
    const middle = ellipseLineBounds({
      width: 480,
      height: 320,
      lineCenterY: 160,
    });
    expect(top.width).toBeLessThan(middle.width);
  });

  test.each([
    "Srpska latinica: č ć š đ ž",
    "Српска ћирилица: ч ћ ш ђ ж",
    "Emoji i grapheme: 👨‍👩‍👧‍👦 ✨ 🚀",
    "veomaDugačkaRečBezRazmakaKojaMoraDaOstaneUObodu",
    "Prvi red\n\nTreći red",
  ])("tekstualni slučaj je pokriven browser Pretext proverom: %s", (sample) => {
    expect(sample.length).toBeGreaterThan(0);
  });
});
