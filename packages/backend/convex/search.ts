import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProfile, requireStartupMember } from "./lib/auth";
import { summarizePage } from "./lib/pages";
import { boundedLimit, pageKindValidator } from "./lib/validators";

export const pages = query({
  args: {
    query: v.string(),
    startupId: v.optional(v.id("startups")),
    kind: v.optional(pageKindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const searchTerm = args.query.trim().slice(0, 200);
    if (searchTerm.length < 2) return [];
    const limit = boundedLimit(args.limit, 20, 50);

    let startupIds: Id<"startups">[];
    if (args.startupId !== undefined) {
      await requireStartupMember(ctx, args.startupId);
      startupIds = [args.startupId];
    } else {
      const memberships = await ctx.db
        .query("startupMembers")
        .withIndex("by_profileId_and_startupId", (q) =>
          q.eq("profileId", profile._id),
        )
        .take(20);
      startupIds = memberships
        .filter((membership) => membership.archivedAt === null)
        .map((membership) => membership.startupId);
    }

    const result = [];
    const areasById = new Map<string, Doc<"startupAreas"> | null>();
    for (const startupId of startupIds) {
      const startup = await ctx.db.get("startups", startupId);
      if (startup === null || startup.archivedAt !== null) continue;
      const matches = args.kind === undefined
        ? await ctx.db
            .query("pages")
            .withSearchIndex("search_title_and_content", (q) =>
              q
                .search("searchText", searchTerm)
                .eq("startupId", startupId)
                .eq("archivedAt", null),
            )
            .take(limit)
        : await ctx.db
            .query("pages")
            .withSearchIndex("search_title_and_content", (q) =>
              q
                .search("searchText", searchTerm)
                .eq("startupId", startupId)
                .eq("kind", args.kind!)
                .eq("archivedAt", null),
            )
            .take(limit);
      for (const page of matches) {
        let area = areasById.get(page.areaId);
        if (area === undefined) {
          area = await ctx.db.get("startupAreas", page.areaId);
          areasById.set(page.areaId, area);
        }
        result.push({ ...summarizePage(page), startup, area });
        if (result.length === limit) return result;
      }
    }
    return result;
  },
});
