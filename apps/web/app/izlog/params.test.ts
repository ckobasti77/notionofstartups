import { describe, expect, test } from "vitest";

import { IZLOG_DEFAULT_EKRAN, izlogHref, resolveIzlogParams } from "./params";

describe("parametri izloga", () => {
  test("bez parametara: podrazumevani ekran i tamna tema", () => {
    expect(resolveIzlogParams({})).toEqual({ ekran: IZLOG_DEFAULT_EKRAN, tema: "dark" });
    expect(IZLOG_DEFAULT_EKRAN).toBe("pokret");
  });

  test("tema: svetla → light, tamna i nepoznato → dark", () => {
    expect(resolveIzlogParams({ tema: "svetla" }).tema).toBe("light");
    expect(resolveIzlogParams({ tema: "tamna" }).tema).toBe("dark");
    expect(resolveIzlogParams({ tema: "light" }).tema).toBe("dark");
  });

  test("ponovljen parametar: važi prvi; prazan ekran → podrazumevani", () => {
    expect(resolveIzlogParams({ ekran: ["moj-dan", "inbox"], tema: ["svetla", "tamna"] })).toEqual({
      ekran: "moj-dan",
      tema: "light",
    });
    expect(resolveIzlogParams({ ekran: "  " }).ekran).toBe(IZLOG_DEFAULT_EKRAN);
  });

  test("link nosi srpska imena tema i enkodira ekran", () => {
    expect(izlogHref("pokret", "dark")).toBe("/izlog?ekran=pokret&tema=tamna");
    expect(izlogHref("moj dan", "light")).toBe("/izlog?ekran=moj+dan&tema=svetla");
  });
});
