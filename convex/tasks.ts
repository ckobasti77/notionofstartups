import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import {
  requireProfile,
  requireProfileInStartup,
  requireStartupMember,
} from "./lib/auth";
import { pageTaskSortAt, requireVisiblePage, summarizePage } from "./lib/pages";
import {
  boundedLimit,
  taskPriorityValidator,
  taskStatusValidator,
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
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    if ((args.dueStart === undefined) !== (args.dueEnd === undefined)) {
      throw new Error("Za raspon roka potrebni su početak i kraj.");
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
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    if (page.kind !== "task") throw new Error("Ova stranica nije task.");
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (args.assigneeProfileId !== undefined && args.assigneeProfileId !== null) {
      await requireProfileInStartup(ctx, page.startupId, args.assigneeProfileId);
    }
    if (
      args.dueDate !== undefined &&
      args.dueDate !== null &&
      (!Number.isFinite(args.dueDate) || args.dueDate < 0)
    ) {
      throw new Error("Rok nije ispravan.");
    }
    const now = Date.now();
    const dueDate = args.dueDate === undefined ? page.dueDate : args.dueDate;
    await ctx.db.patch("pages", page._id, {
      ...(args.status === undefined ? {} : { taskStatus: args.status }),
      ...(args.priority === undefined ? {} : { taskPriority: args.priority }),
      ...(args.assigneeProfileId === undefined
        ? {}
        : { assigneeProfileId: args.assigneeProfileId }),
      ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
      taskSortAt: pageTaskSortAt(dueDate, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
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
