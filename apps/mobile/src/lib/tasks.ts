/**
 * Tipovi izvedeni iz Convex API-ja (jedan izvor istine — bez ručnog dupliranja
 * oblika) i konstante za segmentni prekidač taba „Danas".
 */
import type { FunctionReturnType } from 'convex/server';

import type { api } from '@/convex/_generated/api';

/** Jedan otvoreni zadatak iz `tasks.commandCenter`. */
export type CommandCenterTask =
  FunctionReturnType<typeof api.tasks.commandCenter>['tasks'][number];

/** Izvršilac zadatka iz `taskAssignees.listForTasks`. */
export type TaskAssignee =
  FunctionReturnType<typeof api.taskAssignees.listForTasks>[number]['assignees'][number];

/** Član tima iz `startups.listMembers` (za izbor izvršioca). */
export type StartupMember =
  FunctionReturnType<typeof api.startups.listMembers>[number];

/** Oblast iz `startups.get` (za labelu i boju na kartici / u quick-add-u). */
export type StartupArea = FunctionReturnType<typeof api.startups.get>['areas'][number];

export type TodaySegmentId = 'overview' | 'mine';

export const TODAY_SEGMENTS = [
  { id: 'overview', label: 'Pregled' },
  { id: 'mine', label: 'Moji zadaci' },
] as const satisfies ReadonlyArray<{ id: TodaySegmentId; label: string }>;
