import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_PREVIEW_LENGTH = 480;
const MAX_LEGACY_PLACEMENTS_PER_PAGE = 25;
const MIGRATION_KEY = "areas_v2";

const cursorValidator = v.union(v.string(), v.null());
const batchResultValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  scanned: v.number(),
  changed: v.number(),
  quarantined: v.number(),
});
const verifierStageValidator = v.union(
  v.literal("areas"),
  v.literal("pages"),
  v.literal("placements"),
  v.literal("placement_rows"),
  v.literal("edges"),
  v.literal("viewports"),
  v.literal("relations"),
  v.literal("requests"),
);
const verifierResultValidator = v.object({
  stage: verifierStageValidator,
  continueCursor: v.string(),
  isDone: v.boolean(),
  scanned: v.number(),
  issueCount: v.number(),
  issueSamples: v.array(v.string()),
});

function boundedLimit(value: number | undefined) {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new Error(`Limit mora biti ceo broj od 1 do ${MAX_LIMIT}.`);
  }
  return value;
}

function plainText(content: string | undefined) {
  if (!content) return "";
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function canvasPreview(page: Doc<"pages">, content: string) {
  return plainText(page.instructions || content || page.title).slice(
    0,
    MAX_PREVIEW_LENGTH,
  );
}

function pairKey(nodeAId: Id<"pages">, nodeBId: Id<"pages">) {
  return [nodeAId, nodeBId].sort().join(":");
}

async function quarantine(
  ctx: MutationCtx,
  args: {
    sourceTable: string;
    sourceId: string;
    reason: string;
    dryRun: boolean;
  },
) {
  if (args.dryRun) return;
  const existing = await ctx.db
    .query("areasMigrationIssues")
    .withIndex("by_sourceTable_and_sourceId_and_status", (q) =>
      q
        .eq("sourceTable", args.sourceTable)
        .eq("sourceId", args.sourceId)
        .eq("status", "open"),
    )
    .first();
  const now = Date.now();
  if (existing === null) {
    await ctx.db.insert("areasMigrationIssues", {
      migrationKey: MIGRATION_KEY,
      sourceTable: args.sourceTable,
      sourceId: args.sourceId,
      reason: args.reason,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  } else if (
    existing.migrationKey === MIGRATION_KEY &&
    existing.reason !== args.reason
  ) {
    await ctx.db.patch("areasMigrationIssues", existing._id, {
      reason: args.reason,
      updatedAt: now,
    });
  }
}

function batchResult(
  page: {
    continueCursor: string;
    isDone: boolean;
    page: unknown[];
  },
  changed: number,
  quarantined: number,
) {
  return {
    continueCursor: page.continueCursor,
    isDone: page.isDone,
    scanned: page.page.length,
    changed,
    quarantined,
  };
}

export const backfillAreaBodies = internalMutation({
  args: {
    cursor: cursorValidator,
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: batchResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("startupAreas").order("asc").paginate({
      cursor: args.cursor,
      numItems: boundedLimit(args.limit),
    });
    const dryRun = args.dryRun ?? false;
    let changed = 0;
    let quarantined = 0;
    for (const area of result.page) {
      const startup = await ctx.db.get("startups", area.startupId);
      const existing = await ctx.db
        .query("areaBodies")
        .withIndex("by_areaId", (q) => q.eq("areaId", area._id))
        .take(2);
      if (startup === null) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "startupAreas",
          sourceId: area._id,
          reason: "Oblast upućuje na startup koji ne postoji.",
          dryRun,
        });
        continue;
      }
      if (existing.length > 1) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "startupAreas",
          sourceId: area._id,
          reason: "Oblast ima više od jednog V2 briefinga.",
          dryRun,
        });
        continue;
      }
      if (existing.length === 0) {
        changed += 1;
        if (!dryRun) {
          const now = Date.now();
          await ctx.db.insert("areaBodies", {
            startupId: area.startupId,
            areaId: area._id,
            ownerProfileId: startup.createdByProfileId,
            content: "",
            revision: 0,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }
    return batchResult(result, changed, quarantined);
  },
});

export const backfillPages = internalMutation({
  args: {
    cursor: cursorValidator,
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: batchResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("pages").order("asc").paginate({
      cursor: args.cursor,
      numItems: boundedLimit(args.limit),
    });
    const dryRun = args.dryRun ?? false;
    let changed = 0;
    let quarantined = 0;
    for (const page of result.page) {
      const [area, body] = await Promise.all([
        ctx.db.get("startupAreas", page.areaId),
        ctx.db
          .query("pageBodies")
          .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
          .first(),
      ]);
      if (area === null || area.startupId !== page.startupId) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "pages",
          sourceId: page._id,
          reason: "Stranica i oblast nemaju isti startup opseg.",
          dryRun,
        });
        continue;
      }
      if (page.archivedAt === null && page.parentPageId !== null) {
        const parent = await ctx.db.get("pages", page.parentPageId);
        if (
          parent === null ||
          parent.archivedAt !== null ||
          parent.startupId !== page.startupId ||
          parent.areaId !== page.areaId
        ) {
          quarantined += 1;
          await quarantine(ctx, {
            sourceTable: "pages",
            sourceId: page._id,
            reason: "Roditelj stranice nije u istom startup/area opsegu.",
            dryRun,
          });
          continue;
        }
      }
      const patch: {
        treeRevision?: number;
        canvasPreview?: string;
      } = {};
      if (page.treeRevision === undefined) patch.treeRevision = 0;
      const expectedPreview = canvasPreview(page, body?.content ?? "");
      if (page.canvasPreview !== expectedPreview) {
        patch.canvasPreview = expectedPreview;
      }
      if (Object.keys(patch).length > 0) {
        changed += 1;
        if (!dryRun) await ctx.db.patch("pages", page._id, patch);
      }
    }
    return batchResult(result, changed, quarantined);
  },
});

