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
  text: v.string(),
  kind: pageKindValidator,
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  updatedAt: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  canResize: v.boolean(),
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

function plainText(content: string | undefined) {
  if (!content) return "";
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const DEFAULT_PAGE_NODE_WIDTH = 288;
const DEFAULT_PAGE_NODE_HEIGHT = 196;
const MIN_PAGE_NODE_WIDTH = 240;
const MIN_PAGE_NODE_HEIGHT = 168;
const MAX_PAGE_NODE_WIDTH = 720;
const MAX_PAGE_NODE_HEIGHT = 1_000;

export const getPageCanvasSize = query({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
  },
  returns: v.union(
    v.object({
      width: v.optional(v.number()),
      height: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    const page = await ctx.db.get("pages", args.pageId);
    if (!page || page.startupId !== args.startupId || page.archivedAt !== null) {
      return null;
    }
    const layout = await ctx.db
      .query("pageCanvasNodes")
      .withIndex("by_pageId", (q) => q.eq("pageId", args.pageId))
      .unique();
    return {
      width: layout?.width,
      height: layout?.height,
    };
  },
});

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
    const canvasPages = await Promise.all(pages.map(async (page, index) => {
      const layout = layoutsByPageId.get(page._id);
      const body = await ctx.db
        .query("pageBodies")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique();
      const column = index % columnCount;
      const row = Math.floor(index / columnCount);
      return {
        _id: page._id,
        title: page.title,
        text: plainText(body?.content),
        kind: page.kind,
        taskStatus: page.taskStatus,
        taskPriority: page.taskPriority,
        updatedAt: page.updatedAt,
        x: layout?.x ?? (column - (columnCount - 1) / 2) * 310,
        y: layout?.y ?? (row - 1) * 205,
        width: layout?.width ?? DEFAULT_PAGE_NODE_WIDTH,
        height: layout?.height ?? DEFAULT_PAGE_NODE_HEIGHT,
        canResize: page.createdByProfileId === profile._id,
        creator: creatorsById.get(page.createdByProfileId) ?? null,
      };
    }));

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

export const resizeAreaCanvasPage = mutation({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
    width: v.number(),
    height: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const page = await ctx.db.get("pages", args.pageId);
    if (
      page === null ||
      page.startupId !== args.startupId ||
      page.archivedAt !== null
    ) {
      throw new Error("Kartica više nije dostupna.");
    }
    if (page.createdByProfileId !== profile._id) {
      throw new Error("Možete promeniti veličinu samo svoje kartice.");
    }

    const existing = await ctx.db
      .query("pageCanvasNodes")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique();
    const now = Date.now();
    const layout = {
      startupId: page.startupId,
      areaId: page.areaId,
      pageId: page._id,
      x: existing?.x ?? 0,
      y: existing?.y ?? 0,
      width: clamp(
        args.width,
        MIN_PAGE_NODE_WIDTH,
        MAX_PAGE_NODE_WIDTH,
      ),
      height: clamp(
        args.height,
        MIN_PAGE_NODE_HEIGHT,
        MAX_PAGE_NODE_HEIGHT,
      ),
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, layout);
    } else {
      await ctx.db.insert("pageCanvasNodes", layout);
    }
    return null;
  },
});

export const resetAreaCanvasPageSize = mutation({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const page = await ctx.db.get("pages", args.pageId);
    if (
      page === null ||
      page.startupId !== args.startupId ||
      page.archivedAt !== null
    ) {
      throw new Error("Kartica više nije dostupna.");
    }
    if (page.createdByProfileId !== profile._id) {
      throw new Error("Možete vratiti veličinu samo svoje kartice.");
    }

    const existing = await ctx.db
      .query("pageCanvasNodes")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        width: undefined,
        height: undefined,
        updatedAt: Date.now(),
      });
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
