import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  DEFAULT_CANVAS_NODE_HEIGHT,
  DEFAULT_CANVAS_NODE_WIDTH,
  findAvailableCanvasPosition,
} from "./canvasPlacement";
import { recordActivity } from "./lib/activity";
import {
  requireProfileInStartup,
  requireStartupMember,
} from "./lib/auth";
import {
  contributionTargetKey,
  insertContribution,
} from "./lib/collaboration";
import {
  createNotification,
  notificationCopy,
  notifyTaskStakeholders,
} from "./lib/notifications";
import {
  cleanPageContent,
  cleanPagePosition,
  insertWorkspacePage,
  prepareWorkspacePage,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import {
  getActivePageDescendants,
  nextCompletedAt,
  pageSearchText,
  pageTaskSortAt,
} from "./lib/pages";
import {
  getProfileSummary,
  profileSummaryValidator as profileSummaryObjectValidator,
} from "./lib/profile_summary";
import {
  relationEndpoints,
  relationOtherEndpoint,
  relationTouchesPage,
} from "./lib/page_relations";
import {
  listActiveTaskAssigneeIds,
  normalizeAssigneeProfileIds,
  reconcileTaskAssignees,
  resolveTaskAssignees,
  syncTaskAssigneeMirrors,
} from "./lib/task_assignees";
import { reconcileLegacyTaskCheckpoints } from "./lib/task_checkpoints";
import {
  archiveCheckpointCanvasEdgesForArchivedPage,
  archiveCheckpointCanvasEdgesForMovedPage,
} from "./lib/task_checkpoint_canvas_edges";
import {
  checkpointItemValidator,
  cleanOptionalText,
  pageFileCategoryValidator,
  cleanRequiredText,
  normalizeTaskCheckpoints,
  normalizeTaskInstructions,
  pageKindValidator,
  taskCheckpointCanvasEndpointValidator,
  taskPriorityValidator,
  taskStatusValidator,
  validateTaskDueDate,
} from "./lib/validators";

const MAX_CANVAS_PAGES = 200;
const MAX_CANVAS_EDGES = 400;
const MAX_RELATIONS_PER_AREA = 400;
const MAX_RELATION_CANDIDATES = 100;
const MAX_TREE_DEPTH = 64;
const MAX_LABEL_LENGTH = 200;
const MAX_PREVIEW_LENGTH = 480;
const DEFAULT_WIDTH = DEFAULT_CANVAS_NODE_WIDTH;
const DEFAULT_HEIGHT = DEFAULT_CANVAS_NODE_HEIGHT;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 168;
const MAX_WIDTH = 720;
const MAX_HEIGHT = 1_000;
const MAX_AREA_BODY_LENGTH = 20_000;
const MAX_BATCH_LAYOUT_UPDATES = 100;
const MAX_NESTING_INBOX_ITEMS = 100;
const MAX_LEGACY_AREA_EDGE_ROWS = 1_000;

type ReadCtx = QueryCtx | MutationCtx;
type CanvasRoot = Id<"pages"> | null;

const rootPageIdValidator = v.union(v.id("pages"), v.null());
const nestingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("cancelled"),
);
const profileSummaryValidator = v.union(
  v.object({
    _id: v.id("profiles"),
    displayName: v.string(),
    avatarUrl: v.union(v.string(), v.null()),
  }),
  v.null(),
);
const canvasPageValidator = v.object({
  _id: v.id("pages"),
  title: v.string(),
  text: v.string(),
  kind: pageKindValidator,
  parentPageId: rootPageIdValidator,
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  dueDate: v.union(v.number(), v.null()),
  checkpointTotal: v.number(),
  checkpointCompleted: v.number(),
  /** Prvi izvršilac — zadržan radi kompatibilnosti prikaza jednog avatara. */
  assignee: profileSummaryValidator,
  assignees: v.array(profileSummaryObjectValidator),
  fileCount: v.number(),
  fileCategory: v.union(pageFileCategoryValidator, v.null()),
  filePreviewUrl: v.union(v.string(), v.null()),
  tableRowCount: v.number(),
  tableColumnCount: v.number(),
  updatedAt: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  canMove: v.boolean(),
  canResize: v.boolean(),
  canDetach: v.boolean(),
  creator: profileSummaryValidator,
});
const visibleEdgeValidator = v.object({
  _id: v.union(v.id("pageCanvasEdgesV2"), v.id("pageRelations")),
  source: v.id("pages"),
  target: v.id("pages"),
  label: v.union(v.string(), v.null()),
  kind: v.union(v.literal("canvas"), v.literal("relation")),
  canDelete: v.boolean(),
  canRequestDeletion: v.boolean(),
});
const visibleCheckpointEdgeValidator = v.object({
  _id: v.id("taskCheckpointCanvasEdges"),
  source: taskCheckpointCanvasEndpointValidator,
  target: taskCheckpointCanvasEndpointValidator,
  canDelete: v.boolean(),
  canRequestDeletion: v.boolean(),
});
const ghostValidator = v.object({
  requestId: v.id("pageNestingRequests"),
  pageId: v.id("pages"),
  title: v.string(),
  kind: pageKindValidator,
  sourceParentPageId: rootPageIdValidator,
  targetParentPageId: v.id("pages"),
  x: v.number(),
  y: v.number(),
  status: v.literal("pending"),
  requester: profileSummaryValidator,
  canApprove: v.boolean(),
  canReject: v.boolean(),
  canWithdraw: v.boolean(),
});
const scopeValidator = v.object({
  kind: v.union(v.literal("area"), v.literal("page")),
  startupId: v.id("startups"),
  areaId: v.id("startupAreas"),
  rootPageId: rootPageIdValidator,
  title: v.string(),
  pageKind: v.union(pageKindValidator, v.null()),
  briefing: v.object({
    content: v.string(),
    instructions: v.union(v.string(), v.null()),
    revision: v.number(),
    ownerProfileId: v.id("profiles"),
    canEdit: v.boolean(),
  }),
});
const viewportValidator = v.object({
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
  persisted: v.boolean(),
});
/** Oblik canvas payload-a — deljen između `getCanvas` i resolvera po jednom id-u. */
const canvasPayloadValidator = v.object({
  pages: v.array(canvasPageValidator),
  edges: v.array(visibleEdgeValidator),
  relations: v.array(visibleEdgeValidator),
  checkpointEdges: v.array(visibleCheckpointEdgeValidator),
  ghosts: v.array(ghostValidator),
  viewport: viewportValidator,
  truncated: v.boolean(),
  scope: scopeValidator,
});
const moveResultValidator = v.object({
  nestingStatus: v.union(v.literal("none"), v.literal("pending")),
  requestId: v.union(v.id("pageNestingRequests"), v.null()),
});
const relationPageValidator = v.object({
  pageId: v.id("pages"),
  title: v.string(),
  kind: pageKindValidator,
  parentPageId: rootPageIdValidator,
  areaId: v.id("startupAreas"),
});
const listedRelationValidator = v.object({
  _id: v.id("pageRelations"),
  label: v.union(v.string(), v.null()),
  linkedPage: relationPageValidator,
  canDelete: v.boolean(),
  canRequestDeletion: v.boolean(),
});
const nestingInboxItemValidator = v.object({
  requestId: v.id("pageNestingRequests"),
  child: v.object({
    pageId: v.id("pages"),
    title: v.string(),
    kind: pageKindValidator,
    parentPageId: rootPageIdValidator,
  }),
  targetParent: v.object({
    pageId: v.id("pages"),
    title: v.string(),
    kind: pageKindValidator,
  }),
  requester: profileSummaryValidator,
  createdAt: v.number(),
  canApprove: v.boolean(),
  canReject: v.boolean(),
  canWithdraw: v.boolean(),
});

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Vrednost kanvasa nije ispravna.");
  }
  return Math.min(Math.max(value, minimum), maximum);
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

function canvasPreview(title: string, content: string, instructions?: string) {
  return plainText(instructions || content || title).slice(0, MAX_PREVIEW_LENGTH);
}

function pairKey(nodeAId: Id<"pages">, nodeBId: Id<"pages">) {
  return [nodeAId, nodeBId].sort().join(":");
}

async function requireArea(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  areaId: Id<"startupAreas">,
) {
  const area = await ctx.db.get("startupAreas", areaId);
  if (area === null || area.startupId !== startupId) {
    throw new Error("Oblast nije pronađena u ovom startupu.");
  }
  return area;
}

async function requireStrictVisiblePage(
  ctx: ReadCtx,
  pageId: Id<"pages">,
  expected?: {
    startupId?: Id<"startups">;
    areaId?: Id<"startupAreas">;
  },
) {
  const page = await ctx.db.get("pages", pageId);
  if (page === null || page.archivedAt !== null) {
    throw new Error("Stranica nije pronađena.");
  }
  if (
    (expected?.startupId !== undefined &&
      page.startupId !== expected.startupId) ||
    (expected?.areaId !== undefined && page.areaId !== expected.areaId)
  ) {
    throw new Error("Stranica nije pronađena u traženoj oblasti.");
  }

  const seen = new Set<string>([page._id]);
  let parentPageId = page.parentPageId;
  for (let depth = 0; parentPageId !== null; depth += 1) {
    if (depth >= MAX_TREE_DEPTH) {
      throw new Error("Hijerarhija stranica je preduboka.");
    }
    if (seen.has(parentPageId)) {
      throw new Error("Hijerarhija stranica sadrži kružnu vezu.");
    }
    seen.add(parentPageId);
    const parent = await ctx.db.get("pages", parentPageId);
    if (
      parent === null ||
      parent.archivedAt !== null ||
      parent.startupId !== page.startupId ||
      parent.areaId !== page.areaId
    ) {
      throw new Error("Hijerarhija stranica nije ispravna.");
    }
    parentPageId = parent.parentPageId;
  }
  return page;
}

async function requireScope(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  areaId: Id<"startupAreas">,
  rootPageId: CanvasRoot,
) {
  const area = await requireArea(ctx, startupId, areaId);
  const root =
    rootPageId === null
      ? null
      : await requireStrictVisiblePage(ctx, rootPageId, {
          startupId,
          areaId,
        });
  return { area, root };
}

async function getPageBody(ctx: ReadCtx, pageId: Id<"pages">) {
  return await ctx.db
    .query("pageBodies")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
}

async function getPlacement(ctx: ReadCtx, pageId: Id<"pages">) {
  return await ctx.db
    .query("pageCanvasPlacements")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
}

async function getAvailableCanvasPosition(
  ctx: ReadCtx,
  args: {
    startupId: Id<"startups">;
    areaId: Id<"startupAreas">;
    rootPageId: CanvasRoot;
    excludePageId?: Id<"pages">;
    excludeRequestId?: Id<"pageNestingRequests">;
    width?: number;
    height?: number;
  },
) {
  const rootPageId = args.rootPageId;
  const [placements, pendingRequests] = await Promise.all([
    ctx.db
      .query("pageCanvasPlacements")
      .withIndex(
        "by_startupId_and_areaId_and_rootPageId",
        (q) =>
          q
            .eq("startupId", args.startupId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", rootPageId),
      )
      .take(MAX_CANVAS_PAGES + 1),
    rootPageId === null
      ? Promise.resolve([])
      : ctx.db
          .query("pageNestingRequests")
          .withIndex(
            "by_targetParentPageId_and_status_and_createdAt",
            (q) =>
              q
                .eq("targetParentPageId", rootPageId)
                .eq("status", "pending"),
          )
          .take(MAX_CANVAS_PAGES + 1),
  ]);
  if (
    placements.length > MAX_CANVAS_PAGES ||
    pendingRequests.length > MAX_CANVAS_PAGES
  ) {
    throw new Error("Kanvas ima previše stavki za automatski raspored.");
  }
  const pendingPlacements = await Promise.all(
    pendingRequests.map((request) => getPlacement(ctx, request.childPageId)),
  );

  return findAvailableCanvasPosition(
    [
      ...placements
        .filter((placement) => placement.pageId !== args.excludePageId)
        .map((placement) => ({
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        })),
      ...pendingRequests.flatMap((request, index) => {
        if (
          request._id === args.excludeRequestId ||
          request.startupId !== args.startupId ||
          request.areaId !== args.areaId ||
          request.proposedX === undefined ||
          request.proposedY === undefined
        ) {
          return [];
        }
        const placement = pendingPlacements[index];
        return [{
          x: request.proposedX,
          y: request.proposedY,
          width: placement?.width,
          height: placement?.height,
        }];
      }),
    ],
    { width: args.width, height: args.height },
  );
}

async function upsertPlacement(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    rootPageId: CanvasRoot;
    actorProfileId: Id<"profiles">;
    x: number;
    y: number;
    width?: number;
    height?: number;
    now: number;
  },
) {
  const existing = await getPlacement(ctx, args.page._id);
  const value = {
    startupId: args.page.startupId,
    areaId: args.page.areaId,
    rootPageId: args.rootPageId,
    pageId: args.page._id,
    x: clamp(args.x, -100_000, 100_000),
    y: clamp(args.y, -100_000, 100_000),
    ...(args.width === undefined ? {} : { width: args.width }),
    ...(args.height === undefined ? {} : { height: args.height }),
    updatedByProfileId: args.actorProfileId,
    updatedAt: args.now,
  };
  if (existing === null) {
    await ctx.db.insert("pageCanvasPlacements", {
      ...value,
      createdAt: args.now,
    });
  } else {
    await ctx.db.patch("pageCanvasPlacements", existing._id, value);
  }

  const legacy = await ctx.db
    .query("pageCanvasNodes")
    .withIndex("by_pageId", (q) => q.eq("pageId", args.page._id))
    .unique();
  const legacyValue = {
    startupId: args.page.startupId,
    areaId: args.page.areaId,
    pageId: args.page._id,
    x: value.x,
    y: value.y,
    ...(args.width === undefined ? {} : { width: args.width }),
    ...(args.height === undefined ? {} : { height: args.height }),
    updatedAt: args.now,
  };
  if (legacy === null) {
    await ctx.db.insert("pageCanvasNodes", legacyValue);
  } else {
    await ctx.db.patch("pageCanvasNodes", legacy._id, legacyValue);
  }
}

