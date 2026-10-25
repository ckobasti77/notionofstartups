/**
 * Parametri izloga (`/izlog?ekran=<ime>&tema=tamna|svetla&varijanta=<ime>`) —
 * ČISTO (vitest). Tamna je podrazumevana jer je to primarna tema aplikacije.
 * `varijanta` bira stanje istog ekrana (prazno, pretrpano, greška…) za
 * zaseban snimak (plan K07, E2).
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
  varijanta: string | null;
} {
  const ekran = first(searchParams.ekran)?.trim() || IZLOG_DEFAULT_EKRAN;
  const tema = first(searchParams.tema) === "svetla" ? "light" : "dark";
  const varijanta = first(searchParams.varijanta)?.trim() || null;
  return { ekran, tema, varijanta };
}

/**
 * Varijanta koja se prikazuje: tražena ako je ekran ima, inače prva (podrazumevana).
 * Ekran bez varijanti dobija prazan string.
 */
export function resolveVarijanta(
  varijante: ReadonlyArray<string> | undefined,
  requested: string | null,
): string {
  if (!varijante || varijante.length === 0) return "";
  return requested !== null && varijante.includes(requested) ? requested : varijante[0];
}

export function izlogHref(ekran: string, tema: IzlogTema, varijanta?: string): string {
  const params = new URLSearchParams({ ekran, tema: tema === "light" ? "svetla" : "tamna" });
  if (varijanta) params.set("varijanta", varijanta);
  return `/izlog?${params.toString()}`;
}
