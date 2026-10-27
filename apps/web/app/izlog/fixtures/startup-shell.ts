/**
 * Fixture menija startupa (PROSTOR K08, P11): startup sa oblastima Razvoj ·
 * Marketing · Prodaja · Ostalo i stablo otvorene oblasti (7 vidljivih stranica
 * + „Prikaži još"). Nikad ne ide na server.
 */
import type { PageKind } from "@/lib/page-kinds";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import type { Id } from "@/convex/_generated/dataModel";

import { fakeId } from "./ids";
import { IZLOG_PROFILE } from "./me";
import { IZLOG_NOW } from "./now";

const AREAS = [
  { key: "dev", label: "Razvoj" },
  { key: "marketing", label: "Marketing" },
  { key: "sales", label: "Prodaja" },
  { key: "other", label: "Ostalo" },
] as const;

const STARTUP_ID = fakeId("startups", 1);

export const IZLOG_MENU_STARTUP: StartupWithAreas = {
  _id: STARTUP_ID,
  _creationTime: IZLOG_NOW,
  name: "Cluck Rush",
  description: "",
  createdByProfileId: IZLOG_PROFILE._id,
  archivedAt: null,
  createdAt: IZLOG_NOW,
  updatedAt: IZLOG_NOW,
  logoUrl: null,
  areas: AREAS.map((area, position) => ({
    _id: fakeId("startupAreas", 900 + position),
    _creationTime: IZLOG_NOW,
    startupId: STARTUP_ID,
    key: area.key,
    label: area.label,
    position,
    createdAt: IZLOG_NOW,
  })),
};

/** Član koji nije admin ni vlasnik — ne vidi „Podešavanja startupa" do K20. */
export const IZLOG_MEMBER_PROFILE: ProfileWithAvatar = {
  ...IZLOG_PROFILE,
  _id: fakeId("profiles", 7),
  displayName: "Milica Stanković",
  email: "milica@primer.test",
  role: "member",
};

export type IzlogTreePage = {
  _id: Id<"pages">;
  title: string;
  kind: PageKind;
  hasChildren: boolean;
};

/** Otvorena oblast „Razvoj": 7 vidljivih stranica, još 9 iza „Prikaži još". */
export const IZLOG_TREE_AREA_ID = IZLOG_MENU_STARTUP.areas[0]._id;

const TREE_ROWS: Array<Omit<IzlogTreePage, "_id">> = [
  { title: "Specifikacija API", kind: "note", hasChildren: true },
  { title: "Plan lansiranja", kind: "note", hasChildren: true },
  { title: "Migracija baze na novi klaster", kind: "task", hasChildren: false },
  { title: "Cenovnik dostave po zonama", kind: "table", hasChildren: false },
  { title: "Ugovor sa dobavljačem", kind: "file", hasChildren: false },
  { title: "Webhook za porudžbine", kind: "task", hasChildren: false },
  { title: "Beleške sa sastanka 21.10.", kind: "note", hasChildren: false },
];

export const IZLOG_TREE_PAGES: IzlogTreePage[] = TREE_ROWS.map((page, index) => ({
  ...page,
  _id: fakeId("pages", 900 + index),
}));

export const IZLOG_TREE_HIDDEN = 9;