async function assertCanvasCapacity(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  areaId: Id<"startupAreas">,
  rootPageId: CanvasRoot,
  added = 1,
) {
  const pages = await ctx.db
    .query("pages")
    .withIndex(
      "by_startup_area_parent_active_position",
      (q) =>
        q
          .eq("startupId", startupId)
          .eq("areaId", areaId)
          .eq("parentPageId", rootPageId)
          .eq("archivedAt", null),
    )
    .take(MAX_CANVAS_PAGES + 1);
  const pending =
    rootPageId === null
      ? []
      : await ctx.db
          .query("pageNestingRequests")
          .withIndex(
            "by_targetParentPageId_and_status_and_createdAt",
            (q) =>
              q
                .eq("targetParentPageId", rootPageId)
                .eq("status", "pending"),
          )
          .take(MAX_CANVAS_PAGES + 1);
  if (pages.length + pending.length + added > MAX_CANVAS_PAGES) {
    throw new Error(
      `Jedan kanvas može imati najviše ${MAX_CANVAS_PAGES} direktnih kartica.`,
    );
  }
}

async function pendingForChild(ctx: ReadCtx, childPageId: Id<"pages">) {
  return await ctx.db
    .query("pageNestingRequests")
    .withIndex("by_childPageId_and_status_and_updatedAt", (q) =>
      q.eq("childPageId", childPageId).eq("status", "pending"),
    )
    .unique();
}

async function assertNoPageCycle(
  ctx: ReadCtx,
  childPageId: Id<"pages">,
  targetParentPageId: Id<"pages">,
) {
  const initialTarget = await ctx.db.get("pages", targetParentPageId);
  if (initialTarget === null || initialTarget.archivedAt !== null) {
    throw new Error("Roditeljska stranica više nije dostupna.");
  }
  let cursor: Id<"pages"> | null = targetParentPageId;
  const seen = new Set<string>();
  let chainDepth = 0;
  while (cursor !== null) {
    if (chainDepth >= MAX_TREE_DEPTH) {
      throw new Error("Hijerarhija stranica je preduboka.");
    }
    if (cursor === childPageId || seen.has(cursor)) {
      throw new Error("Ugnježđavanje bi napravilo kružnu hijerarhiju.");
    }
    seen.add(cursor);
    const pending = await pendingForChild(ctx, cursor);
    if (pending !== null) {
      if (
        pending.startupId !== initialTarget.startupId ||
        pending.areaId !== initialTarget.areaId
      ) {
        throw new Error("Zahtev za ugnježđavanje ima neispravan opseg.");
      }
      cursor = pending.targetParentPageId;
      chainDepth += 1;
      continue;
    }
    const page: Doc<"pages"> | null = await ctx.db.get("pages", cursor);
    if (
      page === null ||
      page.archivedAt !== null ||
      page.startupId !== initialTarget.startupId ||
      page.areaId !== initialTarget.areaId
    ) {
      throw new Error("Roditeljska stranica više nije dostupna.");
    }
    cursor = page.parentPageId;
    chainDepth += 1;
  }
  return chainDepth;
}

async function assertReparentDepth(
  ctx: ReadCtx,
  childPageId: Id<"pages">,
  targetParentPageId: Id<"pages">,
) {
  const root = await ctx.db.get("pages", childPageId);
  if (root === null || root.archivedAt !== null) {
    throw new Error("Stranica nije dostupna za premeštanje.");
  }
  const targetChainDepth = await assertNoPageCycle(
    ctx,
    childPageId,
    targetParentPageId,
  );
  const queue: Array<{ pageId: Id<"pages">; depth: number }> = [
    { pageId: childPageId, depth: 0 },
  ];
  const seen = new Set<string>([childPageId]);
  let descendantCount = 0;
  let maximumDescendantDepth = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const children = await ctx.db
      .query("pages")
      .withIndex("by_parentPageId_and_archivedAt", (q) =>
        q.eq("parentPageId", current.pageId).eq("archivedAt", null),
      )
      .take(251);
    descendantCount += children.length;
    if (descendantCount > 250) {
      throw new Error("Grana ima više od 250 aktivnih stranica.");
    }
    for (const child of children) {
      if (
        child.startupId !== root.startupId ||
        child.areaId !== root.areaId
      ) {
        throw new Error("Grana sadrži stranicu iz neispravnog opsega.");
      }
      if (seen.has(child._id)) {
        throw new Error("Hijerarhija stranica sadrži kružnu vezu.");
      }
      seen.add(child._id);
      const depth = current.depth + 1;
      maximumDescendantDepth = Math.max(maximumDescendantDepth, depth);
      queue.push({ pageId: child._id, depth });
    }
  }
  if (
    targetChainDepth + maximumDescendantDepth >
    MAX_TREE_DEPTH
  ) {
    throw new Error("Premeštanje bi napravilo preduboku hijerarhiju.");
  }
}

async function listActiveLegacyAreaEdges(
  ctx: ReadCtx,
  areaId: Id<"startupAreas">,
) {
  const rows = await ctx.db
    .query("pageEdges")
    .withIndex("by_areaId", (q) => q.eq("areaId", areaId))
    .take(MAX_LEGACY_AREA_EDGE_ROWS + 1);
  if (rows.length > MAX_LEGACY_AREA_EDGE_ROWS) {
    throw new Error(
      "Oblast ima previše rollback veza za jednu atomsku radnju.",
    );
  }
  return rows.filter((edge) => edge.archivedAt == null);
}

async function upsertActiveLegacyRootEdgeProjection(
  ctx: MutationCtx,
  edge: Doc<"pageCanvasEdgesV2">,
  now: number,
) {
  if (edge.rootPageId !== null) return;
  const legacy = await ctx.db
    .query("pageEdges")
    .withIndex("by_areaId_and_pairKey", (q) =>
      q.eq("areaId", edge.areaId).eq("pairKey", edge.pairKey),
    )
    .unique();
  const value = {
    startupId: edge.startupId,
    areaId: edge.areaId,
    nodeAId: edge.nodeAId,
    nodeBId: edge.nodeBId,
    pairKey: edge.pairKey,
    label: edge.label,
    ...(edge.authorProfileId === undefined
      ? {}
      : { authorProfileId: edge.authorProfileId }),
    archivedAt: null,
    updatedAt: now,
  };
  if (legacy === null) {
    await ctx.db.insert("pageEdges", {
      ...value,
      createdAt: edge.createdAt,
    });
    return;
  }
  if (legacy.startupId !== edge.startupId) {
    throw new Error("Postojeća veza ne pripada ovom startupu.");
  }
  await ctx.db.patch("pageEdges", legacy._id, value);
}

export async function archiveCanvasEdgeWithLegacyProjection(
  ctx: MutationCtx,
  edge: Doc<"pageCanvasEdgesV2">,
  now: number,
) {
  await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
    archivedAt: now,
    updatedAt: now,
  });
  if (edge.rootPageId !== null) return;
  const legacy = await ctx.db
    .query("pageEdges")
    .withIndex("by_areaId_and_pairKey", (q) =>
      q.eq("areaId", edge.areaId).eq("pairKey", edge.pairKey),
    )
    .unique();
  if (legacy === null) return;
  if (legacy.startupId !== edge.startupId) {
    throw new Error("Postojeća veza ne pripada ovom startupu.");
  }
  await ctx.db.patch("pageEdges", legacy._id, {
    archivedAt: now,
    updatedAt: now,
  });
}

