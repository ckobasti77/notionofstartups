/**
 * Fixture Korpe (PROSTOR K08, P3): stavke u obliku `trash.list` i brojevi u
 * obliku `trash.counts`. Nikad ne idu na server.
 */
import type { TrashCounts, TrashItem } from "@/components/workspace/trash/trash-model";

import { fakeId } from "./ids";
import { IZLOG_NOW } from "./now";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ana = { _id: fakeId("profiles", 2), displayName: "Ana Petrović", avatarUrl: null };
const marko = { _id: fakeId("profiles", 3), displayName: "Marko Ilić", avatarUrl: null };
const jovan = { _id: fakeId("profiles", 1), displayName: "Jovan Milojević", avatarUrl: null };

const RAZVOJ = fakeId("startupAreas", 900);
const MARKETING = fakeId("startupAreas", 901);

export const IZLOG_TRASH_PAGES: TrashItem[] = [
  {
    kind: "page",
    pageId: fakeId("pages", 950),
    title: "Specifikacija API v1",
    pageKind: "note",
    areaId: RAZVOJ,
    areaLabel: "Razvoj",
    parentPageId: fakeId("pages", 901),
    parentTitle: "Plan lansiranja",
    parentAvailable: true,
    descendantCount: 3,
    archivedAt: IZLOG_NOW - 2 * DAY,
    archivedBy: ana,
    canRestore: true,
  },
  {
    kind: "page",
    pageId: fakeId("pages", 951),
    title: "Stari plan objava za oktobar",
    pageKind: "note",
    areaId: MARKETING,
    areaLabel: "Marketing",
    parentPageId: fakeId("pages", 952),
    parentTitle: "Kampanja leto",
    parentAvailable: false,
    descendantCount: 0,
    archivedAt: IZLOG_NOW - 5 * DAY,
    archivedBy: marko,
    canRestore: true,
  },
  {
    kind: "page",
    pageId: fakeId("pages", 953),
    title: "Proveri cene dostave za Novi Sad",
    pageKind: "task",
    areaId: RAZVOJ,
    areaLabel: "Razvoj",
    parentPageId: null,
    parentTitle: null,
    parentAvailable: false,
    descendantCount: 0,
    archivedAt: IZLOG_NOW - 40 * 60_000,
    archivedBy: jovan,
    canRestore: true,
  },
  {
    kind: "page",
    pageId: fakeId("pages", 954),
    title: "Cenovnik po zonama (staro)",
    pageKind: "table",
    areaId: RAZVOJ,
    areaLabel: "Razvoj",
    parentPageId: null,
    parentTitle: null,
    parentAvailable: false,
    descendantCount: 0,
    archivedAt: IZLOG_NOW - 12 * DAY,
    archivedBy: null,
    canRestore: false,
  },
];

export const IZLOG_TRASH_IDEAS: TrashItem[] = [
  {
    kind: "idea",
    ideaId: fakeId("ideaNodes", 950),
    title: "Program preporuke za restorane",
    archivedAt: IZLOG_NOW - DAY,
    archivedBy: marko,
    canRestore: true,
  },
  {
    kind: "idea",
    ideaId: fakeId("ideaNodes", 951),
    title: "Nedeljni bilten za partnere",
    archivedAt: IZLOG_NOW - 3 * HOUR,
    archivedBy: ana,
    canRestore: true,
  },
];

export const IZLOG_TRASH_FILES: TrashItem[] = [
  {
    kind: "file",
    fileId: fakeId("pageFiles", 950),
    name: "ugovor-dobavljac-v2.pdf",
    category: "pdf",
    size: 284_000,
    pageId: fakeId("pages", 960),
    pageTitle: "Ugovor sa dobavljačem",
    pageAvailable: true,
    archivedAt: IZLOG_NOW - 3 * DAY,
    archivedBy: ana,
    canRestore: true,
  },
  {
    kind: "file",
    fileId: fakeId("pageFiles", 951),
    name: "meni-skica.png",
    category: "image",
    size: 1_204_000,
    pageId: fakeId("pages", 950),
    pageTitle: "Specifikacija API v1",
    pageAvailable: false,
    archivedAt: IZLOG_NOW - 2 * DAY,
    archivedBy: ana,
    canRestore: true,
  },
];

export const IZLOG_TRASH_RECOVERED: TrashItem[] = [
  {
    kind: "recovered",
    recoveredId: fakeId("recoveredContent", 950),
    title: "Kampanja leto",
    sourceKind: "page",
    createdAt: IZLOG_NOW - 9 * DAY,
    owner: marko,
    contributions: [
      {
        _id: fakeId("contentContributions", 950),
        excerpt: "Budžet za Instagram podići na 400 € u julu, posle prve analize.",
        author: ana,
        createdAt: IZLOG_NOW - 20 * DAY,
      },
      {
        _id: fakeId("contentContributions", 951),
        excerpt: "Dogovoren termin snimanja sa kuvarom za 14. jul.",
        author: null,
        createdAt: IZLOG_NOW - 25 * DAY,
      },
    ],
    canDismiss: true,
  },
];

export const IZLOG_TRASH_COUNTS: TrashCounts = {
  page: { count: IZLOG_TRASH_PAGES.length, capped: false },
  idea: { count: IZLOG_TRASH_IDEAS.length, capped: false },
  file: { count: IZLOG_TRASH_FILES.length, capped: false },
  recovered: { count: IZLOG_TRASH_RECOVERED.length, capped: false },
};

export const IZLOG_TRASH_EMPTY_COUNTS: TrashCounts = {
  page: { count: 0, capped: false },
  idea: { count: 0, capped: false },
  file: { count: 0, capped: false },
  recovered: { count: 0, capped: false },
};
