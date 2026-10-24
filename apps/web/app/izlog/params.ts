/**
 * Parametri izloga (`/izlog?ekran=<ime>&tema=tamna|svetla`) — ČISTO (vitest).
 * Tamna je podrazumevana jer je to primarna tema aplikacije.
 */

export type IzlogTema = "light" | "dark";
export type IzlogSearchParams = Record<string, string | string[] | undefined>;

export const IZLOG_DEFAULT_EKRAN = "pokret";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveIzlogParams(searchParams: IzlogSearchParams): {
  ekran: string;
  tema: IzlogTema;
} {
  const ekran = first(searchParams.ekran)?.trim() || IZLOG_DEFAULT_EKRAN;
  const tema = first(searchParams.tema) === "svetla" ? "light" : "dark";
  return { ekran, tema };
}

export function izlogHref(ekran: string, tema: IzlogTema): string {
  const params = new URLSearchParams({ ekran, tema: tema === "light" ? "svetla" : "tamna" });
  return `/izlog?${params.toString()}`;
}
