/**
 * Fixture oblasti (PROSTOR K13): opis oblasti, Nedavne izmene, komentari na
 * opisu, revizije opisa, zadaci oblasti i stablo Dokumenata. Gledalac je Jovan
 * — član koji opis menja kao i svi ostali. Nikad ne ide na server.
 */
import type { StartupTaskLike } from "@devotion/shared";

import type { CommentItem } from "@/components/collab/comment-list";
import type { RevisionSummary } from "@/components/collab/revision-history";
import type { DocumentRowPage } from "@/components/workspace/area/area-documents";
import { editMeta, ROOT_LEVEL, type DocumentLevel } from "@/components/workspace/area/area-model";
import type { RecentChangeItem } from "@/components/workspace/area/area-overview";

import { fakeId } from "./ids";
import { IZLOG_STARTUPS } from "./me";
import { IZLOG_NOW, oktobar } from "./now";
import { comment, IZLOG_DOC_PEOPLE } from "./page-document";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const { jovan, ana, marko, lena, djordje } = IZLOG_DOC_PEOPLE;

export const IZLOG_AREA_STARTUP = IZLOG_STARTUPS[0];
/** Nove oblasti se zovu Razvoj · Marketing · Prodaja · Ostalo (K06-9). */
export const IZLOG_AREA = { ...IZLOG_AREA_STARTUP.areas[0], label: "Razvoj" };
export const IZLOG_AREA_LABELS = new Map([[IZLOG_AREA._id as string, IZLOG_AREA.label]]);

export const IZLOG_AREA_BODY = [
  "Aplikacija za poručivanje i kasa u restoranu. Ovde su specifikacije, odluke i zadaci za web i telefon.",
  "",
  "Sada je važno: naplata karticom do lansiranja 7. novembra, pa offline režim kase.",
  "Odluke beležimo kao beleške u „Odluke”, a sve što blokira lansiranje ide kao zadatak sa rokom.",
].join("\n");

export const IZLOG_AREA_LAST_EDIT = { editorName: ana.displayName, updatedAt: IZLOG_NOW - 2 * DAY };

const recent = (n: number, title: string, kind: RecentChangeItem["kind"], editor: string, ago: number, locked = false): RecentChangeItem => ({
  id: fakeId("pages", 900 + n),
  title,
  kind,
  meta: editMeta(editor, IZLOG_NOW - ago, IZLOG_NOW),
  locked,
});

export const IZLOG_AREA_RECENT: RecentChangeItem[] = [
  recent(1, "Endpointi za plaćanje", "note", marko.displayName, 5 * MIN),
  recent(2, "Popraviti plaćanje karticom u aplikaciji", "task", djordje.displayName, 40 * MIN),
  recent(3, "Cene provizija po kartici", "table", lena.displayName, 3 * HOUR, true),
  recent(4, "Offline režim kase", "note", ana.displayName, DAY + 2 * HOUR),
  recent(5, "Šema baze — porudžbine", "file", marko.displayName, 2 * DAY),
  recent(6, "Testiraj povraćaj u sandboxu", "task", jovan.displayName, 3 * DAY),
];

export const IZLOG_AREA_COMMENTS: CommentItem[] = [
  comment({ n: 21, author: marko, text: "Dodao sam rok za naplatu u opis. @Ana Petrović, da li offline ide pre ili posle lansiranja?", mentions: [ana], ago: 3 * HOUR }),
  comment({ n: 22, author: ana, text: "Posle. Prvo kartice, offline je druga faza.", ago: 2 * HOUR, edited: true }),
  comment({ n: 23, author: jovan, text: "Slažem se. Šemu baze stavljam u Dokumente danas.", ago: 20 * MIN }),
].map((item) => ({ ...item, targetKind: "area" as const, targetId: IZLOG_AREA._id }));

const revision = (
  n: number,
  kind: RevisionSummary["kind"],
  author: (typeof IZLOG_DOC_PEOPLE)[keyof typeof IZLOG_DOC_PEOPLE] | null,
  ago: number,
  excerpt: string,
): RevisionSummary => ({
  _id: fakeId("contentRevisions", 900 + n),
  kind,
  author,
  title: IZLOG_AREA.label,
  excerpt,
  contentLength: excerpt.length,
  restoredFromId: null,
  createdAt: IZLOG_NOW - ago,
  updatedAt: IZLOG_NOW - ago,
  canRestore: true,
});

export const IZLOG_AREA_REVISIONS: RevisionSummary[] = [
  revision(1, "edit", ana, 2 * DAY, "Aplikacija za poručivanje i kasa u restoranu. Sada je važno: naplata karticom do lansiranja 7. novembra, pa offline režim kase."),
  revision(2, "edit", marko, 3 * DAY, "Aplikacija za poručivanje i kasa u restoranu. Sada je važno: naplata karticom do lansiranja."),
  revision(3, "edit", lena, 6 * DAY, "Aplikacija za poručivanje. Specifikacije i zadaci za web i telefon."),
  revision(4, "baseline", null, 14 * DAY, "Dev beleške — proizvod, kod i tehničke odluke."),
];

