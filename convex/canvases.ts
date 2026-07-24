import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireStartupMember } from "./lib/auth";
import { requirePageArea } from "./lib/page_creation";
import {
  pageKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";

const canvasViewportValidator = v.object({
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
  persisted: v.boolean(),
});

const canvasPageValidator = v.object({
  _id: v.id("pages"),
  title: v.string(),
  kind: pageKindValidator,
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  updatedAt: v.number(),
  x: v.number(),
  y: v.number(),
  creator: v.union(
    v.object({
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
});

const canvasEdgeValidator = v.object({
  _id: v.id("pageEdges"),
  source: v.id("pages"),
  target: v.id("pages"),
  label: v.union(v.string(), v.null()),
});

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) throw new Error("Koordinata kanvasa nije ispravna.");
  return Math.min(Math.max(value, minimum), maximum);
}

export const getAreaCanvas = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    kind: pageKindValidator,
  },
  returns: v.object({
    pages: v.array(canvasPageValidator),
    edges: v.array(canvasEdgeValidator),
    viewport: canvasViewportValidator,
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);

    const rawPages = await ctx.db
      .query("pages")
      .withIndex(
        "by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position",
        (q) =>
          q
            .eq("areaId", args.areaId)
            .eq("kind", args.kind)
            .eq("parentPageId", null)
            .eq("archivedAt", null),
      )
      .order("desc")
      .take(251);
    const truncated = rawPages.length > 250;
    const pages = rawPages.slice(0, 250);

    const [layouts, rawEdges, savedViewport] = await Promise.all([
      ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
        .take(500),
      ctx.db
        .query("pageEdges")
        .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
        .take(500),
      ctx.db
        .query("pageCanvases")
        .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
          q
            .eq("ownerProfileId", profile._id)
            .eq("areaId", args.areaId)
            .eq("kind", args.kind),
        )
        .unique(),
    ]);

    const layoutsByPageId = new Map(layouts.map((layout) => [layout.pageId, layout]));
    const creatorIds = Array.from(new Set(pages.map((page) => page.createdByProfileId)));
    const creators = await Promise.all(
      creatorIds.map(async (profileId) => {
        const creator = await ctx.db.get("profiles", profileId);
        const avatarUrl = creator?.avatarStorageId
          ? await ctx.storage.getUrl(creator.avatarStorageId)
          : null;
        return [
          profileId,
          creator
            ? { displayName: creator.displayName, avatarUrl }
            : null,
        ] as const;
      }),
    );
    const creatorsById = new Map(creators);

    const columnCount = Math.max(1, Math.ceil(Math.sqrt(pages.length)));
    const canvasPages = pages.map((page, index) => {
      const layout = layoutsByPageId.get(page._id);
      const column = index % columnCount;
      const row = Math.floor(index / columnCount);
      return {
        _id: page._id,
        title: page.title,
        kind: page.kind,
        taskStatus: page.taskStatus,
        taskPriority: page.taskPriority,
        updatedAt: page.updatedAt,
        x: layout?.x ?? (column - (columnCount - 1) / 2) * 310,
        y: layout?.y ?? (row - 1) * 205,
        creator: creatorsById.get(page.createdByProfileId) ?? null,
      };
    });

    const visiblePageIds = new Set(canvasPages.map((page) => page._id));
    const edges = rawEdges
      .filter(
        (edge) =>
          visiblePageIds.has(edge.nodeAId) && visiblePageIds.has(edge.nodeBId),
      )
      .map((edge) => ({
        _id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
        label: edge.label,
      }));

    return {
      pages: canvasPages,
      edges,
      viewport: savedViewport
        ? {
            x: savedViewport.x,
            y: savedViewport.y,
            zoom: savedViewport.zoom,
            persisted: true,
          }
        : { x: 0, y: 0, zoom: 1, persisted: false },
      truncated,
    };
  },
});

export const moveAreaCanvasPages = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    updates: v.array(
      v.object({
        pageId: v.id("pages"),
        x: v.number(),
        y: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);
    if (args.updates.length > 100) {
      throw new Error("Pomeri najviše 100 kartica odjednom.");
    }

    const now = Date.now();
    for (const update of args.updates) {
      const page = await ctx.db.get("pages", update.pageId);
      if (
        !page ||
        page.startupId !== args.startupId ||
        page.areaId !== args.areaId ||
        page.archivedAt !== null
      ) {
        throw new Error("Jedna od kartica više nije dostupna.");
      }
      const existing = await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", update.pageId))
        .unique();
      const position = {
        startupId: args.startupId,
        areaId: args.areaId,
        pageId: update.pageId,
        x: clamp(update.x, -100_000, 100_000),
        y: clamp(update.y, -100_000, 100_000),
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, position);
      } else {
        await ctx.db.insert("pageCanvasNodes", position);
      }
    }
    return null;
  },
});

export const saveAreaCanvasViewport = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    kind: pageKindValidator,
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);
    const now = Date.now();
    const existing = await ctx.db
      .query("pageCanvases")
      .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
        q
          .eq("ownerProfileId", profile._id)
          .eq("areaId", args.areaId)
          .eq("kind", args.kind),
      )
      .unique();
    const viewport = {
      startupId: args.startupId,
      areaId: args.areaId,
      ownerProfileId: profile._id,
      kind: args.kind,
      x: clamp(args.x, -100_000, 100_000),
      y: clamp(args.y, -100_000, 100_000),
      zoom: clamp(args.zoom, 0.5, 1.6),
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, viewport);
    } else {
      await ctx.db.insert("pageCanvases", { ...viewport, createdAt: now });
    }
    return null;
  },
});

export const connectAreaCanvasPages = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    source: v.id("pages"),
    target: v.id("pages"),
  },
  returns: v.id("pageEdges"),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);
    if (args.source === args.target) {
      throw new Error("Kartica ne može biti povezana sa samom sobom.");
    }
    const [source, target] = await Promise.all([
      ctx.db.get("pages", args.source),
      ctx.db.get("pages", args.target),
    ]);
    if (
      !source ||
      !target ||
      source.startupId !== args.startupId ||
      target.startupId !== args.startupId ||
      source.areaId !== args.areaId ||
      target.areaId !== args.areaId ||
      source.archivedAt !== null ||
      target.archivedAt !== null
    ) {
      throw new Error("Poveži samo dostupne kartice iz iste poslovne oblasti.");
    }

    const pairKey = [args.source, args.target].sort().join(":");
    const existing = await ctx.db
      .query("pageEdges")
      .withIndex("by_areaId_and_pairKey", (q) =>
        q.eq("areaId", args.areaId).eq("pairKey", pairKey),
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("pageEdges", {
      startupId: args.startupId,
      areaId: args.areaId,
      nodeAId: args.source,
      nodeBId: args.target,
      pairKey,
      label: null,
      createdAt: Date.now(),
    });
  },
});

export const disconnectAreaCanvasPages = mutation({
  args: {
    startupId: v.id("startups"),
    edgeIds: v.array(v.id("pageEdges")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    if (args.edgeIds.length > 100) {
      throw new Error("Ukloni najviše 100 veza odjednom.");
    }
    for (const edgeId of args.edgeIds) {
      const edge = await ctx.db.get("pageEdges", edgeId);
      if (edge?.startupId === args.startupId) {
        await ctx.db.delete("pageEdges", edgeId);
      }
    }
    return null;
  },
});
