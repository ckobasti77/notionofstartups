import type { StartupMini } from '@devotion/shared';
import { useQuery } from 'convex/react';
import { useMemo } from 'react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useRetained } from '@/hooks/use-retained';

/** Ogledalo `MAX_ASSIGNEE_LOOKUP_PAGES` u `taskAssignees.ts`. */
const MAX_ASSIGNEE_LOOKUP = 300;

/**
 * Podaci iz kojih se računaju Trijaža i Tim (PROSTOR K19) — isti izvori kao ranije u
 * celom Komandnom centru: `tasks.commandCenter`, `taskAssignees.listForTasks`,
 * `startups.listMembers`, `startups.get`. Dva bloka (Trijaža, Tim) zovu ovaj hook
 * svaki u svojoj granici greške; Convex deli iste pretplate, pa nema duplog posla
 * na serveru. Greška upita se baca u render i hvata je granica OVOG bloka.
 */
export function useTriageData(startupId: Id<'startups'>) {
  const profile = useQuery(api.profiles.getCurrent, {});
  const startupArg = { startupId };
  const command = useQuery(api.tasks.commandCenter, startupArg);
  const startup = useQuery(api.startups.get, startupArg);
  const members = useQuery(api.startups.listMembers, { startupId, limit: 50 });

  const tasks = command?.tasks;
  // `listForTasks` BACA iznad 300 id-jeva (`MAX_ASSIGNEE_LOOKUP_PAGES`), a Komandni centar
  // ih može imati do 600: zadaci iznad granice ostaju bez poznatih izvršilaca (dozvole
  // padaju na „ne znamo"), umesto da ceo blok padne u granicu greške.
  const taskIds = useMemo(
    () => tasks?.slice(0, MAX_ASSIGNEE_LOOKUP).map((task) => task._id) ?? [],
    [tasks],
  );
  const liveAssigneeRows = useQuery(
    api.taskAssignees.listForTasks,
    taskIds.length > 0 ? { startupId, taskPageIds: taskIds } : 'skip',
  );
  // Svaka promena liste (završen zadatak…) menja argumente pa upit nakratko vraća
  // `undefined`: zadržavamo poslednji odgovor da kvačice ne trepnu u zaključano
  // i da lista ne ode u skeleton (par web `useLastReady`).
  const assigneeRows = useRetained(liveAssigneeRows ?? null) ?? undefined;

  type Assignees = NonNullable<typeof assigneeRows>[number]['assignees'];
  const assigneesByTask = useMemo(() => {
    const map = new Map<string, Assignees>();
    assigneeRows?.forEach((row) => map.set(row.taskPageId, row.assignees));
    return map;
  }, [assigneeRows]);
  // Dok se izvršioci ne učitaju, ne-kreator nije izvršilac (server je izvor istine).
  const assigneeIdsByTask = useMemo<ReadonlyMap<string, ReadonlyArray<string>> | null>(() => {
    if (taskIds.length > 0 && assigneeRows === undefined) return null;
    return new Map([...assigneesByTask].map(([id, list]) => [id, list.map((a) => a.profileId)]));
  }, [taskIds, assigneeRows, assigneesByTask]);

  const areaLabels = useMemo(() => {
    const map = new Map<string, string>();
    startup?.areas.forEach((area) => map.set(area._id, area.label));
    return map;
  }, [startup]);
  const startupMini = useMemo<StartupMini | null>(
    () => (startup ? { _id: startup._id, name: startup.name, logoUrl: startup.logoUrl ?? null } : null),
    [startup],
  );

  // Vlasnik startupa i admin menjaju i zaključane zadatke (server: P1) — red ih ne sme lokalno zaključati.
  const isManager =
    profile !== undefined && profile !== null && startup !== undefined && startup !== null
      ? startup.createdByProfileId === profile._id || profile.role === 'admin'
      : false;

  return {
    myId: profile?._id ?? null,
    isManager,
    command,
    tasks,
    members,
    startupMini,
    areaLabels,
    assigneesByTask,
    assigneeIdsByTask,
    /** `tasks.commandCenter` seče na 150 zadataka po statusu i javi to kroz `hasMore`. */
    hasMore: command?.hasMore === true,
  };
}
