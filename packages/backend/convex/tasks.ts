import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { notifyTaskStakeholders } from "./lib/notifications";
import {
  requireProfile,
  requireProfileInStartup,
  requireStartupMember,
} from "./lib/auth";
import {
  type AreaMini,
  listMyActiveStartups,
  type StartupMini,
  startupMiniOf,
  type TaskItem,
  toTaskItem,
} from "./lib/my_scope";
import { pageSnapshot, recordPageRevision } from "./lib/page_content";
import { workspaceCanvasPreview } from "./lib/page_creation";
import {
  canChangeTaskStatus,
  canEditPage,
  LOCKED_PAGE_MESSAGE,
  permissionError,
} from "./lib/permissions";
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
  TASKS_EVERYWHERE_DONE_IN_ALL,
  TASKS_EVERYWHERE_MAX,
  TASKS_EVERYWHERE_STATUS_CAP,
  taskItemValidator,
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
 * „Moji zadaci" ličnog nivoa: moji dodeljeni zadaci iz SVIH startupa u kojima
 * sam aktivan član (ili samo iz `startupId`), sa mini podacima startupa i
 * oblasti. `open` je po roku (kao `listMine`), `done` po trenutku završetka,
 * `all` = otvoreni + do 50 poslednjih završenih. `listMine` ostaje za
 * postojeće ekrane.
 */
export const listEverywhere = query({
  args: {
    scope: v.union(v.literal("open"), v.literal("done"), v.literal("all")),
    startupId: v.optional(v.id("startups")),
    limit: v.optional(v.number()),
  },
  returns: v.object({ items: v.array(taskItemValidator), capped: v.boolean() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const limit = boundedLimit(args.limit, 100, TASKS_EVERYWHERE_MAX);
    const startupId = args.startupId;
    let startups: Map<Id<"startups">, StartupMini>;
    if (startupId === undefined) {
      startups = await listMyActiveStartups(ctx, profile._id);
    } else {
      const { startup } = await requireStartupMember(ctx, startupId);
      startups = new Map([[startup._id, await startupMiniOf(ctx, startup)]]);
    }
    const areaCache = new Map<Id<"startupAreas">, AreaMini | null>();
    const hydrate = async (row: Doc<"taskAssignees">) => {
      if (!startups.has(row.startupId)) return null;
      return await toTaskItem(ctx, await ctx.db.get("pages", row.taskPageId), {
        profileId: profile._id,
        startups,
        areaCache,
        isAssignee: true,
      });
    };

    const items: TaskItem[] = [];
    let capped = false;

    if (args.scope === "open" || args.scope === "all") {
      const rows: Doc<"taskAssignees">[] = [];
      for (const status of OPEN_TASK_STATUSES) {
        const statusRows =
          startupId === undefined
            ? await ctx.db
                .query("taskAssignees")
                .withIndex("by_profile_status_active_sort", (q) =>
                  q
                    .eq("profileId", profile._id)
                    .eq("taskStatus", status)
                    .eq("archivedAt", null),
                )
                .order("asc")
                .take(TASKS_EVERYWHERE_STATUS_CAP)
            : await ctx.db
                .query("taskAssignees")
                .withIndex("by_startup_profile_status_active_sort", (q) =>
                  q
                    .eq("startupId", startupId)
                    .eq("profileId", profile._id)
                    .eq("taskStatus", status)
                    .eq("archivedAt", null),
                )
                .order("asc")
                .take(TASKS_EVERYWHERE_STATUS_CAP);
        if (statusRows.length === TASKS_EVERYWHERE_STATUS_CAP) capped = true;
        rows.push(...statusRows);
      }
      rows.sort(
        (a, b) => a.taskSortAt - b.taskSortAt || a._creationTime - b._creationTime,
      );
      const seen = new Set<Id<"pages">>();
      let index = 0;
      for (; index < rows.length && items.length < limit; index += 1) {
        const row = rows[index];
        if (seen.has(row.taskPageId)) continue;
        seen.add(row.taskPageId);
        const item = await hydrate(row);
        if (item !== null) items.push(item);
      }
      if (index < rows.length) capped = true;
    }

    if (args.scope === "done" || args.scope === "all") {
      const doneLimit =
        args.scope === "all" ? Math.min(TASKS_EVERYWHERE_DONE_IN_ALL, limit) : limit;
      // Indeks završenih je po profilu (bez startupa), pa se uz filter startupa
      // čita širi prozor i filtrira posle čitanja.
      const scan =
        startupId === undefined
          ? doneLimit
          : Math.min(doneLimit * 2, TASKS_EVERYWHERE_MAX);
      const doneRows = await ctx.db
        .query("taskAssignees")
        .withIndex("by_profile_status_active_updated", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("taskStatus", "done")
            .eq("archivedAt", null),
        )
        .order("desc")
        .take(scan);
      if (doneRows.length === scan) capped = true;
      const done: TaskItem[] = [];
      const seen = new Set<Id<"pages">>();
      for (const row of doneRows) {
        if (seen.has(row.taskPageId)) continue;
        seen.add(row.taskPageId);
        const item = await hydrate(row);
        if (item !== null && item.taskStatus === "done") done.push(item);
      }
      done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      if (done.length > doneLimit) capped = true;
      items.push(...done.slice(0, doneLimit));
    }

    return { items, capped };
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
    const actor = await requireStartupMember(ctx, page.startupId);
    const { profile } = actor;
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

    // Dozvole se sude po stvarnoj razlici, ne po prisustvu argumenta. PROSTOR
    // P1: svaki član menja sve osobine zadatka; na zaključanom zadatku autor,
    // vlasnik startupa i admin, a izvršilac još i status (ODLUKA K01 D5); svako
    // sme sebe da doda ili skine.
    const isAssignee = currentAssigneeIds.includes(profile._id);
    const touchesOnlySelf = [...addedAssignees, ...removedAssignees].every(
      (profileId) => profileId === profile._id,
    );
    const claimsForSelf = addedAssignees.includes(profile._id);

    if (!canEditPage(actor, page)) {
      if (
        changesPriority ||
        changesDueDate ||
        changesInstructions ||
        changesCheckpoints ||
        (changesAssignee && !touchesOnlySelf) ||
        (changesStatus &&
          !canChangeTaskStatus(actor, page, isAssignee || claimsForSelf))
      ) {
        throw permissionError("ZAKLJUCANO", LOCKED_PAGE_MESSAGE);
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
    if (changesInstructions) {
      // Instrukcije su sadržaj zadatka → Istorija izmena (P2, P14).
      const content = body?.content ?? "";
      await recordPageRevision(ctx, {
        page,
        before: pageSnapshot(page, page.title, content, page.instructions),
        after: pageSnapshot(page, page.title, content, instructions),
        actorProfileId: profile._id,
        now,
        revision: page.revision + 1,
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
