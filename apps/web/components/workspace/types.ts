import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { PageKind } from "@/lib/page-kinds";

export type ProfileWithAvatar = Doc<"profiles"> & { avatarUrl: string | null };
export type StartupWithAreas = Doc<"startups"> & {
  logoUrl: string | null;
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

/** Lični nivo „Ja" (P1): URL nikad ne nosi `startupId` (plan K01, D10). */
export type MeRoute =
  | { kind: "me-today" }
  | { kind: "me-tasks" }
  | { kind: "me-inbox" }
  | { kind: "me-chat"; channelId?: Id<"chatChannels"> };

/** Svet jednog startupa — postojeća unija, bez izmena. */
export type StartupRoute =
  | { kind: "home" }
  | { kind: "thoughts" }
  | { kind: "ideas" }
  | { kind: "today" }
  | { kind: "my-tasks" }
  | { kind: "activity" }
  | { kind: "approvals" }
  | { kind: "chat"; channelId?: Id<"chatChannels"> }
  | { kind: "puls"; weekStart?: number }
  | { kind: "area"; areaId: Id<"startupAreas"> }
  | { kind: "page"; pageId: Id<"pages"> };

export type WorkspaceRoute = MeRoute | StartupRoute;

/** Opseg prikaza: lični nivo ili izabrani startup. */
export type WorkspaceScope = "me" | "startup";

export type CreatePageTarget = {
  areaId?: Id<"startupAreas">;
  parentPageId?: Id<"pages"> | null;
  initialKind?: PageKind;
};
