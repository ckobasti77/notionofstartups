import type { Id } from '@/convex/_generated/dataModel';
import type { TaskPriority, TaskStatus } from '@/lib/task-meta';

/**
 * In-memory nacrt sheeta za kreiranje stranice (lanac 7). Modulske promenljive
 * po uzoru na `lib/undo.ts`: nacrt preživljava SLUČAJNO zatvaranje sheeta
 * (dodir po backdrop-u, prevlačenje nadole) i navigaciju, jer komponenta pri
 * zatvaranju snimi stanje ovde, a pri otvaranju ga vrati.
 *
 * NE preživljava restart aplikacije — namerno: `expo-secure-store` (jedino
 * skladište u aplikaciji) ima ~2KB granicu po vrednosti, a telo beleške sme
 * 20KB+; ista odluka kao za stek poništavanja (`ZA-POPRAVKU.md` §13).
 *
 * Ključ je `${startupId}:${areaId}:${parentPageId ?? 'root'}` — nacrt se vraća
 * SAMO na mestu gde je i nastao, pa ne može da „iskoči" pod tuđim zaglavljem
 * (zamka zbog koje je stari sheet brisao nacrt na svako zatvaranje).
 */

/** Oblik `{id, text, completed}` — isti kao `CheckpointDraft` u draft listi. */
type DraftCheckpoint = { id: string; text: string; completed: boolean };

/** Izabran fajl za prilog — isti oblik koji koristi upload tok. */
export type DraftFilePick = {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
};

export type PageCreateDraft = {
  title: string;
  kind: 'note' | 'task' | 'file' | 'table';
  noteHtml: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: Id<'profiles'>[];
  dueAt: number | null;
  instructions: string;
  checkpoints: DraftCheckpoint[];
  tableFile: { name: string; matrix: string[][]; truncatedCells: number } | null;
  firstRowIsHeader: boolean;
  manualColumns: string[];
  manualRows: string[][];
  filePicks: DraftFilePick[];
  savedAt: number;
};

const drafts = new Map<string, PageCreateDraft>();

export function createDraftKey(
  startupId: Id<'startups'>,
  areaId: Id<'startupAreas'>,
  parentPageId: Id<'pages'> | null,
): string {
  return `${startupId}:${areaId}:${parentPageId ?? 'root'}`;
}

export function readCreateDraft(key: string): PageCreateDraft | null {
  return drafts.get(key) ?? null;
}

export function writeCreateDraft(key: string, draft: PageCreateDraft): void {
  drafts.set(key, draft);
}

export function clearCreateDraft(key: string): void {
  drafts.delete(key);
}

/** Samo za testove — stanje modula je globalno. */
export function resetCreateDraftsForTest(): void {
  drafts.clear();
}
