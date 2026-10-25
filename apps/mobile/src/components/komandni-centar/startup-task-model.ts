/**
 * Zadaci u startupu na telefonu (K18) — od odgovora servera do sekcija sa
 * redovima. ČISTO (vitest). Red je zajednički `TaskRowModel` iz shared
 * `startup-tasks.ts` (isti kao web K17), pa dozvole, radnje i zadržavanje posle
 * kvačice odlučuju isto kao na webu i kao na ličnom nivou.
 *
 * - Komandni centar: četiri mobilne sekcije (prekoračeno · danas · sledeće ·
 *   blokirano) iz `bucketTasksForToday`.
 * - „Svi zadaci": grupe po statusu (ili ravna lista kad je status filtriran).
 */
import {
  applyStartupHolds,
  rowFromStartupTask,
  STARTUP_TASK_STATUSES,
  type StartupMini,
  type StartupTaskHold,
  type StartupTaskLike,
  type StartupTaskSection,
  type StartupTaskStatus,
  type TaskRowModel,
} from '@devotion/shared';

import { bucketTasksForToday, TODAY_SECTION_ORDER, type TodaySection } from '@/lib/deadline';

/** Imena lista zadržavanja (sekcije `<lista>:<sekcija>`). */
export const COMMAND_CENTER_LIST = 'command';
export const ALL_TASKS_LIST = 'tasks';

export type StartupRowsContext = {
  profileId: string;
  startup: StartupMini;
  areaLabels: ReadonlyMap<string, string>;
  /**
   * Izvršioci po zadatku; `null` dok se `taskAssignees.listForTasks` ne učita.
   * Server vraća unos za SVAKI traženi zadatak (prazan niz = nema izvršilaca), pa
   * zadatak bez unosa znači „nepoznato".
   */
  assigneeIdsByTask: ReadonlyMap<string, ReadonlyArray<string>> | null;
  /** Lista je već filtrirana na mene: izvršilac sam i bez učitanih izvršilaca. */
  assumeAssignee?: boolean;
  /** Plan za danas: refKey → id stavke plana. */
  plannedKeys: ReadonlyMap<string, string>;
};

export function startupRow(task: StartupTaskLike, context: StartupRowsContext): TaskRowModel {
  return rowFromStartupTask(task, {
    profileId: context.profileId,
    startup: context.startup,
    areaLabels: context.areaLabels,
    // Zadatak bez unosa (van prvih 300 ili tek dodat) = ne znamo izvršioce, ne „nema ih".
    assigneeIds: context.assigneeIdsByTask ? (context.assigneeIdsByTask.get(task._id) ?? null) : null,
    assumeAssignee: context.assumeAssignee,
    plannedKeys: context.plannedKeys,
  });
}

export type HoldsContext = {
  holds: ReadonlyMap<string, StartupTaskHold>;
  pending: ReadonlyMap<string, boolean>;
};

export type CommandSection = StartupTaskSection<TodaySection>;

/**
 * Sekcije Komandnog centra sa redovima. Zadržan red (kvačica) ostaje u sekciji
 * gde je dodirnut dok se kvačica ne smiri — i kad ga server već skloni
 * (Komandni centar ne prikazuje završene).
 */
export function buildCommandSections<T extends StartupTaskLike & { taskSortAt?: number }>(
  tasks: ReadonlyArray<T>,
  now: number,
  context: StartupRowsContext & HoldsContext,
): CommandSection[] {
  const buckets = bucketTasksForToday(tasks, now);
  return applyStartupHolds(
    COMMAND_CENTER_LIST,
    TODAY_SECTION_ORDER.map((id) => ({ id, rows: buckets[id].map((task) => startupRow(task, context)) })),
    context.holds,
    context.pending,
  );
}

export type StatusSection = StartupTaskSection<StartupTaskStatus>;

/**
 * „Svi zadaci": grupa po statusu u redosledu ekrana; praznih grupa nema. Zadržan
 * red ostaje u grupi gde je bio, kao završen, dok se kvačica ne smiri.
 */
export function buildStatusSections(
  tasks: ReadonlyArray<StartupTaskLike>,
  context: StartupRowsContext & HoldsContext,
): StatusSection[] {
  const rows = tasks.map((task) => startupRow(task, context));
  return applyStartupHolds(
    ALL_TASKS_LIST,
    STARTUP_TASK_STATUSES.map((id) => ({ id, rows: rows.filter((row) => row.status === id) })),
    context.holds,
    context.pending,
  );
}

/** Ravna lista (status je već filtriran): jedna sekcija, redosled kao sa servera. */
export function buildFlatSection(
  tasks: ReadonlyArray<StartupTaskLike>,
  context: StartupRowsContext & HoldsContext,
  status: StartupTaskStatus,
): StatusSection[] {
  const rows = tasks.map((task) => startupRow(task, context));
  return applyStartupHolds(
    ALL_TASKS_LIST,
    [{ id: status, rows }],
    context.holds,
    context.pending,
  );
}

export function sectionRowCount(sections: ReadonlyArray<StartupTaskSection>): number {
  return sections.reduce((sum, section) => sum + section.rows.length, 0);
}