async function archiveEdgesForMovedPage(
  ctx: MutationCtx,
  page: Doc<"pages">,
  sourceRootPageId: CanvasRoot,
  now: number,
) {
  await archiveCheckpointCanvasEdgesForMovedPage(
    ctx,
    page._id,
    sourceRootPageId,
    now,
  );
  const batches = await Promise.all([
    ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_nodeAId_and_archivedAt", (q) =>
        q.eq("nodeAId", page._id).eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1),
    ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_nodeBId_and_archivedAt", (q) =>
        q.eq("nodeBId", page._id).eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1),
  ]);
  const edges = new Map(
    batches
      .flat()
      .filter(
        (edge) =>
          edge.startupId === page.startupId &&
          edge.areaId === page.areaId &&
          edge.rootPageId === sourceRootPageId,
      )
      .map((edge) => [edge._id, edge]),
  );
  if (edges.size > MAX_CANVAS_EDGES) {
    throw new Error("Kartica ima previše veza za jedno atomsko pomeranje.");
  }
  for (const edge of edges.values()) {
    await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
  const legacyEdges = await listActiveLegacyAreaEdges(ctx, page.areaId);
  for (const edge of legacyEdges) {
    if (edge.nodeAId !== page._id && edge.nodeBId !== page._id) continue;
    await ctx.db.patch("pageEdges", edge._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
}

async function applySameAreaReparent(
  ctx: MutationCtx,
  args: {
    child: Doc<"pages">;
    targetParentPageId: CanvasRoot;
    actorProfileId: Id<"profiles">;
    position?: number;
    x?: number;
    y?: number;
    now: number;
    excludeRequestId?: Id<"pageNestingRequests">;
  },
) {
  await archiveEdgesForMovedPage(
    ctx,
    args.child,
    args.child.parentPageId,
    args.now,
  );
  const placement = await getPlacement(ctx, args.child._id);
  const targetPosition =
    args.x !== undefined && args.y !== undefined
      ? { x: args.x, y: args.y }
      : await getAvailableCanvasPosition(ctx, {
          startupId: args.child.startupId,
          areaId: args.child.areaId,
          rootPageId: args.targetParentPageId,
          excludePageId: args.child._id,
          excludeRequestId: args.excludeRequestId,
          width: placement?.width,
          height: placement?.height,
        });
  await ctx.db.patch("pages", args.child._id, {
    parentPageId: args.targetParentPageId,
    position: cleanPagePosition(args.position, args.now),
    treeRevision: (args.child.treeRevision ?? 0) + 1,
    updatedByProfileId: args.actorProfileId,
    updatedAt: args.now,
  });
  const patchedChild = {
    ...args.child,
    parentPageId: args.targetParentPageId,
  };
  await upsertPlacement(ctx, {
    page: patchedChild,
    rootPageId: args.targetParentPageId,
    actorProfileId: args.actorProfileId,
    x: targetPosition.x,
    y: targetPosition.y,
    width: placement?.width,
    height: placement?.height,
    now: args.now,
  });

  const pending = await pendingForChild(ctx, args.child._id);
  if (
    pending !== null &&
    pending._id !== args.excludeRequestId
  ) {
    await ctx.db.patch("pageNestingRequests", pending._id, {
      status: "cancelled",
      resolvedAt: args.now,
      updatedAt: args.now,
    });
  }
}

async function getPageBodyContributions(
  ctx: ReadCtx,
  pageId: Id<"pages">,
  bodyId: Id<"pageBodies"> | null,
) {
  const sourceIds = bodyId === null ? [pageId] : [pageId, bodyId];
  const batches = await Promise.all(
    sourceIds.map((sourceId) =>
      ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_body").eq("sourceId", sourceId),
        )
        .take(2),
    ),
  );
  return Array.from(
    new Map(
      batches
        .flat()
        .filter(
          (row) =>
            row.targetKind === "page" &&
            row.targetId === pageId &&
            row.archivedAt === null,
        )
        .map((row) => [row._id, row]),
    ).values(),
  );
}

function cleanCanvasLabel(value: string | undefined) {
  const cleaned = cleanOptionalText(value, "Naziv veze", MAX_LABEL_LENGTH);
  return cleaned && cleaned.length > 0 ? cleaned : null;
}

function assertOwnedPage(
  page: Doc<"pages">,
  actorProfileId: Id<"profiles">,
  message = "Možete menjati samo svoju stranicu.",
) {
  if (page.createdByProfileId !== actorProfileId) {
    throw new Error(message);
  }
}

function assertDirectCanvasPage(
  page: Doc<"pages">,
  rootPageId: CanvasRoot,
) {
  if (page.parentPageId !== rootPageId) {
    throw new Error("Kartica ne pripada ovom kanvasu.");
  }
}

async function createPendingNestingRequest(
  ctx: MutationCtx,
  args: {
    child: Doc<"pages">;
    targetParent: Doc<"pages">;
    requesterProfileId: Id<"profiles">;
    position?: number;
    x?: number;
    y?: number;
    now: number;
  },
) {
  if (await pendingForChild(ctx, args.child._id)) {
    throw new Error("Ova stranica već ima zahtev za ugnježđavanje na čekanju.");
  }
  await assertReparentDepth(ctx, args.child._id, args.targetParent._id);
  await assertCanvasCapacity(
    ctx,
    args.child.startupId,
    args.targetParent.areaId,
    args.targetParent._id,
  );
  const placement = await getPlacement(ctx, args.child._id);
  const proposedPosition =
    args.x !== undefined && args.y !== undefined
      ? { x: args.x, y: args.y }
      : await getAvailableCanvasPosition(ctx, {
          startupId: args.child.startupId,
          areaId: args.targetParent.areaId,
          rootPageId: args.targetParent._id,
          width: placement?.width,
          height: placement?.height,
        });
  const requestId = await ctx.db.insert("pageNestingRequests", {
    startupId: args.child.startupId,
    areaId: args.child.areaId,
    childPageId: args.child._id,
    sourceParentPageId: args.child.parentPageId,
    targetParentPageId: args.targetParent._id,
    requesterProfileId: args.requesterProfileId,
    parentAuthorProfileId: args.targetParent.createdByProfileId,
    expectedTreeRevision: args.child.treeRevision ?? 0,
    ...(args.position === undefined
      ? {}
      : { proposedPosition: cleanPagePosition(args.position, args.now) }),
    proposedX: clamp(proposedPosition.x, -100_000, 100_000),
    proposedY: clamp(proposedPosition.y, -100_000, 100_000),
    status: "pending",
    createdAt: args.now,
    updatedAt: args.now,
    resolvedAt: null,
  });
  await recordActivity(ctx, {
    startupId: args.child.startupId,
    actorProfileId: args.requesterProfileId,
    action: "nesting_requested",
    targetType: "request",
    targetId: requestId,
    title: `Zatraženo je ugnježđavanje stranice „${args.child.title}”`,
  });
  const requester = await ctx.db.get("profiles", args.requesterProfileId);
  const nestingCopy = notificationCopy.nestingVoteRequested(
    args.child.title,
    args.targetParent.title,
    requester?.displayName ?? "Član tima",
  );
  await createNotification(ctx, {
    recipientProfileId: args.targetParent.createdByProfileId,
    startupId: args.child.startupId,
    type: "vote_requested",
    title: nestingCopy.title,
    body: nestingCopy.body,
    targetType: "approvals",
    targetId: requestId,
    actorProfileId: args.requesterProfileId,
  });
  return requestId;
}

/** Podnosilac zahteva za ugnježđavanje saznaje ishod, bez obzira na smer. */
async function notifyNestingResolution(
  ctx: MutationCtx,
  args: {
    request: Doc<"pageNestingRequests">;
    childTitle: string;
    approved: boolean;
    actorProfileId: Id<"profiles">;
    actorName: string;
  },
) {
  const copy = notificationCopy.requestResolved(
    args.childTitle,
    args.approved,
    args.actorName,
  );
  await createNotification(ctx, {
    recipientProfileId: args.request.requesterProfileId,
    startupId: args.request.startupId,
    type: "request_resolved",
    title: copy.title,
    body: copy.body,
    targetType: "approvals",
    targetId: args.request._id,
    actorProfileId: args.actorProfileId,
  });
}

async function cancelPendingRequestsForChild(
  ctx: MutationCtx,
  childPageId: Id<"pages">,
  now: number,
  excludeRequestId?: Id<"pageNestingRequests">,
) {
  const pending = await pendingForChild(ctx, childPageId);
  if (pending !== null && pending._id !== excludeRequestId) {
    await ctx.db.patch("pageNestingRequests", pending._id, {
      status: "cancelled",
      resolvedAt: now,
      updatedAt: now,
    });
  }
}

// Stranica može biti na bilo kojoj strani relacije, pa se čitaju oba para
// indeksa — stari (note/task) i novi (A/B) — i rezultat se dedupira.
async function listActiveRelationsTouchingPage(
  ctx: MutationCtx,
  pageId: Id<"pages">,
): Promise<Doc<"pageRelations">[]> {
  const [asNote, asTask, asA, asB] = await Promise.all([
    ctx.db
      .query("pageRelations")
      .withIndex("by_notePageId_and_archivedAt", (q) =>
        q.eq("notePageId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
    ctx.db
      .query("pageRelations")
      .withIndex("by_taskPageId_and_archivedAt", (q) =>
        q.eq("taskPageId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
    ctx.db
      .query("pageRelations")
      .withIndex("by_pageAId_and_archivedAt", (q) =>
        q.eq("pageAId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
    ctx.db
      .query("pageRelations")
      .withIndex("by_pageBId_and_archivedAt", (q) =>
        q.eq("pageBId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
  ]);
  const rows = new Map(
    [...asNote, ...asTask, ...asA, ...asB].map((relation) => [
      relation._id,
      relation,
    ]),
  );
  if (rows.size > MAX_RELATIONS_PER_AREA) {
    throw new Error("Stranica ima previše relacija za jednu atomsku radnju.");
  }
  return Array.from(rows.values());
}

async function archiveRelationsForPage(
  ctx: MutationCtx,
  pageId: Id<"pages">,
  now: number,
) {
  const rows = await listActiveRelationsTouchingPage(ctx, pageId);
  for (const relation of rows) {
    await ctx.db.patch("pageRelations", relation._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
}

async function archiveAllCanvasEdgesForPage(
  ctx: MutationCtx,
  pageId: Id<"pages">,
  now: number,
) {
  const [asA, asB] = await Promise.all([
    ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_nodeAId_and_archivedAt", (q) =>
        q.eq("nodeAId", pageId).eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1),
    ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_nodeBId_and_archivedAt", (q) =>
        q.eq("nodeBId", pageId).eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1),
  ]);
  const rows = new Map([...asA, ...asB].map((edge) => [edge._id, edge]));
  if (rows.size > MAX_CANVAS_EDGES) {
    throw new Error("Stranica ima previše veza za jednu atomsku radnju.");
  }
  for (const edge of rows.values()) {
    await archiveCanvasEdgeWithLegacyProjection(ctx, edge, now);
  }
}

async function recoverForeignPageContributions(
  ctx: MutationCtx,
  page: Doc<"pages">,
  now: number,
) {
  const contributions = await ctx.db
    .query("contentContributions")
    .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
      q
        .eq("targetKey", contributionTargetKey("page", page._id))
        .eq("archivedAt", null),
    )
    .take(201);
  if (contributions.length > 200) {
    throw new Error("Stranica ima previše doprinosa za jedno atomsko arhiviranje.");
  }
  const recoveries = new Map<Id<"profiles">, Id<"recoveredContent">>();
  for (const contribution of contributions) {
    const authorProfileId = contribution.authorProfileId;
    if (
      contribution.attribution === "author" &&
      authorProfileId !== undefined &&
      authorProfileId !== page.createdByProfileId
    ) {
      let recoveredId = recoveries.get(authorProfileId);
      if (recoveredId === undefined) {
        recoveredId = await ctx.db.insert("recoveredContent", {
          startupId: page.startupId,
          title: `Sačuvan sadržaj iz „${page.title}”`,
          sourceKind: "page",
          sourceTargetId: page._id,
          createdByProfileId: authorProfileId,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        recoveries.set(authorProfileId, recoveredId);
      }
      await ctx.db.patch("contentContributions", contribution._id, {
        targetKind: "recovered",
        targetKey: contributionTargetKey("recovered", recoveredId),
        targetId: recoveredId,
        updatedAt: now,
      });
      continue;
    }
    await ctx.db.patch("contentContributions", contribution._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
  for (const [authorProfileId, recoveredId] of recoveries) {
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: authorProfileId,
      action: "content_recovered",
      targetType: "recovered",
      targetId: recoveredId,
      title: `Sačuvan je doprinos iz stranice „${page.title}”`,
    });
  }
}

export async function moveWithinArea(
  ctx: MutationCtx,
  args: {
    child: Doc<"pages">;
    targetParent: Doc<"pages"> | null;
    actorProfileId: Id<"profiles">;
    position?: number;
    x?: number;
    y?: number;
    now: number;
  },
) {
  const targetParentPageId = args.targetParent?._id ?? null;
  if (args.child.parentPageId === targetParentPageId) {
    const pending = await pendingForChild(ctx, args.child._id);
    if (pending !== null) {
      await ctx.db.patch("pageNestingRequests", pending._id, {
        status: "withdrawn",
        resolvedAt: args.now,
        updatedAt: args.now,
      });
    }
    return {
      nestingStatus: "none" as const,
      requestId: null,
    };
  }
  if (
    args.targetParent !== null &&
    args.targetParent.createdByProfileId !== args.actorProfileId
  ) {
    const pending = await pendingForChild(ctx, args.child._id);
    if (
      pending !== null &&
      pending.targetParentPageId === args.targetParent._id &&
      pending.requesterProfileId === args.actorProfileId
    ) {
      return {
        nestingStatus: "pending" as const,
        requestId: pending._id,
      };
    }
    if (pending !== null) {
      throw new Error("Ova stranica već ima drugi zahtev na čekanju.");
    }
    const requestId = await createPendingNestingRequest(ctx, {
      child: args.child,
      targetParent: args.targetParent,
      requesterProfileId: args.actorProfileId,
      position: args.position,
      x: args.x,
      y: args.y,
      now: args.now,
    });
    return {
      nestingStatus: "pending" as const,
      requestId,
    };
  }
  if (args.targetParent !== null) {
    await assertReparentDepth(ctx, args.child._id, args.targetParent._id);
  }
  await assertCanvasCapacity(
    ctx,
    args.child.startupId,
    args.child.areaId,
    targetParentPageId,
  );
  await applySameAreaReparent(ctx, {
    child: args.child,
    targetParentPageId,
    actorProfileId: args.actorProfileId,
    position: args.position,
    x: args.x,
    y: args.y,
    now: args.now,
  });
  return {
    nestingStatus: "none" as const,
    requestId: null,
  };
}

export async function archivePageWithV2Sidecars(
  ctx: MutationCtx,
  page: Doc<"pages">,
  actorProfileId: Id<"profiles">,
  now = Date.now(),
) {
  await archiveCheckpointCanvasEdgesForArchivedPage(ctx, page, now);
  const children = await ctx.db
    .query("pages")
    .withIndex("by_parentPageId_and_archivedAt", (q) =>
      q.eq("parentPageId", page._id).eq("archivedAt", null),
    )
    .take(MAX_CANVAS_PAGES + 1);
  if (children.length > MAX_CANVAS_PAGES) {
    throw new Error(
      `Stranica ima više od ${MAX_CANVAS_PAGES} direktnih stavki.`,
    );
  }
  await assertCanvasCapacity(
    ctx,
    page.startupId,
    page.areaId,
    page.parentPageId,
    Math.max(0, children.length - 1),
  );
  const innerEdges = await ctx.db
    .query("pageCanvasEdgesV2")
    .withIndex("by_scope_active_pair", (q) =>
      q
        .eq("startupId", page.startupId)
        .eq("areaId", page.areaId)
        .eq("rootPageId", page._id)
        .eq("archivedAt", null),
    )
    .take(MAX_CANVAS_EDGES + 1);
  if (innerEdges.length > MAX_CANVAS_EDGES) {
    throw new Error("Ugnježđeni kanvas ima previše veza za arhiviranje.");
  }
  const destinationEdges = await ctx.db
    .query("pageCanvasEdgesV2")
    .withIndex("by_scope_active_pair", (q) =>
      q
        .eq("startupId", page.startupId)
        .eq("areaId", page.areaId)
        .eq("rootPageId", page.parentPageId)
        .eq("archivedAt", null),
    )
    .take(MAX_CANVAS_EDGES + 1);
  if (destinationEdges.length > MAX_CANVAS_EDGES) {
    throw new Error("Odredišni kanvas već ima previše aktivnih veza.");
  }
  const retainedDestinationEdges = destinationEdges.filter(
    (edge) => edge.nodeAId !== page._id && edge.nodeBId !== page._id,
  );
  const occupiedDestinationKeys = new Set(
    retainedDestinationEdges.map((edge) => edge.pairKey),
  );
  const childIds = new Set(children.map((child) => child._id));
  const childrenById = new Map(children.map((child) => [child._id, child]));
  const innerEdgeDecisions = new Map<
    Id<"pageCanvasEdgesV2">,
    "move" | "archive"
  >();
  let addedDestinationEdges = 0;
  for (const edge of innerEdges) {
    if (
      !childIds.has(edge.nodeAId) ||
      !childIds.has(edge.nodeBId) ||
      childrenById.get(edge.nodeAId)?.kind !==
        childrenById.get(edge.nodeBId)?.kind ||
      occupiedDestinationKeys.has(edge.pairKey)
    ) {
      innerEdgeDecisions.set(edge._id, "archive");
      continue;
    }
    occupiedDestinationKeys.add(edge.pairKey);
    addedDestinationEdges += 1;
    innerEdgeDecisions.set(edge._id, "move");
  }
  if (
    retainedDestinationEdges.length + addedDestinationEdges >
    MAX_CANVAS_EDGES
  ) {
    throw new Error(
      `Odredišni kanvas može imati najviše ${MAX_CANVAS_EDGES} veza.`,
    );
  }
  const [archivedPlacement, rootedViewports] = await Promise.all([
    getPlacement(ctx, page._id),
    ctx.db
      .query("pageCanvasViewports")
      .withIndex("by_rootPageId", (q) => q.eq("rootPageId", page._id))
      .take(MAX_CANVAS_PAGES + 1),
  ]);
  if (rootedViewports.length > MAX_CANVAS_PAGES) {
    throw new Error("Stranica ima previše viewport zapisa za arhiviranje.");
  }
  await recoverForeignPageContributions(ctx, page, now);
  await archiveAllCanvasEdgesForPage(ctx, page._id, now);
  await archiveRelationsForPage(ctx, page._id, now);
  for (const edge of innerEdges) {
    if (innerEdgeDecisions.get(edge._id) === "move") {
      await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
        rootPageId: page.parentPageId,
        updatedAt: now,
      });
      await upsertActiveLegacyRootEdgeProjection(
        ctx,
        { ...edge, rootPageId: page.parentPageId, updatedAt: now },
        now,
      );
    } else {
      await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
        archivedAt: now,
        updatedAt: now,
      });
    }
  }
  for (const child of children) {
    const placement = await getPlacement(ctx, child._id);
    const targetPosition = await getAvailableCanvasPosition(ctx, {
      startupId: child.startupId,
      areaId: child.areaId,
      rootPageId: page.parentPageId,
      excludePageId: child._id,
      width: placement?.width,
      height: placement?.height,
    });
    await ctx.db.patch("pages", child._id, {
      parentPageId: page.parentPageId,
      treeRevision: (child.treeRevision ?? 0) + 1,
      updatedByProfileId: actorProfileId,
      updatedAt: now,
    });
    await upsertPlacement(ctx, {
      page: { ...child, parentPageId: page.parentPageId },
      rootPageId: page.parentPageId,
      actorProfileId,
      x: targetPosition.x,
      y: targetPosition.y,
      width: placement?.width,
      height: placement?.height,
      now,
    });
    await cancelPendingRequestsForChild(ctx, child._id, now);
  }
  if (archivedPlacement !== null) {
    await ctx.db.delete("pageCanvasPlacements", archivedPlacement._id);
  }
  for (const viewport of rootedViewports) {
    await ctx.db.delete("pageCanvasViewports", viewport._id);
  }
  await cancelPendingRequestsForChild(ctx, page._id, now);
  const targetRequests = await ctx.db
    .query("pageNestingRequests")
    .withIndex(
      "by_targetParentPageId_and_status_and_createdAt",
      (q) => q.eq("targetParentPageId", page._id).eq("status", "pending"),
    )
    .take(MAX_CANVAS_PAGES + 1);
  if (targetRequests.length > MAX_CANVAS_PAGES) {
    throw new Error("Stranica ima previše zahteva za jedno arhiviranje.");
  }
  for (const request of targetRequests) {
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "cancelled",
      resolvedAt: now,
      updatedAt: now,
    });
  }
  await ctx.db.patch("pages", page._id, {
    archivedAt: now,
    treeRevision: (page.treeRevision ?? 0) + 1,
    updatedByProfileId: actorProfileId,
    updatedAt: now,
  });
  await recordActivity(ctx, {
    startupId: page.startupId,
    actorProfileId,
    action: "page_archived",
    targetType: "page",
    targetId: page._id,
    title: `„${page.title}” je arhiviran/a`,
  });
}

export const resolveRoute = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.optional(v.string()),
    pageId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      kind: v.literal("area"),
      areaId: v.id("startupAreas"),
    }),
    v.object({
      kind: v.literal("page"),
      pageId: v.id("pages"),
      areaId: v.id("startupAreas"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    if (args.pageId !== undefined) {
      const pageId = ctx.db.normalizeId("pages", args.pageId);
      if (pageId !== null) {
        const rawPage = await ctx.db.get("pages", pageId);
        try {
          const page = await requireStrictVisiblePage(ctx, pageId, {
            startupId: args.startupId,
          });
          return { kind: "page" as const, pageId: page._id, areaId: page.areaId };
        } catch {
          if (rawPage !== null && rawPage.startupId === args.startupId) {
            const fallbackArea = await ctx.db.get(
              "startupAreas",
              rawPage.areaId,
            );
            if (
              fallbackArea !== null &&
              fallbackArea.startupId === args.startupId
            ) {
              return {
                kind: "area" as const,
                areaId: fallbackArea._id,
              };
            }
          }
        }
      }
    }
    if (args.areaId !== undefined) {
      const areaId = ctx.db.normalizeId("startupAreas", args.areaId);
      if (areaId !== null) {
        const area = await ctx.db.get("startupAreas", areaId);
        if (area !== null && area.startupId === args.startupId) {
          return { kind: "area" as const, areaId: area._id };
        }
      }
    }
    return null;
  },
});

export const getCanvas = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
  },
  returns: canvasPayloadValidator,
  handler: async (ctx, args) => {
    const { profile, startup } = await requireStartupMember(ctx, args.startupId);
    const { area, root } = await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    return await assembleCanvas(ctx, {
      startupId: args.startupId,
      areaId: args.areaId,
      rootPageId: args.rootPageId,
      profile,
      startup,
      area,
      root,
    });
  },
});

