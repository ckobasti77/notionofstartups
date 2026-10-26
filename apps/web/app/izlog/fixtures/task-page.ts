/**
 * Fixture zadatka na celu stranu (PROSTOR K11): podaci u obliku koji prima
 * `TaskDetailLayout`, dozvole po varijanti kao što ih računa
 * `taskPermissionsOf(pages.get.permissions)` i komentari zadatka. Nikad ne idu
 * na server.
 */
import type { TaskDetailLayoutProps } from "@/components/me/task-panel/task-detail-layout";
import type { DocumentPermissions } from "@/components/workspace/page/page-document-model";
import { taskPermissionsOf } from "@/components/workspace/task-page/task-page-model";

import { IZLOG_DOC_MEMBERS, IZLOG_DOC_PEOPLE, comment } from "./page-document";
import { IZLOG_NOW, oktobar } from "./now";

const MIN = 60_000;
const HOUR = 60 * MIN;

const { jovan, ana, marko } = IZLOG_DOC_PEOPLE;

export type IzlogTaskPageVariant = "clan" | "zakljucan" | "sa-komentarima";

export const IZLOG_TASK_PAGE_TITLE = "Pripremi API ključeve za produkciju";

export const IZLOG_TASK_PAGE_CRUMBS = {
  areaLabel: "Razvoj",
  ancestors: [] as Array<{ id: string; title: string }>,
};

export const IZLOG_TASK_PAGE_META = {
  authorName: ana.displayName,
  editorName: marko.displayName,
  updatedAt: IZLOG_NOW - HOUR,
};

export const IZLOG_TASK_PAGE_INSTRUCTIONS =
  "Napraviti produkcioni nalog kod provajdera, upisati ključeve u sef i proveriti webhook na stagingu pre prebacivanja.";

const OPEN: DocumentPermissions = {
  canEdit: true,
  canMove: true,
  canDetach: false,
  canArchive: true,
  canLock: false,
  canUnlock: false,
  canComment: true,
  canRestoreRevision: true,
  isLocked: false,
};

/** Dozvole stranice po varijanti, kao što ih šalje `pages.get` (P1). */
export function izlogTaskPageDocumentPermissions(variant: IzlogTaskPageVariant): DocumentPermissions {
  if (variant === "zakljucan") {
    return { ...OPEN, canEdit: false, canMove: false, canArchive: false, canRestoreRevision: false, isLocked: true };
  }
  return { ...OPEN, canLock: true };
}

/** Čipovi, koraci i instrukcije: izvršilac na zaključanom zadatku menja samo status. */
export function izlogTaskPagePermissions(variant: IzlogTaskPageVariant): TaskDetailLayoutProps["permissions"] {
  return taskPermissionsOf(izlogTaskPageDocumentPermissions(variant), true);
}

export const IZLOG_TASK_PAGE_TASK: TaskDetailLayoutProps["task"] = {
  status: "in_progress",
  priority: "high",
  dueDate: oktobar(28),
};

export const IZLOG_TASK_PAGE_ASSIGNEES: TaskDetailLayoutProps["assignees"] = [
  { _id: ana._id, displayName: ana.displayName, avatarUrl: null },
  { _id: jovan._id, displayName: jovan.displayName, avatarUrl: null },
];

export const IZLOG_TASK_PAGE_MEMBERS = IZLOG_DOC_MEMBERS.map((member) => ({
  _id: member.profileId,
  displayName: member.displayName,
  avatarUrl: null,
}));

/** Komentari zadatka (najstariji prvi); drugi je pominjanje gledaoca. */
export const IZLOG_TASK_COMMENTS = [
  comment({ n: 21, author: ana, text: "Ključeve šaljem tek posle potvrde od @Jovan Milojević.", mentions: [jovan], ago: 5 * HOUR }),
  comment({ n: 22, author: marko, text: "Staging webhook prolazi, ostalo je samo produkcioni nalog.", ago: 2 * HOUR }),
  comment({ n: 23, author: jovan, text: "Potvrđujem. Ključevi idu u sef, ne u repo.", ago: 25 * MIN }),
  comment({ n: 24, author: ana, text: "Dodala sam korak za rotaciju ključeva.", ago: 4 * MIN, edited: true }),
];
