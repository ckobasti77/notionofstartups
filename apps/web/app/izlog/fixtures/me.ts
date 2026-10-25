/**
 * Fixture podaci ličnog nivoa „Ja" (K08): profil, Jovanovih 6 startupa sa
 * oblastima, odgovor `myDay.overview` i bedževi trake. Nikad ne idu na server.
 */
import type { MyDayOverviewData } from "@/components/me/my-day/my-day-model";
import type { RailBadges } from "@/components/me/shell/scope";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import type { Id } from "@/convex/_generated/dataModel";

import { fakeId } from "./ids";
import { IZLOG_NOW, oktobar } from "./now";

export const IZLOG_PROFILE: ProfileWithAvatar = {
  _id: fakeId("profiles", 1),
  _creationTime: IZLOG_NOW,
  userId: fakeId("users", 1),
  displayName: "Jovan Milojević",
  email: "jovan@primer.test",
  role: "admin",
  archivedAt: null,
  createdAt: IZLOG_NOW,
  updatedAt: IZLOG_NOW,
  avatarUrl: null,
};

const AREAS = [
  { key: "dev", label: "Dev" },
  { key: "marketing", label: "Marketing" },
  { key: "sales", label: "Sales" },
  { key: "other", label: "Ostalo" },
] as const;

const STARTUP_NAMES = [
  "Cluck Rush",
  "Silly Handyman",
  "Beauty Masterclass",
  "Enigma IT",
  "Scan Me",
  "Nauči AI",
] as const;

export const IZLOG_STARTUPS: StartupWithAreas[] = STARTUP_NAMES.map((name, index) => {
  const startupId = fakeId("startups", index + 1);
  return {
    _id: startupId,
    _creationTime: IZLOG_NOW,
    name,
    description: "",
    createdByProfileId: IZLOG_PROFILE._id,
    archivedAt: null,
    createdAt: IZLOG_NOW,
    updatedAt: IZLOG_NOW,
    logoUrl: null,
    areas: AREAS.map((area, position) => ({
      _id: fakeId("startupAreas", (index + 1) * 10 + position),
      _creationTime: IZLOG_NOW,
      startupId,
      key: area.key,
      label: area.label,
      position,
      createdAt: IZLOG_NOW,
    })),
  };
});

const S = (index: number) => IZLOG_STARTUPS[index];

type OverviewTask = MyDayOverviewData["tasks"][number];

function task(
  n: number,
  startupIndex: number,
  title: string,
  area: string | null,
  partial: Partial<OverviewTask> = {},
): OverviewTask {
  return {
    _id: fakeId("pages", n),
    title,
    taskStatus: "next",
    taskPriority: "medium",
    dueDate: null,
    completedAt: null,
    createdAt: oktobar(1) + n,
    isCreator: n % 2 === 0,
    isAssignee: true,
    startup: { _id: S(startupIndex)._id, name: S(startupIndex).name },
    area: area ? { label: area } : null,
    ...partial,
  };
}

/** Običan dan: 2 kasni, 3 danas, 1 planirano, 1 u toku, 2 uskoro, 1 blokirano, 2 završeno. */
export const IZLOG_OVERVIEW: MyDayOverviewData = {
  tasks: [
    task(1, 0, "Ugovor sa dobavljačem piletine", "Sales", { dueDate: oktobar(22), taskPriority: "high" }),
    task(2, 0, "Snimi reel za novi meni", "Marketing", { dueDate: oktobar(24) }),
    task(3, 4, "Landing za QR menije", "Marketing", { dueDate: oktobar(24), taskPriority: "urgent" }),
    task(4, 1, "Ponuda za renoviranje kupatila", "Sales", { taskStatus: "in_progress" }),
    task(5, 2, "Raspored predavača za novembar", "Ostalo", { dueDate: oktobar(28) }),
    task(6, 5, "Skripta za lekciju 4: prompt inženjering", "Dev", { dueDate: oktobar(27) }),
    task(7, 3, "Popraviti prijavu na staging serveru", "Dev", { taskStatus: "blocked" }),
    task(8, 4, "Faktura za hosting", "Ostalo", {
      taskStatus: "done",
      dueDate: oktobar(24),
      completedAt: new Date("2026-10-24T08:40:00").getTime(),
    }),
    task(9, 0, "Odgovori na recenzije sa Wolta", "Marketing", { dueDate: oktobar(26), isAssignee: true }),
  ],
  personal: [
    {
      _id: fakeId("personalTasks", 1),
      title: "Platiti račun za struju",
      status: "open",
      priority: null,
      dueDate: oktobar(23),
      completedAt: null,
      createdAt: oktobar(20),
    },
    {
      _id: fakeId("personalTasks", 2),
      title: "Pregledati Q4 budžet",
      status: "open",
      priority: "high",
      dueDate: null,
      completedAt: null,
      createdAt: oktobar(21),
    },
    {
      _id: fakeId("personalTasks", 3),
      title: "Pozvati računovođu",
      status: "done",
      priority: null,
      dueDate: oktobar(24),
      completedAt: new Date("2026-10-24T09:05:00").getTime(),
      createdAt: oktobar(19),
    },
  ],
  entries: [
    {
      _id: fakeId("myDayEntries", 1),
      dayKey: "2026-10-24",
      refKey: `personal:${fakeId("personalTasks", 2)}`,
      position: 1024,
    },
  ],
  history: [],
  startups: IZLOG_STARTUPS.map((startup) => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl })),
  capped: { tasks: false, personal: false, history: false },
};

export const IZLOG_BADGES: RailBadges = {
  me: 16,
  meCapped: false,
  startupDots: { [S(0)._id]: true, [S(3)._id]: true },
};

export const IZLOG_INBOX_UNREAD = 12;
export const IZLOG_CHAT_UNREAD = 4;

export function izlogStartupId(index: number): Id<"startups"> {
  return S(index)._id;
}