type CanvasMember = Awaited<ReturnType<typeof requireStartupMember>>;
type CanvasScope = Awaited<ReturnType<typeof requireScope>>;

/**
 * Sklapa canvas payload (stranice, ivice, relacije, checkpoint-ivice, ghosts,
 * viewport, scope) iz već razrešenog scope-a. Izdvojeno iz `getCanvas` da ga dele i
 * resolveri po jednom id-u (`getAreaCanvasByArea`/`getPageCanvasByPage`) — oni sami
 * urade `requireStartupMember` + `requireScope`, pa pozovu ovo. Lokalni `args` čuva
 * isti oblik kao ranije da telo (ispod) ostane nepromenjeno.
 */
async function assembleCanvas(
  ctx: ReadCtx,
  params: {
    startupId: Id<"startups">;
    areaId: Id<"startupAreas">;
    rootPageId: CanvasRoot;
    profile: CanvasMember["profile"];
    startup: CanvasMember["startup"];
    area: CanvasScope["area"];
    root: CanvasScope["root"];
  },
) {
  const { profile, startup, area, root } = params;
  const args = {
    startupId: params.startupId,
    areaId: params.areaId,
    rootPageId: params.rootPageId,
  };
  const rawPages = await ctx.db
      .query("pages")
      .withIndex(
        "by_startup_area_parent_active_position",
        (q) =>
          q
            .eq("startupId", args.startupId)
            .eq("areaId", args.areaId)
            .eq("parentPageId", args.rootPageId)
            .eq("archivedAt", null),
      )
      .order("desc")
      .take(MAX_CANVAS_PAGES + 1);
    const pages = rawPages.slice(0, MAX_CANVAS_PAGES);
    const visibleIds = new Set(pages.map((page) => page._id));
    const [
      placements,
      rawEdges,
      rawRelations,
      rawCheckpointEdges,
      viewport,
      areaBody,
      rootBody,
    ] = await Promise.all([
        ctx.db
          .query("pageCanvasPlacements")
          .withIndex(
            "by_startupId_and_areaId_and_rootPageId",
            (q) =>
              q
                .eq("startupId", args.startupId)
                .eq("areaId", args.areaId)
                .eq("rootPageId", args.rootPageId),
          )
          .take(MAX_CANVAS_PAGES + 1),
        ctx.db
          .query("pageCanvasEdgesV2")
          .withIndex(
            "by_scope_active_pair",
            (q) =>
              q
                .eq("startupId", args.startupId)
                .eq("areaId", args.areaId)
                .eq("rootPageId", args.rootPageId)
                .eq("archivedAt", null),
          )
          .take(MAX_CANVAS_EDGES + 1),
        ctx.db
          .query("pageRelations")
          .withIndex("by_startup_area_active_created", (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("areaId", args.areaId)
              .eq("archivedAt", null),
          )
          .take(MAX_RELATIONS_PER_AREA + 1),
        ctx.db
          .query("taskCheckpointCanvasEdges")
          .withIndex("by_scope_active_pair", (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("areaId", args.areaId)
              .eq("rootPageId", args.rootPageId)
              .eq("archivedAt", null),
          )
          .take(MAX_CANVAS_EDGES + 1),
        ctx.db
          .query("pageCanvasViewports")
          .withIndex(
            "by_viewerProfileId_and_startupId_and_areaId_and_rootPageId",
            (q) =>
              q
                .eq("viewerProfileId", profile._id)
                .eq("startupId", args.startupId)
                .eq("areaId", args.areaId)
                .eq("rootPageId", args.rootPageId),
          )
          .unique(),
        root === null
          ? ctx.db
              .query("areaBodies")
              .withIndex("by_areaId", (q) => q.eq("areaId", area._id))
              .unique()
          : Promise.resolve(null),
        root === null ? Promise.resolve(null) : getPageBody(ctx, root._id),
      ]);
    const placementsByPageId = new Map(
      placements.map((placement) => [placement.pageId, placement]),
    );
    const columnCount = Math.max(1, Math.ceil(Math.sqrt(pages.length)));
    // Tim je mali, a ista lica se ponavljaju na desetinama kartica — bez keša
    // bi jedan kanvas povukao stotine istih profila i potpisa avatara.
    const profileSummaries = new Map<
      Id<"profiles">,
      Awaited<ReturnType<typeof getProfileSummary>>
    >();
    const loadProfileSummary = async (profileId: Id<"profiles">) => {
      const cached = profileSummaries.get(profileId);
      if (cached !== undefined) return cached;
      const summary = await getProfileSummary(ctx, profileId);
      profileSummaries.set(profileId, summary);
      return summary;
    };
    const canvasPages = [];
    for (const [index, page] of pages.entries()) {
      {
        const placement = placementsByPageId.get(page._id);
        const assigneeEntries = await resolveTaskAssignees(ctx, page);
        const [body, creator] = await Promise.all([
          page.canvasPreview === undefined
            ? getPageBody(ctx, page._id)
            : Promise.resolve(null),
          loadProfileSummary(page.createdByProfileId),
        ]);
        const assignees = [];
        for (const entry of assigneeEntries) {
          const summary = await loadProfileSummary(entry.profileId);
          if (summary !== null) assignees.push(summary);
        }
        const column = index % columnCount;
        const row = Math.floor(index / columnCount);
        canvasPages.push({
          _id: page._id,
          title: page.title,
          text:
            page.canvasPreview ??
            canvasPreview(page.title, body?.content ?? "", page.instructions),
          kind: page.kind,
          parentPageId: page.parentPageId,
          taskStatus: page.taskStatus,
          taskPriority: page.taskPriority,
          dueDate: page.kind === "task" ? (page.dueDate ?? null) : null,
          checkpointTotal:
            page.kind === "task"
              ? (page.checkpointTotal ?? page.checkpoints?.length ?? 0)
              : 0,
          checkpointCompleted:
            page.kind === "task"
              ? (page.checkpointCompleted ??
                page.checkpoints?.filter((checkpoint) => checkpoint.completed)
                  .length ??
                0)
              : 0,
          assignee: assignees[0] ?? null,
          assignees,
          fileCount: page.kind === "file" ? page.fileCount ?? 0 : 0,
          fileCategory:
            page.kind === "file" ? page.filePrimaryCategory ?? null : null,
          filePreviewUrl:
            page.kind === "file" && page.filePreviewStorageId !== undefined
              ? await ctx.storage.getUrl(page.filePreviewStorageId)
              : null,
          tableRowCount: page.kind === "table" ? page.tableRowCount ?? 0 : 0,
          tableColumnCount:
            page.kind === "table" ? page.tableColumnCount ?? 0 : 0,
          updatedAt: page.updatedAt,
          x: placement?.x ?? (column - (columnCount - 1) / 2) * 310,
          y: placement?.y ?? Math.max(0, row) * 220,
          width: placement?.width ?? DEFAULT_WIDTH,
          height: placement?.height ?? DEFAULT_HEIGHT,
          canMove: page.createdByProfileId === profile._id,
          canResize: page.createdByProfileId === profile._id,
          canDetach:
            root !== null &&
            (page.createdByProfileId === profile._id ||
              root.createdByProfileId === profile._id),
          creator,
        });
      }
    }
    const canvasEdges = rawEdges
      .slice(0, MAX_CANVAS_EDGES)
      .filter(
        (edge) =>
          visibleIds.has(edge.nodeAId) && visibleIds.has(edge.nodeBId),
      )
      .map((edge) => ({
        _id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
        label: edge.label,
        kind: "canvas" as const,
        canDelete: edge.authorProfileId === profile._id,
        canRequestDeletion: edge.authorProfileId !== profile._id,
      }));
    const visibleRelations = rawRelations
      .slice(0, MAX_RELATIONS_PER_AREA)
      .map((relation) => ({ relation, ...relationEndpoints(relation) }))
      .filter(
        ({ relation, pageAId, pageBId }) =>
          relation.startupId === args.startupId &&
          visibleIds.has(pageAId) &&
          visibleIds.has(pageBId),
      )
      .map(({ relation, pageAId, pageBId }) => ({
        _id: relation._id,
        source: pageAId,
        target: pageBId,
        label: relation.label,
        kind: "relation" as const,
        canDelete: relation.authorProfileId === profile._id,
        canRequestDeletion: relation.authorProfileId !== profile._id,
      }));
    const checkpointIds = new Set<Id<"taskCheckpoints">>();
    for (const edge of rawCheckpointEdges.slice(0, MAX_CANVAS_EDGES)) {
      if (edge.endpointA.kind === "task_checkpoint") {
        checkpointIds.add(edge.endpointA.id);
      }
      if (edge.endpointB.kind === "task_checkpoint") {
        checkpointIds.add(edge.endpointB.id);
      }
    }
    const checkpointRows = await Promise.all(
      [...checkpointIds].map((checkpointId) =>
        ctx.db.get("taskCheckpoints", checkpointId),
      ),
    );
    const activeCheckpointsById = new Map(
      checkpointRows
        .filter(
          (checkpoint): checkpoint is Doc<"taskCheckpoints"> =>
            checkpoint !== null &&
            checkpoint.archivedAt === null &&
            checkpoint.startupId === args.startupId &&
            checkpoint.areaId === args.areaId,
        )
        .map((checkpoint) => [checkpoint._id, checkpoint]),
    );
    const checkpointEndpointIsPresent = (
      endpoint:
        | { kind: "page"; id: Id<"pages"> }
        | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> },
      endpointPageId: Id<"pages">,
    ) => {
      if (endpoint.kind === "page") {
        return endpoint.id === endpointPageId && visibleIds.has(endpoint.id);
      }
      const checkpoint = activeCheckpointsById.get(endpoint.id);
      return (
        checkpoint?.taskPageId === endpointPageId &&
        (endpointPageId === args.rootPageId ||
          visibleIds.has(endpointPageId))
      );
    };
    const checkpointEdges = rawCheckpointEdges
      .slice(0, MAX_CANVAS_EDGES)
      .filter(
        (edge) =>
          checkpointEndpointIsPresent(
            edge.endpointA,
            edge.endpointAPageId,
          ) &&
          checkpointEndpointIsPresent(
            edge.endpointB,
            edge.endpointBPageId,
          ),
      )
      .map((edge) => ({
        _id: edge._id,
        source: edge.endpointA,
        target: edge.endpointB,
        canDelete: edge.authorProfileId === profile._id,
        canRequestDeletion: edge.authorProfileId !== profile._id,
      }));
    const rawGhosts =
      root === null
        ? []
        : await ctx.db
            .query("pageNestingRequests")
            .withIndex(
              "by_targetParentPageId_and_status_and_createdAt",
              (q) =>
                q
                  .eq("targetParentPageId", root._id)
                  .eq("status", "pending"),
            )
            .take(MAX_CANVAS_PAGES + 1);
    const ghosts = [];
    for (const request of rawGhosts.slice(0, MAX_CANVAS_PAGES)) {
      const child = await ctx.db.get("pages", request.childPageId);
      if (
        child === null ||
        child.archivedAt !== null ||
        child.startupId !== args.startupId ||
        child.areaId !== args.areaId
      ) {
        continue;
      }
      ghosts.push({
        requestId: request._id,
        pageId: child._id,
        title: child.title,
        kind: child.kind,
        sourceParentPageId: request.sourceParentPageId,
        targetParentPageId: request.targetParentPageId,
        x: request.proposedX ?? 0,
        y: request.proposedY ?? 0,
        status: "pending" as const,
        requester: await getProfileSummary(ctx, request.requesterProfileId),
        canApprove: request.parentAuthorProfileId === profile._id,
        canReject: request.parentAuthorProfileId === profile._id,
        canWithdraw: request.requesterProfileId === profile._id,
      });
    }
    const ownerProfileId =
      root === null
        ? areaBody?.ownerProfileId ?? startup.createdByProfileId
        : root.createdByProfileId;
    return {
      pages: canvasPages,
      edges: canvasEdges,
      relations: visibleRelations,
      checkpointEdges,
      ghosts,
      viewport:
        viewport === null
          ? { x: 0, y: 0, zoom: 1, persisted: false }
          : {
              x: viewport.x,
              y: viewport.y,
              zoom: viewport.zoom,
              persisted: true,
            },
      truncated:
        rawPages.length > MAX_CANVAS_PAGES ||
        rawEdges.length > MAX_CANVAS_EDGES ||
        rawRelations.length > MAX_RELATIONS_PER_AREA ||
        rawCheckpointEdges.length > MAX_CANVAS_EDGES ||
        rawGhosts.length > MAX_CANVAS_PAGES,
      scope: {
        kind: root === null ? ("area" as const) : ("page" as const),
        startupId: args.startupId,
        areaId: args.areaId,
        rootPageId: args.rootPageId,
        title: root?.title ?? area.label,
        pageKind: root?.kind ?? null,
        briefing: {
          content: rootBody?.content ?? areaBody?.content ?? "",
          instructions: root?.kind === "task" ? root.instructions ?? null : null,
          revision: root?.revision ?? areaBody?.revision ?? 0,
          ownerProfileId,
          canEdit: ownerProfileId === profile._id,
        },
      },
    };
}

/**
 * Resolver za embed: iz jednog `areaId` (koji mobilni prosleđuje kroz URL) razreši
 * pun scope i vrati canvas oblasti (`rootPageId: null`). `ctx.db.get` zaobilazi
 * proveru pristupa, ali ništa se ne vraća pre `requireStartupMember` — ne-član koji
 * pošalje tuđi `areaId` dobije grešku članstva; `requireScope` dodatno potvrđuje da
 * oblast pripada startup-u. Bez curenja podataka.
 */
export const getAreaCanvasByArea = query({
  args: { areaId: v.id("startupAreas") },
  returns: canvasPayloadValidator,
  handler: async (ctx, args) => {
    const area = await ctx.db.get("startupAreas", args.areaId);
    if (area === null) throw new Error("Oblast ne postoji.");
    const { profile, startup } = await requireStartupMember(ctx, area.startupId);
    const { area: scopedArea, root } = await requireScope(
      ctx,
      area.startupId,
      args.areaId,
      null,
    );
    return await assembleCanvas(ctx, {
      startupId: area.startupId,
      areaId: args.areaId,
      rootPageId: null,
      profile,
      startup,
      area: scopedArea,
      root,
    });
  },
});

/**
 * Resolver za embed: iz jednog `pageId` razreši pun scope (startupId + areaId iz
 * dokumenta stranice) i vrati canvas te stranice (`rootPageId: pageId`). Ista
 * authz priča kao gore — vidi komentar na `getAreaCanvasByArea`; `requireScope`
 * (preko `requireStrictVisiblePage`) potvrđuje da je stranica vidljiva u startup-u.
 */
export const getPageCanvasByPage = query({
  args: { pageId: v.id("pages") },
  returns: canvasPayloadValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db.get("pages", args.pageId);
    if (page === null) throw new Error("Stranica ne postoji.");
    const { profile, startup } = await requireStartupMember(ctx, page.startupId);
    const { area, root } = await requireScope(
      ctx,
      page.startupId,
      page.areaId,
      args.pageId,
    );
    return await assembleCanvas(ctx, {
      startupId: page.startupId,
      areaId: page.areaId,
      rootPageId: args.pageId,
      profile,
      startup,
      area,
      root,
    });
  },
});