export const backfillPlacements = internalMutation({
  args: {
    cursor: cursorValidator,
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: batchResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("pages").order("asc").paginate({
      cursor: args.cursor,
      numItems: boundedLimit(args.limit),
    });
    const dryRun = args.dryRun ?? false;
    let changed = 0;
    let quarantined = 0;
    for (const page of result.page) {
      if (page.archivedAt !== null) continue;
      const area = await ctx.db.get("startupAreas", page.areaId);
      const parent =
        page.parentPageId === null
          ? null
          : await ctx.db.get("pages", page.parentPageId);
      if (
        area === null ||
        area.startupId !== page.startupId ||
        (page.parentPageId !== null &&
          (parent === null ||
            parent.archivedAt !== null ||
            parent.startupId !== page.startupId ||
            parent.areaId !== page.areaId))
      ) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "pages",
          sourceId: page._id,
          reason: "Aktivna stranica nema validan area/parent opseg.",
          dryRun,
        });
        continue;
      }
      const existing = await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .take(2);
      if (existing.length > 1) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "pages",
          sourceId: page._id,
          reason: "Stranica ima više od jedne V2 pozicije.",
          dryRun,
        });
        continue;
      }
      if (existing.length === 1) {
        const placement = existing[0];
        if (
          placement.startupId !== page.startupId ||
          placement.areaId !== page.areaId ||
          placement.rootPageId !== page.parentPageId
        ) {
          changed += 1;
          if (!dryRun) {
            await ctx.db.patch("pageCanvasPlacements", placement._id, {
              startupId: page.startupId,
              areaId: page.areaId,
              rootPageId: page.parentPageId,
            });
          }
        }
        continue;
      }
      if (existing.length === 0) {
        const legacyRows = await ctx.db
          .query("pageCanvasNodes")
          .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
          .order("desc")
          .take(MAX_LEGACY_PLACEMENTS_PER_PAGE);
        const validLegacyRows: Doc<"pageCanvasNodes">[] = [];
        for (const legacy of legacyRows) {
          const isValid =
            legacy.startupId === page.startupId &&
            legacy.areaId === page.areaId &&
            Number.isFinite(legacy.x) &&
            Number.isFinite(legacy.y) &&
            (legacy.width === undefined ||
              (Number.isFinite(legacy.width) && legacy.width > 0)) &&
            (legacy.height === undefined ||
              (Number.isFinite(legacy.height) && legacy.height > 0));
          if (isValid) {
            validLegacyRows.push(legacy);
          } else {
            quarantined += 1;
            await quarantine(ctx, {
              sourceTable: "pageCanvasNodes",
              sourceId: legacy._id,
              reason: "Legacy pozicija nema validan opseg ili dimenzije.",
              dryRun,
            });
          }
        }
        const legacy = validLegacyRows.sort(
          (a, b) =>
            b.updatedAt - a.updatedAt || b._id.localeCompare(a._id),
        )[0];
        changed += 1;
        if (!dryRun) {
          const timestamp = legacy?.updatedAt ?? page.createdAt;
          await ctx.db.insert("pageCanvasPlacements", {
            startupId: page.startupId,
            areaId: page.areaId,
            rootPageId: page.parentPageId,
            pageId: page._id,
            x: legacy?.x ?? 0,
            y: legacy?.y ?? 0,
            ...(legacy?.width === undefined
              ? {}
              : { width: legacy.width }),
            ...(legacy?.height === undefined
              ? {}
              : { height: legacy.height }),
            updatedByProfileId: page.updatedByProfileId,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
      }
    }
    return batchResult(result, changed, quarantined);
  },
});

