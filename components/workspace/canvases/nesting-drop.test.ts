import { describe, expect, it } from "vitest";

import {
  selectNestingDropTarget,
  type NestingDropNode,
} from "./nesting-drop";

const node = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
): NestingDropNode => ({
  id,
  position: { x, y },
  width,
  height,
});

describe("selectNestingDropTarget", () => {
  it("selects the card containing the dragged card centre", () => {
    const dragged = node("dragged", 80, 80);
    const target = node("target", 100, 100, 160, 160);

    expect(
      selectNestingDropTarget(dragged, [target]),
    ).toEqual(target);
  });

  it("ignores a casual edge overlap", () => {
    const dragged = node("dragged", 20, 20);
    const target = node("target", 100, 100);

    expect(
      selectNestingDropTarget(dragged, [target]),
    ).toBeNull();
  });

  it("does not nest into another card in the dragged group", () => {
    const dragged = node("dragged", 80, 80);
    const selectedPeer = node("selected-peer", 100, 100, 160, 160);

    expect(
      selectNestingDropTarget(
        dragged,
        [selectedPeer],
        new Set(["dragged", "selected-peer"]),
      ),
    ).toBeNull();
  });
});
