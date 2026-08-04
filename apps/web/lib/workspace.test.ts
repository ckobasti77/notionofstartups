import { describe, expect, test } from "vitest";

import { tasksWord } from "./workspace";

describe("pluralizacija zadataka", () => {
  test("poštuje srpska pravila za jedinicu i male brojeve", () => {
    expect(tasksWord(1)).toBe("zadatak");
    expect(tasksWord(21)).toBe("zadatak");
    expect(tasksWord(2)).toBe("zadatka");
    expect(tasksWord(4)).toBe("zadatka");
    expect(tasksWord(23)).toBe("zadatka");
    expect(tasksWord(5)).toBe("zadataka");
    expect(tasksWord(11)).toBe("zadataka");
    expect(tasksWord(12)).toBe("zadataka");
    expect(tasksWord(14)).toBe("zadataka");
    expect(tasksWord(0)).toBe("zadataka");
  });
});
