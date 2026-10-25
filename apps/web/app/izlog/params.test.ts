import { describe, expect, test } from "vitest";

import { IZLOG_DEFAULT_EKRAN, izlogHref, resolveIzlogParams, resolveVarijanta } from "./params";

describe("parametri izloga", () => {
  test("bez parametara: podrazumevani ekran i tamna tema", () => {
    expect(resolveIzlogParams({})).toEqual({ ekran: IZLOG_DEFAULT_EKRAN, tema: "dark", varijanta: null });
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
      varijanta: null,
    });
    expect(resolveIzlogParams({ ekran: "  " }).ekran).toBe(IZLOG_DEFAULT_EKRAN);
  });

  test("link nosi srpska imena tema i enkodira ekran", () => {
    expect(izlogHref("pokret", "dark")).toBe("/izlog?ekran=pokret&tema=tamna");
    expect(izlogHref("moj dan", "light")).toBe("/izlog?ekran=moj+dan&tema=svetla");
  });

  test("varijanta: čita se, prazna je null, link je nosi samo kad je zadata", () => {
    expect(resolveIzlogParams({ ekran: "ljuska", varijanta: "startup" }).varijanta).toBe("startup");
    expect(resolveIzlogParams({ varijanta: ["meni", "ja"] }).varijanta).toBe("meni");
    expect(resolveIzlogParams({ varijanta: " " }).varijanta).toBeNull();
    expect(izlogHref("ljuska", "dark", "meni")).toBe("/izlog?ekran=ljuska&tema=tamna&varijanta=meni");
    expect(izlogHref("ljuska", "dark", "")).toBe("/izlog?ekran=ljuska&tema=tamna");
  });

  test("prikazana varijanta: tražena ako postoji, inače prva; bez varijanti prazno", () => {
    expect(resolveVarijanta(["ja", "startup"], "startup")).toBe("startup");
    expect(resolveVarijanta(["ja", "startup"], "nepostoji")).toBe("ja");
    expect(resolveVarijanta(["ja", "startup"], null)).toBe("ja");
    expect(resolveVarijanta(undefined, "ja")).toBe("");
  });
});
