import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireStartupMember } from "./lib/auth";
import { boundedLimit } from "./lib/validators";

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
