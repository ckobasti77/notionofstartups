/**
 * Fiksni sat izloga: subota 24.10.2026. 09:30 po lokalnom vremenu mašine.
 * Prezentacione komponente dobijaju `now` kroz props, pa su snimci isti svaki put.
 */
export const IZLOG_NOW = new Date("2026-10-24T09:30:00").getTime();

/** Lokalno podne dana u oktobru 2026. (kanonska vrednost roka). */
export function oktobar(day: number): number {
  return new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00`).getTime();
}