export const updateAreaBody = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    content: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.object({
    revision: v.number(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { profile, startup } = await requireStartupMember(
      ctx,
      args.startupId,
    );
    await requireArea(ctx, args.startupId, args.areaId);
    if (
      !Number.isSafeInteger(args.expectedRevision) ||
      args.expectedRevision < 0
    ) {
      throw new Error("Revizija briefinga nije ispravna.");
    }
    if (args.content.length > MAX_AREA_BODY_LENGTH) {
      throw new Error(
        `Briefing može imati najviše ${MAX_AREA_BODY_LENGTH.toLocaleString("sr-Latn-RS")} znakova.`,
      );
    }
    const existing = await ctx.db
      .query("areaBodies")
      .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
      .unique();
    const ownerProfileId =
      existing?.ownerProfileId ?? startup.createdByProfileId;
    if (ownerProfileId !== profile._id) {
      throw new Error("Briefing oblasti može menjati samo kreator startupa.");
    }
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== args.expectedRevision) {
      throw new Error(
        "KONFLIKT_IZMENA: Briefing je u međuvremenu izmenjen.",
      );
    }
    if (existing !== null && existing.content === args.content) {
      return {
        revision: existing.revision,
        updatedAt: existing.updatedAt,
      };
    }
    const now = Date.now();
    const revision = currentRevision + 1;
    if (existing === null) {
      await ctx.db.insert("areaBodies", {
        startupId: args.startupId,
        areaId: args.areaId,
        ownerProfileId,
        content: args.content,
        revision,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("areaBodies", existing._id, {
        content: args.content,
        revision,
        updatedAt: now,
      });
    }
    return { revision, updatedAt: now };
  },
});

export const createPage = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    kind: pageKindValidator,
    title: v.string(),
    content: v.optional(v.string()),
    position: v.optional(v.number()),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.union(v.number(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
    checkpoints: v.optional(
      v.union(v.array(checkpointItemValidator), v.null()),
    ),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
  },
  returns: v.object({
    pageId: v.id("pages"),
    nestingStatus: v.union(v.literal("none"), v.literal("pending")),
    requestId: v.union(v.id("pageNestingRequests"), v.null()),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const { root } = await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    const needsApproval =
      root !== null && root.createdByProfileId !== profile._id;
    const actualParentPageId = needsApproval ? null : args.rootPageId;
    await assertCanvasCapacity(
      ctx,
      args.startupId,
      args.areaId,
      actualParentPageId,
    );
    const target = await validateWorkspacePageTarget(ctx, {
      startupId: args.startupId,
      areaId: args.areaId,
      parentPageId: actualParentPageId,
      kind: args.kind,
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileId: args.assigneeProfileId,
      assigneeProfileIds: args.assigneeProfileIds,
      dueDate: args.dueDate,
      instructions: args.instructions ?? undefined,
      checkpoints: args.checkpoints ?? undefined,
    });
    const now = Date.now();
    const page = prepareWorkspacePage(target, {
      title: args.title,
      content: cleanPageContent(args.content ?? ""),
      position: args.position,
      now,
    });
    const pageId = await insertWorkspacePage(ctx, {
      target,
      page,
      actorProfileId: profile._id,
      now,
    });
    await ctx.db.patch("pages", pageId, {
      treeRevision: 0,
      canvasPreview: canvasPreview(
        page.title,
        page.content,
        target.instructions ?? undefined,
      ),
    });
    const createdPage = await ctx.db.get("pages", pageId);
    if (createdPage === null) {
      throw new Error("Nova stranica nije sačuvana.");
    }
    const canvasPosition =
      args.x !== undefined && args.y !== undefined
        ? { x: args.x, y: args.y }
        : await getAvailableCanvasPosition(ctx, {
            startupId: args.startupId,
            areaId: args.areaId,
            rootPageId: actualParentPageId,
          });
    await upsertPlacement(ctx, {
      page: createdPage,
      rootPageId: actualParentPageId,
      actorProfileId: profile._id,
      x: canvasPosition.x,
      y: canvasPosition.y,
      now,
    });
    if (!needsApproval && root !== null) {
      await assertReparentDepth(ctx, createdPage._id, root._id);
    }
    if (!needsApproval || root === null) {
      return {
        pageId,
        nestingStatus: "none" as const,
        requestId: null,
      };
    }
    const requestId = await createPendingNestingRequest(ctx, {
      child: createdPage,
      targetParent: root,
      requesterProfileId: profile._id,
      position: args.position,
      x: args.x,
      y: args.y,
      now,
    });
    return {
      pageId,
      nestingStatus: "pending" as const,
      requestId,
    };
  },
});

export const updatePage = mutation({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
    expectedRevision: v.number(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    /** Deprecated ulaz — znači „spisak izvršilaca = [x]” (ili prazan za null). */
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.union(v.number(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
    checkpoints: v.optional(
      v.union(v.array(checkpointItemValidator), v.null()),
    ),
  },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      startupId: args.startupId,
    });
    const { profile } = await requireStartupMember(ctx, args.startupId);
    assertOwnedPage(
      page,
      profile._id,
      "Naslov i osnovni sadržaj menja samo kreator stranice.",
    );
    if (
      !Number.isSafeInteger(args.expectedRevision) ||
      page.revision !== args.expectedRevision
    ) {
      throw new Error(
        "KONFLIKT_IZMENA: Neko iz tima je u međuvremenu izmenio ovu stranicu.",
      );
    }
    const hasTaskPatch =
      args.taskStatus !== undefined ||
      args.taskPriority !== undefined ||
      args.assigneeProfileId !== undefined ||
      args.assigneeProfileIds !== undefined ||
      args.dueDate !== undefined ||
      args.instructions !== undefined ||
      args.checkpoints !== undefined;
    if (page.kind !== "task" && hasTaskPatch) {
      throw new Error("Task podaci se mogu menjati samo na task stranici.");
    }
    const currentAssigneeIds =
      page.kind === "task"
        ? await listActiveTaskAssigneeIds(ctx, page._id)
        : [];
    const requestedAssigneeIds =
      normalizeAssigneeProfileIds(args.assigneeProfileIds) ??
      (args.assigneeProfileId === undefined
        ? undefined
        : args.assigneeProfileId === null
          ? []
          : [args.assigneeProfileId]);
    for (const profileId of requestedAssigneeIds ?? []) {
      await requireProfileInStartup(ctx, args.startupId, profileId);
    }
    const body = await getPageBody(ctx, page._id);
    const title =
      args.title === undefined
        ? page.title
        : cleanRequiredText(args.title, "Naslov", 200);
    const currentContent = body?.content ?? "";
    const content =
      args.content === undefined
        ? currentContent
        : cleanPageContent(args.content);
    const taskStatus =
      page.kind === "task"
        ? args.taskStatus ?? page.taskStatus ?? "backlog"
        : null;
    const taskPriority =
      page.kind === "task"
        ? args.taskPriority ?? page.taskPriority ?? "medium"
        : null;
    const assigneeProfileIds =
      page.kind === "task"
        ? requestedAssigneeIds ?? currentAssigneeIds
        : [];
    const addedAssignees = assigneeProfileIds.filter(
      (profileId) => !currentAssigneeIds.includes(profileId),
    );
    const changesAssignee =
      addedAssignees.length > 0 ||
      currentAssigneeIds.some(
        (profileId) => !assigneeProfileIds.includes(profileId),
      );
    const assigneeProfileId =
      page.kind === "task" ? assigneeProfileIds[0] ?? null : null;
    const dueDate =
      page.kind === "task" && args.dueDate !== undefined
        ? validateTaskDueDate(args.dueDate) ?? null
        : page.dueDate;
    const instructions =
      page.kind === "task" && args.instructions !== undefined
        ? normalizeTaskInstructions(args.instructions)
        : page.instructions;
    const checkpoints =
      page.kind === "task" && args.checkpoints !== undefined
        ? (normalizeTaskCheckpoints(args.checkpoints) ?? [])
        : page.checkpoints;
    const bodyContributions = await getPageBodyContributions(
      ctx,
      page._id,
      body?._id ?? null,
    );
    const authoredBodyContribution = bodyContributions.find(
      (contribution) =>
        contribution.attribution === "author" &&
        contribution.authorProfileId === profile._id,
    );
    const shouldClaimMissingBody =
      content !== currentContent &&
      authoredBodyContribution === undefined &&
      bodyContributions.length === 0 &&
      !currentContent.trim();
    if (
      content !== currentContent &&
      authoredBodyContribution === undefined &&
      !shouldClaimMissingBody
    ) {
      throw new Error(
        "Raniji zajednički sadržaj je zaključan. Dodajte svoj potpisani tekst.",
      );
    }
    const unchanged =
      title === page.title &&
      content === currentContent &&
      taskStatus === page.taskStatus &&
      taskPriority === page.taskPriority &&
      !changesAssignee &&
      dueDate === page.dueDate &&
      instructions === page.instructions &&
      JSON.stringify(checkpoints ?? null) ===
        JSON.stringify(page.checkpoints ?? null);
    if (unchanged) return { revision: page.revision };

    const now = Date.now();
    const revision = page.revision + 1;
    await ctx.db.patch("pages", page._id, {
      title,
      searchText: pageSearchText(title, content),
      canvasPreview: canvasPreview(title, content, instructions),
      revision,
      taskStatus,
      taskPriority,
      assigneeProfileId,
      dueDate,
      instructions,
      checkpoints,
      taskSortAt: pageTaskSortAt(dueDate, now),
      completedAt: nextCompletedAt(page, taskStatus, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    if (page.kind === "task" && changesAssignee) {
      const patched = await ctx.db.get("pages", page._id);
      if (patched === null) throw new Error("Stranica nije pronađena.");
      await reconcileTaskAssignees(ctx, {
        page: patched,
        profileIds: assigneeProfileIds,
        actorProfileId: profile._id,
        now,
        membershipChecked: true,
      });
    }
    if (
      page.kind === "task" &&
      (taskStatus !== page.taskStatus || dueDate !== page.dueDate)
    ) {
      await syncTaskAssigneeMirrors(ctx, {
        taskPageId: page._id,
        taskStatus,
        taskSortAt: pageTaskSortAt(dueDate, now),
        now,
      });
    }
    if (page.kind === "task" && args.checkpoints !== undefined) {
      await reconcileLegacyTaskCheckpoints(ctx, {
        page,
        checkpoints,
        actorProfileId: profile._id,
        now,
      });
    }
    if (body === null) {
      await ctx.db.insert("pageBodies", {
        pageId: page._id,
        content,
        updatedAt: now,
      });
    } else if (content !== currentContent) {
      await ctx.db.patch("pageBodies", body._id, { content, updatedAt: now });
    }
    if (content !== currentContent && authoredBodyContribution !== undefined) {
      await ctx.db.patch(
        "contentContributions",
        authoredBodyContribution._id,
        { content, updatedAt: now },
      );
    } else if (shouldClaimMissingBody) {
      await insertContribution(ctx, {
        startupId: page.startupId,
        targetKind: "page",
        targetId: page._id,
        authorProfileId: profile._id,
        content,
        sourceKind: "page_body",
        sourceId: page._id,
        createdAt: now,
      });
    }
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: profile._id,
      action: page.kind === "task" ? "task_updated" : "page_updated",
      targetType: "page",
      targetId: page._id,
      title: `„${title}” je izmenjen/a`,
    });
    await notifyTaskStakeholders(ctx, {
      page,
      addedAssigneeProfileIds: addedAssignees,
      assigneeProfileIdsAfterChange: assigneeProfileIds,
      nextTaskStatus: taskStatus,
      actorProfileId: profile._id,
    });
    return { revision };
  },
});

export const archivePage = mutation({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      startupId: args.startupId,
    });
    const { profile } = await requireStartupMember(ctx, args.startupId);
    assertOwnedPage(
      page,
      profile._id,
      "Tuđa stranica se arhivira samo kroz odobreni timski postupak.",
    );
    await archivePageWithV2Sidecars(ctx, page, profile._id);
    return null;
  },
});