export const backfillEdges = internalMutation({
  args: {
    cursor: cursorValidator,
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: batchResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("pageEdges").order("asc").paginate({
      cursor: args.cursor,
      numItems: boundedLimit(args.limit),
    });
    const dryRun = args.dryRun ?? false;
    let changed = 0;
    let quarantined = 0;
    for (const legacy of result.page) {
      if (legacy.archivedAt !== undefined && legacy.archivedAt !== null) {
        continue;
      }
      const [nodeA, nodeB] = await Promise.all([
        ctx.db.get("pages", legacy.nodeAId),
        ctx.db.get("pages", legacy.nodeBId),
      ]);
      if (
        nodeA === null ||
        nodeB === null ||
        nodeA.archivedAt !== null ||
        nodeB.archivedAt !== null ||
        nodeA.startupId !== legacy.startupId ||
        nodeB.startupId !== legacy.startupId ||
        nodeA.areaId !== legacy.areaId ||
        nodeB.areaId !== legacy.areaId ||
        nodeA.parentPageId !== nodeB.parentPageId ||
        nodeA.kind !== nodeB.kind
      ) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "pageEdges",
          sourceId: legacy._id,
          reason:
            "Legacy veza nema dva aktivna endpointa u istom startup/area/parent opsegu.",
          dryRun,
        });
        continue;
      }
      const key = pairKey(nodeA._id, nodeB._id);
      const existing = await ctx.db
        .query("pageCanvasEdgesV2")
        .withIndex("by_scope_active_pair", (q) =>
          q
            .eq("startupId", legacy.startupId)
            .eq("areaId", legacy.areaId)
            .eq("rootPageId", nodeA.parentPageId)
            .eq("archivedAt", null)
            .eq("pairKey", key),
        )
        .first();
      if (existing === null) {
        changed += 1;
        if (!dryRun) {
          await ctx.db.insert("pageCanvasEdgesV2", {
            startupId: legacy.startupId,
            areaId: legacy.areaId,
            rootPageId: nodeA.parentPageId,
            nodeAId: nodeA._id,
            nodeBId: nodeB._id,
            pairKey: key,
            label: legacy.label,
            authorProfileId: legacy.authorProfileId,
            attribution:
              legacy.authorProfileId === undefined
                ? "legacy_neutral"
                : "author",
            archivedAt: null,
            createdAt: legacy.createdAt,
            updatedAt: legacy.updatedAt ?? legacy.createdAt,
          });
        }
      }
    }
    return batchResult(result, changed, quarantined);
  },
});

