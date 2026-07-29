import { describe, expect, test } from "vitest";

import { orderTaskCheckpointsForEditor } from "./task-checkpoint-order";

describe("redosled checkpointa u editoru zadatka", () => {
  test("otvorene prikazuje numerički pre završenih, uz očuvane brojeve", () => {
    const checkpoints = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      ordinal: index + 1,
      completed: [2, 5, 7].includes(index + 1),
    }));

    const ordered = orderTaskCheckpointsForEditor(checkpoints);

    expect(ordered.map(({ checkpoint }) => checkpoint.id)).toEqual([
      1, 3, 4, 6, 2, 5, 7,
    ]);
    expect(ordered.map(({ ordinal }) => ordinal)).toEqual([
      1, 3, 4, 6, 2, 5, 7,
    ]);
  });
});