export const movePages = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
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
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    if (args.updates.length > MAX_BATCH_LAYOUT_UPDATES) {
      throw new Error(
        `Odjednom se može pomeriti najviše ${MAX_BATCH_LAYOUT_UPDATES} kartica.`,
      );
    }
    const seen = new Set<string>();
    const pages = [];
    for (const update of args.updates) {
      if (seen.has(update.pageId)) {
        throw new Error("Ista kartica je poslata više puta.");
      }
      seen.add(update.pageId);
      const page = await requireStrictVisiblePage(ctx, update.pageId, {
        startupId: args.startupId,
        areaId: args.areaId,
      });
      assertDirectCanvasPage(page, args.rootPageId);
      assertOwnedPage(page, profile._id, "Možete pomerati samo svoje kartice.");
      pages.push({ page, update });
    }
    const now = Date.now();
    for (const { page, update } of pages) {
      const placement = await getPlacement(ctx, page._id);
      await upsertPlacement(ctx, {
        page,
        rootPageId: args.rootPageId,
        actorProfileId: profile._id,
        x: update.x,
        y: update.y,
        width: placement?.width,
        height: placement?.height,
        now,
      });
    }
    return null;
  },
});

export const resizePage = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    pageId: v.id("pages"),
    width: v.number(),
    height: v.number(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      startupId: args.startupId,
      areaId: args.areaId,
    });
    assertDirectCanvasPage(page, args.rootPageId);
    assertOwnedPage(page, profile._id, "Možete menjati veličinu samo svoje kartice.");
    if ((args.x === undefined) !== (args.y === undefined)) {
      throw new Error("Pozicija kartice mora imati i x i y koordinatu.");
    }
    const placement = await getPlacement(ctx, page._id);
    const now = Date.now();
    await upsertPlacement(ctx, {
      page,
      rootPageId: args.rootPageId,
      actorProfileId: profile._id,
      x:
        args.x === undefined
          ? (placement?.x ?? 0)
          : clamp(args.x, -100_000, 100_000),
      y:
        args.y === undefined
          ? (placement?.y ?? 0)
          : clamp(args.y, -100_000, 100_000),
      width: clamp(args.width, MIN_WIDTH, MAX_WIDTH),
      height: clamp(args.height, MIN_HEIGHT, MAX_HEIGHT),
      now,
    });
    return null;
  },
});

export const resetPageSize = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    pageId: v.id("pages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      startupId: args.startupId,
      areaId: args.areaId,
    });
    assertDirectCanvasPage(page, args.rootPageId);
    assertOwnedPage(page, profile._id, "Možete menjati veličinu samo svoje kartice.");
    const placement = await getPlacement(ctx, page._id);
    if (placement !== null) {
      const now = Date.now();
      await ctx.db.patch("pageCanvasPlacements", placement._id, {
        width: undefined,
        height: undefined,
        updatedByProfileId: profile._id,
        updatedAt: now,
      });
      const legacy = await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique();
      if (legacy === null) {
        await ctx.db.insert("pageCanvasNodes", {
          startupId: page.startupId,
          areaId: page.areaId,
          pageId: page._id,
          x: placement.x,
          y: placement.y,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch("pageCanvasNodes", legacy._id, {
          width: undefined,
          height: undefined,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const saveViewport = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    const value = {
      startupId: args.startupId,
      areaId: args.areaId,
      rootPageId: args.rootPageId,
      viewerProfileId: profile._id,
      x: clamp(args.x, -100_000, 100_000),
      y: clamp(args.y, -100_000, 100_000),
      zoom: clamp(args.zoom, 0.1, 4),
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("pageCanvasViewports")
      .withIndex(
        "by_viewerProfileId_and_startupId_and_areaId_and_rootPageId",
        (q) =>
          q
            .eq("viewerProfileId", profile._id)
            .eq("startupId", args.startupId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", args.rootPageId),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("pageCanvasViewports", {
        ...value,
        createdAt: value.updatedAt,
      });
    } else {
      await ctx.db.patch("pageCanvasViewports", existing._id, value);
    }
    if (args.rootPageId === null) {
      const legacyZoom = clamp(value.zoom, 0.5, 1.6);
      for (const kind of ["note", "task"] as const) {
        const legacy = await ctx.db
          .query("pageCanvases")
          .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
            q
              .eq("ownerProfileId", profile._id)
              .eq("areaId", args.areaId)
              .eq("kind", kind),
          )
          .unique();
        const legacyValue = {
          startupId: args.startupId,
          areaId: args.areaId,
          ownerProfileId: profile._id,
          kind,
          x: value.x,
          y: value.y,
          zoom: legacyZoom,
          updatedAt: value.updatedAt,
        };
        if (legacy === null) {
          await ctx.db.insert("pageCanvases", {
            ...legacyValue,
            createdAt: value.updatedAt,
          });
        } else {
          await ctx.db.patch("pageCanvases", legacy._id, legacyValue);
        }
      }
    }
    return null;
  },
});

export const connectPages = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    sourcePageId: v.id("pages"),
    targetPageId: v.id("pages"),
    label: v.optional(v.string()),
  },
  returns: v.id("pageCanvasEdgesV2"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    if (args.sourcePageId === args.targetPageId) {
      throw new Error("Kartica ne može biti povezana sama sa sobom.");
    }
    const [source, target] = await Promise.all([
      requireStrictVisiblePage(ctx, args.sourcePageId, {
        startupId: args.startupId,
        areaId: args.areaId,
      }),
      requireStrictVisiblePage(ctx, args.targetPageId, {
        startupId: args.startupId,
        areaId: args.areaId,
      }),
    ]);
    assertDirectCanvasPage(source, args.rootPageId);
    assertDirectCanvasPage(target, args.rootPageId);
    if (
      source.createdByProfileId !== profile._id &&
      target.createdByProfileId !== profile._id
    ) {
      throw new Error("Vezu možete praviti samo od ili ka svojoj kartici.");
    }
    const key = pairKey(source._id, target._id);
    const existing = await ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex(
        "by_scope_active_pair",
        (q) =>
          q
            .eq("startupId", args.startupId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", args.rootPageId)
            .eq("archivedAt", null)
            .eq("pairKey", key),
      )
      .first();
    const label = cleanCanvasLabel(args.label);
    const now = Date.now();
    let edgeId: Id<"pageCanvasEdgesV2">;
    let edgeLabel: string | null;
    let edgeAuthorProfileId: Id<"profiles"> | undefined;
    if (existing !== null) {
      edgeId = existing._id;
      edgeLabel = existing.label;
      edgeAuthorProfileId = existing.authorProfileId;
    } else {
      const activeEdges = await ctx.db
        .query("pageCanvasEdgesV2")
        .withIndex(
          "by_scope_active_pair",
          (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("areaId", args.areaId)
              .eq("rootPageId", args.rootPageId)
              .eq("archivedAt", null),
        )
        .take(MAX_CANVAS_EDGES + 1);
      if (activeEdges.length >= MAX_CANVAS_EDGES) {
        throw new Error(`Kanvas može imati najviše ${MAX_CANVAS_EDGES} veza.`);
      }
      edgeId = await ctx.db.insert("pageCanvasEdgesV2", {
        startupId: args.startupId,
        areaId: args.areaId,
        rootPageId: args.rootPageId,
        nodeAId: source._id,
        nodeBId: target._id,
        pairKey: key,
        label,
        authorProfileId: profile._id,
        attribution: "author",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      edgeLabel = label;
      edgeAuthorProfileId = profile._id;
    }
    if (args.rootPageId === null) {
      const legacy = await ctx.db
        .query("pageEdges")
        .withIndex("by_areaId_and_pairKey", (q) =>
          q.eq("areaId", args.areaId).eq("pairKey", key),
        )
        .unique();
      const legacyValue = {
        startupId: args.startupId,
        areaId: args.areaId,
        nodeAId: source._id,
        nodeBId: target._id,
        pairKey: key,
        label: edgeLabel,
        ...(edgeAuthorProfileId === undefined
          ? {}
          : { authorProfileId: edgeAuthorProfileId }),
        archivedAt: null,
        updatedAt: now,
      };
      if (legacy === null) {
        await ctx.db.insert("pageEdges", {
          ...legacyValue,
          createdAt: now,
        });
      } else {
        if (legacy.startupId !== args.startupId) {
          throw new Error("Postojeća veza ne pripada ovom startupu.");
        }
        await ctx.db.patch("pageEdges", legacy._id, legacyValue);
      }
    }
    return edgeId;
  },
});

export const disconnectPages = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: rootPageIdValidator,
    edgeId: v.id("pageCanvasEdgesV2"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireScope(
      ctx,
      args.startupId,
      args.areaId,
      args.rootPageId,
    );
    const edge = await ctx.db.get("pageCanvasEdgesV2", args.edgeId);
    if (
      edge === null ||
      edge.archivedAt !== null ||
      edge.startupId !== args.startupId ||
      edge.areaId !== args.areaId ||
      edge.rootPageId !== args.rootPageId
    ) {
      throw new Error("Veza nije pronađena na ovom kanvasu.");
    }
    if (edge.authorProfileId !== profile._id) {
      throw new Error("Možete ukloniti samo vezu koju ste napravili.");
    }
    const now = Date.now();
    await archiveCanvasEdgeWithLegacyProjection(ctx, edge, now);
    return null;
  },
});

export const listRelations = query({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
  },
  returns: v.object({
    relations: v.array(listedRelationValidator),
    candidates: v.array(relationPageValidator),
    candidatesTruncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      startupId: args.startupId,
    });
    const { profile } = await requireStartupMember(ctx, args.startupId);
    // Stranica može biti na bilo kojoj strani relacije, pa se čitaju oba para
    // indeksa — stari (note/task) i novi (A/B) — i rezultat se dedupira.
    const relationBatches = await Promise.all(
      (
        [
          ["by_notePageId_and_archivedAt", "notePageId"],
          ["by_taskPageId_and_archivedAt", "taskPageId"],
          ["by_pageAId_and_archivedAt", "pageAId"],
          ["by_pageBId_and_archivedAt", "pageBId"],
        ] as const
      ).map(([indexName, field]) =>
        ctx.db
          .query("pageRelations")
          .withIndex(indexName, (q) =>
            q.eq(field, page._id).eq("archivedAt", null),
          )
          .take(MAX_RELATIONS_PER_AREA + 1),
      ),
    );
    const rawRelations = Array.from(
      new Map(
        relationBatches.flat().map((relation) => [relation._id, relation]),
      ).values(),
    );
    // Vidljivost relacije je po stranici, ne po oblasti — relacija sme da
    // spaja stranice iz različitih oblasti istog startupa.
    const scopedRelations = rawRelations
      .slice(0, MAX_RELATIONS_PER_AREA)
      .filter(
        (relation) =>
          relation.startupId === args.startupId &&
          relationTouchesPage(relation, page._id),
      );
    const linkedPageIds = Array.from(
      new Set(
        scopedRelations.flatMap((relation) => {
          const other = relationOtherEndpoint(relation, page._id);
          return other === null ? [] : [other];
        }),
      ),
    );
    const linkedPages = new Map(
      await Promise.all(
        linkedPageIds.map(async (linkedPageId) => [
          linkedPageId,
          await ctx.db.get("pages", linkedPageId),
        ] as const),
      ),
    );
    const relations = [];
    const linkedIds = new Set<string>();
    for (const relation of scopedRelations) {
      const linkedPageId = relationOtherEndpoint(relation, page._id);
      const linked =
        linkedPageId === null ? undefined : linkedPages.get(linkedPageId);
      if (
        linked === null ||
        linked === undefined ||
        linked.archivedAt !== null ||
        linked.startupId !== args.startupId
      ) {
        continue;
      }
      linkedIds.add(linked._id);
      relations.push({
        _id: relation._id,
        label: relation.label,
        linkedPage: {
          pageId: linked._id,
          title: linked.title,
          kind: linked.kind,
          parentPageId: linked.parentPageId,
          areaId: linked.areaId,
        },
        canDelete: relation.authorProfileId === profile._id,
        canRequestDeletion: relation.authorProfileId !== profile._id,
      });
    }
    // Veže se sve sa svim, pa su kandidati sve aktivne stranice startupa bez
    // obzira na vrstu i oblast — sem same stranice i onih koje su već
    // povezane. Redosled po poslednjoj izmeni, najskorije prve.
    const rawCandidates = await ctx.db
      .query("pages")
      .withIndex("by_startupId_and_archivedAt_and_updatedAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null),
      )
      .order("desc")
      .take(MAX_RELATION_CANDIDATES * 3 + 1);
    const validCandidates = [];
    for (const candidate of rawCandidates) {
      if (
        candidate._id === page._id ||
        linkedIds.has(candidate._id) ||
        (page.createdByProfileId !== profile._id &&
          candidate.createdByProfileId !== profile._id)
      ) {
        continue;
      }
      validCandidates.push({
        pageId: candidate._id,
        title: candidate.title,
        kind: candidate.kind,
        parentPageId: candidate.parentPageId,
        areaId: candidate.areaId,
      });
    }
    return {
      relations,
      candidates: validCandidates.slice(0, MAX_RELATION_CANDIDATES),
      candidatesTruncated:
        validCandidates.length > MAX_RELATION_CANDIDATES ||
        rawCandidates.length > MAX_RELATION_CANDIDATES * 3,
    };
  },
});

