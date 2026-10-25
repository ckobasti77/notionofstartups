/**
 * Komandni centar (K17) — od odgovora `tasks.commandCenter` + izvršilaca do
 * zona sa redovima. ČISTO (vitest). Zone su postojeća trijaža iz
 * `lib/deadline.ts` (gori · danas · nedelja · kasnije); red je zajednički
 * `TaskRowModel` (shared `startup-tasks.ts`), pa radnje i dozvole rade kao na
 * ličnom nivou.
 */
import {
  applyStartupHolds,
  rowFromStartupTask,
  type StartupMini,
  type StartupTaskHold,
  type StartupTaskLike,
  type StartupTaskSection,
  type TaskRowModel,
} from "@devotion/shared";

import { bucketTasksByZone, classifyDeadline, TRIAGE_ZONE_ORDER, type TriageZone } from "@/lib/deadline";

/** Lista zadržavanja (sekcije `zones:<zona>`). */
export const COMMAND_CENTER_LIST = "zones";
export const UNASSIGNED_KEY = "unassigned";

export type CommandCenterTask = StartupTaskLike & { taskSortAt: number };

export type CommandCenterAssignee = { profileId: string; displayName: string; avatarUrl: string | null };

export type CommandCenterZone = StartupTaskSection<TriageZone>;

export type WorkloadCount = { key: string; open: number; overdue: number; urgent: number };

/** Filter člana: `null` = svi, `UNASSIGNED_KEY` = bez izvršioca, inače id profila. */
export function filterByMember<T extends { _id: string }>(
  tasks: ReadonlyArray<T>,
  memberFilter: string | null,
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>,
): T[] {
  if (memberFilter === null) return [...tasks];
  if (memberFilter === UNASSIGNED_KEY) {
    return tasks.filter((task) => (assigneesByTaskId.get(task._id) ?? []).length === 0);
  }
  return tasks.filter((task) =>
    (assigneesByTaskId.get(task._id) ?? []).some((assignee) => assignee.profileId === memberFilter),
  );
}

/**
 * Opterećenje po članu (isto kao do sada): svi izvršioci su ravnopravni, pa
 * zadatak ulazi u opterećenje svakog od njih; bez izvršioca → „Nedodeljeno".
 */
export function workloadCounts(
  tasks: ReadonlyArray<CommandCenterTask>,
  memberIds: ReadonlyArray<string>,
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>,
  now: number,
): WorkloadCount[] {
  const entries = memberIds.map((key) => ({ key, open: 0, overdue: 0, urgent: 0 }));
  const unassigned = { key: UNASSIGNED_KEY, open: 0, overdue: 0, urgent: 0 };
  const byKey = new Map(entries.map((entry) => [entry.key, entry] as const));
  for (const task of tasks) {
    const assignees = assigneesByTaskId.get(task._id) ?? [];
    const targets =
      assignees.length === 0
        ? [unassigned]
        : assignees.flatMap((assignee) => {
            const entry = byKey.get(assignee.profileId);
            return entry ? [entry] : [];
          });
    const overdue =
      classifyDeadline({ dueDate: task.dueDate, taskStatus: task.taskStatus, now }).urgency === "overdue";
    for (const entry of targets) {
      entry.open += 1;
      if (overdue) entry.overdue += 1;
      if (task.taskPriority === "urgent") entry.urgent += 1;
    }
  }
  return unassigned.open > 0 ? [...entries, unassigned] : entries;
}

/**
 * Zone sa redovima. Zadržan red (kvačica) ostaje u zoni gde je kliknut dok
 * se kvačica ne smiri — i kad ga server već skloni (Komandni centar ne
 * prikazuje završene) — pa se Flip-om zatvori praznina.
 */
export function buildZones(
  tasks: ReadonlyArray<CommandCenterTask>,
  context: {
    now: number;
    profileId: string;
    startup: StartupMini;
    areaLabels: ReadonlyMap<string, string>;
    /** `null` dok se izvršioci ne učitaju. */
    assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>> | null;
    plannedKeys: ReadonlyMap<string, string>;
    holds: ReadonlyMap<string, StartupTaskHold>;
    pending: ReadonlyMap<string, boolean>;
  },
): CommandCenterZone[] {
  const buckets = bucketTasksByZone([...tasks], context.now);
  const toRow = (task: CommandCenterTask): TaskRowModel =>
    rowFromStartupTask(task, {
      profileId: context.profileId,
      startup: context.startup,
      areaLabels: context.areaLabels,
      assigneeIds: context.assigneesByTaskId
        ? (context.assigneesByTaskId.get(task._id) ?? []).map((assignee) => assignee.profileId)
        : null,
      plannedKeys: context.plannedKeys,
    });
  return applyStartupHolds(
    COMMAND_CENTER_LIST,
    TRIAGE_ZONE_ORDER.map((zone) => ({ id: zone, rows: buckets[zone].map(toRow) })),
    context.holds,
    context.pending,
  );
}

export function zoneRowCount(zones: ReadonlyArray<CommandCenterZone>): number {
  return zones.reduce((sum, zone) => sum + zone.rows.length, 0);
}
