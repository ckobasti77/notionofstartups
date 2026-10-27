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
  | { kind: "me-chat"; channelId?: Id<"chatChannels"> }
  /** Beleške (PROSTOR P7, K18): moje misli iz svih startupa + lične. */
  | { kind: "me-notes" };

/** Filter Zadataka startupa (PROSTOR P11): Svi (podrazumevano) · Moji · osoba. */
export type TasksFilter = "svi" | "moji";

/** Kartica rute stranice: samo Mapa (zadatak je ignoriše, P14). */
export type PageTab = "mapa";

/** Kartica oblasti (PROSTOR P12): Pregled je podrazumevan (K07 E15). */
export type AreaTab = "pregled" | "zadaci" | "dokumenti" | "mapa";

/** Segment Korpe (PROSTOR P3) — isti ključevi kao `trash.list`. */
export type TrashSegment = "page" | "idea" | "file" | "recovered";

/**
 * Svet jednog startupa. PROSTOR P11 (K08): `home` → `today`, `my-tasks` →
 * `tasks` (Moji) i `approvals` → `trash` žive samo kao preusmerenja u
 * `readWorkspaceRouteCandidate` — nisu više prikazi.
 */
export type StartupRoute =
  | { kind: "thoughts" }
  /** `ideaId` = otvoren detalj ideje (fioka, PROSTOR P16, K16). */
  | { kind: "ideas"; ideaId?: Id<"ideaNodes"> }
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
  /** `tab` iz URL-a ima prednost nad zapamćenom karticom (K07 §5.5). */
  | { kind: "area"; areaId: Id<"startupAreas">; tab?: AreaTab }
  /** `tab: "mapa"` = Mapa stranice (PROSTOR P13, K10); bez njega dokument. */
  | { kind: "page"; pageId: Id<"pages">; tab?: PageTab };

export type WorkspaceRoute = MeRoute | StartupRoute;

/** Opseg prikaza: lični nivo ili izabrani startup. */
export type WorkspaceScope = "me" | "startup";

export type CreatePageTarget = {
  areaId?: Id<"startupAreas">;
  parentPageId?: Id<"pages"> | null;
  initialKind?: PageKind;
};