let order = 0;
const task = (n: number, title: string, fields: Partial<StartupTaskLike> = {}): StartupTaskLike => ({
  _id: fakeId("pages", 950 + n),
  areaId: IZLOG_AREA._id,
  title,
  taskStatus: "next",
  taskPriority: "medium",
  dueDate: null,
  createdByProfileId: jovan._id,
  createdAt: IZLOG_NOW - (order += 1) * HOUR,
  ...fields,
});

export const IZLOG_AREA_TASKS: StartupTaskLike[] = [
  task(1, "Popraviti plaćanje karticom u aplikaciji", { taskStatus: "in_progress", taskPriority: "urgent", dueDate: oktobar(24), createdByProfileId: djordje._id }),
  task(2, "Webhook potvrde od provajdera", { taskStatus: "in_progress", taskPriority: "high", dueDate: oktobar(27) }),
  task(3, "Testiraj povraćaj u sandboxu", { taskPriority: "high", dueDate: oktobar(28), checkpointTotal: 4, checkpointCompleted: 1 }),
  task(4, "Offline režim kase — istraživanje", { taskStatus: "backlog", taskPriority: "low", createdByProfileId: ana._id }),
  task(5, "Migracija porudžbina na novu šemu", { taskStatus: "blocked", dueDate: oktobar(22), createdByProfileId: marko._id }),
  task(6, "Ključevi za produkcioni nalog provajdera", { dueDate: oktobar(30), lockedAt: IZLOG_NOW - DAY, createdByProfileId: ana._id }),
  task(7, "Izveštaj o greškama sa kase", { taskStatus: "done", taskPriority: "low" }),
];

const doc = (
  n: number,
  title: string,
  kind: DocumentRowPage["kind"],
  parent: number | null,
  editor: (typeof IZLOG_DOC_PEOPLE)[keyof typeof IZLOG_DOC_PEOPLE],
  ago: number,
  locked = false,
): DocumentRowPage => ({
  _id: fakeId("pages", 900 + n),
  title,
  kind,
  parentPageId: parent === null ? null : fakeId("pages", 900 + parent),
  createdByProfileId: ana._id,
  updatedByProfileId: editor._id,
  editorName: editor.displayName,
  updatedAt: IZLOG_NOW - ago,
  lockedAt: locked ? IZLOG_NOW - DAY : null,
});

const ROOT_DOCS: DocumentRowPage[] = [
  doc(10, "Lansiranje", "note", null, ana, 3 * HOUR),
  doc(1, "Endpointi za plaćanje", "note", null, marko, 5 * MIN),
  doc(2, "Popraviti plaćanje karticom u aplikaciji", "task", null, djordje, 40 * MIN),
  doc(3, "Cene provizija po kartici", "table", null, lena, 3 * HOUR, true),
  doc(4, "Offline režim kase", "note", null, ana, DAY + 2 * HOUR),
  doc(5, "Šema baze — porudžbine", "file", null, marko, 2 * DAY),
  doc(11, "Odluke", "note", null, jovan, 4 * DAY),
];

const LAUNCH_CHILDREN: DocumentRowPage[] = [
  doc(12, "Kontrolna lista za 7. novembar", "task", 10, ana, 3 * HOUR),
  doc(13, "Tekstovi za prodavnice aplikacija", "note", 10, lena, DAY),
  doc(6, "Testiraj povraćaj u sandboxu", "task", 10, jovan, 3 * DAY),
];

const DECISION_CHILDREN: DocumentRowPage[] = [
  doc(14, "Kartice pre pouzeća", "note", 11, ana, 5 * DAY),
  doc(15, "Jedan provajder za početak", "note", 11, marko, 6 * DAY),
];

/** Nivoi stabla: „Lansiranje" je razvijeno, „Odluke" ima decu (skupljeno). */
export const IZLOG_AREA_DOC_LEVELS = new Map<string, DocumentLevel>([
  [ROOT_LEVEL, { status: "ready", pages: ROOT_DOCS, hasMore: false }],
  [fakeId("pages", 910), { status: "ready", pages: LAUNCH_CHILDREN, hasMore: false }],
  [fakeId("pages", 911), { status: "ready", pages: DECISION_CHILDREN, hasMore: false }],
]);
export const IZLOG_AREA_DOC_EXPANDED = new Set<string>([fakeId("pages", 910)]);
export const IZLOG_AREA_DOC_CHILD_COUNTS = new Map<string, number>([
  ...ROOT_DOCS.map((page) => [page._id as string, 0] as const),
  ...LAUNCH_CHILDREN.map((page) => [page._id as string, 0] as const),
  ...DECISION_CHILDREN.map((page) => [page._id as string, 0] as const),
  [fakeId("pages", 910), 3],
  [fakeId("pages", 911), 2],
]);
