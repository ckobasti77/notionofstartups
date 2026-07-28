import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import {
  requireProfile,
  requireProfileInStartup,
  requireStartupMember,
} from "./lib/auth";
import { workspaceCanvasPreview } from "./lib/page_creation";
import { pageTaskSortAt, requireVisiblePage, summarizePage } from "./lib/pages";
import { reconcileLegacyTaskCheckpoints } from "./lib/task_checkpoints";
import {
  boundedLimit,
  checkpointItemValidator,
  MAX_TASK_PAGE_SIZE,
  normalizeTaskCheckpoints,
  normalizeTaskInstructions,
  pageSummaryValidator,
  startupAreaDocumentValidator,
  startupDocumentValidator,
  taskPriorityValidator,
  taskStatusValidator,
  validateTaskDueDate,
} from "./lib/validators";

export const listForStartup = query({
  args: {
    startupId: v.id("startups"),
    status: v.optional(taskStatusValidator),
    assigneeProfileId: v.optional(v.id("profiles")),
    dueStart: v.optional(v.number()),
    dueEnd: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(pageSummaryValidator),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    boundedLimit(
      args.paginationOpts.numItems,
      MAX_TASK_PAGE_SIZE,
      MAX_TASK_PAGE_SIZE,
    );
    if ((args.dueStart === undefined) !== (args.dueEnd === undefined)) {
      throw new Error("Za raspon roka potrebni su početak i kraj.");
    }
    if (args.assigneeProfileId !== undefined) {
      await requireProfileInStartup(
        ctx,
        args.startupId,
        args.assigneeProfileId,
      );
    }
    if (args.dueStart !== undefined && args.dueEnd !== undefined) {
      validateTaskDueDate(args.dueStart);
      validateTaskDueDate(args.dueEnd);
      if (args.dueStart >= args.dueEnd) {
        throw new Error("Početak raspona roka mora biti pre kraja.");
      }
      if (args.status !== undefined || args.assigneeProfileId !== undefined) {
        throw new Error(
          "Raspon roka se ne kombinuje sa statusom ili dodeljenim članom.",
        );
      }
    }
    const tasks = args.dueStart !== undefined && args.dueEnd !== undefined
      ? await ctx.db
          .query("pages")
          .withIndex("by_startup_kind_active_sort", (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("kind", "task")
              .eq("archivedAt", null)
              .gte("taskSortAt", args.dueStart!)
              .lt("taskSortAt", args.dueEnd!),
          )
          .order("asc")
          .paginate(args.paginationOpts)
      : args.assigneeProfileId !== undefined
      ? args.status !== undefined
        ? await ctx.db
            .query("pages")
            .withIndex(
              "by_startup_assignee_status_sort",
              (q) =>
                q
                  .eq("startupId", args.startupId)
                  .eq("assigneeProfileId", args.assigneeProfileId!)
                  .eq("taskStatus", args.status!)
                  .eq("archivedAt", null),
            )
            .order("asc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("pages")
            .withIndex(
              "by_startup_assignee_active_sort",
              (q) =>
                q
                  .eq("startupId", args.startupId)
                  .eq("assigneeProfileId", args.assigneeProfileId!)
                  .eq("archivedAt", null),
            )
            .order("asc")
            .paginate(args.paginationOpts)
      : args.status !== undefined
        ? await ctx.db
            .query("pages")
            .withIndex("by_startup_status_active_sort", (q) =>
              q
                .eq("startupId", args.startupId)
                .eq("kind", "task")
                .eq("taskStatus", args.status!)
                .eq("archivedAt", null),
            )
            .order("asc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("pages")
            .withIndex("by_startup_kind_active_sort", (q) =>
              q
                .eq("startupId", args.startupId)
                .eq("kind", "task")
                .eq("archivedAt", null),
            )
            .order("asc")
            .paginate(args.paginationOpts);

    return { ...tasks, page: tasks.page.map(summarizePage) };
  },
});

export const listMine = query({
  args: { status: v.optional(taskStatusValidator), limit: v.optional(v.number()) },
  returns: v.array(
    pageSummaryValidator.extend({
      startup: startupDocumentValidator,
      area: v.union(startupAreaDocumentValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const limit = boundedLimit(args.limit, 40, 100);
    const tasks = args.status === undefined
      ? await ctx.db
          .query("pages")
          .withIndex("by_assigneeProfileId_and_kind_and_archivedAt", (q) =>
            q
              .eq("assigneeProfileId", profile._id)
              .eq("kind", "task")
              .eq("archivedAt", null),
          )
          .take(limit)
      : await ctx.db
          .query("pages")
          .withIndex("by_assigneeProfileId_and_kind_and_taskStatus_and_archivedAt", (q) =>
            q
              .eq("assigneeProfileId", profile._id)
              .eq("kind", "task")
              .eq("taskStatus", args.status!)
              .eq("archivedAt", null),
          )
          .take(limit);

    const result = [];
    for (const task of tasks) {
      const startup = await ctx.db.get("startups", task.startupId);
      if (startup === null || startup.archivedAt !== null) continue;
      const membership = await ctx.db
        .query("startupMembers")
        .withIndex("by_startupId_and_profileId", (q) =>
          q.eq("startupId", startup._id).eq("profileId", profile._id),
        )
        .unique();
      if (membership === null || membership.archivedAt !== null) continue;
      const area = await ctx.db.get("startupAreas", task.areaId);
      result.push({ ...summarizePage(task), startup, area });
      if (result.length === limit) break;
    }
    return result;
  },
});

export const updateMetadata = mutation({
  args: {
    pageId: v.id("pages"),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    dueDate: v.optional(v.union(v.number(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
    checkpoints: v.optional(v.union(v.array(checkpointItemValidator), v.null())),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    if (page.kind !== "task") throw new Error("Ova stranica nije task.");
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (page.createdByProfileId !== profile._id) {
      throw new Error("Osnovne podatke zadatka menja samo njegov kreator.");
    }
    if (args.assigneeProfileId !== undefined && args.assigneeProfileId !== null) {
      await requireProfileInStartup(ctx, page.startupId, args.assigneeProfileId);
    }
    const normalizedDueDate = validateTaskDueDate(args.dueDate);
    const normalizedInstructions =
      args.instructions === undefined
        ? undefined
        : normalizeTaskInstructions(args.instructions);
    const normalizedCheckpoints =
      args.checkpoints === undefined
        ? undefined
        : normalizeTaskCheckpoints(args.checkpoints);
    const updatedDueDate = normalizedDueDate ?? null;
    const dueDate =
      args.dueDate === undefined ? page.dueDate : updatedDueDate;
    const taskStatus =
      args.status === undefined ? page.taskStatus : args.status;
    const taskPriority =
      args.priority === undefined ? page.taskPriority : args.priority;
    const assigneeProfileId =
      args.assigneeProfileId === undefined
        ? page.assigneeProfileId
        : args.assigneeProfileId;
    const instructions =
      args.instructions === undefined
        ? page.instructions
        : normalizedInstructions;
    const checkpoints =
      args.checkpoints === undefined
        ? page.checkpoints
        : (normalizedCheckpoints ?? []);
    const body = await ctx.db
      .query("pageBodies")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique();
    const canvasPreview = workspaceCanvasPreview(
      page.title,
      body?.content ?? "",
      instructions,
    );
    const unchanged =
      taskStatus === page.taskStatus &&
      taskPriority === page.taskPriority &&
      assigneeProfileId === page.assigneeProfileId &&
      dueDate === page.dueDate &&
      instructions === page.instructions &&
      JSON.stringify(checkpoints ?? null) ===
        JSON.stringify(page.checkpoints ?? null) &&
      canvasPreview === page.canvasPreview;
    if (unchanged) return page._id;

    const now = Date.now();
    await ctx.db.patch("pages", page._id, {
      taskStatus,
      taskPriority,
      assigneeProfileId,
      dueDate,
      instructions,
      checkpoints,
      revision: page.revision + 1,
      canvasPreview,
      taskSortAt: pageTaskSortAt(dueDate, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    if (args.checkpoints !== undefined) {
      await reconcileLegacyTaskCheckpoints(ctx, {
        page,
        checkpoints,
        actorProfileId: profile._id,
        now,
      });
    }
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: profile._id,
      action: "task_updated",
      targetType: "page",
      targetId: page._id,
      title: `Task „${page.title}” je ažuriran`,
    });
    return page._id;
  },
});
