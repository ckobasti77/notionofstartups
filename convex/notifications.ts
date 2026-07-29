import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { requireProfile, requireStartupMember } from "./lib/auth";
import {
  belgradeDayKey,
  createNotification,
  notificationCopy,
} from "./lib/notifications";
import {
  boundedLimit,
  notificationTargetTypeValidator,
  notificationTypeValidator,
} from "./lib/validators";

/** Preko ovoga brojač prikazuje „99+” umesto tačnog broja. */
const UNREAD_COUNT_CAP = 100;
const MARK_ALL_BATCH = 200;
const LATEST_LIMIT = 10;

/** Prozor u kome cron traži rokove: dovoljno unazad za prekoračene. */
const REMINDER_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const REMINDER_LOOKAHEAD_MS = 48 * 60 * 60 * 1000;
const REMINDER_STARTUP_CAP = 100;
const REMINDER_TASK_CAP = 200;

const notificationItemValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  recipientProfileId: v.id("profiles"),
  startupId: v.id("startups"),
  type: notificationTypeValidator,
  title: v.string(),
  body: v.optional(v.string()),
  targetType: notificationTargetTypeValidator,
  targetId: v.union(v.string(), v.null()),
  actorProfileId: v.union(v.id("profiles"), v.null()),
  dedupeKey: v.union(v.string(), v.null()),
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  actor: v.union(
    v.object({
      _id: v.id("profiles"),
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
});

async function withActors(
  ctx: QueryCtx,
  rows: Array<Doc<"notifications">>,
) {
  const actorIds = [
    ...new Set(
      rows
        .map((row) => row.actorProfileId)
        .filter((id): id is Id<"profiles"> => id !== null),
    ),
  ];
  const actors = new Map(
    await Promise.all(
      actorIds.map(async (actorId) => {
        const actor = await ctx.db.get("profiles", actorId);
        return [
          actorId,
          actor === null
            ? null
            : {
                _id: actor._id,
                displayName: actor.displayName,
                avatarUrl:
                  actor.avatarStorageId === undefined
                    ? null
                    : await ctx.storage.getUrl(actor.avatarStorageId),
              },
        ] as const;
      }),
    ),
  );

  return rows.map((row) => ({
    ...row,
    actor:
      row.actorProfileId === null
        ? null
        : actors.get(row.actorProfileId) ?? null,
  }));
}

export const list = query({
  args: {
    startupId: v.id("startups"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(notificationItemValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const page = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_startup_and_createdAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("startupId", args.startupId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return { ...page, page: await withActors(ctx, page.page) };
  },
});

/** Glava liste — služi samo detekciji novih obaveštenja za toast. */
export const latest = query({
  args: { startupId: v.id("startups"), limit: v.optional(v.number()) },
  returns: v.array(notificationItemValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const limit = boundedLimit(args.limit, LATEST_LIMIT, 50);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_startup_and_createdAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("startupId", args.startupId),
      )
      .order("desc")
      .take(limit);
    return await withActors(ctx, rows);
  },
});

export const unreadCount = query({
  args: { startupId: v.id("startups") },
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_startup_and_readAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("startupId", args.startupId)
          .eq("readAt", null),
      )
      .take(UNREAD_COUNT_CAP);
    return { count: rows.length, capped: rows.length === UNREAD_COUNT_CAP };
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (
      notification === null ||
      notification.recipientProfileId !== profile._id
    ) {
      throw new Error("Obaveštenje nije pronađeno.");
    }
    if (notification.readAt === null) {
      await ctx.db.patch("notifications", notification._id, {
        readAt: Date.now(),
      });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: { startupId: v.id("startups") },
  returns: v.object({ marked: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_startup_and_readAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("startupId", args.startupId)
          .eq("readAt", null),
      )
      .take(MARK_ALL_BATCH);

    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch("notifications", row._id, { readAt: now });
    }

    const hasMore = rows.length === MARK_ALL_BATCH;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.notifications.markAllReadBatch, {
        profileId: profile._id,
        startupId: args.startupId,
      });
    }
    return { marked: rows.length, hasMore };
  },
});

/** Nastavak `markAllRead` u novoj transakciji kad ih je previše za jednu. */
export const markAllReadBatch = internalMutation({
  args: { profileId: v.id("profiles"), startupId: v.id("startups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_startup_and_readAt", (q) =>
        q
          .eq("recipientProfileId", args.profileId)
          .eq("startupId", args.startupId)
          .eq("readAt", null),
      )
      .take(MARK_ALL_BATCH);
    if (rows.length === 0) return null;

    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch("notifications", row._id, { readAt: now });
    }
    if (rows.length === MARK_ALL_BATCH) {
      await ctx.scheduler.runAfter(0, internal.notifications.markAllReadBatch, args);
    }
    return null;
  },
});

/**
 * Cron: podsetnici za rokove. Radi na kalendarskom danu po Beogradu, a ne na
 * „24 sata unazad”, pa se pokretanje više puta dnevno ne pretvara u gnjavljenje —
 * dedupe ključ nosi tip i datum roka, tako da svaki podsetnik ide jednom.
 */
export const remindDueTasks = internalMutation({
  args: {},
  returns: v.object({ created: v.number(), scanned: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const todayKey = belgradeDayKey(now);
    const tomorrowKey = belgradeDayKey(now + 24 * 60 * 60 * 1000);

    const startups = await ctx.db
      .query("startups")
      .withIndex("by_archivedAt_and_updatedAt", (q) => q.eq("archivedAt", null))
      .take(REMINDER_STARTUP_CAP);

    let created = 0;
    let scanned = 0;

    for (const startup of startups) {
      // `taskSortAt === dueDate` kad rok postoji, pa ovaj opseg strukturno
      // isključuje zadatke bez roka i arhivirane.
      const tasks = await ctx.db
        .query("pages")
        .withIndex("by_startup_kind_active_sort", (q) =>
          q
            .eq("startupId", startup._id)
            .eq("kind", "task")
            .eq("archivedAt", null)
            .gte("taskSortAt", now - REMINDER_LOOKBACK_MS)
            .lt("taskSortAt", now + REMINDER_LOOKAHEAD_MS),
        )
        .take(REMINDER_TASK_CAP);

      for (const task of tasks) {
        scanned += 1;
        if (task.taskStatus === "done" || task.dueDate === null) continue;

        const dueKey = belgradeDayKey(task.dueDate);
        const type =
          dueKey === tomorrowKey
            ? "task_due_soon"
            : dueKey === todayKey
              ? "task_due_today"
              : dueKey < todayKey
                ? "task_overdue"
                : null;
        if (type === null) continue;

        const copy =
          type === "task_due_soon"
            ? notificationCopy.taskDueSoon(task.title, task.dueDate)
            : type === "task_due_today"
              ? notificationCopy.taskDueToday(task.title, task.dueDate)
              : notificationCopy.taskOverdue(task.title, task.dueDate);

        // Nedodeljen zadatak podseća onoga koji ga je otvorio.
        const recipientProfileId =
          task.assigneeProfileId ?? task.createdByProfileId;

        const notificationId = await createNotification(ctx, {
          recipientProfileId,
          startupId: task.startupId,
          type,
          title: copy.title,
          body: copy.body,
          targetType: "page",
          targetId: task._id,
          actorProfileId: null,
          dedupeKey: `${task._id}:${type}:${dueKey}`,
        });
        if (notificationId !== null) created += 1;
      }
    }

    return { created, scanned };
  },
});
