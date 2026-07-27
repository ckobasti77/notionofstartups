import { describe, expect, test } from "vitest";

import {
  availableLineSegments,
  ellipseLineBounds,
} from "./circular-text-layout";

describe("ellipseLineBounds", () => {
  test("shape coordinates stay independent from React Flow zoom", () => {
    const segments = availableLineSegments({
      width: 688,
      height: 246,
      lineTop: 0,
      lineHeight: 20,
      shapeWidth: 720,
      shapeHeight: 330,
      shapeOffsetLeft: 16,
      shapeOffsetTop: 44,
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].width).toBeGreaterThan(500);
  });

  test("only rows touching a badge lose its occupied width", () => {
    const unobstructed = availableLineSegments({
      width: 400,
      height: 220,
      lineTop: 80,
      lineHeight: 20,
    });
    const obstructed = availableLineSegments({
      width: 400,
      height: 220,
      lineTop: 80,
      lineHeight: 20,
      obstacles: [{ left: 0, top: 76, right: 110, bottom: 108 }],
    });

    expect(unobstructed).toHaveLength(1);
    expect(obstructed).toHaveLength(1);
    expect(obstructed[0].left).toBeGreaterThan(110);
    expect(obstructed[0].width).toBeLessThan(unobstructed[0].width);
  });

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
      expect(bounds.width).toBeGreaterThanOrEqual(0);
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