export const backfillViewports = internalMutation({
  args: {
    cursor: cursorValidator,
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: batchResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("pageCanvases").order("asc").paginate({
      cursor: args.cursor,
      numItems: boundedLimit(args.limit),
    });
    const dryRun = args.dryRun ?? false;
    let changed = 0;
    let quarantined = 0;
    for (const legacy of result.page) {
      const [area, ownerRows] = await Promise.all([
        ctx.db.get("startupAreas", legacy.areaId),
        ctx.db
          .query("pageCanvases")
          .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
            q
              .eq("ownerProfileId", legacy.ownerProfileId)
              .eq("areaId", legacy.areaId),
          )
          .take(3),
      ]);
      if (area === null || area.startupId !== legacy.startupId) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "pageCanvases",
          sourceId: legacy._id,
          reason: "Legacy viewport nema oblast u istom startup opsegu.",
          dryRun,
        });
        continue;
      }
      const canonical = [...ownerRows].sort(
        (a, b) =>
          b.updatedAt - a.updatedAt || b._id.localeCompare(a._id),
      )[0];
      if (canonical?._id !== legacy._id) continue;
      const existing = await ctx.db
        .query("pageCanvasViewports")
        .withIndex(
          "by_viewerProfileId_and_startupId_and_areaId_and_rootPageId",
          (q) =>
            q
              .eq("viewerProfileId", legacy.ownerProfileId)
              .eq("startupId", legacy.startupId)
              .eq("areaId", legacy.areaId)
              .eq("rootPageId", null),
        )
        .take(2);
      if (existing.length > 1) {
        quarantined += 1;
        await quarantine(ctx, {
          sourceTable: "pageCanvases",
          sourceId: legacy._id,
          reason: "Korisnik ima više V2 viewporta za isti area scope.",
          dryRun,
        });
        continue;
      }
      if (existing.length === 0) {
        changed += 1;
        if (!dryRun) {
          await ctx.db.insert("pageCanvasViewports", {
            startupId: legacy.startupId,
            areaId: legacy.areaId,
            rootPageId: null,
            viewerProfileId: legacy.ownerProfileId,
            x: legacy.x,
            y: legacy.y,
            zoom: legacy.zoom,
            createdAt: legacy.createdAt,
            updatedAt: legacy.updatedAt,
          });
        }
      }
    }
    return batchResult(result, changed, quarantined);
  },
});

function addIssue(
  issues: string[],
  value: string,
) {
  if (issues.length < 25) issues.push(value);
}

function verifierResult(
  stage:
    | "areas"
    | "pages"
    | "placements"
    | "placement_rows"
    | "edges"
    | "viewports"
    | "relations"
    | "requests",
  result: {
    continueCursor: string;
    isDone: boolean;
    page: unknown[];
  },
  issueCount: number,
  issueSamples: string[],
) {
  return {
    stage,
    continueCursor: result.continueCursor,
    isDone: result.isDone,
    scanned: result.page.length,
    issueCount,
    issueSamples,
  };
}

