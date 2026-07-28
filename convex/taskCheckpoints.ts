import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { requireStartupMember } from "./lib/auth";
import { requireVisiblePage } from "./lib/pages";
import {
  listActiveTaskCheckpoints,
  newCheckpointLegacyId,
  normalizeCheckpointText,
  syncTaskCheckpointProjection,
} from "./lib/task_checkpoints";
import { MAX_TASK_CHECKPOINTS } from "./lib/validators";

const canvasRootPageIdValidator = v.union(v.id("pages"), v.null());
const placementValidator = v.union(
  v.object({
    x: v.number(),
    y: v.number(),
    width: v.union(v.number(), v.null()),
    height: v.union(v.number(), v.null()),
  }),
  v.null(),
);
const checkpointValidator = v.object({
  _id: v.id("taskCheckpoints"),
  _creationTime: v.number(),
  taskPageId: v.id("pages"),
  legacyId: v.string(),
  text: v.string(),
  completed: v.boolean(),
  position: v.number(),
  ordinal: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  placement: placementValidator,
  canEdit: v.boolean(),
  canToggle: v.boolean(),
  canMove: v.boolean(),
  canDeleteDirectly: v.boolean(),
  canRequestDeletion: v.boolean(),
});

function clampCoordinate(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Pozicija checkpointa nije ispravna.");
  }
  return Math.min(Math.max(value, -100_000), 100_000);
}

