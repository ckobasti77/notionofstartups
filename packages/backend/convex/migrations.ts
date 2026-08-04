import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { insertContribution } from "./lib/collaboration";
import { MAX_TASK_ASSIGNEES } from "./lib/validators";

const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
  defaultBatchSize: 50,
});

export const backfillTaskCheckpoints = migrations.define({
  table: "pages",
  batchSize: 5,
  migrateOne: async (ctx, page) => {
    if (page.kind !== "task") return;
    const checkpoints = page.checkpoints ?? [];
    for (const [position, checkpoint] of checkpoints.entries()) {
      const existing = await ctx.db
        .query("taskCheckpoints")
        .withIndex("by_taskPageId_and_legacyId", (q) =>
          q
            .eq("taskPageId", page._id)
            .eq("legacyId", checkpoint.id),
        )
        .unique();
      if (existing === null) {
        await ctx.db.insert("taskCheckpoints", {
          startupId: page.startupId,
          areaId: page.areaId,
          taskPageId: page._id,
          legacyId: checkpoint.id,
          text: checkpoint.text,
          completed: checkpoint.completed,
          position,
          createdByProfileId: page.createdByProfileId,
          archivedAt: null,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        });
      } else if (
        existing.text !== checkpoint.text ||
        existing.completed !== checkpoint.completed ||
        existing.position !== position ||
        existing.archivedAt !== null
      ) {
        await ctx.db.patch("taskCheckpoints", existing._id, {
          text: checkpoint.text,
          completed: checkpoint.completed,
          position,
          archivedAt: null,
          updatedAt: page.updatedAt,
        });
      }
    }
    await ctx.db.patch("pages", page._id, {
      checkpointTotal: checkpoints.length,
      checkpointCompleted: checkpoints.filter((item) => item.completed).length,
      checkpointRevision: page.checkpointRevision ?? 0,
    });
  },
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

/**
 * Zapisi od pre uvođenja `completedAt` dobijaju procenu iz `updatedAt` — to je
 * najbolji dostupni signal za istorijske zadatke. Čitanje ionako ide kroz
 * `taskCompletedAt`, pa Puls daje iste brojeve i pre i posle ove migracije.
 */
export const backfillTaskCompletedAt = migrations.define({
  table: "pages",
  migrateOne: async (ctx, page) => {
    if (page.kind !== "task" || page.completedAt !== undefined) return;
    await ctx.db.patch("pages", page._id, {
      completedAt: page.taskStatus === "done" ? page.updatedAt : null,
    });
  },
});

/**
 * Skalarni `pages.assigneeProfileId` postaje projekcija; kanon je `taskAssignees`.
 * Isti widen-migrate-narrow oblik kao `backfillTaskCheckpoints` — stara kolona
 * ostaje netaknuta da bi rollback bio moguć bez vraćanja baze.
 */
export const backfillTaskAssignees = migrations.define({
  table: "pages",
  batchSize: 25,
  migrateOne: async (ctx, page) => {
    if (page.kind !== "task" || page.assigneeProfileId === null) return;
    const existing = await ctx.db
      .query("taskAssignees")
      .withIndex("by_task_and_profile", (q) =>
        q
          .eq("taskPageId", page._id)
          .eq("profileId", page.assigneeProfileId!),
      )
      .unique();
    if (existing !== null) {
      if (
        existing.archivedAt === null &&
        existing.taskStatus === page.taskStatus &&
        existing.taskSortAt === page.taskSortAt
      ) {
        return;
      }
      await ctx.db.patch("taskAssignees", existing._id, {
        archivedAt: null,
        taskStatus: page.taskStatus,
        taskSortAt: page.taskSortAt,
        updatedAt: page.updatedAt,
      });
      return;
    }
    await ctx.db.insert("taskAssignees", {
      startupId: page.startupId,
      taskPageId: page._id,
      profileId: page.assigneeProfileId,
      taskStatus: page.taskStatus,
      taskSortAt: page.taskSortAt,
      addedByProfileId: page.createdByProfileId,
      archivedAt: null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });
  },
});

/**
 * Relacija je nekad bila strukturno Beleška↔Zadatak. Novi kanonski par
 * `pageAId`/`pageBId` se popunjava iz starih kolona; stare ostaju upisane da bi
 * rollback aplikacije radio bez vraćanja baze.
 */
export const backfillPageRelationEndpoints = migrations.define({
  table: "pageRelations",
  migrateOne: async (ctx, relation) => {
    if (
      relation.pageAId !== undefined &&
      relation.pageBId !== undefined
    ) {
      return;
    }
    await ctx.db.patch("pageRelations", relation._id, {
      pageAId: relation.pageAId ?? relation.notePageId,
      pageBId: relation.pageBId ?? relation.taskPageId,
    });
  },
});

/**
 * Kanali oblasti + opšti kanal za svaki aktivan startup (04-CHAT.md sekcija 9).
 * Iterira `startups`; za svaki pravi tačno jedan `kind:"startup"` kanal i po
 * jedan `kind:"area"` kanal po oblasti. Idempotentno — ponovni run ne duplira.
 * Namerno NE seeduje `chatReads` (odluka F: „nema reda = 0 unread", lenjo) i ne
 * upisuje poruke dobrodošlice — dira samo `chatChannels`.
 */
export const backfillChatChannels = migrations.define({
  table: "startups",
  migrateOne: async (ctx, startup) => {
    if (startup.archivedAt !== null) return;

    const existingGeneral = await ctx.db
      .query("chatChannels")
      .withIndex("by_startup_and_kind", (q) =>
        q
          .eq("startupId", startup._id)
          .eq("kind", "startup")
          .eq("archivedAt", null),
      )
      .first();
    if (existingGeneral === null) {
      await ctx.db.insert("chatChannels", {
        startupId: startup._id,
        kind: "startup",
        areaId: null,
        anchorType: null,
        anchorId: null,
        dmKey: null,
        name: "Opšte",
        isPrivate: false,
        lastMessageAt: startup.createdAt,
        lastMessagePreview: "",
        lastMessageAuthorId: null,
        messageCount: 0,
        createdByProfileId: startup.createdByProfileId,
        archivedAt: null,
        createdAt: startup.createdAt,
      });
    }

    const areas = await ctx.db
      .query("startupAreas")
      .withIndex("by_startupId_and_position", (q) =>
        q.eq("startupId", startup._id),
      )
      .collect();
    for (const area of areas) {
      const existingArea = await ctx.db
        .query("chatChannels")
        .withIndex("by_area", (q) =>
          q.eq("areaId", area._id).eq("archivedAt", null),
        )
        .first();
      if (existingArea !== null) continue;
      await ctx.db.insert("chatChannels", {
        startupId: startup._id,
        kind: "area",
        areaId: area._id,
        anchorType: null,
        anchorId: null,
        dmKey: null,
        name: area.label,
        isPrivate: false,
        lastMessageAt: startup.createdAt,
        lastMessagePreview: "",
        lastMessageAuthorId: null,
        messageCount: 0,
        createdByProfileId: startup.createdByProfileId,
        archivedAt: null,
        createdAt: startup.createdAt,
      });
    }
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

export const verifyPageRelationEndpointBackfill = internalQuery({
  args: {},
  returns: v.object({
    scanned: v.number(),
    missingEndpoints: v.number(),
    complete: v.boolean(),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const relations = await ctx.db.query("pageRelations").take(501);
    const missingEndpoints = relations.filter(
      (relation) =>
        relation.pageAId === undefined || relation.pageBId === undefined,
    ).length;
    const truncated = relations.length > 500;
    return {
      scanned: Math.min(relations.length, 500),
      missingEndpoints,
      complete: !truncated && missingEndpoints === 0,
      truncated,
    };
  },
});

export const verifyTaskAssigneeBackfill = internalQuery({
  args: {},
  returns: v.object({
    scannedTasks: v.number(),
    missingRows: v.number(),
    driftedProjections: v.number(),
    complete: v.boolean(),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const pages = await ctx.db.query("pages").take(501);
    const tasks = pages.filter((page) => page.kind === "task");
    let missingRows = 0;
    let driftedProjections = 0;
    for (const task of tasks) {
      const rows = await ctx.db
        .query("taskAssignees")
        .withIndex("by_task_active_created", (q) =>
          q.eq("taskPageId", task._id).eq("archivedAt", null),
        )
        .take(MAX_TASK_ASSIGNEES + 1);
      if (task.assigneeProfileId !== null && rows.length === 0) {
        missingRows += 1;
        continue;
      }
      if ((rows[0]?.profileId ?? null) !== task.assigneeProfileId) {
        driftedProjections += 1;
      }
    }
    const truncated = pages.length > 500;
    return {
      scannedTasks: tasks.length,
      missingRows,
      driftedProjections,
      complete: !truncated && missingRows === 0 && driftedProjections === 0,
      truncated,
    };
  },
});

export const verifyTaskCheckpointBackfill = internalQuery({
  args: {},
  returns: v.object({
    scannedTasks: v.number(),
    missingRows: v.number(),
    mismatchedCounts: v.number(),
    complete: v.boolean(),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const pages = await ctx.db.query("pages").take(501);
    const tasks = pages.filter((page) => page.kind === "task");
    let missingRows = 0;
    let mismatchedCounts = 0;
    for (const task of tasks) {
      const checkpoints = task.checkpoints ?? [];
      if (
        task.checkpointTotal !== checkpoints.length ||
        task.checkpointCompleted !==
          checkpoints.filter((item) => item.completed).length
      ) {
        mismatchedCounts += 1;
      }
      for (const checkpoint of checkpoints) {
        const row = await ctx.db
          .query("taskCheckpoints")
          .withIndex("by_taskPageId_and_legacyId", (q) =>
            q
              .eq("taskPageId", task._id)
              .eq("legacyId", checkpoint.id),
          )
          .unique();
        if (
          row === null ||
          row.archivedAt !== null ||
          row.text !== checkpoint.text ||
          row.completed !== checkpoint.completed
        ) {
          missingRows += 1;
        }
      }
    }
    const truncated = pages.length > 500;
    return {
      scannedTasks: tasks.length,
      missingRows,
      mismatchedCounts,
      complete: !truncated && missingRows === 0 && mismatchedCounts === 0,
      truncated,
    };
  },
});

export const verifyChatChannelBackfill = internalQuery({
  args: {},
  returns: v.object({
    scannedStartups: v.number(),
    missingGeneral: v.number(),
    missingAreaChannels: v.number(),
    complete: v.boolean(),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const startups = await ctx.db.query("startups").take(501);
    const active = startups.filter((startup) => startup.archivedAt === null);
    let missingGeneral = 0;
    let missingAreaChannels = 0;
    for (const startup of active) {
      const general = await ctx.db
        .query("chatChannels")
        .withIndex("by_startup_and_kind", (q) =>
          q
            .eq("startupId", startup._id)
            .eq("kind", "startup")
            .eq("archivedAt", null),
        )
        .first();
      if (general === null) missingGeneral += 1;

      const areas = await ctx.db
        .query("startupAreas")
        .withIndex("by_startupId_and_position", (q) =>
          q.eq("startupId", startup._id),
        )
        .collect();
      for (const area of areas) {
        const channel = await ctx.db
          .query("chatChannels")
          .withIndex("by_area", (q) =>
            q.eq("areaId", area._id).eq("archivedAt", null),
          )
          .first();
        if (channel === null) missingAreaChannels += 1;
      }
    }
    const truncated = startups.length > 500;
    return {
      scannedStartups: active.length,
      missingGeneral,
      missingAreaChannels,
      complete: !truncated && missingGeneral === 0 && missingAreaChannels === 0,
      truncated,
    };
  },
});
