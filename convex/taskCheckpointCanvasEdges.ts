import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requireStartupMember } from "./lib/auth";
import { requireVisiblePage } from "./lib/pages";
import {
  canonicalTaskCheckpointCanvasEndpoints,
  taskCheckpointCanvasEndpointKey,
  type TaskCheckpointCanvasEndpoint,
} from "./lib/task_checkpoint_canvas_edges";
import { taskCheckpointCanvasEndpointValidator } from "./lib/validators";

const MAX_CHECKPOINT_CANVAS_EDGES = 400;
const rootPageIdValidator = v.union(v.id("pages"), v.null());

async function requireCanvasScope(
  ctx: MutationCtx,
  args: {
    startupId: Id<"startups">;
    areaId: Id<"startupAreas">;
    rootPageId: Id<"pages"> | null;
  },
) {
  const area = await ctx.db.get("startupAreas", args.areaId);
  if (area === null || area.startupId !== args.startupId) {
    throw new Error("Canvas oblast nije pronađena.");
  }
  if (args.rootPageId === null) return;
  const root = await requireVisiblePage(ctx, args.rootPageId);
  if (
    root.startupId !== args.startupId ||
    root.areaId !== args.areaId
  ) {
    throw new Error("Canvas ne pripada izabranoj oblasti.");
  }
}

async function requireEndpoint(
  ctx: MutationCtx,
  endpoint: TaskCheckpointCanvasEndpoint,
  scope: {
    startupId: Id<"startups">;
    areaId: Id<"startupAreas">;
    rootPageId: Id<"pages"> | null;
  },
): Promise<{
  endpoint: TaskCheckpointCanvasEndpoint;
  page: Doc<"pages">;
  ownerProfileId: Id<"profiles">;
}> {
  if (endpoint.kind === "page") {
    const page = await requireVisiblePage(ctx, endpoint.id);
    if (
      page.startupId !== scope.startupId ||
      page.areaId !== scope.areaId ||
      page.parentPageId !== scope.rootPageId
    ) {
      throw new Error("Stranica nije prikazana na ovom Canvas-u.");
    }
    return {
      endpoint,
      page,
      ownerProfileId: page.createdByProfileId,
    };
  }

  const checkpoint = await ctx.db.get("taskCheckpoints", endpoint.id);
  if (
    checkpoint === null ||
    checkpoint.archivedAt !== null ||
    checkpoint.startupId !== scope.startupId ||
    checkpoint.areaId !== scope.areaId
  ) {
    throw new Error("Checkpoint nije pronađen.");
  }
  const page = await requireVisiblePage(ctx, checkpoint.taskPageId);
  if (
    page.kind !== "task" ||
    page.startupId !== scope.startupId ||
    page.areaId !== scope.areaId ||
    (page._id !== scope.rootPageId &&
      page.parentPageId !== scope.rootPageId)
  ) {
    throw new Error("Checkpoint nije prikazan na ovom Canvas-u.");
  }
  return {
    endpoint,
    page,
    ownerProfileId: page.createdByProfileId,
  };
}

export const connect = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    source: taskCheckpointCanvasEndpointValidator,
    target: taskCheckpointCanvasEndpointValidator,
  },
  returns: v.id("taskCheckpointCanvasEdges"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireCanvasScope(ctx, args);
    const sourceKey = taskCheckpointCanvasEndpointKey(args.source);
    const targetKey = taskCheckpointCanvasEndpointKey(args.target);
    if (sourceKey === targetKey) {
      throw new Error("Stavka ne može biti povezana sama sa sobom.");
    }
    if (
      args.source.kind !== "task_checkpoint" &&
      args.target.kind !== "task_checkpoint"
    ) {
      throw new Error("Ova veza mora sadržati najmanje jedan checkpoint.");
    }
    const [source, target] = await Promise.all([
      requireEndpoint(ctx, args.source, args),
      requireEndpoint(ctx, args.target, args),
    ]);
    if (
      source.ownerProfileId !== profile._id &&
      target.ownerProfileId !== profile._id
    ) {
      throw new Error(
        "Vezu možete praviti samo od ili ka svojoj stavci.",
      );
    }

    const canonical = canonicalTaskCheckpointCanvasEndpoints(
      args.source,
      args.target,
    );
    const existing = await ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_scope_active_pair", (q) =>
        q
          .eq("startupId", args.startupId)
          .eq("areaId", args.areaId)
          .eq("rootPageId", args.rootPageId)
          .eq("archivedAt", null)
          .eq("pairKey", canonical.pairKey),
      )
      .first();
    if (existing !== null) return existing._id;

    const activeEdges = await ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_scope_active_pair", (q) =>
        q
          .eq("startupId", args.startupId)
          .eq("areaId", args.areaId)
          .eq("rootPageId", args.rootPageId)
          .eq("archivedAt", null),
      )
      .take(MAX_CHECKPOINT_CANVAS_EDGES + 1);
    if (activeEdges.length >= MAX_CHECKPOINT_CANVAS_EDGES) {
      throw new Error(
        `Canvas može imati najviše ${MAX_CHECKPOINT_CANVAS_EDGES} checkpoint veza.`,
      );
    }

    const endpointAPageId =
      canonical.endpointAKey === sourceKey ? source.page._id : target.page._id;
    const endpointBPageId =
      canonical.endpointBKey === targetKey ? target.page._id : source.page._id;
    const now = Date.now();
    return await ctx.db.insert("taskCheckpointCanvasEdges", {
      startupId: args.startupId,
      areaId: args.areaId,
      rootPageId: args.rootPageId,
      endpointA: canonical.endpointA,
      endpointB: canonical.endpointB,
      endpointAKey: canonical.endpointAKey,
      endpointBKey: canonical.endpointBKey,
      endpointAPageId,
      endpointBPageId,
      pairKey: canonical.pairKey,
      authorProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const disconnect = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    edgeId: v.id("taskCheckpointCanvasEdges"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireCanvasScope(ctx, args);
    const edge = await ctx.db.get(
      "taskCheckpointCanvasEdges",
      args.edgeId,
    );
    if (
      edge === null ||
      edge.archivedAt !== null ||
      edge.startupId !== args.startupId ||
      edge.areaId !== args.areaId ||
      edge.rootPageId !== args.rootPageId
    ) {
      throw new Error("Checkpoint veza nije pronađena na ovom Canvas-u.");
    }
    if (edge.authorProfileId !== profile._id) {
      throw new Error("Možete ukloniti samo vezu koju ste napravili.");
    }
    const now = Date.now();
    await ctx.db.patch("taskCheckpointCanvasEdges", edge._id, {
      archivedAt: now,
      updatedAt: now,
    });
    return null;
  },
});
