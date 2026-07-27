import { describe, expect, test } from "vitest";

import { findAvailableCanvasPosition } from "./canvasPlacement";

describe("canvas placement", () => {
  test("automatic placement accounts for the moved card's custom size", () => {
    const occupied = [{ x: 352, y: 0, width: 288, height: 196 }];

    expect(findAvailableCanvasPosition(occupied)).toEqual({ x: 0, y: 0 });
    expect(
      findAvailableCanvasPosition(occupied, {
        width: 520,
        height: 420,
      }),
    ).toEqual({ x: 704, y: 0 });
  });
});
