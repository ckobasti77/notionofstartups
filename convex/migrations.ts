import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { insertContribution } from "./lib/collaboration";

const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
  defaultBatchSize: 50,
});

export const backfillIdeaOriginalContributions = migrations.define({
  table: "ideaNodes",
  migrateOne: async (ctx, idea) => {
    const existing = await ctx.db
      .query("contentContributions")
      .withIndex("by_sourceKind_and_sourceId", (q) =>
        q.eq("sourceKind", "idea_original").eq("sourceId", idea._id),
      )
      .unique();
    if (existing !== null) return;
    await insertContribution(ctx, {
      startupId: idea.startupId,
      targetKind: "idea",
      targetId: idea._id,
      authorProfileId: idea.authorProfileId,
      content: idea.text,
      sourceKind: "idea_original",
      sourceId: idea._id,
      createdAt: idea.createdAt,
    });
  },
});

export const backfillPageEntries = migrations.define({
  table: "pageEntries",
  migrateOne: async (ctx, entry) => {
    const existing = await ctx.db
      .query("contentContributions")
      .withIndex("by_sourceKind_and_sourceId", (q) =>
        q.eq("sourceKind", "page_entry").eq("sourceId", entry._id),
      )
      .unique();
    if (existing !== null) return;
    const page = await ctx.db.get("pages", entry.pageId);
    if (page === null) return;
    await insertContribution(ctx, {
      startupId: page.startupId,
      targetKind: "page",
      targetId: page._id,
      authorProfileId: entry.authorProfileId,
      content: entry.content,
      sourceKind: "page_entry",
      sourceId: entry._id,
      createdAt: entry.createdAt,
    });
  },
});

export const backfillLegacyPageBodies = migrations.define({
  table: "pageBodies",
  migrateOne: async (ctx, body) => {
    if (!body.content.trim()) return;
    const page = await ctx.db.get("pages", body.pageId);
    if (page === null) return;
    const existingBySource = await Promise.all(
      [page._id, body._id].map((sourceId) =>
        ctx.db
          .query("contentContributions")
          .withIndex("by_sourceKind_and_sourceId", (q) =>
            q.eq("sourceKind", "page_body").eq("sourceId", sourceId),
          )
          .take(2),
      ),
    );
    if (
      existingBySource
        .flat()
        .some(
          (contribution) =>
            contribution.targetKind === "page" &&
            contribution.targetId === page._id,
        )
    ) {
      return;
    }
    await insertContribution(ctx, {
      startupId: page.startupId,
      targetKind: "page",
      targetId: page._id,
      attribution: "legacy_neutral",
      content: body.content,
      sourceKind: "page_body",
      sourceId: page._id,
      createdAt: page.createdAt,
    });
  },
});

export const run = migrations.runner();

export const verifyContributionBackfill = internalQuery({
  args: {},
  returns: v.object({
    scanned: v.object({
      ideas: v.number(),
      entries: v.number(),
      bodies: v.number(),
    }),
    remaining: v.object({
      ideas: v.number(),
      entries: v.number(),
      bodies: v.number(),
    }),
    complete: v.boolean(),
    note: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const [ideas, entries, bodies] = await Promise.all([
      ctx.db.query("ideaNodes").take(500),
      ctx.db.query("pageEntries").take(500),
      ctx.db.query("pageBodies").take(500),
    ]);
    const missingIdeas: string[] = [];
    const missingEntries: string[] = [];
    const missingBodies: string[] = [];
    for (const idea of ideas) {
      const contribution = await ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "idea_original").eq("sourceId", idea._id),
        )
        .unique();
      if (contribution === null) missingIdeas.push(idea._id);
    }
    for (const entry of entries) {
      const contribution = await ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_entry").eq("sourceId", entry._id),
        )
        .unique();
      if (contribution === null) missingEntries.push(entry._id);
    }
    for (const body of bodies) {
      if (!body.content.trim()) continue;
      const page = await ctx.db.get("pages", body.pageId);
      if (page === null) {
        missingBodies.push(body._id);
        continue;
      }
      const contributionBatches = await Promise.all(
        [page._id, body._id].map((sourceId) =>
          ctx.db
            .query("contentContributions")
            .withIndex("by_sourceKind_and_sourceId", (q) =>
              q.eq("sourceKind", "page_body").eq("sourceId", sourceId),
            )
            .take(2),
        ),
      );
      const hasContribution = contributionBatches
        .flat()
        .some(
          (contribution) =>
            contribution.targetKind === "page" &&
            contribution.targetId === page._id,
        );
      if (!hasContribution) missingBodies.push(body._id);
    }
    const truncated =
      ideas.length === 500 || entries.length === 500 || bodies.length === 500;
    return {
      scanned: {
        ideas: ideas.length,
        entries: entries.length,
        bodies: bodies.length,
      },
      remaining: {
        ideas: missingIdeas.length,
        entries: missingEntries.length,
        bodies: missingBodies.length,
      },
      complete:
        !truncated &&
        missingIdeas.length === 0 &&
        missingEntries.length === 0 &&
        missingBodies.length === 0,
      note:
        truncated
          ? "Provera je ograničena na prvih 500 zapisa po tabeli i ne može potvrditi završetak."
          : null,
    };
  },
});
