"use client";

import { useMemo, useState } from "react";

import { useQueryResult } from "@/components/workspace/workspace-error-boundary";
import type { CommandCenterAssignee, CommandCenterTask } from "@/components/workspace/startup-tasks/command-center-model";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Ogledalo `MAX_ASSIGNEE_LOOKUP_PAGES` u `taskAssignees.ts`: `listForTasks` BACA iznad toga. */
export const MAX_ASSIGNEE_LOOKUP = 300;

export type TriageMember = {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TriageData =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      tasks: CommandCenterTask[];
      hasMore: boolean;
      members: TriageMember[];
      /** `null` dok se izvršioci prvi put ne učitaju. */
      assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>> | null;
    };

/** Poslednja učitana vrednost (izvedeno stanje, bez efekta). */
export function useLastReady<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

/**
 * Podaci trijaže tima (PROSTOR K19): `tasks.commandCenter`, `taskAssignees.listForTasks`
 * i `startups.listMembers`. Trijaža i Tim čitaju iste tri pretplate (Convex ih spaja),
 * a greška bilo koje daje stanje `error` — blok pada za sebe, ne ceo ekran.
 */
export function useTriageData(startupId: Id<"startups">): TriageData {
  const overview = useQueryResult(api.tasks.commandCenter, { startupId });
  const members = useQueryResult(api.startups.listMembers, { startupId, limit: 50 });
  const tasks = useMemo(() => overview.data?.tasks ?? [], [overview.data]);
  const lookupIds = useMemo(() => tasks.slice(0, MAX_ASSIGNEE_LOOKUP).map((task) => task._id), [tasks]);

  // Argumenti se menjaju sa svakom promenom liste (završen zadatak ispada):
  // do novog odgovora važi poslednji, da kvačice ne trepnu u „zaključano".
  const assignees = useQueryResult(
    api.taskAssignees.listForTasks,
    lookupIds.length > 0 ? { startupId, taskPageIds: lookupIds } : "skip",
  );
  const assigneeRows = useLastReady(assignees.data);
  const assigneesByTaskId = useMemo(
    () =>
      lookupIds.length === 0
        ? new Map<string, CommandCenterAssignee[]>()
        : assigneeRows === undefined
          ? null
          : new Map<string, CommandCenterAssignee[]>(assigneeRows.map((row) => [row.taskPageId, row.assignees])),
    [assigneeRows, lookupIds.length],
  );
  const memberList = useMemo<TriageMember[]>(
    () =>
      (members.data ?? []).map((member) => ({
        profileId: member.profile._id,
        displayName: member.profile.displayName,
        avatarUrl: member.profile.avatarUrl ?? null,
      })),
    [members.data],
  );

  const failed = overview.failed || members.failed || assignees.failed;
  const hasOverview = overview.data !== undefined && members.data !== undefined;
  const hasLookup = lookupIds.length === 0 || assigneesByTaskId !== null;
  const hasMore = overview.data?.hasMore ?? false;
  // Isti objekat dok se podaci ne promene: zone i prijava redova ne računaju se iznova na svaki render.
  return useMemo<TriageData>(() => {
    if (failed) return { status: "error" };
    // Dozvole zavise od izvršilaca: dok prvi put ne stignu, blok je u učitavanju.
    if (!hasOverview || !hasLookup) return { status: "loading" };
    return { status: "ready", tasks, hasMore, members: memberList, assigneesByTaskId };
  }, [failed, hasOverview, hasLookup, tasks, hasMore, memberList, assigneesByTaskId]);
}