export const createRelation = mutation({
  args: {
    startupId: v.id("startups"),
    pageAId: v.id("pages"),
    pageBId: v.id("pages"),
    label: v.optional(v.string()),
  },
  returns: v.id("pageRelations"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    if (args.pageAId === args.pageBId) {
      throw new Error("Stranica ne može biti povezana sama sa sobom.");
    }
    const [pageA, pageB] = await Promise.all([
      requireStrictVisiblePage(ctx, args.pageAId, {
        startupId: args.startupId,
      }),
      requireStrictVisiblePage(ctx, args.pageBId, {
        startupId: args.startupId,
      }),
    ]);
    if (
      pageA.createdByProfileId !== profile._id &&
      pageB.createdByProfileId !== profile._id
    ) {
      throw new Error("Relaciju možete praviti samo sa svojom stranicom.");
    }
    // Poredak endpointa je kanonski (isti `pairKey` bez obzira ko je izvor),
    // pa duplikat u suprotnom smeru ne može da nastane. Jedinstvenost para je
    // na nivou startupa jer relacija sme da spaja stranice različitih oblasti.
    const [firstPage, secondPage] =
      pageA._id < pageB._id ? [pageA, pageB] : [pageB, pageA];
    const key = pairKey(firstPage._id, secondPage._id);
    const existing = await ctx.db
      .query("pageRelations")
      .withIndex("by_startupId_and_pairKey_and_archivedAt", (q) =>
        q
          .eq("startupId", args.startupId)
          .eq("pairKey", key)
          .eq("archivedAt", null),
      )
      .first();
    if (existing !== null) {
      return existing._id;
    }
    // Limit ostaje po oblasti u kojoj red nastaje (oblast stranice A): on
    // ograničava koliko `getCanvas` čita za jednu oblast, pa mora da prati
    // `areaId` reda, a ne ukupan broj relacija startupa.
    const active = await ctx.db
      .query("pageRelations")
      .withIndex("by_startup_area_active_created", (q) =>
        q
          .eq("startupId", args.startupId)
          .eq("areaId", pageA.areaId)
          .eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1);
    if (active.length >= MAX_RELATIONS_PER_AREA) {
      throw new Error(
        `Oblast može imati najviše ${MAX_RELATIONS_PER_AREA} relacija.`,
      );
    }
    const now = Date.now();
    return await ctx.db.insert("pageRelations", {
      startupId: args.startupId,
      areaId: pageA.areaId,
      // Stari par se i dalje popunjava dok migracija ne prođe kroz sve redove.
      notePageId: firstPage._id,
      taskPageId: secondPage._id,
      pageAId: firstPage._id,
      pageBId: secondPage._id,
      pairKey: key,
      label: cleanCanvasLabel(args.label),
      authorProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteRelation = mutation({
  args: {
    startupId: v.id("startups"),
    relationId: v.id("pageRelations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const relation = await ctx.db.get("pageRelations", args.relationId);
    if (
      relation === null ||
      relation.archivedAt !== null ||
      relation.startupId !== args.startupId
    ) {
      throw new Error("Relacija nije pronađena.");
    }
    if (relation.authorProfileId !== profile._id) {
      throw new Error("Možete ukloniti samo relaciju koju ste napravili.");
    }
    const now = Date.now();
    await ctx.db.patch("pageRelations", relation._id, {
      archivedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const requestNesting = mutation({
  args: {
    startupId: v.id("startups"),
    childPageId: v.id("pages"),
    targetParentPageId: v.id("pages"),
    position: v.optional(v.number()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
  },
  returns: moveResultValidator,
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const [child, targetParent] = await Promise.all([
      requireStrictVisiblePage(ctx, args.childPageId, {
        startupId: args.startupId,
      }),
      requireStrictVisiblePage(ctx, args.targetParentPageId, {
        startupId: args.startupId,
      }),
    ]);
    assertOwnedPage(child, profile._id, "Možete ugnježđavati samo svoju stranicu.");
    if (child.areaId !== targetParent.areaId) {
      throw new Error("Ugnježđavanje je moguće samo unutar iste oblasti.");
    }
    if (child._id === targetParent._id) {
      throw new Error("Stranica ne može biti sopstveni roditelj.");
    }
    return await moveWithinArea(ctx, {
      child,
      targetParent,
      actorProfileId: profile._id,
      position: args.position,
      x: args.x,
      y: args.y,
      now: Date.now(),
    });
  },
});

export const approveNesting = mutation({
  args: {
    startupId: v.id("startups"),
    requestId: v.id("pageNestingRequests"),
  },
  returns: v.object({ status: nestingStatusValidator }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const request = await ctx.db.get("pageNestingRequests", args.requestId);
    if (
      request === null ||
      request.startupId !== args.startupId ||
      request.status !== "pending"
    ) {
      throw new Error("Zahtev za ugnježđavanje nije aktivan.");
    }
    if (request.parentAuthorProfileId !== profile._id) {
      throw new Error("Samo autor roditeljske stranice može odobriti zahtev.");
    }
    const [child, targetParent] = await Promise.all([
      ctx.db.get("pages", request.childPageId),
      ctx.db.get("pages", request.targetParentPageId),
    ]);
    const isStale =
      child === null ||
      child.archivedAt !== null ||
      targetParent === null ||
      targetParent.archivedAt !== null ||
      child.startupId !== request.startupId ||
      targetParent.startupId !== request.startupId ||
      child.areaId !== request.areaId ||
      targetParent.areaId !== request.areaId ||
      child.parentPageId !== request.sourceParentPageId ||
      (child.treeRevision ?? 0) !== request.expectedTreeRevision ||
      targetParent.createdByProfileId !== request.parentAuthorProfileId;
    if (isStale || child === null || targetParent === null) {
      const now = Date.now();
      await ctx.db.patch("pageNestingRequests", request._id, {
        status: "cancelled",
        resolvedAt: now,
        updatedAt: now,
      });
      return { status: "cancelled" as const };
    }
    try {
      await assertReparentDepth(ctx, child._id, targetParent._id);
    } catch {
      const now = Date.now();
      await ctx.db.patch("pageNestingRequests", request._id, {
        status: "cancelled",
        resolvedAt: now,
        updatedAt: now,
      });
      return { status: "cancelled" as const };
    }
    await assertCanvasCapacity(
      ctx,
      child.startupId,
      child.areaId,
      targetParent._id,
      // The pending ghost already occupies one canvas slot. Approval replaces
      // that ghost with the real child, so it must not count as an extra card.
      0,
    );
    const now = Date.now();
    await applySameAreaReparent(ctx, {
      child,
      targetParentPageId: targetParent._id,
      actorProfileId: profile._id,
      position: request.proposedPosition,
      x: request.proposedX,
      y: request.proposedY,
      now,
      excludeRequestId: request._id,
    });
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "approved",
      resolvedAt: now,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      startupId: request.startupId,
      actorProfileId: profile._id,
      action: "nesting_resolved",
      targetType: "request",
      targetId: request._id,
      title: `Odobreno je ugnježđavanje stranice „${child.title}”`,
    });
    await notifyNestingResolution(ctx, {
      request,
      childTitle: child.title,
      approved: true,
      actorProfileId: profile._id,
      actorName: profile.displayName,
    });
    return { status: "approved" as const };
  },
});

export const rejectNesting = mutation({
  args: {
    startupId: v.id("startups"),
    requestId: v.id("pageNestingRequests"),
  },
  returns: v.object({ status: nestingStatusValidator }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const request = await ctx.db.get("pageNestingRequests", args.requestId);
    if (request === null || request.startupId !== args.startupId) {
      throw new Error("Zahtev nije pronađen.");
    }
    if (request.parentAuthorProfileId !== profile._id) {
      throw new Error("Samo autor roditeljske stranice može odbiti zahtev.");
    }
    if (request.status !== "pending") return { status: request.status };
    const now = Date.now();
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "rejected",
      resolvedAt: now,
      updatedAt: now,
    });
    const rejectedChild = await ctx.db.get("pages", request.childPageId);
    await notifyNestingResolution(ctx, {
      request,
      childTitle: rejectedChild?.title ?? "stranica",
      approved: false,
      actorProfileId: profile._id,
      actorName: profile.displayName,
    });
    return { status: "rejected" as const };
  },
});

export const withdrawNesting = mutation({
  args: {
    startupId: v.id("startups"),
    requestId: v.id("pageNestingRequests"),
  },
  returns: v.object({ status: nestingStatusValidator }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const request = await ctx.db.get("pageNestingRequests", args.requestId);
    if (request === null || request.startupId !== args.startupId) {
      throw new Error("Zahtev nije pronađen.");
    }
    if (request.requesterProfileId !== profile._id) {
      throw new Error("Samo podnosilac može povući zahtev.");
    }
    if (request.status !== "pending") return { status: request.status };
    const now = Date.now();
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "withdrawn",
      resolvedAt: now,
      updatedAt: now,
    });
    return { status: "withdrawn" as const };
  },
});

export const detachPage = mutation({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
  },
  returns: v.object({
    status: v.union(
      v.literal("detached"),
      v.literal("withdrawn"),
      v.literal("rejected"),
      v.literal("none"),
    ),
  }),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      startupId: args.startupId,
    });
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const pending = await pendingForChild(ctx, page._id);
    const parent =
      page.parentPageId === null
        ? null
        : await requireStrictVisiblePage(ctx, page.parentPageId, {
            startupId: args.startupId,
            areaId: page.areaId,
          });
    const canDetachActual =
      page.createdByProfileId === profile._id ||
      parent?.createdByProfileId === profile._id;
    if (canDetachActual && page.parentPageId !== null) {
      await moveWithinArea(ctx, {
        child: page,
        targetParent: null,
        actorProfileId: profile._id,
        now: Date.now(),
      });
      return { status: "detached" as const };
    }
    if (pending !== null && pending.requesterProfileId === profile._id) {
      const now = Date.now();
      await ctx.db.patch("pageNestingRequests", pending._id, {
        status: "withdrawn",
        resolvedAt: now,
        updatedAt: now,
      });
      return { status: "withdrawn" as const };
    }
    if (pending !== null && pending.parentAuthorProfileId === profile._id) {
      const now = Date.now();
      await ctx.db.patch("pageNestingRequests", pending._id, {
        status: "rejected",
        resolvedAt: now,
        updatedAt: now,
      });
      return { status: "rejected" as const };
    }
    if (page.parentPageId === null && pending === null) {
      return { status: "none" as const };
    }
    throw new Error("Nemate pravo da odvojite ovu stranicu.");
  },
});

export const listNestingInbox = query({
  args: { startupId: v.id("startups") },
  returns: v.object({
    incoming: v.array(nestingInboxItemValidator),
    outgoing: v.array(nestingInboxItemValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const [rawIncoming, rawOutgoing] = await Promise.all([
      ctx.db
        .query("pageNestingRequests")
        .withIndex(
          "by_startupId_and_parentAuthorProfileId_and_status_and_createdAt",
          (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("parentAuthorProfileId", profile._id)
              .eq("status", "pending"),
        )
        .order("desc")
        .take(MAX_NESTING_INBOX_ITEMS + 1),
      ctx.db
        .query("pageNestingRequests")
        .withIndex(
          "by_startupId_and_requesterProfileId_and_status_and_createdAt",
          (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("requesterProfileId", profile._id)
              .eq("status", "pending"),
        )
        .order("desc")
        .take(MAX_NESTING_INBOX_ITEMS + 1),
    ]);
    const present = async (requests: typeof rawIncoming) => {
      const items = [];
      for (const request of requests.slice(0, MAX_NESTING_INBOX_ITEMS)) {
        const [child, targetParent, requester] = await Promise.all([
          ctx.db.get("pages", request.childPageId),
          ctx.db.get("pages", request.targetParentPageId),
          getProfileSummary(ctx, request.requesterProfileId),
        ]);
        if (
          child === null ||
          child.archivedAt !== null ||
          targetParent === null ||
          targetParent.archivedAt !== null ||
          child.startupId !== args.startupId ||
          targetParent.startupId !== args.startupId ||
          child.areaId !== request.areaId ||
          targetParent.areaId !== request.areaId
        ) {
          continue;
        }
        items.push({
          requestId: request._id,
          child: {
            pageId: child._id,
            title: child.title,
            kind: child.kind,
            parentPageId: child.parentPageId,
          },
          targetParent: {
            pageId: targetParent._id,
            title: targetParent.title,
            kind: targetParent.kind,
          },
          requester,
          createdAt: request.createdAt,
          canApprove: request.parentAuthorProfileId === profile._id,
          canReject: request.parentAuthorProfileId === profile._id,
          canWithdraw: request.requesterProfileId === profile._id,
        });
      }
      return items;
    };
    return {
      incoming: await present(rawIncoming),
      outgoing: await present(rawOutgoing),
      truncated:
        rawIncoming.length > MAX_NESTING_INBOX_ITEMS ||
        rawOutgoing.length > MAX_NESTING_INBOX_ITEMS,
    };
  },
});

export async function movePageAcrossAreasWithSidecars(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    targetAreaId: Id<"startupAreas">;
    actorProfileId: Id<"profiles">;
    position?: number;
    now: number;
  },
) {
  if (args.page.areaId === args.targetAreaId) {
    throw new Error("Stranica je već u ciljnoj oblasti.");
  }
  const descendants = await getActivePageDescendants(ctx, args.page._id);
  const movedPages = [args.page, ...descendants];
  if (
    movedPages.some(
      (item) =>
        item.startupId !== args.page.startupId ||
        item.areaId !== args.page.areaId ||
        item.createdByProfileId !== args.actorProfileId,
    )
  ) {
    throw new Error(
      "Grana sadrži aktivne stranice drugih autora ili neispravan opseg. Prvo ih odvojite.",
    );
  }
  await assertCanvasCapacity(
    ctx,
    args.page.startupId,
    args.targetAreaId,
    null,
  );

  const rootPlacement = await getPlacement(ctx, args.page._id);
  const targetRootPosition = await getAvailableCanvasPosition(ctx, {
    startupId: args.page.startupId,
    areaId: args.targetAreaId,
    rootPageId: null,
    width: rootPlacement?.width,
    height: rootPlacement?.height,
  });
  const movedIds = new Set(movedPages.map((item) => item._id));
  const movedPagesById = new Map(
    movedPages.map((item) => [item._id, item]),
  );
  const scopedEdges: Doc<"pageCanvasEdgesV2">[] = [];
  const scopedViewports: Doc<"pageCanvasViewports">[] = [];
  const pendingRequests = new Map<
    Id<"pageNestingRequests">,
    Doc<"pageNestingRequests">
  >();

  for (const moved of movedPages) {
    const [edges, viewports, pendingChild, pendingTargets] =
      await Promise.all([
        ctx.db
          .query("pageCanvasEdgesV2")
          .withIndex(
            "by_scope_active_pair",
            (q) =>
              q
                .eq("startupId", args.page.startupId)
                .eq("areaId", args.page.areaId)
                .eq("rootPageId", moved._id)
                .eq("archivedAt", null),
          )
          .take(MAX_CANVAS_EDGES + 1),
        ctx.db
          .query("pageCanvasViewports")
          .withIndex("by_rootPageId", (q) =>
            q.eq("rootPageId", moved._id),
          )
          .take(MAX_CANVAS_PAGES + 1),
        pendingForChild(ctx, moved._id),
        ctx.db
          .query("pageNestingRequests")
          .withIndex(
            "by_targetParentPageId_and_status_and_createdAt",
            (q) =>
              q
                .eq("targetParentPageId", moved._id)
                .eq("status", "pending"),
          )
          .take(MAX_CANVAS_PAGES + 1),
      ]);
    if (
      edges.length > MAX_CANVAS_EDGES ||
      viewports.length > MAX_CANVAS_PAGES ||
      pendingTargets.length > MAX_CANVAS_PAGES
    ) {
      throw new Error("Grana ima previše povezanih podataka za jednu radnju.");
    }
    scopedEdges.push(...edges);
    scopedViewports.push(
      ...viewports.filter(
        (viewport) =>
          viewport.startupId === args.page.startupId &&
          viewport.areaId === args.page.areaId,
      ),
    );
    if (pendingChild !== null) {
      pendingRequests.set(pendingChild._id, pendingChild);
    }
    for (const request of pendingTargets) {
      if (
        request.startupId === args.page.startupId &&
        request.areaId === args.page.areaId
      ) {
        pendingRequests.set(request._id, request);
      }
    }
    if (
      scopedEdges.length > MAX_CANVAS_EDGES ||
      scopedViewports.length > MAX_CANVAS_EDGES ||
      pendingRequests.size > MAX_CANVAS_EDGES
    ) {
      throw new Error("Grana ima previše sidecar zapisa za jednu radnju.");
    }
  }

  const edgeMoveDecisions = new Map<
    Id<"pageCanvasEdgesV2">,
    "move" | "archive"
  >();
  let targetEdgeReadCount = 0;
  for (const moved of movedPages) {
    const sourceScopeEdges = scopedEdges.filter(
      (edge) => edge.rootPageId === moved._id,
    );
    if (sourceScopeEdges.length === 0) continue;
    const targetScopeEdges = await ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_scope_active_pair", (q) =>
        q
          .eq("startupId", args.page.startupId)
          .eq("areaId", args.targetAreaId)
          .eq("rootPageId", moved._id)
          .eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1);
    if (targetScopeEdges.length > MAX_CANVAS_EDGES) {
      throw new Error("Ciljni kanvas već ima previše aktivnih veza.");
    }
    targetEdgeReadCount += targetScopeEdges.length;
    if (targetEdgeReadCount > MAX_CANVAS_EDGES) {
      throw new Error("Ciljna grana ima previše sidecar veza za jednu radnju.");
    }
    const occupiedKeys = new Set(
      targetScopeEdges.map((edge) => edge.pairKey),
    );
    let addedEdges = 0;
    for (const edge of sourceScopeEdges) {
      if (
        !movedIds.has(edge.nodeAId) ||
        !movedIds.has(edge.nodeBId) ||
        movedPagesById.get(edge.nodeAId)?.kind !==
          movedPagesById.get(edge.nodeBId)?.kind ||
        occupiedKeys.has(edge.pairKey)
      ) {
        edgeMoveDecisions.set(edge._id, "archive");
        continue;
      }
      occupiedKeys.add(edge.pairKey);
      addedEdges += 1;
      edgeMoveDecisions.set(edge._id, "move");
    }
    if (targetScopeEdges.length + addedEdges > MAX_CANVAS_EDGES) {
      throw new Error(
        `Ciljni kanvas može imati najviše ${MAX_CANVAS_EDGES} veza.`,
      );
    }
  }

  // Relacije prate stranice, ne oblast. Red menja `areaId` (kanvas-scope)
  // samo kad se oba kraja sele zajedno; relacija čiji drugi kraj ostaje se ne
  // dira — postaje relacija preko granica oblasti i vidi se sa obe strane.
  const touchingRelations = new Map<
    Id<"pageRelations">,
    Doc<"pageRelations">
  >();
  for (const moved of movedPages) {
    const rows = await listActiveRelationsTouchingPage(ctx, moved._id);
    for (const relation of rows) {
      if (relation.startupId !== args.page.startupId) continue;
      touchingRelations.set(relation._id, relation);
    }
    if (touchingRelations.size > MAX_RELATIONS_PER_AREA) {
      throw new Error("Grana ima previše relacija za jednu radnju.");
    }
  }
  const relationRescopes: Doc<"pageRelations">[] = [];
  for (const relation of touchingRelations.values()) {
    const { pageAId, pageBId } = relationEndpoints(relation);
    const aMoves = movedIds.has(pageAId);
    const bMoves = movedIds.has(pageBId);
    if (!aMoves && !bMoves) continue;
    if (relation.areaId === args.targetAreaId) continue;
    if (aMoves && bMoves) {
      relationRescopes.push(relation);
      continue;
    }
    // Jedan kraj se seli: kanvas-scope se pomera samo kad drugi kraj VEĆ živi
    // u ciljnoj oblasti — posle premeštanja su oba kraja u njoj, pa linija
    // mora da se crta na njenom kanvasu. Bez ovoga bi red zauvek ostao vezan
    // za oblast u kojoj više nema nijednog kraja (nevidljiva linija + zauzet
    // limit stare oblasti), a dedup po pairKey bi sprečio ponovno kreiranje.
    const otherEndpoint = await ctx.db.get("pages", aMoves ? pageBId : pageAId);
    if (
      otherEndpoint !== null &&
      otherEndpoint.archivedAt === null &&
      otherEndpoint.areaId === args.targetAreaId
    ) {
      relationRescopes.push(relation);
    }
  }
  if (relationRescopes.length > 0) {
    const targetRelations = await ctx.db
      .query("pageRelations")
      .withIndex("by_startup_area_active_created", (q) =>
        q
          .eq("startupId", args.page.startupId)
          .eq("areaId", args.targetAreaId)
          .eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1);
    if (
      targetRelations.length + relationRescopes.length >
      MAX_RELATIONS_PER_AREA
    ) {
      throw new Error(
        `Ciljna oblast može imati najviše ${MAX_RELATIONS_PER_AREA} relacija.`,
      );
    }
  }

  const legacySourceEdges = await listActiveLegacyAreaEdges(
    ctx,
    args.page.areaId,
  );

  for (const moved of movedPages) {
    await archiveCheckpointCanvasEdgesForArchivedPage(
      ctx,
      moved,
      args.now,
    );
  }
  await archiveEdgesForMovedPage(
    ctx,
    args.page,
    args.page.parentPageId,
    args.now,
  );
  for (const edge of scopedEdges) {
    if (edgeMoveDecisions.get(edge._id) !== "move") {
      await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
        archivedAt: args.now,
        updatedAt: args.now,
      });
      continue;
    }
    await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
      areaId: args.targetAreaId,
      updatedAt: args.now,
    });
  }
  for (const edge of legacySourceEdges) {
    const nodeAMoves = movedIds.has(edge.nodeAId);
    const nodeBMoves = movedIds.has(edge.nodeBId);
    if (!nodeAMoves && !nodeBMoves) continue;
    await ctx.db.patch("pageEdges", edge._id, {
      archivedAt: args.now,
      updatedAt: args.now,
    });
  }
  for (const relation of relationRescopes) {
    await ctx.db.patch("pageRelations", relation._id, {
      areaId: args.targetAreaId,
      updatedAt: args.now,
    });
  }
  for (const viewport of scopedViewports) {
    const duplicate = await ctx.db
      .query("pageCanvasViewports")
      .withIndex(
        "by_viewerProfileId_and_startupId_and_areaId_and_rootPageId",
        (q) =>
          q
            .eq("viewerProfileId", viewport.viewerProfileId)
            .eq("startupId", args.page.startupId)
            .eq("areaId", args.targetAreaId)
            .eq("rootPageId", viewport.rootPageId),
      )
      .first();
    if (duplicate === null) {
      await ctx.db.patch("pageCanvasViewports", viewport._id, {
        areaId: args.targetAreaId,
        updatedAt: args.now,
      });
    } else {
      await ctx.db.delete("pageCanvasViewports", viewport._id);
    }
  }
  for (const request of pendingRequests.values()) {
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "cancelled",
      resolvedAt: args.now,
      updatedAt: args.now,
    });
  }
  for (const moved of movedPages) {
    const isRoot = moved._id === args.page._id;
    const parentPageId = isRoot ? null : moved.parentPageId;
    await ctx.db.patch("pages", moved._id, {
      areaId: args.targetAreaId,
      parentPageId,
      ...(isRoot && args.position !== undefined
        ? { position: cleanPagePosition(args.position, args.now) }
        : {}),
      treeRevision: (moved.treeRevision ?? 0) + 1,
      updatedByProfileId: args.actorProfileId,
      updatedAt: args.now,
    });
    const placement = isRoot
      ? rootPlacement
      : await getPlacement(ctx, moved._id);
    await upsertPlacement(ctx, {
      page: {
        ...moved,
        areaId: args.targetAreaId,
        parentPageId,
      },
      rootPageId: parentPageId,
      actorProfileId: args.actorProfileId,
      x: isRoot ? targetRootPosition.x : (placement?.x ?? 0),
      y: isRoot ? targetRootPosition.y : (placement?.y ?? 0),
      width: placement?.width,
      height: placement?.height,
      now: args.now,
    });
  }
  await recordActivity(ctx, {
    startupId: args.page.startupId,
    actorProfileId: args.actorProfileId,
    action: "page_moved",
    targetType: "page",
    targetId: args.page._id,
    title: `„${args.page.title}“ je premešten/a u drugu oblast`,
  });
  return {
    nestingStatus: "none" as const,
    requestId: null,
  };
}

