import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { notifyTaskStakeholders } from "./lib/notifications";
import {
  requireProfile,
  requireProfileInStartup,
  requireStartupMember,
} from "./lib/auth";
import { workspaceCanvasPreview } from "./lib/page_creation";
import {
  nextCompletedAt,
  pageTaskSortAt,
  requireVisiblePage,
  summarizePage,
} from "./lib/pages";
import {
  listActiveTaskAssigneeIds,
  normalizeAssigneeProfileIds,
  reconcileTaskAssignees,
  syncTaskAssigneeMirrors,
} from "./lib/task_assignees";
import { reconcileLegacyTaskCheckpoints } from "./lib/task_checkpoints";
import {
  boundedLimit,
  checkpointItemValidator,
  COMMAND_CENTER_STATUS_CAP,
  MAX_TASK_PAGE_SIZE,
  normalizeTaskCheckpoints,
  normalizeTaskInstructions,
  OPEN_TASK_STATUSES,
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
    // Filtriranje po izvršiocu ide kroz spisak učešća — zadatak može imati više
    // izvršilaca, pa projekcija na `pages` nije dovoljna.
    if (args.assigneeProfileId !== undefined) {
      const assignments =
        args.status !== undefined
          ? await ctx.db
              .query("taskAssignees")
              .withIndex(
                "by_startup_profile_status_active_sort",
                (q) =>
                  q
                    .eq("startupId", args.startupId)
                    .eq("profileId", args.assigneeProfileId!)
                    .eq("taskStatus", args.status!)
                    .eq("archivedAt", null),
              )
              .order("asc")
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("taskAssignees")
              .withIndex(
                "by_startup_profile_active_sort",
                (q) =>
                  q
                    .eq("startupId", args.startupId)
                    .eq("profileId", args.assigneeProfileId!)
                    .eq("archivedAt", null),
              )
              .order("asc")
              .paginate(args.paginationOpts);
      const assignedTasks = [];
      for (const assignment of assignments.page) {
        const task = await ctx.db.get("pages", assignment.taskPageId);
        if (
          task === null ||
          task.archivedAt !== null ||
          task.kind !== "task" ||
          task.startupId !== args.startupId ||
          (args.status !== undefined && task.taskStatus !== args.status)
        ) {
          continue;
        }
        assignedTasks.push(summarizePage(task));
      }
      return { ...assignments, page: assignedTasks };
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
    // Čita se spisak učešća, pa se stranice hidriraju. Arhivirane stranice se
    // ne ogledaju u join redovima, pa ih ovde filtriramo — zato se uzima
    // rezerva iznad tražene granice.
    const assignments = args.status === undefined
      ? await ctx.db
          .query("taskAssignees")
          .withIndex("by_profile_active_sort", (q) =>
            q.eq("profileId", profile._id).eq("archivedAt", null),
          )
          .order("asc")
          .take(limit * 2 + MAX_TASK_PAGE_SIZE)
      : await ctx.db
          .query("taskAssignees")
          .withIndex(
            "by_profile_status_active_sort",
            (q) =>
              q
                .eq("profileId", profile._id)
                .eq("taskStatus", args.status!)
                .eq("archivedAt", null),
          )
          .order("asc")
          .take(limit * 2 + MAX_TASK_PAGE_SIZE);

    const tasks = [];
    for (const assignment of assignments) {
      const task = await ctx.db.get("pages", assignment.taskPageId);
      if (
        task === null ||
        task.archivedAt !== null ||
        task.kind !== "task" ||
        (args.status !== undefined && task.taskStatus !== args.status)
      ) {
        continue;
      }
      tasks.push(task);
      if (tasks.length === limit) break;
    }

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

/**
 * Sve otvoreno u jednom startupu, u jednoj reaktivnoj subskripciji — trijažne
 * zone, brojači i opterećenje tima moraju da se osvežavaju kao jedna slika.
 * Zone se namerno ne računaju ovde: query ne sme da čita sat, a ista logika
 * treba i tabeli, stablu i kanvasu (`lib/deadline.ts`).
 */
export const commandCenter = query({
  args: { startupId: v.id("startups") },
  returns: v.object({
    tasks: v.array(pageSummaryValidator),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);

    const tasks = [];
    let hasMore = false;
    for (const status of OPEN_TASK_STATUSES) {
      const rows = await ctx.db
        .query("pages")
        .withIndex("by_startup_status_active_sort", (q) =>
          q
            .eq("startupId", args.startupId)
            .eq("kind", "task")
            .eq("taskStatus", status)
            .eq("archivedAt", null),
        )
        .order("asc")
        .take(COMMAND_CENTER_STATUS_CAP);
      if (rows.length === COMMAND_CENTER_STATUS_CAP) hasMore = true;
      for (const row of rows) tasks.push(summarizePage(row));
    }

    return { tasks, hasMore };
  },
});

export const updateMetadata = mutation({
  args: {
    pageId: v.id("pages"),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
    /** Deprecated ulaz — znači „spisak izvršilaca = [x]” (ili prazan za null). */
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.union(v.number(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
    checkpoints: v.optional(v.union(v.array(checkpointItemValidator), v.null())),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    if (page.kind !== "task") throw new Error("Ova stranica nije task.");
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const currentAssigneeIds = await listActiveTaskAssigneeIds(ctx, page._id);
    const requestedAssigneeIds =
      normalizeAssigneeProfileIds(args.assigneeProfileIds) ??
      (args.assigneeProfileId === undefined
        ? undefined
        : args.assigneeProfileId === null
          ? []
          : [args.assigneeProfileId]);
    for (const profileId of requestedAssigneeIds ?? []) {
      await requireProfileInStartup(ctx, page.startupId, profileId);
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
    const assigneeProfileIds = requestedAssigneeIds ?? currentAssigneeIds;
    const assigneeProfileId = assigneeProfileIds[0] ?? null;
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
    const changesStatus = taskStatus !== page.taskStatus;
    const changesPriority = taskPriority !== page.taskPriority;
    const addedAssignees = assigneeProfileIds.filter(
      (profileId) => !currentAssigneeIds.includes(profileId),
    );
    const removedAssignees = currentAssigneeIds.filter(
      (profileId) => !assigneeProfileIds.includes(profileId),
    );
    const changesAssignee =
      addedAssignees.length > 0 || removedAssignees.length > 0;
    const changesDueDate = dueDate !== page.dueDate;
    const changesInstructions = instructions !== page.instructions;
    const changesCheckpoints =
      JSON.stringify(checkpoints ?? null) !==
      JSON.stringify(page.checkpoints ?? null);

    const unchanged =
      !changesStatus &&
      !changesPriority &&
      !changesAssignee &&
      !changesDueDate &&
      !changesInstructions &&
      !changesCheckpoints &&
      canvasPreview === page.canvasPreview;
    if (unchanged) return page._id;

    // Dozvole se sude po stvarnoj razlici, ne po prisustvu argumenta: kreator
    // vodi zadatak, svaki izvršilac pomera njegov status, a svaki član tima
    // može sam sebe da doda ili skine sa zadatka.
    const isCreator = page.createdByProfileId === profile._id;
    const isAssignee = currentAssigneeIds.includes(profile._id);
    const touchesOnlySelf = [...addedAssignees, ...removedAssignees].every(
      (profileId) => profileId === profile._id,
    );
    const claimsForSelf = addedAssignees.includes(profile._id);

    if (!isCreator) {
      if (changesAssignee && !touchesOnlySelf) {
        throw new Error(
          "Tuđe učešće na zadatku menja njegov kreator. Sebe možeš da dodaš ili skineš.",
        );
      }
      if (changesStatus && !isAssignee && !claimsForSelf) {
        throw new Error(
          "Status menja kreator zadatka ili osoba kojoj je dodeljen.",
        );
      }
      if (changesPriority) {
        throw new Error("Prioritet menja samo kreator zadatka.");
      }
      if (changesDueDate) {
        throw new Error("Rok menja samo kreator zadatka.");
      }
      if (changesInstructions) {
        throw new Error("Instrukcije menja samo kreator zadatka.");
      }
      if (changesCheckpoints) {
        throw new Error("Checkpointe menja samo kreator zadatka.");
      }
    }

    const now = Date.now();
    const taskSortAt = pageTaskSortAt(dueDate, now);
    await ctx.db.patch("pages", page._id, {
      taskStatus,
      taskPriority,
      assigneeProfileId,
      dueDate,
      instructions,
      checkpoints,
      revision: page.revision + 1,
      canvasPreview,
      taskSortAt,
      completedAt: nextCompletedAt(page, taskStatus, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    if (changesAssignee) {
      const patched = await ctx.db.get("pages", page._id);
      if (patched === null) throw new Error("Zadatak nije pronađen.");
      await reconcileTaskAssignees(ctx, {
        page: patched,
        profileIds: assigneeProfileIds,
        actorProfileId: profile._id,
        now,
        membershipChecked: true,
      });
    }
    if (changesStatus || changesDueDate) {
      await syncTaskAssigneeMirrors(ctx, {
        taskPageId: page._id,
        taskStatus,
        taskSortAt,
        now,
      });
    }
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
      ...(claimsForSelf
        ? { detail: `Preuzeo/la: ${profile.displayName}` }
        : {}),
    });
    await notifyTaskStakeholders(ctx, {
      page,
      addedAssigneeProfileIds: addedAssignees,
      assigneeProfileIdsAfterChange: assigneeProfileIds,
      nextTaskStatus: taskStatus,
      actorProfileId: profile._id,
    });
    return page._id;
  },
});
