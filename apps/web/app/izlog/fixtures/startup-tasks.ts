/**
 * Fixture podaci za zadatke u startupu (K17): Komandni centar Cluck Rush-a,
 * moji zadaci za tablu, nacrt brzog pravljenja i detalj zadatka. Nikad ne idu
 * na server.
 */
import type { StartupTaskLike } from "@devotion/shared";

import type { PanelPerson } from "@/components/me/task-panel/startup-task-panel-view";
import type { CommandCenterAssignee, CommandCenterTask } from "@/components/workspace/startup-tasks/command-center-model";

import { fakeId } from "./ids";
import { IZLOG_PROFILE, IZLOG_STARTUPS } from "./me";
import { IZLOG_NOW, oktobar } from "./now";

export const IZLOG_ST_STARTUP = IZLOG_STARTUPS[0];
const [DEV, MARKETING, SALES, OSTALO] = IZLOG_ST_STARTUP.areas;

const ME = IZLOG_PROFILE._id;
const MILICA = fakeId("profiles", 2);
const NIKOLA = fakeId("profiles", 3);
const ANA = fakeId("profiles", 4);

export const IZLOG_ST_MEMBERS: PanelPerson[] = [
  { _id: ME, displayName: "Jovan Milojević", avatarUrl: null },
  { _id: MILICA, displayName: "Milica Jovanović", avatarUrl: null },
  { _id: NIKOLA, displayName: "Nikola Petrović", avatarUrl: null },
  { _id: ANA, displayName: "Ana Ilić", avatarUrl: null },
];

const person = (id: string): CommandCenterAssignee => {
  const member = IZLOG_ST_MEMBERS.find((item) => item._id === id);
  return { profileId: id, displayName: member?.displayName ?? "Član", avatarUrl: null };
};

let order = 0;
const task = (
  n: number,
  title: string,
  fields: Partial<CommandCenterTask> & { areaId: string },
): CommandCenterTask => ({
  _id: fakeId("pages", 700 + n),
  title,
  taskStatus: "next",
  taskPriority: "medium",
  dueDate: null,
  createdByProfileId: ME,
  taskSortAt: (order += 1),
  createdAt: IZLOG_NOW - n * 3_600_000,
  ...fields,
});

/** Otvoreni zadaci Komandnog centra (sve četiri zone, mešane dozvole). */
export const IZLOG_ST_TASKS: CommandCenterTask[] = [
  task(1, "Ugovor sa dobavljačem piletine", { areaId: SALES._id, taskStatus: "in_progress", taskPriority: "high", dueDate: oktobar(22) }),
  task(2, "Popraviti plaćanje karticom u aplikaciji", { areaId: DEV._id, taskPriority: "urgent", createdByProfileId: NIKOLA }),
  task(3, "Odobrenje dizajna menija", { areaId: MARKETING._id, taskStatus: "blocked", createdByProfileId: MILICA }),
  task(4, "Objava za vikend akciju", { areaId: MARKETING._id, dueDate: oktobar(24) }),
  task(5, "Ponuda za ketering — Beogradski sajam", { areaId: SALES._id, dueDate: oktobar(24), createdByProfileId: ANA }),
  task(6, "Testirati novi checkout na Androidu", { areaId: DEV._id, taskStatus: "in_progress", dueDate: oktobar(27), createdByProfileId: NIKOLA }),
  task(7, "Landing za Q4 kampanju", { areaId: MARKETING._id, dueDate: oktobar(29) }),
  task(8, "Plan nabavke opreme za kuhinju", { areaId: OSTALO._id, taskStatus: "backlog", taskPriority: "low" }),
  task(9, "Istraživanje konkurencije u Novom Sadu", { areaId: SALES._id, taskStatus: "backlog", createdByProfileId: MILICA }),
];

export const IZLOG_ST_ASSIGNEES = new Map<string, CommandCenterAssignee[]>([
  [IZLOG_ST_TASKS[0]._id, [person(ME), person(ANA)]],
  [IZLOG_ST_TASKS[1]._id, [person(NIKOLA)]],
  [IZLOG_ST_TASKS[2]._id, [person(MILICA), person(ME)]],
  [IZLOG_ST_TASKS[3]._id, [person(ME)]],
  [IZLOG_ST_TASKS[4]._id, [person(ANA)]],
  [IZLOG_ST_TASKS[5]._id, [person(NIKOLA), person(ME)]],
  [IZLOG_ST_TASKS[6]._id, [person(MILICA)]],
  [IZLOG_ST_TASKS[7]._id, []],
  [IZLOG_ST_TASKS[8]._id, []],
]);

/** Moj dan: jedan zadatak je već u planu. */
export const IZLOG_ST_PLANNED = new Map<string, string>([[`task:${IZLOG_ST_TASKS[3]._id}`, fakeId("myDayEntries", 801)]]);

/** Moji zadaci u startupu (tabla): moji otvoreni + jedan završen. */
export const IZLOG_ST_MY_TASKS: StartupTaskLike[] = [
  ...IZLOG_ST_TASKS.filter((item) => (IZLOG_ST_ASSIGNEES.get(item._id) ?? []).some((assignee) => assignee.profileId === ME)),
  task(10, "Fotografisanje novih burgera", { areaId: MARKETING._id, taskStatus: "done", taskPriority: "medium" }),
];

/** Detalj zadatka: isti zadatak iz ugla kreatora i iz ugla izvršioca. */
export const IZLOG_ST_DETAIL = {
  title: "Testirati novi checkout na Androidu",
  status: "in_progress" as const,
  priority: "high" as const,
  dueDate: oktobar(27),
  assignees: [IZLOG_ST_MEMBERS[2], IZLOG_ST_MEMBERS[0]],
  creatorName: "Nikola Petrović",
  areaLabel: DEV.label,
};
