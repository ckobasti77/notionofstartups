import { describe, expect, it } from "vitest";

// Serverski autoritet nad limitima tabela…
import * as backend from "./lib/validators";
// …i njegovo namerno ogledalo u mobilnom klijentu (RN bundle ne sme da uvlači
// serverski modul, pa se konstante dupliraju — vidi komentar u tom fajlu).
import * as mobile from "../../../apps/mobile/src/lib/table-limits";

/**
 * Straža protiv tihог razilaženja: `apps/mobile/src/lib/table-limits.ts` ručno
 * kopira limite iz `convex/lib/validators.ts`. Kopija se lako zaboravi kad se
 * server promeni; ovaj test pukne isti čas i tera da se oba mesta usklade.
 */
describe("limiti tabela: mobilni klijent = serverski autoritet", () => {
  it.each([
    ["MAX_TABLE_COLUMNS"],
    ["MAX_TABLE_ROWS"],
    ["MAX_TABLE_CELL_LENGTH"],
    ["MAX_TABLE_LABEL_LENGTH"],
  ] as const)("%s je jednak na oba mesta", (name) => {
    expect(mobile[name]).toBe(backend[name]);
  });
});
