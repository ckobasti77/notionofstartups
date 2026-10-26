/**
 * Fixture podaci za Moje zadatke, panel zadatka i birač datuma (K11). Sat je
 * `IZLOG_NOW` (subota 24.10.2026. 09:30). Nikad ne idu na server.
 */
import {
  EMPTY_TASK_FILTERS,
  taskPermissions,
  type PersonalTaskLike,
  type TaskFilters,
  type TaskItemLike,
} from "@devotion/shared";

import type { MyTasksSource } from "@/components/me/tasks/my-tasks-model";
import type { PersonalTaskPanelViewProps } from "@/components/me/task-panel/personal-task-panel-view";
import type { PanelPerson, StartupTaskView } from "@/components/me/task-panel/startup-task-panel-view";

import { fakeId } from "./ids";
import { IZLOG_STARTUPS } from "./me";
import { oktobar } from "./now";

const S = (index: number) => ({
  _id: IZLOG_STARTUPS[index]._id,
  name: IZLOG_STARTUPS[index].name,
  logoUrl: IZLOG_STARTUPS[index].logoUrl,
});

export const IZLOG_TASK_STARTUPS = IZLOG_STARTUPS.map((startup) => ({
  _id: startup._id,
  name: startup.name,
  logoUrl: startup.logoUrl,
  areas: startup.areas.map((area) => ({ _id: area._id, label: area.label })),
}));

function item(n: number, startup: number, title: string, area: string | null, partial: Partial<TaskItemLike> = {}): TaskItemLike {
  return {
    _id: fakeId("pages", 300 + n),
    title,
    taskStatus: "next",
    taskPriority: "medium",
    dueDate: null,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    isCreator: n % 2 === 0,
    isAssignee: true,
    startup: S(startup),
    area: area ? { label: area } : null,
    createdAt: oktobar(1) + n,
    ...partial,
  };
}

function personal(n: number, title: string, partial: Partial<PersonalTaskLike> = {}): PersonalTaskLike {
  return {
    _id: fakeId("personalTasks", 300 + n),
    title,
    status: "open",
    priority: null,
    dueDate: null,
    createdAt: oktobar(10) + n,
    ...partial,
  };
}

export const IZLOG_TASK_ITEMS: TaskItemLike[] = [
  item(1, 0, "Ugovor sa dobavljačem piletine", "Sales", { dueDate: oktobar(22), taskPriority: "high", taskStatus: "in_progress", isCreator: true, checkpointTotal: 5, checkpointCompleted: 2 }),
  item(2, 0, "Landing za Q4 kampanju", "Marketing", { dueDate: oktobar(30) }),
  item(3, 0, "Odgovori na recenzije sa Wolta", "Marketing", { dueDate: oktobar(26) }),
  item(4, 0, "Istraži konkurenciju u Nišu", "Sales", { taskStatus: "backlog", taskPriority: "high" }),
  item(5, 1, "Ponuda za renoviranje kupatila", "Sales", { taskStatus: "in_progress", dueDate: oktobar(25) }),
  item(6, 1, "Nabavka alata za novog majstora", "Ostalo", { taskPriority: "low" }),
  item(7, 2, "Raspored predavača za novembar", "Ostalo", { dueDate: oktobar(28) }),
  item(8, 2, "Pripremi sadržaj za newsletter", "Marketing", { taskStatus: "blocked" }),
  item(9, 3, "Popravi prijavu na staging serveru", "Dev", { taskStatus: "blocked", taskPriority: "urgent", dueDate: oktobar(24) }),
  item(10, 3, "Nova landing stranica za Enigmu", "Dev", { dueDate: oktobar(31) }),
  item(11, 4, "Landing za QR menije", "Marketing", { dueDate: oktobar(24), taskPriority: "urgent", isCreator: false }),
  item(12, 4, "Faktura za hosting", "Ostalo", { taskStatus: "done", dueDate: oktobar(24) }),
  item(13, 5, "Skripta za lekciju 4: prompt inženjering", "Dev", { dueDate: oktobar(27), isCreator: true }),
  item(14, 5, "Napiši onboarding mejl za polaznike", "Marketing", { dueDate: oktobar(21), isCreator: false }),
];

