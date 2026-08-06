import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireStartupMember } from "./lib/auth";
import { boundedLimit } from "./lib/validators";

/** Tipovi radnji i ciljeva — ogledalo `activities` tabele u `schema.ts`. */
const activityActionValidator = v.union(
  v.literal("startup_created"),
  v.literal("startup_updated"),
  v.literal("startup_archived"),
  v.literal("member_added"),
  v.literal("member_removed"),
  v.literal("invite_created"),
  v.literal("invite_claimed"),
  v.literal("invite_revoked"),
  v.literal("page_created"),
  v.literal("page_updated"),
  v.literal("page_moved"),
  v.literal("page_archived"),
  v.literal("task_updated"),
  v.literal("contribution_created"),
  v.literal("contribution_updated"),
  v.literal("deletion_requested"),
  v.literal("deletion_voted"),
  v.literal("deletion_resolved"),
  v.literal("nesting_requested"),
  v.literal("nesting_resolved"),
  v.literal("content_recovered"),
  v.literal("content_soft_deleted"),
);

const activityTargetTypeValidator = v.union(
  v.literal("startup"),
  v.literal("profile"),
  v.literal("invite"),
  v.literal("page"),
  v.literal("idea"),
  v.literal("contribution"),
  v.literal("request"),
  v.literal("recovered"),
);

const activityItemValidator = v.object({
  _id: v.id("activities"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  actorProfileId: v.id("profiles"),
  action: activityActionValidator,
  targetType: activityTargetTypeValidator,
  targetId: v.string(),
  title: v.string(),
  detail: v.optional(v.string()),
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

/** Uz svaki red zakačen sažetak aktera (ime + avatar), keširan po id-ju. */
async function withActors(ctx: QueryCtx, rows: Array<Doc<"activities">>) {
  const actorIds = [...new Set(rows.map((row) => row.actorProfileId))];
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
    actor: actors.get(row.actorProfileId) ?? null,
  }));
}

export const listForStartup = query({
  args: { startupId: v.id("startups"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    const limit = boundedLimit(args.limit, 30, 50);
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_startupId_and_createdAt", (q) =>
        q.eq("startupId", args.startupId),
      )
      .order("desc")
      .take(limit);
    const actorIds = [...new Set(activities.map((activity) => activity.actorProfileId))];
    const actors = new Map(
      await Promise.all(
        actorIds.map(async (actorId) => {
          const actor = await ctx.db.get("profiles", actorId);
          return [
            actorId,
            actor === null
              ? null
              : {
                  ...actor,
                  avatarUrl:
                    actor.avatarStorageId === undefined
                      ? null
                      : await ctx.storage.getUrl(actor.avatarStorageId),
                },
          ] as const;
        }),
      ),
    );
    return activities.map((activity) => ({
      ...activity,
      actor: actors.get(activity.actorProfileId) ?? null,
    }));
  },
});

/**
 * Hronološka aktivnost startupa, paginirano (najnovije prvo). Za mobilnu listu
 * grupisanu po danu sa „učitaj još"; klijent-neutralno, pa je i web sme koristiti
 * (trenutno web čita `listForStartup`).
 */
export const listPaginated = query({
  args: {
    startupId: v.id("startups"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(activityItemValidator),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    const page = await ctx.db
      .query("activities")
      .withIndex("by_startupId_and_createdAt", (q) =>
        q.eq("startupId", args.startupId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: await withActors(ctx, page.page) };
  },
});
