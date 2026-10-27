/**
 * Beleške na telefonu (PROSTOR P7, K18) — ČISTA logika ekrana „Beleške" bez
 * React-a: red liste iz stavke servera, rezultat pretrage kao ravan red,
 * odredište brzog unosa, mete „Sredi raspored" i odluka o dovlačenju strana.
 * Filter, raspored sa uvlačenjem, tekstovi i provere unosa su u
 * `@devotion/shared` (`notes.ts`) i ovde se NE ponavljaju — isto kao na webu.
 */
import {
  noteDisplayTitle,
  noteMetaLabel,
  notePreview,
  noteScopeLabel,
  NOTE_SEARCH_MIN,
  type NoteFilter,
  type NoteNode,
  type NoteRow,
} from '@devotion/shared';

/** Uvlačenje podbeleške po nivou (K07 §5.10: 16 px po nivou, najviše 3 nivoa). */
export const NOTE_INDENT_PX = 16;
/**
 * Lista se sama dovlači do ovolike granice (R6: strana može biti kraća od
 * `numItems`, pa se ne staje na prvoj); dalje ide tek skrolom (`onEndReached`).
 */
export const NOTES_AUTO_LOAD_MAX = 300;
/** Backend `MAX_BULK_ITEMS` — `moveNodes` prima najviše 50 poteza. */
export const TIDY_NOTES_MAX = 50;

export type NotesListStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

/** Startup kako ga crtaju čipovi i izbor cilja (podskup `startups.listForCurrent`). */
export type NoteStartup = { _id: string; name: string; logoUrl: string | null };

/** Stavka `thoughts.listMine` — onoliko koliko red i akcije čitaju. */
export type NoteListItem = NoteNode & {
  startup: { name: string; logoUrl: string | null } | null;
};

/** Rezultat `thoughts.searchMine`. */
export type NoteSearchHit = {
  _id: string;
  title: string | null;
  text: string;
  startupId: string | null;
};

/** Sve što red liste crta — prezentaciona komponenta ne računa ništa sama. */
export type NoteRowModel = {
  id: string;
  title: string;
  preview: string | null;
  /** „Cluck Rush · pre 2 h" / „Lično · pre 3 dana" (pretraga: samo opseg). */
  meta: string;
  startup: { name: string; logoUrl: string | null } | null;
  depth: number;
  indent: number;
  /** Jedna rečenica za čitač ekrana. */
  label: string;
};

function rowLabel(parts: ReadonlyArray<string | null>, depth: number): string {
  return [...parts, depth > 0 ? 'Podbeleška' : null].filter((part): part is string => !!part).join('. ');
}

/** Red obične liste: naslov, isečak, meta sa starošću i uvlačenje po nivou. */
export function noteRowModel(row: NoteRow<NoteListItem>, nowMs: number, zone?: string): NoteRowModel {
  const { note, depth } = row;
  const title = noteDisplayTitle(note);
  const preview = notePreview(note);
  const meta = noteMetaLabel(note, nowMs, zone);
  return {
    id: note._id,
    title,
    preview,
    meta,
    startup: note.startup,
    depth,
    indent: depth * NOTE_INDENT_PX,
    label: rowLabel([title, preview, meta], depth),
  };
}

/**
 * Red pretrage: ravno, bez uvlačenja. Server ne vraća starost, pa je meta samo
 * opseg; startup se razrešava iz liste mojih startupa po `startupId`.
 */
export function noteSearchRowModel(hit: NoteSearchHit, startups: ReadonlyArray<NoteStartup>): NoteRowModel {
  const startup = hit.startupId === null ? null : (startups.find((item) => item._id === hit.startupId) ?? null);
  // Beleška iz startupa koji nije u listi (ne bi smela da stigne) se ne izdaje za „Lično".
  const meta = hit.startupId !== null && startup === null ? 'Startup' : noteScopeLabel({ startup });
  const title = noteDisplayTitle(hit);
  const preview = notePreview(hit);
  return {
    id: hit._id,
    title,
    preview,
    meta,
    startup: startup === null ? null : { name: startup.name, logoUrl: startup.logoUrl },
    depth: 0,
    indent: 0,
    label: rowLabel([title, preview, meta], 0),
  };
}

/** Pretraga ide serveru tek od `NOTE_SEARCH_MIN` znakova; kraće je obična lista. */
export function isSearchingNotes(term: string): boolean {
  return term.trim().length >= NOTE_SEARCH_MIN;
}

/** Automatsko dovlačenje dok lista nije `Exhausted` — ali ne preko granice i ne u pretrazi. */
export function shouldAutoLoadNotes(input: {
  status: NotesListStatus;
  loaded: number;
  searching: boolean;
}): boolean {
  return !input.searching && input.status === 'CanLoadMore' && input.loaded < NOTES_AUTO_LOAD_MAX;
}

/** Iza granice se dovlači skrolom do kraja. */
export function shouldLoadMoreOnEnd(status: NotesListStatus): boolean {
  return status === 'CanLoadMore';
}

/** Lista nije do kraja učitana (broj u zaglavlju dobija „+"). */
export function hasMoreNotes(status: NotesListStatus): boolean {
  return status === 'CanLoadMore' || status === 'LoadingMore';
}

/**
 * Odredište brzog unosa: izabran startup ili Lično (pod „Sve" i „Lično" beleška
 * ide u Lično). `null` startup = Lično.
 */
export function quickNoteTarget<S extends NoteStartup>(
  filter: NoteFilter,
  startups: ReadonlyArray<S>,
): S | null {
  if (filter.kind !== 'startup') return null;
  return startups.find((startup) => startup._id === filter.startupId) ?? null;
}

/** Red ispod polja brze beleške: gde će se sačuvati. */
export function quickNoteHint(target: Pick<NoteStartup, 'name'> | null): string {
  return `Čuva se u: ${target?.name ?? 'Lično'}`;
}

/** Odredište iz filtera za sheet nove beleške: startup → njegov id, ostalo → Lično. */
export function filterStartupId<Id extends string>(filter: NoteFilter<Id>): Id | null {
  return filter.kind === 'startup' ? filter.startupId : null;
}

/**
 * „Sredi raspored" radi nad učitanim beleškama jednog startupa koje nisu
 * podbeleške (ugnježdene putuju sa roditeljem), najviše `TIDY_NOTES_MAX`.
 */
export function tidyNoteTargets<T extends Pick<NoteNode, '_id' | 'parentThoughtId'>>(
  notes: ReadonlyArray<T>,
): { targets: T[]; topLevelCount: number; truncated: boolean } {
  const topLevel = notes.filter((note) => note.parentThoughtId === null);
  return {
    targets: topLevel.slice(0, TIDY_NOTES_MAX),
    topLevelCount: topLevel.length,
    truncated: topLevel.length > TIDY_NOTES_MAX,
  };
}