function clampDimension(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} checkpointa nije ispravna.`);
  }
  return Math.min(Math.max(value, minimum), maximum);
}

async function requireTaskCheckpoint(
  ctx: MutationCtx,
  checkpointId: Id<"taskCheckpoints">,
) {
  const checkpoint = await ctx.db.get("taskCheckpoints", checkpointId);
  if (checkpoint === null) throw new Error("Checkpoint nije pronađen.");
  const page = await requireVisiblePage(ctx, checkpoint.taskPageId);
  if (
    page.kind !== "task" ||
    page.startupId !== checkpoint.startupId ||
    page.areaId !== checkpoint.areaId
  ) {
    throw new Error("Checkpoint više nije povezan sa dostupnim zadatkom.");
  }
  const { profile } = await requireStartupMember(ctx, page.startupId);
  return { checkpoint, page, profile };
}

function assertOwner(page: Doc<"pages">, profileId: Id<"profiles">) {
  if (page.createdByProfileId !== profileId) {
    throw new Error("Checkpoint menja samo autor zadatka.");
  }
}

export const listForTask = query({
  args: {
    taskPageId: v.id("pages"),
    canvasRootPageId: v.optional(canvasRootPageIdValidator),
  },
  returns: v.array(checkpointValidator),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.taskPageId);
    if (page.kind !== "task") throw new Error("Ova stranica nije zadatak.");
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (
      args.canvasRootPageId !== undefined &&
      args.canvasRootPageId !== page._id &&
      args.canvasRootPageId !== page.parentPageId
    ) {
      throw new Error("Checkpoint nije prikazan u ovom Canvas-u.");
    }
    const rows = await listActiveTaskCheckpoints(ctx, page._id);
    const placements =
      args.canvasRootPageId === undefined
        ? []
        : await ctx.db
            .query("taskCheckpointCanvasPlacements")
            .withIndex(
              "by_startupId_and_areaId_and_canvasRootPageId",
              (q) =>
                q
                  .eq("startupId", page.startupId)
                  .eq("areaId", page.areaId)
                  .eq("canvasRootPageId", args.canvasRootPageId!),
            )
            .take(MAX_TASK_CHECKPOINTS + 1);
    const placementsByCheckpoint = new Map(
      placements.map((placement) => [placement.checkpointId, placement]),
    );
    const canEdit = page.createdByProfileId === profile._id;
    const canToggle =
      canEdit || page.assigneeProfileId === profile._id;
    return rows.map((row, index) => {
      const placement = placementsByCheckpoint.get(row._id);
      return {
        _id: row._id,
        _creationTime: row._creationTime,
        taskPageId: row.taskPageId,
        legacyId: row.legacyId,
        text: row.text,
        completed: row.completed,
        position: row.position,
        ordinal: index + 1,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        placement: placement
          ? {
              x: placement.x,
              y: placement.y,
              width: placement.width ?? null,
              height: placement.height ?? null,
            }
          : null,
        canEdit,
        canToggle,
        canMove: canEdit,
        canDeleteDirectly: canEdit,
        canRequestDeletion: !canEdit,
      };
    });
  },
});

export const create = mutation({
  args: { taskPageId: v.id("pages"), text: v.string() },
  returns: v.id("taskCheckpoints"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.taskPageId);
    if (page.kind !== "task") throw new Error("Ova stranica nije zadatak.");
    const { profile } = await requireStartupMember(ctx, page.startupId);
    assertOwner(page, profile._id);
    const rows = await listActiveTaskCheckpoints(ctx, page._id);
    if (rows.length >= MAX_TASK_CHECKPOINTS) {
      throw new Error(
        `Zadatak može imati najviše ${MAX_TASK_CHECKPOINTS} checkpointa.`,
      );
    }
    const now = Date.now();
    const checkpointId = await ctx.db.insert("taskCheckpoints", {
      startupId: page.startupId,
      areaId: page.areaId,
      taskPageId: page._id,
      legacyId: newCheckpointLegacyId(profile._id, now),
      text: normalizeCheckpointText(args.text),
      completed: false,
      position: rows.length,
      createdByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await syncTaskCheckpointProjection(ctx, page._id, profile._id, now);
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: profile._id,
      action: "task_updated",
      targetType: "page",
      targetId: page._id,
      title: `Dodat je checkpoint u zadatak „${page.title}“`,
    });
    return checkpointId;
  },
});

export const updateText = mutation({
  args: { checkpointId: v.id("taskCheckpoints"), text: v.string() },
  returns: v.id("taskCheckpoints"),
  handler: async (ctx, args) => {
    const { checkpoint, page, profile } = await requireTaskCheckpoint(
      ctx,
      args.checkpointId,
    );
    if (checkpoint.archivedAt !== null) throw new Error("Checkpoint je obrisan.");
    assertOwner(page, profile._id);
    const text = normalizeCheckpointText(args.text);
    if (text === checkpoint.text) return checkpoint._id;
    const now = Date.now();
    await ctx.db.patch("taskCheckpoints", checkpoint._id, {
      text,
      updatedAt: now,
    });
    await syncTaskCheckpointProjection(ctx, page._id, profile._id, now);
    return checkpoint._id;
  },
});

export const setCompleted = mutation({
  args: {
    checkpointId: v.id("taskCheckpoints"),
    completed: v.boolean(),
  },
  returns: v.id("taskCheckpoints"),
  handler: async (ctx, args) => {
    const { checkpoint, page, profile } = await requireTaskCheckpoint(
      ctx,
      args.checkpointId,
    );
    if (checkpoint.archivedAt !== null) throw new Error("Checkpoint je obrisan.");
    if (
      page.createdByProfileId !== profile._id &&
      page.assigneeProfileId !== profile._id
    ) {
      throw new Error("Checkpoint završava autor ili osoba kojoj je zadatak dodeljen.");
    }
    if (checkpoint.completed === args.completed) return checkpoint._id;
    const now = Date.now();
    await ctx.db.patch("taskCheckpoints", checkpoint._id, {
      completed: args.completed,
      updatedAt: now,
    });
    await syncTaskCheckpointProjection(ctx, page._id, profile._id, now);
    return checkpoint._id;
  },
});

export const archiveOwn = mutation({
  args: { checkpointId: v.id("taskCheckpoints") },
  returns: v.object({
    checkpointId: v.id("taskCheckpoints"),
    undoUntil: v.number(),
  }),
  handler: async (ctx, args) => {
    const { checkpoint, page, profile } = await requireTaskCheckpoint(
      ctx,
      args.checkpointId,
    );
    if (checkpoint.archivedAt !== null) throw new Error("Checkpoint je već obrisan.");
    assertOwner(page, profile._id);
    const now = Date.now();
    await ctx.db.patch("taskCheckpoints", checkpoint._id, {
      archivedAt: now,
      updatedAt: now,
    });
    await syncTaskCheckpointProjection(ctx, page._id, profile._id, now);
    return { checkpointId: checkpoint._id, undoUntil: now + 8_000 };
  },
});

export const restoreOwn = mutation({
  args: { checkpointId: v.id("taskCheckpoints") },
  returns: v.id("taskCheckpoints"),
  handler: async (ctx, args) => {
    const { checkpoint, page, profile } = await requireTaskCheckpoint(
      ctx,
      args.checkpointId,
    );
    if (checkpoint.archivedAt === null) throw new Error("Checkpoint nije obrisan.");
    assertOwner(page, profile._id);
    if (Date.now() - checkpoint.archivedAt > 8_000) {
      throw new Error("Vreme za Undo je isteklo.");
    }
    const rows = await listActiveTaskCheckpoints(ctx, page._id);
    if (rows.length >= MAX_TASK_CHECKPOINTS) {
      throw new Error("Zadatak već ima maksimalan broj checkpointa.");
    }
    const now = Date.now();
    await ctx.db.patch("taskCheckpoints", checkpoint._id, {
      archivedAt: null,
      updatedAt: now,
    });
    await syncTaskCheckpointProjection(ctx, page._id, profile._id, now);
    return checkpoint._id;
  },
});

export const saveCanvasPlacement = mutation({
  args: {
    checkpointId: v.id("taskCheckpoints"),
    canvasRootPageId: canvasRootPageIdValidator,
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { checkpoint, page, profile } = await requireTaskCheckpoint(
      ctx,
      args.checkpointId,
    );
    if (checkpoint.archivedAt !== null) throw new Error("Checkpoint je obrisan.");
    assertOwner(page, profile._id);
    if (
      args.canvasRootPageId !== page._id &&
      args.canvasRootPageId !== page.parentPageId
    ) {
      throw new Error("Checkpoint nije prikazan u ovom Canvas-u.");
    }
    if ((args.width === undefined) !== (args.height === undefined)) {
      throw new Error("Širina i visina checkpointa moraju biti sačuvane zajedno.");
    }
    const now = Date.now();
    const dimensions =
      args.width === undefined || args.height === undefined
        ? {}
        : {
            width: clampDimension(args.width, 140, 520, "Širina"),
            height: clampDimension(args.height, 92, 600, "Visina"),
          };
    const value = {
      startupId: page.startupId,
      areaId: page.areaId,
      canvasRootPageId: args.canvasRootPageId,
      checkpointId: checkpoint._id,
      x: clampCoordinate(args.x),
      y: clampCoordinate(args.y),
      ...dimensions,
      updatedByProfileId: profile._id,
      updatedAt: now,
    };
    const existing = await ctx.db
      .query("taskCheckpointCanvasPlacements")
      .withIndex("by_checkpointId_and_canvasRootPageId", (q) =>
        q
          .eq("checkpointId", checkpoint._id)
          .eq("canvasRootPageId", args.canvasRootPageId),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("taskCheckpointCanvasPlacements", {
        ...value,
        createdAt: now,
      });
    } else {
      await ctx.db.patch(
        "taskCheckpointCanvasPlacements",
        existing._id,
        value,
      );
    }
    return null;
  },
});

export const resetCanvasSize = mutation({
  args: {
    checkpointId: v.id("taskCheckpoints"),
    canvasRootPageId: canvasRootPageIdValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { checkpoint, page, profile } = await requireTaskCheckpoint(
      ctx,
      args.checkpointId,
    );
    if (checkpoint.archivedAt !== null) throw new Error("Checkpoint je obrisan.");
    assertOwner(page, profile._id);
    if (
      args.canvasRootPageId !== page._id &&
      args.canvasRootPageId !== page.parentPageId
    ) {
      throw new Error("Checkpoint nije prikazan u ovom Canvas-u.");
    }
    const existing = await ctx.db
      .query("taskCheckpointCanvasPlacements")
      .withIndex("by_checkpointId_and_canvasRootPageId", (q) =>
        q
          .eq("checkpointId", checkpoint._id)
          .eq("canvasRootPageId", args.canvasRootPageId),
      )
      .unique();
    if (existing !== null) {
      await ctx.db.patch("taskCheckpointCanvasPlacements", existing._id, {
        width: undefined,
        height: undefined,
        updatedByProfileId: profile._id,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
