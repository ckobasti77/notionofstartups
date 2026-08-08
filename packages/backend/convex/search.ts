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

const nodeSearchResultValidator = v.object({
  _id: v.union(v.id("ideaNodes"), v.id("thoughtNodes")),
  title: v.union(v.string(), v.null()),
  text: v.string(),
  startupId: v.id("startups"),
});
const NODE_TEXT_SNIPPET = 280;

/**
 * Full-text pretraga ideja i misli u jednom startupu. Dve tabele — dva indeksa —
 * ali jedan poziv, jer ih klijent prikazuje kao dve grupe uporedo.
 *
 * AUTHZ: ideje su zajedničke (ideas.list filtrira samo po startupId), a misli su
 * PRIVATNE po vlasniku (thoughts.listNodes .eq ownerProfileId). Zato upit nad
 * `thoughtNodes` MORA da .eq-uje `ownerProfileId` na profil pozivaoca — u
 * suprotnom bi pretraga vraćala tuđe privatne misli. Poruke se ovde ne diraju:
 * web zove postojeći `chat.searchMessages`, koji ima svoj kanal-level authz.
 */
export const ideasAndThoughts = query({
  args: {
    startupId: v.id("startups"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    ideas: v.array(nodeSearchResultValidator),
    thoughts: v.array(nodeSearchResultValidator),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const searchTerm = args.query.trim().slice(0, 200);
    if (searchTerm.length < 2) return { ideas: [], thoughts: [] };
    const limit = boundedLimit(args.limit, 20, 50);

    const ideaMatches = await ctx.db
      .query("ideaNodes")
      .withSearchIndex("search_ideas", (q) =>
        q
          .search("searchText", searchTerm)
          .eq("startupId", args.startupId)
          .eq("archivedAt", null),
      )
      .take(limit);

    const thoughtMatches = await ctx.db
      .query("thoughtNodes")
      .withSearchIndex("search_thoughts", (q) =>
        q
          .search("searchText", searchTerm)
          .eq("ownerProfileId", profile._id) // ← privatnost misli
          .eq("startupId", args.startupId)
          .eq("archivedAt", null),
      )
      .take(limit);

    return {
      ideas: ideaMatches.map((node) => ({
        _id: node._id,
        title: node.title,
        text: node.text.slice(0, NODE_TEXT_SNIPPET),
        startupId: node.startupId,
      })),
      thoughts: thoughtMatches.map((node) => ({
        _id: node._id,
        title: node.title,
        text: node.text.slice(0, NODE_TEXT_SNIPPET),
        startupId: node.startupId,
      })),
    };
  },
});
