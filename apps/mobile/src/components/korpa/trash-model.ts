/**
 * Korpa na telefonu (PROSTOR P3, plan K07 §5.4) — čista logika reda: tekst,
 * razlog onemogućenog „Vrati", cilj „Otvori" posle vraćanja, brojevi segmenata.
 * Bez React-a; deli je Dizajn katalog. Ogledalo web
 * `apps/web/components/workspace/trash/trash-model.ts` (isti tekstovi); vreme i
 * podstranice dolaze iz `@devotion/shared` (`trash.ts`), kao na webu.
 */
import { subpagesLabel, trashMetaLabel, type TrashKind } from '@devotion/shared';
import type { FunctionReturnType } from 'convex/server';

import type { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

export type TrashItem = FunctionReturnType<typeof api.trash.list>['page'][number];
export type TrashCounts = FunctionReturnType<typeof api.trash.counts>;
export type RestorableTrashItem = Exclude<TrashItem, { kind: 'recovered' }>;
export type RecoveredTrashItem = Extract<TrashItem, { kind: 'recovered' }>;
export type TrashFileCategory = Extract<TrashItem, { kind: 'file' }>['category'];

export const RETURNS_TO_AREA_ROOT = 'Vraća se na vrh oblasti';
export const FILE_PAGE_IN_TRASH = 'Stranica ovog fajla je u Korpi — prvo vrati nju.';
export const NO_RESTORE_RIGHT = 'Nemaš pravo da vratiš ovu stavku.';
export const DISMISSED_RECOVERED = 'Uklonjeno iz Oporavljenog.';
/** Najviše isečaka Oporavljenog po redu; ostatak je „+N". */
export const RECOVERED_EXCERPTS_SHOWN = 3;
/** Stavki po strani (`trash.list` prima najviše 50, K07: 30). */
export const TRASH_PAGE_SIZE = 30;

/** Prazna stanja po segmentu (jedna rečenica, bez obećanja roka) — isto kao web. */
export const TRASH_EMPTY_COPY: Record<TrashKind, { title: string; description?: string }> = {
  page: { title: 'Korpa je prazna.', description: 'Obrisano ovde čeka dok ga neko iz tima ne vrati.' },
  idea: { title: 'Nema obrisanih ideja.' },
  file: { title: 'Nema uklonjenih priloga.' },
  recovered: { title: 'Nema oporavljenih tekstova.' },
};

/** Vrsta priloga — iste reči kao web `PAGE_FILE_CATEGORY_LABELS`. */
export const TRASH_FILE_CATEGORY_LABELS: Record<TrashFileCategory, string> = {
  image: 'Slika',
  video: 'Video',
  pdf: 'PDF',
  audio: 'Audio',
  sheet: 'Tabela',
  document: 'Dokument',
};

/** Veličina priloga — isti zapis kao web `formatFileSize`. */
export function formatTrashFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function trashItemKey(item: TrashItem): string {
  switch (item.kind) {
    case 'page':
      return `page:${item.pageId}`;
    case 'idea':
      return `idea:${item.ideaId}`;
    case 'file':
      return `file:${item.fileId}`;
    case 'recovered':
      return `recovered:${item.recoveredId}`;
  }
}

export function trashItemTitle(item: TrashItem): string {
  return item.kind === 'file' ? item.name : item.title;
}

/**
 * Gde je stavka bila: „Razvoj › Lansiranje" (stranica), „PDF · 2.4 MB · na
 * stranici „X”" (prilog). Ideja i Oporavljeno nemaju mesto.
 */
export function trashItemLocation(item: TrashItem): string | null {
  if (item.kind === 'page') {
    return item.parentTitle ? `${item.areaLabel} › ${item.parentTitle}` : item.areaLabel;
  }
  if (item.kind === 'file') {
    return `${TRASH_FILE_CATEGORY_LABELS[item.category]} · ${formatTrashFileSize(item.size)} · na stranici „${item.pageTitle}”`;
  }
  return null;
}

function textsWord(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return 'tekst';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'teksta';
  return 'tekstova';
}

/** Meta red: „Sa 3 podstranice · Obrisao/la Ana · pre 2 dana · Vraća se na vrh oblasti". */
export function trashItemMeta(item: TrashItem, now: number, zone?: string): string {
  if (item.kind === 'recovered') {
    const count = item.contributions.length;
    const owner = item.owner ? `Sačuvano za ${item.owner.displayName}` : 'Sačuvano';
    return `${owner} · ${count} ${textsWord(count)}`;
  }
  const parts: string[] = [];
  if (item.kind === 'page' && item.descendantCount > 0) {
    parts.push(`Sa ${subpagesLabel(item.descendantCount)}`);
  }
  parts.push(
    trashMetaLabel(
      { archivedAt: item.archivedAt, archivedByName: item.archivedBy?.displayName ?? null },
      now,
      zone,
    ),
  );
  if (item.kind === 'page' && item.parentPageId !== null && !item.parentAvailable) {
    parts.push(RETURNS_TO_AREA_ROOT);
  }
  return parts.join(' · ');
}

/** Isečci Oporavljenog: najviše tri („Ana: …") i koliko ih je preostalo. */
export function recoveredExcerpts(item: RecoveredTrashItem): {
  lines: Array<{ key: string; author: string; excerpt: string }>;
  more: number;
} {
  const shown = item.contributions.slice(0, RECOVERED_EXCERPTS_SHOWN);
  return {
    lines: shown.map((contribution) => ({
      key: contribution._id,
      author: contribution.author?.displayName ?? 'Raniji tekst tima',
      excerpt: contribution.excerpt,
    })),
    more: Math.max(0, item.contributions.length - shown.length),
  };
}

/** Zašto „Vrati" ne radi (`null` = radi). Prilog čija je stranica u Korpi ide prvi. */
export function restoreBlockReason(item: RestorableTrashItem): string | null {
  if (item.kind === 'file' && !item.pageAvailable) return FILE_PAGE_IN_TRASH;
  if (!item.canRestore) return NO_RESTORE_RIGHT;
  return null;
}

export type TrashRestoreTarget =
  | { kind: 'page'; id: Id<'pages'> }
  | { kind: 'idea'; id: Id<'ideaNodes'> }
  | { kind: 'file'; id: Id<'pageFiles'> };

export function restoreTarget(item: RestorableTrashItem): TrashRestoreTarget {
  if (item.kind === 'page') return { kind: 'page', id: item.pageId };
  if (item.kind === 'idea') return { kind: 'idea', id: item.ideaId };
  return { kind: 'file', id: item.fileId };
}

/**
 * Kuda vodi „Otvori" posle vraćanja. Za razliku od weba (lista ideja), telefon
 * ima detalj ideje, pa ideja vodi na nju; prilog vodi na svoju stranicu.
 */
export type TrashOpenTarget =
  | { kind: 'page'; pageId: Id<'pages'> }
  | { kind: 'idea'; ideaId: Id<'ideaNodes'> };

export function openTargetAfterRestore(item: RestorableTrashItem): TrashOpenTarget {
  if (item.kind === 'idea') return { kind: 'idea', ideaId: item.ideaId };
  return { kind: 'page', pageId: item.pageId };
}

/** Broj na segmentu: „99+" kad je server odsekao brojanje; `null` za nulu. */
export function trashCountLabel(counter: { count: number; capped: boolean } | undefined): string | null {
  if (!counter || counter.count === 0) return null;
  return counter.capped ? `${counter.count}+` : String(counter.count);
}
