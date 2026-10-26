/**
 * Redovi početne startupa na telefonu (PROSTOR P18, plan K07 §4.2): Zadaci ·
 * Dokumenti · Ideje · Kanali · Korpa, pa privremeni Puls nedelje · Aktivnost
 * (dok K19 ne napravi blokove). Čista logika — bez React-a; deli je Dizajn
 * katalog i test.
 */

export type ProstorHubDestination =
  | 'zadaci'
  | 'oblasti'
  | 'ideje'
  | 'kanali'
  | 'korpa'
  | 'puls'
  | 'aktivnost';

export type ProstorHubRow = {
  id: ProstorHubDestination;
  title: string;
};

/** Redovi na vrhu Prostora, tim redom (K07 E4). */
export const PROSTOR_HUB_ROWS: ReadonlyArray<ProstorHubRow> = [
  { id: 'zadaci', title: 'Zadaci' },
  { id: 'oblasti', title: 'Dokumenti' },
  { id: 'ideje', title: 'Ideje' },
  { id: 'kanali', title: 'Kanali' },
  { id: 'korpa', title: 'Korpa' },
];

/** Privremeni redovi na dnu Prostora do Komandnog centra 2.0 (K19). */
export const PROSTOR_TEMP_ROWS: ReadonlyArray<ProstorHubRow> = [
  { id: 'puls', title: 'Puls nedelje' },
  { id: 'aktivnost', title: 'Aktivnost' },
];

/** „1 oblast" · „3 oblasti" · „21 oblast" · „11 oblasti". */
export function areasLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  return `${count} ${last === 1 && lastTwo !== 11 ? 'oblast' : 'oblasti'}`;
}

/**
 * Desna vrednost reda „Dokumenti" (broj oblasti iz `startups.get`); `null` dok
 * stiže. Zadaci i Korpa su bez broja (K07), Ideje broj dobijaju u K17, a Kanali
 * nose broj nepročitanih kao pilulu, ne kao tekst.
 */
export function hubRowValue(id: ProstorHubDestination, areaCount: number | null): string | null {
  if (id === 'oblasti' && areaCount !== null) return areasLabel(areaCount);
  return null;
}
