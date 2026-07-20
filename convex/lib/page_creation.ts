import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordActivity } from "./activity";
import { requireProfileInStartup } from "./auth";
import { pageSearchText, pageTaskSortAt, requireVisiblePage } from "./pages";
import { cleanRequiredText } from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export type WorkspacePageKind = "note" | "task";
export type WorkspaceTaskStatus =
  | "backlog"
  | "next"
  | "in_progress"
  | "blocked"
  | "done";
export type WorkspaceTaskPriority = "low" | "medium" | "high" | "urgent";

export type WorkspacePageTarget = {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  parentPageId: Id<"pages"> | null;
  kind: WorkspacePageKind;
  taskStatus: WorkspaceTaskStatus | null;
  taskPriority: WorkspaceTaskPriority | null;
  assigneeProfileId: Id<"profiles"> | null;
  dueDate: number | null;
  instructions: string | null;
  checkpoints: Array<{ id: string; text: string; completed: boolean }> | null;
};

export type PreparedWorkspacePage = {
  title: string;
  content: string;
  position: number;
  taskSortAt: number;
};

export function cleanPageContent(content: string) {
  if (content.length > 80_000) {
    throw new Error("Sadržaj može imati najviše 80.000 znakova.");
  }
  return content;
}

export function cleanPagePosition(position: number | undefined, fallback: number) {
  const value = position ?? fallback;
  if (!Number.isFinite(value)) {
    throw new Error("Pozicija stranice nije ispravna.");
  }
  return value;
}

export async function requirePageArea(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  areaId: Id<"startupAreas">,
) {
  const area = await ctx.db.get("startupAreas", areaId);
  if (area === null || area.startupId !== startupId) {
    throw new Error("Oblast nije pronađena u ovom startupu.");
  }
  return area;
}

export async function requirePageParent(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  areaId: Id<"startupAreas">,
  parentPageId: Id<"pages"> | null,
) {
  if (parentPageId === null) return null;
  const parent = await requireVisiblePage(ctx, parentPageId);
  if (parent.startupId !== startupId || parent.areaId !== areaId) {
    throw new Error("Roditeljska stranica mora biti u istoj oblasti.");
  }
  return parent;
}

export async function validateWorkspacePageTarget(
  ctx: ReadCtx,
  args: {
    startupId: Id<"startups">;
    areaId: Id<"startupAreas">;
    parentPageId: Id<"pages"> | null;
    kind: WorkspacePageKind;
    taskStatus?: WorkspaceTaskStatus;
    taskPriority?: WorkspaceTaskPriority;
    assigneeProfileId?: Id<"profiles"> | null;
    dueDate?: number | null;
    instructions?: string;
    checkpoints?: Array<{ id: string; text: string; completed: boolean }>;
  },
): Promise<WorkspacePageTarget> {
  await requirePageArea(ctx, args.startupId, args.areaId);
  await requirePageParent(
    ctx,
    args.startupId,
    args.areaId,
    args.parentPageId,
  );

  const hasTaskData =
    args.taskStatus !== undefined ||
    args.taskPriority !== undefined ||
    (args.assigneeProfileId !== undefined && args.assigneeProfileId !== null) ||
    (args.dueDate !== undefined && args.dueDate !== null) ||
    args.instructions !== undefined ||
    args.checkpoints !== undefined;
  if (args.kind === "note" && hasTaskData) {
    throw new Error("Task podaci se mogu dodati samo task stranici.");
  }

  if (args.assigneeProfileId !== undefined && args.assigneeProfileId !== null) {
    await requireProfileInStartup(
      ctx,
      args.startupId,
      args.assigneeProfileId,
    );
  }
  if (
    args.dueDate !== undefined &&
    args.dueDate !== null &&
    (!Number.isFinite(args.dueDate) || args.dueDate < 0)
  ) {
    throw new Error("Rok nije ispravan.");
  }

  return {
    startupId: args.startupId,
    areaId: args.areaId,
    parentPageId: args.parentPageId,
    kind: args.kind,
    taskStatus: args.kind === "task" ? args.taskStatus ?? "backlog" : null,
    taskPriority: args.kind === "task" ? args.taskPriority ?? "medium" : null,
    assigneeProfileId:
      args.kind === "task" ? args.assigneeProfileId ?? null : null,
    dueDate: args.kind === "task" ? args.dueDate ?? null : null,
    instructions: args.kind === "task" ? args.instructions ?? null : null,
    checkpoints: args.kind === "task" ? args.checkpoints ?? null : null,
  };
}

export function prepareWorkspacePage(
  target: WorkspacePageTarget,
  args: {
    title: string;
    content: string;
    position?: number;
    now: number;
  },
): PreparedWorkspacePage {
  const title = cleanRequiredText(args.title, "Naslov", 200);
  const content = cleanPageContent(args.content);
  const position = cleanPagePosition(args.position, args.now);
  return {
    title,
    content,
    position,
    taskSortAt: pageTaskSortAt(target.dueDate, args.now),
  };
}

export async function insertWorkspacePage(
  ctx: MutationCtx,
  args: {
    target: WorkspacePageTarget;
    page: PreparedWorkspacePage;
    actorProfileId: Id<"profiles">;
    now: number;
  },
) {
  const pageId = await ctx.db.insert("pages", {
    startupId: args.target.startupId,
    areaId: args.target.areaId,
    parentPageId: args.target.parentPageId,
    kind: args.target.kind,
    title: args.page.title,
    searchText: pageSearchText(args.page.title, args.page.content),
    revision: 0,
    position: args.page.position,
    taskStatus: args.target.taskStatus,
    taskPriority: args.target.taskPriority,
    assigneeProfileId: args.target.assigneeProfileId,
    dueDate: args.target.dueDate,
    ...(args.target.instructions ? { instructions: args.target.instructions } : {}),
    ...(args.target.checkpoints ? { checkpoints: args.target.checkpoints } : {}),
    taskSortAt: args.page.taskSortAt,
    createdByProfileId: args.actorProfileId,
    updatedByProfileId: args.actorProfileId,
    archivedAt: null,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await ctx.db.insert("pageBodies", {
    pageId,
    content: args.page.content,
    updatedAt: args.now,
  });
  await recordActivity(ctx, {
    startupId: args.target.startupId,
    actorProfileId: args.actorProfileId,
    action: "page_created",
    targetType: "page",
    targetId: pageId,
    title: `${args.target.kind === "task" ? "Task" : "Stranica"} „${args.page.title}” je kreiran/a`,
  });
  return pageId;
}
