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

/** Filter Zadataka startupa (PROSTOR P11): Svi (podrazumevano) · Moji · osoba. */
export type TasksFilter = "svi" | "moji";

/** Segment Korpe (PROSTOR P3) — isti ključevi kao `trash.list`. */
export type TrashSegment = "page" | "idea" | "file" | "recovered";

/**
 * Svet jednog startupa. PROSTOR P11 (K08): `home` → `today`, `my-tasks` →
 * `tasks` (Moji) i `approvals` → `trash` žive samo kao preusmerenja u
 * `readWorkspaceRouteCandidate` — nisu više prikazi.
 */
export type StartupRoute =
  | { kind: "thoughts" }
  | { kind: "ideas" }
  | { kind: "today" }
  | {
      kind: "tasks";
      /** Odsutno = „Svi". */
      filter?: TasksFilter;
      /** Zadaci jednog člana (ima prednost nad `filter`). */
      profileId?: Id<"profiles">;
    }
  | { kind: "trash"; segment?: TrashSegment }
  | { kind: "activity" }
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
