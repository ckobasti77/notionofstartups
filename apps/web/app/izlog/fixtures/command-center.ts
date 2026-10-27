/**
 * Fixture podaci za Komandni centar 2.0 (PROSTOR K19): zatrpano stanje sa 30
 * prekoračenih zadataka (deo zastareo), ideje koje čekaju glas i unosi
 * aktivnosti. Nikad ne idu na server.
 */
import type { ActivityItemLike } from "@devotion/shared";

import type { CommandCenterAssignee, CommandCenterTask } from "@/components/workspace/startup-tasks/command-center-model";

import { fakeId } from "./ids";
import { IZLOG_ST_ASSIGNEES, IZLOG_ST_MEMBERS, IZLOG_ST_STARTUP, IZLOG_ST_TASKS } from "./startup-tasks";
import { IZLOG_PROFILE } from "./me";
import { IZLOG_NOW, oktobar } from "./now";

const ME = IZLOG_PROFILE._id as string;
const AREAS = IZLOG_ST_STARTUP.areas;
const person = (id: string): CommandCenterAssignee => {
  const member = IZLOG_ST_MEMBERS.find((item) => item._id === id);
  return { profileId: id, displayName: member?.displayName ?? "Član", avatarUrl: null };
};

let order = 100;
const overdue = (n: number, title: string, dueDay: number, areaIndex: number, owner = ME): CommandCenterTask => ({
  _id: fakeId("pages", 900 + n),
  areaId: AREAS[areaIndex % AREAS.length]._id,
  title,
  taskStatus: n % 5 === 0 ? "blocked" : n % 3 === 0 ? "in_progress" : "next",
  taskPriority: n % 7 === 0 ? "urgent" : "medium",
  dueDate: oktobar(dueDay),
  createdByProfileId: owner,
  taskSortAt: (order += 1),
  createdAt: IZLOG_NOW - n * 3_600_000,
});

/** Tri zadatka kojima je rok prošao pre više od 14 dana (Zastarelo) uz običan skup. */
export const IZLOG_CC_STALE: CommandCenterTask[] = [
  overdue(1, "Obnoviti ugovor sa hostingom", 9, 0),
  overdue(2, "Prijaviti zaštitni znak", 2, 2),
  overdue(3, "Arhivirati stare ponude", 1, 3),
];

export const IZLOG_CC_PUN: CommandCenterTask[] = [...IZLOG_ST_TASKS, ...IZLOG_CC_STALE];

const MEMBER_IDS = IZLOG_ST_MEMBERS.map((member) => member._id as string);

const TITLES = [
  "Pregledati ponude dobavljača",
  "Poslati podsetnik za uplatu",
  "Ažurirati cenovnik",
  "Zakazati sastanak sa knjigovođom",
  "Sređivanje inventara",
  "Odgovoriti na upit iz Niša",
  "Proveriti izveštaj o prodaji",
  "Napisati objavu za newsletter",
  "Popraviti link u footeru",
  "Poručiti materijal za štand",
];

/** Zatrpano stanje: 30 zadataka sa prošlim rokom, od jučerašnjeg do trosedmičnog kašnjenja. */
export const IZLOG_CC_ZATRPAN: CommandCenterTask[] = [
  ...IZLOG_ST_TASKS.filter((item) => item.dueDate === null || item.dueDate >= oktobar(24)),
  ...Array.from({ length: 30 }, (_, index) =>
    overdue(10 + index, `${TITLES[index % TITLES.length]} (${index + 1})`, 23 - ((index * 3) % 23), index, MEMBER_IDS[index % MEMBER_IDS.length]),
  ),
];

/** Izvršioci zatrpanog stanja: ravnomerno po članovima, svaki treći zadatak je moj. */
export const IZLOG_CC_ZATRPAN_ASSIGNEES: Map<string, CommandCenterAssignee[]> = new Map([
  ...IZLOG_ST_ASSIGNEES,
  ...IZLOG_CC_ZATRPAN.filter((item) => !IZLOG_ST_ASSIGNEES.has(item._id)).map(
    (item, index): [string, CommandCenterAssignee[]] => [
      item._id,
      [person(index % 3 === 0 ? ME : MEMBER_IDS[(index + 1) % MEMBER_IDS.length])],
    ],
  ),
]);

/** Izvršioci „običnog" stanja: osnovni skup + zastareli zadaci. */
export const IZLOG_CC_PUN_ASSIGNEES: Map<string, CommandCenterAssignee[]> = new Map([
  ...IZLOG_ST_ASSIGNEES,
  ...IZLOG_CC_STALE.map((item, index): [string, CommandCenterAssignee[]] => [
    item._id,
    [person(index === 0 ? ME : MEMBER_IDS[(index + 1) % MEMBER_IDS.length])],
  ]),
]);

export type IzlogWaitingItem = {
  ideaId: string;
  title: string;
  authorName: string | null;
  upvotes: number;
  downvotes: number;
};

export const IZLOG_CC_WAITING: IzlogWaitingItem[] = [
  { ideaId: fakeId("ideaNodes", 1), title: "Referral program za stalne goste", authorName: "Ana Ilić", upvotes: 3, downvotes: 0 },
  { ideaId: fakeId("ideaNodes", 2), title: "Novi onboarding za dostavljače", authorName: "Nikola Petrović", upvotes: 1, downvotes: 1 },
  { ideaId: fakeId("ideaNodes", 3), title: "Meni na tri jezika", authorName: null, upvotes: 0, downvotes: 0 },
];

type IzlogActivity = ActivityItemLike & { id: string; actor: string | null; targetType: string; minutesAgo: number };

export const IZLOG_CC_ACTIVITY: IzlogActivity[] = [
  { id: "a1", action: "page_locked", title: "Specifikacija API", actor: "Ana Ilić", targetType: "page", minutesAgo: 62 },
  { id: "a2", action: "page_restored", title: "Plan lansiranja", detail: "Sa 3 podstranice", actor: "Marko Petrović", targetType: "page", minutesAgo: 180 },
  { id: "a3", action: "idea_stage_changed", title: "Referral program", detail: "Razmatra se", actor: "Jovan Milojević", targetType: "idea", minutesAgo: 400 },
  { id: "a4", action: "tasks_rescheduled", title: "Cluck Rush", detail: "12 zadataka → sutra", actor: "Nikola Petrović", targetType: "startup", minutesAgo: 1_500 },
  { id: "a5", action: "comment_created", title: "Ugovor sa dobavljačem piletine", actor: "Milica Jovanović", targetType: "page", minutesAgo: 1_900 },
  { id: "a6", action: "revision_restored", title: "Opis oblasti Prodaja", actor: "Ana Ilić", targetType: "area", minutesAgo: 3_000 },
  { id: "a7", action: "page_updated", title: "Ana je izmenila „Cenovnik”", actor: "Ana Ilić", targetType: "page", minutesAgo: 4_300 },
  { id: "a8", action: "idea_archived", title: "Maskota restorana", actor: null, targetType: "idea", minutesAgo: 6_000 },
];

export const IZLOG_CC_PULSE = { completed: { current: 14 }, created: { current: 9 }, stuck: { current: 3 } };
export const IZLOG_CC_PULSE_EMPTY = { completed: { current: 0 }, created: { current: 0 }, stuck: { current: 0 } };
