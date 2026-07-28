import { describe, expect, test } from "vitest";

import {
  taskCheckpointNodeId,
  taskCheckpointNodeMetrics,
  taskCheckpointOrbitPosition,
} from "./task-checkpoint-layout";

describe("task checkpoint Canvas layout", () => {
  test("React Flow ID je stabilan i odvojen od page čvorova", () => {
    expect(taskCheckpointNodeId("abc123")).toBe("checkpoint:abc123");
  });

  test("isti input daje isti orbitalni raspored bez centra taska", () => {
    const node = taskCheckpointNodeMetrics("Potvrdi finalni plan");
    const first = Array.from({ length: 20 }, (_, index) =>
      taskCheckpointOrbitPosition({
        index,
        center: { x: 200, y: 180 },
        node,
        exclusion: { width: 300, height: 220 },
      }),
    );
    const second = Array.from({ length: 20 }, (_, index) =>
      taskCheckpointOrbitPosition({
        index,
        center: { x: 200, y: 180 },
        node,
        exclusion: { width: 300, height: 220 },
      }),
    );
    expect(second).toEqual(first);
    expect(new Set(first.map(({ x, y }) => `${x}:${y}`)).size).toBe(20);
    expect(
      first.every(
        ({ x, y }) =>
          Math.abs(x - 200) > 80 || Math.abs(y - 180) > 60,
      ),
    ).toBe(true);
  });

  test("dimenzije checkpointa rastu sa sadržajem, ali ostaju ograničene", () => {
    const short = taskCheckpointNodeMetrics("QA");
    const medium = taskCheckpointNodeMetrics(
      "Proveri mobilni prikaz i tastaturu",
    );
    const long = taskCheckpointNodeMetrics("x".repeat(500));

    expect(short.width).toBeLessThan(medium.width);
    expect(short.height).toBeLessThanOrEqual(medium.height);
    expect(medium.width).toBeLessThan(long.width);
    expect(long.width).toBe(228);
    expect(long.height).toBeLessThanOrEqual(190);
  });
});