export const verifyAreasV2 = internalQuery({
  args: {
    stage: verifierStageValidator,
    cursor: cursorValidator,
    limit: v.optional(v.number()),
  },
  returns: verifierResultValidator,
  handler: async (ctx, args) => {
    const paginationOpts = {
      cursor: args.cursor,
      numItems: boundedLimit(args.limit),
    };
    let issueCount = 0;
    const issueSamples: string[] = [];
    if (args.stage === "areas") {
      const result = await ctx.db
        .query("startupAreas")
        .order("asc")
        .paginate(paginationOpts);
      for (const area of result.page) {
        const rows = await ctx.db
          .query("areaBodies")
          .withIndex("by_areaId", (q) => q.eq("areaId", area._id))
          .take(2);
        if (
          rows.length !== 1 ||
          rows[0].startupId !== area.startupId ||
          rows[0].areaId !== area._id
        ) {
          issueCount += 1;
          addIssue(issueSamples, `startupAreas:${area._id}:briefing`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "pages") {
      const result = await ctx.db
        .query("pages")
        .order("asc")
        .paginate(paginationOpts);
      for (const page of result.page) {
        const [area, parent] = await Promise.all([
          ctx.db.get("startupAreas", page.areaId),
          page.parentPageId === null
            ? Promise.resolve(null)
            : ctx.db.get("pages", page.parentPageId),
        ]);
        const invalidActiveParent =
          page.archivedAt === null &&
          page.parentPageId !== null &&
          (parent === null ||
            parent.archivedAt !== null ||
            parent.startupId !== page.startupId ||
            parent.areaId !== page.areaId);
        if (
          area === null ||
          area.startupId !== page.startupId ||
          page.treeRevision === undefined ||
          page.canvasPreview === undefined ||
          invalidActiveParent
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pages:${page._id}:scope_or_sidecar`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "placements") {
      const result = await ctx.db
        .query("pages")
        .order("asc")
        .paginate(paginationOpts);
      for (const page of result.page) {
        if (page.archivedAt !== null) continue;
        const [placements, parent] = await Promise.all([
          ctx.db
            .query("pageCanvasPlacements")
            .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
            .take(2),
          page.parentPageId === null
            ? Promise.resolve(null)
            : ctx.db.get("pages", page.parentPageId),
        ]);
        const placement = placements[0] ?? null;
        if (
          placements.length !== 1 ||
          placement === null ||
          placement.startupId !== page.startupId ||
          placement.areaId !== page.areaId ||
          placement.rootPageId !== page.parentPageId ||
          !Number.isFinite(placement.x) ||
          !Number.isFinite(placement.y) ||
          (placement.width !== undefined &&
            (!Number.isFinite(placement.width) || placement.width <= 0)) ||
          (placement.height !== undefined &&
            (!Number.isFinite(placement.height) || placement.height <= 0)) ||
          (page.parentPageId !== null &&
            (parent === null ||
              parent.archivedAt !== null ||
              parent.startupId !== page.startupId ||
              parent.areaId !== page.areaId))
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pages:${page._id}:placement`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "placement_rows") {
      const result = await ctx.db
        .query("pageCanvasPlacements")
        .order("asc")
        .paginate(paginationOpts);
      for (const placement of result.page) {
        const page = await ctx.db.get("pages", placement.pageId);
        const [duplicates, root] = await Promise.all([
          ctx.db
            .query("pageCanvasPlacements")
            .withIndex("by_pageId", (q) => q.eq("pageId", placement.pageId))
            .take(2),
          placement.rootPageId === null
            ? Promise.resolve(null)
            : ctx.db.get("pages", placement.rootPageId),
        ]);
        if (
          page === null ||
          page.archivedAt !== null ||
          duplicates.length !== 1 ||
          page.startupId !== placement.startupId ||
          page.areaId !== placement.areaId ||
          page.parentPageId !== placement.rootPageId ||
          !Number.isFinite(placement.x) ||
          !Number.isFinite(placement.y) ||
          (placement.width !== undefined &&
            (!Number.isFinite(placement.width) || placement.width <= 0)) ||
          (placement.height !== undefined &&
            (!Number.isFinite(placement.height) || placement.height <= 0)) ||
          (placement.rootPageId !== null &&
            (root === null ||
              root.archivedAt !== null ||
              root.startupId !== placement.startupId ||
              root.areaId !== placement.areaId))
        ) {
          issueCount += 1;
          addIssue(
            issueSamples,
            `pageCanvasPlacements:${placement._id}:orphan_or_duplicate`,
          );
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "edges") {
      const result = await ctx.db
        .query("pageCanvasEdgesV2")
        .order("asc")
        .paginate(paginationOpts);
      for (const edge of result.page) {
        if (edge.archivedAt !== null) continue;
        const [nodeA, nodeB, duplicates] = await Promise.all([
          ctx.db.get("pages", edge.nodeAId),
          ctx.db.get("pages", edge.nodeBId),
          ctx.db
            .query("pageCanvasEdgesV2")
            .withIndex("by_scope_active_pair", (q) =>
              q
                .eq("startupId", edge.startupId)
                .eq("areaId", edge.areaId)
                .eq("rootPageId", edge.rootPageId)
                .eq("archivedAt", null)
                .eq("pairKey", edge.pairKey),
            )
            .take(2),
        ]);
        if (
          nodeA === null ||
          nodeB === null ||
          nodeA.archivedAt !== null ||
          nodeB.archivedAt !== null ||
          nodeA._id === nodeB._id ||
          nodeA.startupId !== edge.startupId ||
          nodeB.startupId !== edge.startupId ||
          nodeA.areaId !== edge.areaId ||
          nodeB.areaId !== edge.areaId ||
          nodeA.parentPageId !== edge.rootPageId ||
          nodeB.parentPageId !== edge.rootPageId ||
          nodeA.kind !== nodeB.kind ||
          edge.pairKey !== pairKey(edge.nodeAId, edge.nodeBId) ||
          duplicates.length !== 1
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pageCanvasEdgesV2:${edge._id}:scope`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "viewports") {
      const result = await ctx.db
        .query("pageCanvasViewports")
        .order("asc")
        .paginate(paginationOpts);
      for (const viewport of result.page) {
        const area = await ctx.db.get("startupAreas", viewport.areaId);
        const root =
          viewport.rootPageId === null
            ? null
            : await ctx.db.get("pages", viewport.rootPageId);
        if (
          area === null ||
          area.startupId !== viewport.startupId ||
          (viewport.rootPageId !== null &&
            (root === null ||
              root.startupId !== viewport.startupId ||
              root.areaId !== viewport.areaId))
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pageCanvasViewports:${viewport._id}:scope`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "relations") {
      const result = await ctx.db
        .query("pageRelations")
        .order("asc")
        .paginate(paginationOpts);
      for (const relation of result.page) {
        if (relation.archivedAt !== null) continue;
        const [note, task, duplicates] = await Promise.all([
          ctx.db.get("pages", relation.notePageId),
          ctx.db.get("pages", relation.taskPageId),
          ctx.db
            .query("pageRelations")
            .withIndex("by_scope_pair_active", (q) =>
              q
                .eq("startupId", relation.startupId)
                .eq("areaId", relation.areaId)
                .eq("pairKey", relation.pairKey)
                .eq("archivedAt", null),
            )
            .take(2),
        ]);
        if (
          note === null ||
          task === null ||
          note.archivedAt !== null ||
          task.archivedAt !== null ||
          note.kind !== "note" ||
          task.kind !== "task" ||
          note.startupId !== relation.startupId ||
          task.startupId !== relation.startupId ||
          note.areaId !== relation.areaId ||
          task.areaId !== relation.areaId ||
          relation.pairKey !== pairKey(note._id, task._id) ||
          duplicates.length !== 1
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pageRelations:${relation._id}:scope`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    const result = await ctx.db
      .query("pageNestingRequests")
      .order("asc")
      .paginate(paginationOpts);
    for (const request of result.page) {
      if (request.status !== "pending") continue;
      const [child, parent, sourceParent, area, duplicates] = await Promise.all([
        ctx.db.get("pages", request.childPageId),
        ctx.db.get("pages", request.targetParentPageId),
        request.sourceParentPageId === null
          ? Promise.resolve(null)
          : ctx.db.get("pages", request.sourceParentPageId),
        ctx.db.get("startupAreas", request.areaId),
        ctx.db
          .query("pageNestingRequests")
          .withIndex("by_childPageId_and_status_and_updatedAt", (q) =>
            q.eq("childPageId", request.childPageId).eq("status", "pending"),
          )
          .take(2),
      ]);
      if (
        child === null ||
        parent === null ||
        child.archivedAt !== null ||
        parent.archivedAt !== null ||
        child._id === parent._id ||
        area === null ||
        area.startupId !== request.startupId ||
        child.startupId !== request.startupId ||
        parent.startupId !== request.startupId ||
        child.areaId !== request.areaId ||
        parent.areaId !== request.areaId ||
        child.parentPageId !== request.sourceParentPageId ||
        (child.treeRevision ?? 0) !== request.expectedTreeRevision ||
        child.createdByProfileId !== request.requesterProfileId ||
        parent.createdByProfileId !== request.parentAuthorProfileId ||
        request.requesterProfileId === request.parentAuthorProfileId ||
        request.resolvedAt !== null ||
        duplicates.length !== 1 ||
        (request.sourceParentPageId !== null &&
          (sourceParent === null ||
            sourceParent.archivedAt !== null ||
            sourceParent.startupId !== request.startupId ||
            sourceParent.areaId !== request.areaId))
      ) {
        issueCount += 1;
        addIssue(issueSamples, `pageNestingRequests:${request._id}:scope`);
      }
    }
    return verifierResult(args.stage, result, issueCount, issueSamples);
  },
});
