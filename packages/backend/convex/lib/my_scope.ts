import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { taskCompletedAt } from "./pages";
import {
  MY_SCOPE_STARTUP_CAP,
  type areaMiniValidator,
  type personalTaskItemValidator,
  type startupMiniValidator,
  type taskItemValidator,
} from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export type StartupMini = Infer<typeof startupMiniValidator>;
export type AreaMini = Infer<typeof areaMiniValidator>;
export type TaskItem = Infer<typeof taskItemValidator>;
export type PersonalTaskItem = Infer<typeof personalTaskItemValidator>;

/** Isti „bez roka" pomak kao `pageTaskSortAt` (`lib/pages.ts`). */
const NO_DUE_DATE_SORT_BASE = 8_000_000_000_000_000;

/**
 * Ključ sortiranja ličnog zadatka: rok, a bez roka najnoviji prvi posle onih
 * sa rokom. Računa se od `createdAt` (ne `updatedAt`), da izmena naslova ne
 * pomera zadatak u listi.
 */
export function personalTaskSortAt(dueDate: number | null, createdAt: number) {
  return dueDate ?? NO_DUE_DATE_SORT_BASE - createdAt;
}

export async function startupMiniOf(
  ctx: ReadCtx,
  startup: Doc<"startups">,
): Promise<StartupMini> {
  return {
    _id: startup._id,
    name: startup.name,
    logoUrl:
      startup.logoStorageId === undefined
        ? null
        : await ctx.storage.getUrl(startup.logoStorageId),
  };
}

/**
 * Startupi u kojima je profil AKTIVAN član, a startup nije arhiviran — jedini
 * opseg iz koga lični nivo sme da čita. Dokumenti članstva ostaju u read setu
 * upita, pa uklanjanje iz tima ili arhiviranje startupa reaktivno sakriva
 * njegove zadatke.
 */
export async function listMyActiveStartups(
  ctx: ReadCtx,
  profileId: Id<"profiles">,
  cap: number = MY_SCOPE_STARTUP_CAP,
): Promise<Map<Id<"startups">, StartupMini>> {
  const memberships = await ctx.db
    .query("startupMembers")
    .withIndex("by_profileId_and_createdAt", (q) => q.eq("profileId", profileId))
    .order("desc")
    .take(cap * 2);
  const startups = new Map<Id<"startups">, StartupMini>();
  for (const membership of memberships) {
    if (membership.archivedAt !== null) continue;
    if (startups.has(membership.startupId)) continue;
    const startup = await ctx.db.get("startups", membership.startupId);
    if (startup === null || startup.archivedAt !== null) continue;
    startups.set(startup._id, await startupMiniOf(ctx, startup));
    if (startups.size === cap) break;
  }
  return startups;
}

/**
 * Da li je profil aktivan izvršilac zadatka. Kao `resolveTaskAssignees`: stari
 * zadatak bez join redova pada na skalarnu projekciju `assigneeProfileId`.
 */
export async function isActiveAssignee(
  ctx: ReadCtx,
  page: Doc<"pages">,
  profileId: Id<"profiles">,
) {
  const rows = await ctx.db
    .query("taskAssignees")
    .withIndex("by_task_and_profile", (q) =>
      q.eq("taskPageId", page._id).eq("profileId", profileId),
    )
    .take(4);
  if (rows.some((row) => row.archivedAt === null)) return true;
  if (rows.length > 0) return false;
  return page.assigneeProfileId === profileId;
}

async function areaMiniOf(
  ctx: ReadCtx,
  areaId: Id<"startupAreas">,
  cache: Map<Id<"startupAreas">, AreaMini | null>,
) {
  if (cache.has(areaId)) return cache.get(areaId) ?? null;
  const area = await ctx.db.get("startupAreas", areaId);
  const mini =
    area === null ? null : { _id: area._id, key: area.key, label: area.label };
  cache.set(areaId, mini);
  return mini;
}

/**
 * Stranica → stavka liste ličnog nivoa. `null` kad stranica ne postoji, nije
 * zadatak, arhivirana je ili joj startup nije u opsegu (`startups`). Polja se
 * NABRAJAJU — `taskItemValidator` odbija višak.
 */
export async function toTaskItem(
  ctx: ReadCtx,
  page: Doc<"pages"> | null,
  options: {
    profileId: Id<"profiles">;
    startups: Map<Id<"startups">, StartupMini>;
    areaCache: Map<Id<"startupAreas">, AreaMini | null>;
    /** Poznato iz reda izvršioca; inače se proverava. */
    isAssignee?: boolean;
  },
): Promise<TaskItem | null> {
  if (page === null || page.archivedAt !== null || page.kind !== "task") {
    return null;
  }
  const startup = options.startups.get(page.startupId);
  if (startup === undefined) return null;
  const isAssignee =
    options.isAssignee ?? (await isActiveAssignee(ctx, page, options.profileId));
  return {
    _id: page._id,
    title: page.title,
    taskStatus: page.taskStatus,
    taskPriority: page.taskPriority,
    dueDate: page.dueDate,
    taskSortAt: page.taskSortAt,
    completedAt: taskCompletedAt(page),
    checkpointTotal: page.checkpointTotal ?? page.checkpoints?.length ?? 0,
    checkpointCompleted:
      page.checkpointCompleted ??
      page.checkpoints?.filter((item) => item.completed).length ??
      0,
    createdByProfileId: page.createdByProfileId,
    isCreator: page.createdByProfileId === options.profileId,
    isAssignee,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    startup,
    area: await areaMiniOf(ctx, page.areaId, options.areaCache),
  };
}

export function toPersonalTaskItem(doc: Doc<"personalTasks">): PersonalTaskItem {
  return {
    _id: doc._id,
    title: doc.title,
    notes: doc.notes ?? null,
    status: doc.status,
    priority: doc.priority,
    dueDate: doc.dueDate,
    sortAt: doc.sortAt,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