export const movePage = mutation({
  args: {
    startupId: v.id("startups"),
    pageId: v.id("pages"),
    targetAreaId: v.id("startupAreas"),
    targetParentPageId: rootPageIdValidator,
  },
  returns: moveResultValidator,
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      startupId: args.startupId,
    });
    const { profile } = await requireStartupMember(ctx, args.startupId);
    assertOwnedPage(page, profile._id, "Možete premeštati samo svoju stranicu.");
    await requireArea(ctx, args.startupId, args.targetAreaId);
    const targetParent =
      args.targetParentPageId === null
        ? null
        : await requireStrictVisiblePage(ctx, args.targetParentPageId, {
            startupId: args.startupId,
            areaId: args.targetAreaId,
          });
    if (targetParent?._id === page._id) {
      throw new Error("Stranica ne može biti sopstveni roditelj.");
    }
    if (page.areaId === args.targetAreaId) {
      return await moveWithinArea(ctx, {
        child: page,
        targetParent,
        actorProfileId: profile._id,
        now: Date.now(),
      });
    }
    if (targetParent !== null) {
      throw new Error(
        "Premeštanje u drugu oblast je dozvoljeno samo u koren oblasti.",
      );
    }
    return await movePageAcrossAreasWithSidecars(ctx, {
      page,
      targetAreaId: args.targetAreaId,
      actorProfileId: profile._id,
      now: Date.now(),
    });
  },
});