export const IZLOG_PERSONAL_ITEMS: PersonalTaskLike[] = [
  personal(1, "Platiti račun za struju", { dueDate: oktobar(23) }),
  personal(2, "Pregledati Q4 budžet", { priority: "high" }),
  personal(3, "Servis auta", { dueDate: oktobar(29) }),
  personal(4, "Kupiti poklon za Teodoru"),
  personal(5, "Pozvati računovođu", { status: "done", dueDate: oktobar(24) }),
];

export const IZLOG_TASKS_SOURCE: MyTasksSource = {
  tasks: IZLOG_TASK_ITEMS,
  personal: IZLOG_PERSONAL_ITEMS,
  entries: [
    { _id: fakeId("myDayEntries", 301), refKey: `personal:${IZLOG_PERSONAL_ITEMS[1]._id}` },
    { _id: fakeId("myDayEntries", 302), refKey: `task:${IZLOG_TASK_ITEMS[1]._id}` },
  ],
  capped: false,
};

export const IZLOG_TASKS_EMPTY: MyTasksSource = { tasks: [], personal: [], entries: [], capped: false };

/** Varijanta „filteri": 2 filtera (Cluck Rush + Lično, rok prekoračeno/danas/nedelja), grupisano po roku. */
export const IZLOG_FILTERS_TWO: TaskFilters = {
  ...EMPTY_TASK_FILTERS,
  startupIds: [IZLOG_STARTUPS[0]._id, "licno"],
  due: ["overdue", "today", "tomorrow", "week"],
};

/** „Bez rezultata": pretraga koja ništa ne nalazi. */
export const IZLOG_FILTERS_NONE: TaskFilters = { ...EMPTY_TASK_FILTERS, query: "ugovor za avion" };

export const IZLOG_PEOPLE: PanelPerson[] = [
  { _id: fakeId("profiles", 1), displayName: "Jovan Milojević", avatarUrl: null },
  { _id: fakeId("profiles", 2), displayName: "Milica Jovanović", avatarUrl: null },
  { _id: fakeId("profiles", 3), displayName: "Nikola Petrović", avatarUrl: null },
  { _id: fakeId("profiles", 4), displayName: "Ana Ilić", avatarUrl: null },
  { _id: fakeId("profiles", 5), displayName: "Stefan Marković", avatarUrl: null },
];

/** Startup zadatak u panelu (Ugovor sa dobavljačem). */
export const IZLOG_PANEL_TASK: StartupTaskView = {
  title: "Ugovor sa dobavljačem piletine",
  status: "in_progress",
  priority: "high",
  dueDate: oktobar(28),
  instructions:
    "Proveriti klauzulu o rokovima isporuke i kazne za kašnjenje. Cenu fiksirati do kraja godine; plaćanje u dve rate.",
  startup: S(0),
  areaLabel: "Sales",
};

export const IZLOG_PANEL_CHECKPOINTS = [
  { id: "c1", text: "Poslati nacrt ugovora", completed: true },
  { id: "c2", text: "Dogovoriti cenu po kilogramu", completed: true },
  { id: "c3", text: "Pravnik pregleda klauzule", completed: false },
  { id: "c4", text: "Potpis obe strane", completed: false },
  { id: "c5", text: "Prva isporuka", completed: false },
];

export const IZLOG_PERMS_CREATOR = taskPermissions({ kind: "task", isCreator: true, isAssignee: true });
/** Izvršilac na ZAKLJUČANOM zadatku: menja status i korake, ostalo ima katanac (P1, D5). */
export const IZLOG_PERMS_MEMBER = taskPermissions({ kind: "task", isCreator: false, isAssignee: true, lockedForViewer: true });

export const IZLOG_PANEL_PERSONAL: PersonalTaskPanelViewProps["task"] = {
  title: "Pregledati Q4 budžet",
  notes: "Uporediti troškove marketinga po startupu sa planom iz jula. Izdvojiti tri najveća odstupanja.",
  status: "open",
  priority: "high",
  dueDate: oktobar(30),
};
