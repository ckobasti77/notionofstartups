import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordActivity } from "./activity";
import { requireProfileInStartup } from "./auth";
import { insertContribution } from "./collaboration";
import { createNotification, notificationCopy } from "./notifications";
import { pageSearchText, pageTaskSortAt, requireVisiblePage } from "./pages";
import { reconcileLegacyTaskCheckpoints } from "./task_checkpoints";
import {
  cleanRequiredText,
  normalizeTaskCheckpoints,
  normalizeTaskInstructions,
  validateTaskDueDate,
} from "./validators";

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

export function workspaceCanvasPreview(
  title: string,
  content: string,
  instructions?: string | null,
) {
  const source = instructions || content || title;
  return source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 480);
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
  const dueDate = validateTaskDueDate(args.dueDate);
  const instructions = normalizeTaskInstructions(args.instructions);
  const checkpoints = normalizeTaskCheckpoints(args.checkpoints);

  return {
    startupId: args.startupId,
    areaId: args.areaId,
    parentPageId: args.parentPageId,
    kind: args.kind,
    taskStatus: args.kind === "task" ? args.taskStatus ?? "backlog" : null,
    taskPriority: args.kind === "task" ? args.taskPriority ?? "medium" : null,
    assigneeProfileId:
      args.kind === "task" ? args.assigneeProfileId ?? null : null,
    dueDate: args.kind === "task" ? dueDate ?? null : null,
    instructions: args.kind === "task" ? instructions ?? null : null,
    checkpoints: args.kind === "task" ? checkpoints ?? null : null,
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
    treeRevision: 0,
    canvasPreview: workspaceCanvasPreview(
      args.page.title,
      args.page.content,
      args.target.instructions,
    ),
    position: args.page.position,
    taskStatus: args.target.taskStatus,
    taskPriority: args.target.taskPriority,
    assigneeProfileId: args.target.assigneeProfileId,
    dueDate: args.target.dueDate,
    ...(args.target.instructions === null
      ? {}
      : { instructions: args.target.instructions }),
    ...(args.target.checkpoints === null
      ? {}
      : { checkpoints: args.target.checkpoints }),
    ...(args.target.kind === "task"
      ? {
          checkpointTotal: args.target.checkpoints?.length ?? 0,
          checkpointCompleted:
            args.target.checkpoints?.filter((item) => item.completed).length ?? 0,
          checkpointRevision: 0,
        }
      : {}),
    taskSortAt: args.page.taskSortAt,
    completedAt:
      args.target.kind === "task" && args.target.taskStatus === "done"
        ? args.now
        : null,
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
  await ctx.db.insert("pageCanvasPlacements", {
    startupId: args.target.startupId,
    areaId: args.target.areaId,
    rootPageId: args.target.parentPageId,
    pageId,
    x: 0,
    y: 0,
    updatedByProfileId: args.actorProfileId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  if (args.target.kind === "task") {
    const insertedPage = await ctx.db.get("pages", pageId);
    if (insertedPage === null) {
      throw new Error("Kreirani zadatak nije moguće učitati.");
    }
    await reconcileLegacyTaskCheckpoints(ctx, {
      page: insertedPage,
      checkpoints: args.target.checkpoints,
      actorProfileId: args.actorProfileId,
      now: args.now,
    });
  }
  await insertContribution(ctx, {
    startupId: args.target.startupId,
    targetKind: "page",
    targetId: pageId,
    authorProfileId: args.actorProfileId,
    content: args.page.content,
    sourceKind: "page_body",
    sourceId: pageId,
    createdAt: args.now,
  });
  await recordActivity(ctx, {
    startupId: args.target.startupId,
    actorProfileId: args.actorProfileId,
    action: "page_created",
    targetType: "page",
    targetId: pageId,
    title: `${args.target.kind === "task" ? "Task" : "Stranica"} „${args.page.title}” je kreiran/a`,
  });
  // Zadatak koji odmah dobije vlasnika ga i obavesti — inače bi dodela postojala
  // samo u bazi dok je slučajno ne primeti.
  if (args.target.kind === "task" && args.target.assigneeProfileId !== null) {
    const actor = await ctx.db.get("profiles", args.actorProfileId);
    const copy = notificationCopy.taskAssigned(
      args.page.title,
      actor?.displayName ?? "Član tima",
    );
    await createNotification(ctx, {
      recipientProfileId: args.target.assigneeProfileId,
      startupId: args.target.startupId,
      type: "task_assigned",
      title: copy.title,
      body: copy.body,
      targetType: "page",
      targetId: pageId,
      actorProfileId: args.actorProfileId,
    });
  }
  return pageId;
}
