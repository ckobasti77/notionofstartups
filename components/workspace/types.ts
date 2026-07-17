import type { Doc, Id } from "@/convex/_generated/dataModel";

export type ProfileWithAvatar = Doc<"profiles"> & { avatarUrl: string | null };
export type StartupWithAreas = Doc<"startups"> & {
  areas: Array<Doc<"startupAreas">>;
};
export type StartupMember = {
  membershipId: Id<"startupMembers">;
  profile: ProfileWithAvatar;
};
export type PageDetail = Doc<"pages"> & {
  creator: Doc<"profiles"> | null;
  updater: Doc<"profiles"> | null;
  assignee: Doc<"profiles"> | null;
};
export type MyTask = Doc<"pages"> & {
  startup: Doc<"startups">;
  area: Doc<"startupAreas"> | null;
};

export type WorkspaceRoute =
  | { kind: "home" }
  | { kind: "today" }
  | { kind: "my-tasks" }
  | { kind: "activity" }
  | { kind: "area"; areaId: Id<"startupAreas"> }
  | { kind: "page"; pageId: Id<"pages"> };

export type CreatePageTarget = {
  areaId?: Id<"startupAreas">;
  parentPageId?: Id<"pages"> | null;
  initialKind?: "note" | "task";
};
