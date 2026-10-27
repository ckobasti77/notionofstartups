/**
 * Ekran oblasti na telefonu (PROSTOR P12, plan K07 §5.5, K14) — čista logika bez
 * React-a: kartice, brojevi („12 stranica · 8 zadataka"), meta redovi opisa i
 * nedavnih izmena, pravila čuvanja opisa. Blizanac web `workspace/area/area-model.ts`
 * (K13), da oba klijenta pišu iste brojeve i iste rečenice.
 */
import { formatEditTime } from '@devotion/shared';

/** Kartice ekrana oblasti; „Mapa" nije kartica nego dugme u zaglavlju (P18). */
export const AREA_TABS = [
  { id: 'pregled', label: 'Pregled' },
  { id: 'zadaci', label: 'Zadaci' },
  { id: 'dokumenti', label: 'Dokumenti' },
] as const;

export type AreaTab = (typeof AREA_TABS)[number]['id'];

export const DEFAULT_AREA_TAB: AreaTab = 'pregled';

export function isAreaTab(value: unknown): value is AreaTab {
  return AREA_TABS.some((tab) => tab.id === value);
}

/** Isti limit kao `MAX_AREA_BODY_LENGTH` na backendu (`areasV2.ts`). */
export const AREA_DESCRIPTION_MAX = 20_000;

/** Broj stavki; `capped` kad ih ima više nego što je upit pročitao. */
export type CountValue = { count: number; capped: boolean };

/** Veličina prve strane `tasks.listForArea` iz koje se čita broj zadataka (K13-1). */
export const TASK_COUNT_PAGE_SIZE = 50;

/**
 * Lista oblasti pretplaćuje broj zadataka po redu; iznad ove granice redovi
 * ostaju samo sa brojem stranica (jedna pretplata po redu ne sme da raste bez kraja).
 */
export const AREA_ROW_TASK_COUNT_MAX = 20;

/** „12" ili „99+" kad je broj ograničen. */
export function countLabel(value: CountValue): string {
  return value.capped ? `${value.count}+` : String(value.count);
}

/** Srpska množina: 1 zadatak · 2–4 zadatka · 5+ zadataka (11–14 i 0 su „mnogo"). */
export function pluralSr(count: number, one: string, few: string, many: string): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

/** „1 stranica" · „3 stranice" · „99+ stranica". */
export function pagesPhrase(value: CountValue): string {
  return `${countLabel(value)} ${pluralSr(value.count, 'stranica', 'stranice', 'stranica')}`;
}

/** „1 zadatak" · „3 zadatka" · „50+ zadataka". */
export function tasksPhrase(value: CountValue): string {
  return `${countLabel(value)} ${pluralSr(value.count, 'zadatak', 'zadatka', 'zadataka')}`;
}

/**
 * Meta red ispod naslova: „12 stranica · 8 zadataka". Deo koji još stiže (`null`)
 * se izostavlja, pa red raste umesto da pokaže „0"; `null` kad nema ničega.
 */
export function areaMetaLine(pages: CountValue | null, tasks: CountValue | null): string | null {
  const parts = [pages === null ? null : pagesPhrase(pages), tasks === null ? null : tasksPhrase(tasks)];
  const line = parts.filter((part): part is string => part !== null).join(' · ');
  return line === '' ? null : line;
}

/** Broj zadataka iz prve strane `tasks.listForArea`: više od strane = „50+". */
export function taskCountFromPage(page: { page: ReadonlyArray<unknown>; isDone: boolean }): CountValue {
  return { count: page.page.length, capped: !page.isDone };
}

/**
 * Meta ispod opisa oblasti: „Marko · pre 2 dana". Bez opisa (nikad sačuvan) i bez
 * poznatog urednika nema ničega; bez imena ostaje samo vreme.
 */
export function descriptionMeta(input: {
  hasContent: boolean;
  lastEditorName: string | null;
  updatedAt: number | null;
  now: number;
}): string | null {
  if (!input.hasContent || input.updatedAt === null) return null;
  const when = formatEditTime(input.updatedAt, input.now);
  const name = input.lastEditorName?.trim();
  return name ? `${name} · ${when}` : when;
}

/** Meta reda „Nedavne izmene": „Ana · pre 5 min" (bez imena samo vreme). */
export function recentMeta(editorName: string | null, updatedAt: number, now: number): string {
  const when = formatEditTime(updatedAt, now);
  const name = editorName?.trim();
  return name ? `${name} · ${when}` : when;
}

/**
 * Da li „Sačuvaj" u izmeni opisa sme: tekst se razlikuje od onog sa kog se
 * krenulo, staje u granicu i ništa se ne čuva baš sada. Prazan opis je dozvoljen
 * (brisanje opisa je izmena kao svaka druga i ostaje u Istoriji izmena).
 */
export function canSaveDescription(input: { draft: string; original: string; busy: boolean }): boolean {
  if (input.busy) return false;
  if (input.draft.length > AREA_DESCRIPTION_MAX) return false;
  return input.draft !== input.original;
}

/**
 * Revizija za ponovni upis posle konflikta („Prepiši"): veća od one koju je server
 * prijavio u grešci i poslednje poznate sa ekrana (upit je živ), da treća izmena
 * između greške i dodira ne vrati korisnika u novi konflikt.
 */
export function overwriteRevision(reported: number | null, latestKnown: number): number {
  return Math.max(reported ?? 0, latestKnown);
}

/** Tekst brojača u izmeni opisa: „1.204/20.000". */
export function descriptionCounter(length: number): string {
  const format = (value: number) => value.toLocaleString('sr-Latn-RS');
  return `${format(length)}/${format(AREA_DESCRIPTION_MAX)}`;
}
