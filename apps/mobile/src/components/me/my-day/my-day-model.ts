/**
 * Moj dan (v1, K09) — od odgovora `myDay.overview` do redova za prikaz.
 * ČISTO (vitest). Grupisanje je iz `@devotion/shared` (isto kao web, P5);
 * oblik reda i tekstovi su par web `components/me/my-day/my-day-model.ts`.
 * K10/K12 ovo zamenjuju zajedničkim `task-row.ts` iz shared paketa (E4).
 */
import {
  fromOverview,
  groupMyDay,
  type MyDayGrouping,
  type MyDayOverviewLike,
  type MyDayRow,
  type MyDaySectionId,
  type TaskPriorityKey,
  type TaskStatusKey,
} from '@devotion/shared';

export type OverviewStartup = { _id: string; name: string; logoUrl: string | null };

/** Strukturni oblik `api.myDay.overview` koji ovaj prikaz koristi. */
export type MyDayOverviewData = MyDayOverviewLike & {
  startups: ReadonlyArray<OverviewStartup>;
  capped: { tasks: boolean; personal: boolean; history: boolean };
};

export type MyDayRowData = {
  /** `refKey`: "task:<id>" | "personal:<id>". */
  key: string;
  kind: 'task' | 'personal';
  id: string;
  title: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey | null;
  dueDate: number | null;
  /** `null` = „Lično". */
  startup: OverviewStartup | null;
  areaLabel: string | null;
  done: boolean;
  /** Sme li ja da menjam status (kreator ili izvršilac; lični — uvek). */
  canComplete: boolean;
};

export type MyDaySectionModel = {
  id: MyDaySectionId;
  title: string;
  collapsedByDefault: boolean;
  rows: MyDayRowData[];
};

export type MyDayModel = {
  sections: MyDaySectionModel[];
  progress: MyDayGrouping['progress'];
  counts: MyDayGrouping['counts'];
  /** Neki izvor u `overview` je odsečen — prikaz je deo zadataka. */
  capped: boolean;
};

/** Razlog za onemogućenu kvačicu (plan K07 §3, E15). */
export const STATUS_DENIED_REASON = 'Status menja kreator zadatka ili osoba kojoj je dodeljen.';

export function rowData(row: MyDayRow, startups: ReadonlyMap<string, OverviewStartup>): MyDayRowData {
  const startup =
    row.startupId === null
      ? null
      : (startups.get(row.startupId) ?? {
          _id: row.startupId,
          name: row.startupName ?? 'Startup',
          logoUrl: null,
        });
  return {
    key: row.key,
    kind: row.kind,
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    startup,
    areaLabel: row.areaLabel,
    done: row.status === 'done',
    canComplete: row.kind === 'personal' || row.isCreator || row.isAssignee,
  };
}

export function buildMyDay(overview: MyDayOverviewData, now: number, zone?: string): MyDayModel {
  const grouping = groupMyDay(fromOverview(overview, now, zone));
  const startups = new Map(overview.startups.map((startup) => [startup._id, startup] as const));
  return {
    sections: grouping.sections.map((section) => ({
      id: section.id,
      title: section.title,
      collapsedByDefault: section.collapsedByDefault,
      rows: section.rows.map((row) => rowData(row, startups)),
    })),
    progress: grouping.progress,
    counts: grouping.counts,
    capped: overview.capped.tasks || overview.capped.personal,
  };
}

/** „2 kasni, 3 za danas." — sažetak ispod pozdrava; delovi sa nulom se izostavljaju. */
export function daySummary(counts: Record<MyDaySectionId, number>): string {
  const parts: string[] = [];
  if (counts.overdue > 0) parts.push(`${counts.overdue} kasni`);
  if (counts.today > 0) parts.push(`${counts.today} za danas`);
  return parts.length === 0 ? 'Ništa ne gori.' : `${parts.join(', ')}.`;
}

/** Ime za pozdrav: prva reč imena za prikaz. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

/** „3 od 7 završeno" / „Dan je završen." — vrednost prstena za čitač ekrana. */
export function progressValueText(progress: { done: number; total: number }): string {
  if (progress.total > 0 && progress.done >= progress.total) return 'Dan je završen.';
  return `${progress.done} od ${progress.total} završeno`;
}

/**
 * Status na koji se startup zadatak vraća kad se kvačica poništi: prethodni
 * (ako ga znamo iz ove sesije), inače „Sledeće" (plan K07 §1, `completionCall`).
 */
export function reopenStatus(previous: TaskStatusKey | undefined): Exclude<TaskStatusKey, 'done' | 'open'> {
  if (previous === undefined || previous === 'done' || previous === 'open') return 'next';
  return previous;
}

export type CompletionHold = {
  /** Sekcija u kojoj je red bio kad je kvačica dodirnuta. */
  section: MyDaySectionId;
  /** Indeks u toj sekciji — red ostaje na svom mestu dok se kvačica ne smiri. */
  index: number;
  row: MyDayRowData;
  done: boolean;
};

/**
 * Primeni „zadržavanje" (plan K07 E7): posle dodira na kvačicu red ostaje na
 * svom mestu, kao završen, dok se spring kvačice ne smiri; tek onda ga podaci
 * sa servera presele (npr. u „Završeno danas"). `pending` drži željeni status
 * dok mutacija ne potvrdi (Convex osveži upit pre nego što mutacija vrati).
 */
export function applyCompletionOverrides(
  model: MyDayModel,
  holds: ReadonlyMap<string, CompletionHold>,
  pending: ReadonlyMap<string, boolean>,
): MyDayModel {
  if (holds.size === 0 && pending.size === 0) return model;
  const sections = model.sections.map((section) => ({
    ...section,
    rows: section.rows
      .filter((row) => !holds.has(row.key))
      .map((row) => (pending.has(row.key) ? { ...row, done: pending.get(row.key) === true } : row)),
  }));
  const byId = new Map(sections.map((section) => [section.id, section] as const));
  const ordered = [...holds.values()].sort((a, b) => a.index - b.index);
  for (const hold of ordered) {
    const target = byId.get(hold.section);
    if (!target) continue;
    const index = Math.min(Math.max(hold.index, 0), target.rows.length);
    target.rows.splice(index, 0, { ...hold.row, done: hold.done });
  }
  return { ...model, sections };
}
