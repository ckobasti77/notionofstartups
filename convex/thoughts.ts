import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireStartupMember } from "./lib/auth";
import {
  insertWorkspacePage,
  prepareWorkspacePage,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import {
  cleanRequiredText,
  pageKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";

const MAX_NODE_PAGE_SIZE = 100;
const MAX_EDGE_PAGE_SIZE = 200;
const MAX_BULK_ITEMS = 50;
const MAX_CONNECTED_NODES = 200;
const MAX_CONNECTED_EDGES = 1_000;
const MAX_EDGES_IN_NODE_ACTION = 500;
const MAX_THOUGHT_TEXT = 12_000;
const MAX_THOUGHT_TITLE = 200;
const MAX_EDGE_LABEL = 120;

const thoughtColorValidator = v.union(
  v.literal("neutral"),
  v.literal("violet"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("amber"),
  v.literal("rose"),
);

const thoughtCanvasDocumentValidator = v.object({
  _id: v.id("thoughtCanvases"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  ownerProfileId: v.id("profiles"),
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const thoughtNodeDocumentValidator = v.object({
  _id: v.id("thoughtNodes"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  ownerProfileId: v.id("profiles"),
  title: v.union(v.string(), v.null()),
  text: v.string(),
  x: v.number(),
  y: v.number(),
  color: thoughtColorValidator,
  isParent: v.optional(v.boolean()),
  conversionCount: v.number(),
  lastConvertedIdeaId: v.optional(v.id("ideaNodes")),
  lastConvertedPageId: v.union(v.id("pages"), v.null()),
  lastConvertedAt: v.union(v.number(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const thoughtEdgeDocumentValidator = v.object({
  _id: v.id("thoughtEdges"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  ownerProfileId: v.id("profiles"),
  nodeAId: v.id("thoughtNodes"),
  nodeBId: v.id("thoughtNodes"),
  pairKey: v.string(),
  label: v.union(v.string(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
  archivedByNode: v.optional(v.boolean()),
  archivedForNodeIds: v.optional(v.array(v.id("thoughtNodes"))),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type ReadCtx = QueryCtx | MutationCtx;
type ThoughtColor = Doc<"thoughtNodes">["color"];

function validatePageSize(numItems: number, max: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > max) {
    throw new Error(`Po stranici možete učitati najviše ${max} stavki.`);
  }
}

function validateFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} nije ispravan.`);
  return value;
}

function validateZoom(zoom: number) {
  if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 4) {
    throw new Error("Nivo uvećanja mora biti između 0,1 i 4.");
  }
  return zoom;
}

function cleanThoughtText(text: string) {
  const cleaned = text.trim();
  if (cleaned.length === 0) throw new Error("Tekst misli je obavezan.");
  if (cleaned.length > MAX_THOUGHT_TEXT) {
    throw new Error(`Tekst misli može imati najviše ${MAX_THOUGHT_TEXT} znakova.`);
  }
  return cleaned;
}

function cleanNullableText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  if (value === null || value === undefined) return null;
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned.length === 0 ? null : cleaned;
}

function validateUniqueIds<TableName extends "thoughtNodes" | "thoughtEdges">(
  ids: Id<TableName>[],
  label: string,
  max = MAX_BULK_ITEMS,
) {
  if (ids.length < 1 || ids.length > max) {
    throw new Error(`${label} mora sadržati između 1 i ${max} stavki.`);
  }
  if (new Set<string>(ids).size !== ids.length) {
    throw new Error(`${label} ne sme sadržati duplikate.`);
  }
}

async function ensureCanvas(
  ctx: MutationCtx,
  startupId: Id<"startups">,
  ownerProfileId: Id<"profiles">,
) {
  const existing = await ctx.db
    .query("thoughtCanvases")
    .withIndex("by_ownerProfileId_and_startupId", (q) =>
      q.eq("ownerProfileId", ownerProfileId).eq("startupId", startupId),
    )
    .unique();
  if (existing !== null) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("thoughtCanvases", {
    startupId,
    ownerProfileId,
    x: 0,
    y: 0,
    zoom: 1,
    createdAt: now,
    updatedAt: now,
  });
}

async function requireOwnedNodes(
  ctx: ReadCtx,
  nodeIds: Id<"thoughtNodes">[],
  options?: {
    startupId?: Id<"startups">;
    allowArchived?: boolean;
  },
) {
  validateUniqueIds(nodeIds, "Izbor misli");
  const first = await ctx.db.get("thoughtNodes", nodeIds[0]);
  const startupId = options?.startupId ?? first?.startupId;
  if (startupId === undefined) throw new Error("Misao nije pronađena.");
  const { profile } = await requireStartupMember(ctx, startupId);
  const nodes: Doc<"thoughtNodes">[] = [];
  for (const nodeId of nodeIds) {
    const node = nodeId === nodeIds[0] ? first : await ctx.db.get("thoughtNodes", nodeId);
    if (
      node === null ||
      node.startupId !== startupId ||
      node.ownerProfileId !== profile._id ||
      (!options?.allowArchived && node.archivedAt !== null)
    ) {
      throw new Error("Misao nije pronađena.");
    }
    nodes.push(node);
  }
  return { nodes, profile, startupId };
}

async function requireOwnedEdges(
  ctx: ReadCtx,
  edgeIds: Id<"thoughtEdges">[],
  options?: { allowArchived?: boolean },
) {
  validateUniqueIds(edgeIds, "Izbor veza");
  const first = await ctx.db.get("thoughtEdges", edgeIds[0]);
  if (first === null) throw new Error("Veza nije pronađena.");
  const { profile } = await requireStartupMember(ctx, first.startupId);
  const edges: Doc<"thoughtEdges">[] = [];
  for (const edgeId of edgeIds) {
    const edge = edgeId === edgeIds[0] ? first : await ctx.db.get("thoughtEdges", edgeId);
    if (
      edge === null ||
      edge.startupId !== first.startupId ||
      edge.ownerProfileId !== profile._id ||
      (!options?.allowArchived && edge.archivedAt !== null)
    ) {
      throw new Error("Veza nije pronađena.");
    }
    edges.push(edge);
  }
  return { edges, profile, startupId: first.startupId };
}

function normalizedPair(
  firstId: Id<"thoughtNodes">,
  secondId: Id<"thoughtNodes">,
) {
  const [nodeAId, nodeBId] =
    firstId < secondId ? [firstId, secondId] : [secondId, firstId];
  return { nodeAId, nodeBId, pairKey: `${nodeAId}:${nodeBId}` };
}

export const getCanvas = query({
  args: { startupId: v.id("startups") },
  returns: v.union(thoughtCanvasDocumentValidator, v.null()),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    return await ctx.db
      .query("thoughtCanvases")
      .withIndex("by_ownerProfileId_and_startupId", (q) =>
        q
          .eq("ownerProfileId", profile._id)
          .eq("startupId", args.startupId),
      )
      .unique();
  },
});

export const listNodes = query({
  args: {
    startupId: v.id("startups"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(thoughtNodeDocumentValidator),
  handler: async (ctx, args) => {
    validatePageSize(args.paginationOpts.numItems, MAX_NODE_PAGE_SIZE);
    const { profile } = await requireStartupMember(ctx, args.startupId);
    return await ctx.db
      .query("thoughtNodes")
      .withIndex(
        "by_ownerProfileId_and_startupId_and_archivedAt_and_updatedAt",
        (q) =>
          q
            .eq("ownerProfileId", profile._id)
            .eq("startupId", args.startupId)
            .eq("archivedAt", null),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const listEdges = query({
  args: {
    startupId: v.id("startups"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(thoughtEdgeDocumentValidator),
  handler: async (ctx, args) => {
    validatePageSize(args.paginationOpts.numItems, MAX_EDGE_PAGE_SIZE);
    const { profile } = await requireStartupMember(ctx, args.startupId);
    return await ctx.db
      .query("thoughtEdges")
      .withIndex(
        "by_ownerProfileId_and_startupId_and_archivedAt_and_updatedAt",
        (q) =>
          q
            .eq("ownerProfileId", profile._id)
            .eq("startupId", args.startupId)
            .eq("archivedAt", null),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const saveViewport = mutation({
  args: {
    startupId: v.id("startups"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  returns: v.id("thoughtCanvases"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const x = validateFinite(args.x, "Horizontalna pozicija kanvasa");
    const y = validateFinite(args.y, "Vertikalna pozicija kanvasa");
    const zoom = validateZoom(args.zoom);
    const existing = await ctx.db
      .query("thoughtCanvases")
      .withIndex("by_ownerProfileId_and_startupId", (q) =>
        q
          .eq("ownerProfileId", profile._id)
          .eq("startupId", args.startupId),
      )
      .unique();
    const now = Date.now();
    if (existing !== null) {
      await ctx.db.patch("thoughtCanvases", existing._id, {
        x,
        y,
        zoom,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("thoughtCanvases", {
      startupId: args.startupId,
      ownerProfileId: profile._id,
      x,
      y,
      zoom,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createNode = mutation({
  args: {
    startupId: v.id("startups"),
    title: v.optional(v.string()),
    text: v.string(),
    x: v.number(),
    y: v.number(),
    color: thoughtColorValidator,
    isParent: v.optional(v.boolean()),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const title = cleanNullableText(
      args.title,
      "Naslov misli",
      MAX_THOUGHT_TITLE,
    );
    const text = cleanThoughtText(args.text);
    const x = validateFinite(args.x, "Horizontalna pozicija misli");
    const y = validateFinite(args.y, "Vertikalna pozicija misli");
    await ensureCanvas(ctx, args.startupId, profile._id);
    const now = Date.now();
    return await ctx.db.insert("thoughtNodes", {
      startupId: args.startupId,
      ownerProfileId: profile._id,
      title,
      text,
      x,
      y,
      color: args.color,
      isParent: args.isParent ?? false,
      conversionCount: 0,
      lastConvertedPageId: null,
      lastConvertedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNode = mutation({
  args: {
    nodeId: v.id("thoughtNodes"),
    title: v.optional(v.union(v.string(), v.null())),
    text: v.optional(v.string()),
    color: v.optional(thoughtColorValidator),
    isParent: v.optional(v.boolean()),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [args.nodeId]);
    const node = nodes[0];
    const title =
      args.title === undefined
        ? node.title
        : cleanNullableText(args.title, "Naslov misli", MAX_THOUGHT_TITLE);
    const text =
      args.text === undefined ? node.text : cleanThoughtText(args.text);
    const color: ThoughtColor = args.color ?? node.color;
    const isParent = args.isParent === undefined ? node.isParent : args.isParent;
    if (
      title === node.title &&
      text === node.text &&
      color === node.color &&
      isParent === node.isParent
    ) {
      return node._id;
    }
    await ctx.db.patch("thoughtNodes", node._id, {
      title,
      text,
      color,
      isParent,
      updatedAt: Date.now(),
    });
    return node._id;
  },
});

export const toggleNodeParent = mutation({
  args: {
    nodeId: v.id("thoughtNodes"),
    isParent: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [args.nodeId]);
    const node = nodes[0];
    const nextState = args.isParent ?? !node.isParent;
    await ctx.db.patch("thoughtNodes", node._id, {
      isParent: nextState,
      updatedAt: Date.now(),
    });
    return nextState;
  },
});

export const moveNodes = mutation({
  args: {
    moves: v.array(
      v.object({
        nodeId: v.id("thoughtNodes"),
        x: v.number(),
        y: v.number(),
      }),
    ),
  },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const nodeIds = args.moves.map((move) => move.nodeId);
    validateUniqueIds(nodeIds, "Izbor misli");
    const { nodes } = await requireOwnedNodes(ctx, nodeIds);
    const coordinates = args.moves.map((move) => ({
      x: validateFinite(move.x, "Horizontalna pozicija misli"),
      y: validateFinite(move.y, "Vertikalna pozicija misli"),
    }));
    const now = Date.now();
    for (let index = 0; index < nodes.length; index += 1) {
      await ctx.db.patch("thoughtNodes", nodes[index]._id, {
        ...coordinates[index],
        updatedAt: now,
      });
    }
    return nodeIds;
  },
});

export const duplicateNodes = mutation({
  args: {
    nodeIds: v.array(v.id("thoughtNodes")),
    offsetX: v.number(),
    offsetY: v.number(),
  },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const { nodes, profile, startupId } = await requireOwnedNodes(
      ctx,
      args.nodeIds,
    );
    const offsetX = validateFinite(args.offsetX, "Horizontalni pomeraj");
    const offsetY = validateFinite(args.offsetY, "Vertikalni pomeraj");
    for (const node of nodes) {
      validateFinite(node.x + offsetX, "Horizontalna pozicija misli");
      validateFinite(node.y + offsetY, "Vertikalna pozicija misli");
    }
    await ensureCanvas(ctx, startupId, profile._id);
    const now = Date.now();
    const ids: Id<"thoughtNodes">[] = [];
    for (const node of nodes) {
      ids.push(
        await ctx.db.insert("thoughtNodes", {
          startupId,
          ownerProfileId: profile._id,
          title: node.title,
          text: node.text,
          x: node.x + offsetX,
          y: node.y + offsetY,
          color: node.color,
          conversionCount: 0,
          lastConvertedPageId: null,
          lastConvertedAt: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return ids;
  },
});

async function collectEdgesTouchingNodes(
  ctx: ReadCtx,
  ownerProfileId: Id<"profiles">,
  startupId: Id<"startups">,
  nodeIds: Id<"thoughtNodes">[],
  options: { includeActive: boolean; includeNodeArchived: boolean },
) {
  const edges = new Map<Id<"thoughtEdges">, Doc<"thoughtEdges">>();
  const addEdges = (candidates: Doc<"thoughtEdges">[], allowance: number) => {
    if (candidates.length > allowance) {
      throw new Error(
        `Izabrane misli imaju više od ${MAX_EDGES_IN_NODE_ACTION} veza. Prvo arhivirajte deo veza.`,
      );
    }
    for (const edge of candidates) edges.set(edge._id, edge);
  };

  for (const nodeId of nodeIds) {
    if (options.includeActive) {
      const knownOutgoing = [...edges.values()].filter(
        (edge) => edge.nodeAId === nodeId,
      ).length;
      const outgoingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownOutgoing;
      const outgoing = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_startupId_and_nodeAId_and_archivedAt",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("startupId", startupId)
              .eq("nodeAId", nodeId)
              .eq("archivedAt", null),
        )
        .take(Math.max(1, outgoingAllowance + 1));
      addEdges(outgoing, outgoingAllowance);

      const knownIncoming = [...edges.values()].filter(
        (edge) => edge.nodeBId === nodeId,
      ).length;
      const incomingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownIncoming;
      const incoming = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_startupId_and_nodeBId_and_archivedAt",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("startupId", startupId)
              .eq("nodeBId", nodeId)
              .eq("archivedAt", null),
        )
        .take(Math.max(1, incomingAllowance + 1));
      addEdges(incoming, incomingAllowance);
    }

    if (options.includeNodeArchived) {
      const knownOutgoing = [...edges.values()].filter(
        (edge) => edge.nodeAId === nodeId,
      ).length;
      const outgoingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownOutgoing;
      const outgoing = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_startupId_and_nodeAId_and_archivedByNode",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("startupId", startupId)
              .eq("nodeAId", nodeId)
              .eq("archivedByNode", true),
        )
        .take(Math.max(1, outgoingAllowance + 1));
      addEdges(outgoing, outgoingAllowance);

      const knownIncoming = [...edges.values()].filter(
        (edge) => edge.nodeBId === nodeId,
      ).length;
      const incomingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownIncoming;
      const incoming = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_startupId_and_nodeBId_and_archivedByNode",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("startupId", startupId)
              .eq("nodeBId", nodeId)
              .eq("archivedByNode", true),
        )
        .take(Math.max(1, incomingAllowance + 1));
      addEdges(incoming, incomingAllowance);
    }
  }
  return [...edges.values()];
}

export const getConnectedGroup = query({
  args: {
    startupId: v.id("startups"),
    nodeId: v.id("thoughtNodes"),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    nodes: v.array(thoughtNodeDocumentValidator),
    edges: v.array(thoughtEdgeDocumentValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? MAX_CONNECTED_NODES;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CONNECTED_NODES) {
      throw new Error(
        `Povezana grupa može imati najviše ${MAX_CONNECTED_NODES} misli.`,
      );
    }
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const start = await ctx.db.get("thoughtNodes", args.nodeId);
    if (
      start === null ||
      start.startupId !== args.startupId ||
      start.ownerProfileId !== profile._id ||
      start.archivedAt !== null
    ) {
      throw new Error("Misao nije pronađena.");
    }

    const nodes = new Map<Id<"thoughtNodes">, Doc<"thoughtNodes">>([
      [start._id, start],
    ]);
    const edges = new Map<Id<"thoughtEdges">, Doc<"thoughtEdges">>();
    const queue: Id<"thoughtNodes">[] = [start._id];
    let truncated = false;

    for (let index = 0; index < queue.length && !truncated; index += 1) {
      const nodeId = queue[index];
      const knownOutgoing = [...edges.values()].filter(
        (edge) => edge.nodeAId === nodeId,
      ).length;
      const outgoingAllowance =
        MAX_CONNECTED_EDGES - edges.size + knownOutgoing;
      const outgoing = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_startupId_and_nodeAId_and_archivedAt",
          (q) =>
            q
              .eq("ownerProfileId", profile._id)
              .eq("startupId", args.startupId)
              .eq("nodeAId", nodeId)
              .eq("archivedAt", null),
        )
        .take(Math.max(1, outgoingAllowance + 1));
      if (outgoing.length > outgoingAllowance) truncated = true;
      for (const edge of outgoing.slice(0, Math.max(0, outgoingAllowance))) {
        edges.set(edge._id, edge);
      }

      if (!truncated) {
        const knownIncoming = [...edges.values()].filter(
          (edge) => edge.nodeBId === nodeId,
        ).length;
        const incomingAllowance =
          MAX_CONNECTED_EDGES - edges.size + knownIncoming;
        const incoming = await ctx.db
          .query("thoughtEdges")
          .withIndex(
            "by_ownerProfileId_and_startupId_and_nodeBId_and_archivedAt",
            (q) =>
              q
                .eq("ownerProfileId", profile._id)
                .eq("startupId", args.startupId)
                .eq("nodeBId", nodeId)
                .eq("archivedAt", null),
          )
          .take(Math.max(1, incomingAllowance + 1));
        if (incoming.length > incomingAllowance) truncated = true;
        for (const edge of incoming.slice(0, Math.max(0, incomingAllowance))) {
          edges.set(edge._id, edge);
        }
      }

      for (const edge of edges.values()) {
        if (edge.nodeAId !== nodeId && edge.nodeBId !== nodeId) continue;
        const neighbourId =
          edge.nodeAId === nodeId ? edge.nodeBId : edge.nodeAId;
        if (nodes.has(neighbourId)) continue;
        if (nodes.size >= limit) {
          truncated = true;
          break;
        }
        const neighbour = await ctx.db.get("thoughtNodes", neighbourId);
        if (
          neighbour !== null &&
          neighbour.startupId === args.startupId &&
          neighbour.ownerProfileId === profile._id &&
          neighbour.archivedAt === null
        ) {
          nodes.set(neighbour._id, neighbour);
          queue.push(neighbour._id);
        }
      }
    }

    const includedIds = new Set(nodes.keys());
    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()].filter(
        (edge) =>
          includedIds.has(edge.nodeAId) && includedIds.has(edge.nodeBId),
      ),
      truncated,
    };
  },
});

export const archiveNodes = mutation({
  args: { nodeIds: v.array(v.id("thoughtNodes")) },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const { nodes, profile, startupId } = await requireOwnedNodes(
      ctx,
      args.nodeIds,
      { allowArchived: true },
    );
    const edges = await collectEdgesTouchingNodes(
      ctx,
      profile._id,
      startupId,
      args.nodeIds,
      { includeActive: true, includeNodeArchived: true },
    );
    const selectedNodeIds = new Set<Id<"thoughtNodes">>(args.nodeIds);
    const now = Date.now();
    for (const node of nodes) {
      if (node.archivedAt === null) {
        await ctx.db.patch("thoughtNodes", node._id, {
          archivedAt: now,
          updatedAt: now,
        });
      }
    }
    for (const edge of edges) {
      const archivedForNodeIds = new Set<Id<"thoughtNodes">>(
        edge.archivedByNode ? edge.archivedForNodeIds ?? [] : [],
      );
      if (selectedNodeIds.has(edge.nodeAId)) archivedForNodeIds.add(edge.nodeAId);
      if (selectedNodeIds.has(edge.nodeBId)) archivedForNodeIds.add(edge.nodeBId);
      await ctx.db.patch("thoughtEdges", edge._id, {
        archivedAt: edge.archivedAt ?? now,
        archivedByNode: true,
        archivedForNodeIds: [...archivedForNodeIds],
        updatedAt: now,
      });
    }
    return args.nodeIds;
  },
});

export const restoreNodes = mutation({
  args: { nodeIds: v.array(v.id("thoughtNodes")) },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const { nodes, profile, startupId } = await requireOwnedNodes(
      ctx,
      args.nodeIds,
      { allowArchived: true },
    );
    const edges = await collectEdgesTouchingNodes(
      ctx,
      profile._id,
      startupId,
      args.nodeIds,
      { includeActive: false, includeNodeArchived: true },
    );
    const restoring = new Set<Id<"thoughtNodes">>(args.nodeIds);
    const nodeCache = new Map<Id<"thoughtNodes">, Doc<"thoughtNodes">>(
      nodes.map((node) => [node._id, node]),
    );
    const edgeUpdates: Array<{
      edge: Doc<"thoughtEdges">;
      archivedForNodeIds: Id<"thoughtNodes">[];
      restore: boolean;
    }> = [];
    for (const edge of edges) {
      let nodeA = nodeCache.get(edge.nodeAId);
      if (nodeA === undefined) {
        nodeA = (await ctx.db.get("thoughtNodes", edge.nodeAId)) ?? undefined;
        if (nodeA !== undefined) nodeCache.set(nodeA._id, nodeA);
      }
      let nodeB = nodeCache.get(edge.nodeBId);
      if (nodeB === undefined) {
        nodeB = (await ctx.db.get("thoughtNodes", edge.nodeBId)) ?? undefined;
        if (nodeB !== undefined) nodeCache.set(nodeB._id, nodeB);
      }
      if (
        nodeA === undefined ||
        nodeB === undefined ||
        nodeA.startupId !== startupId ||
        nodeB.startupId !== startupId ||
        nodeA.ownerProfileId !== profile._id ||
        nodeB.ownerProfileId !== profile._id
      ) {
        throw new Error("Veza upućuje na nepostojeću privatnu misao.");
      }
      const nodeAActive = nodeA.archivedAt === null || restoring.has(nodeA._id);
      const nodeBActive = nodeB.archivedAt === null || restoring.has(nodeB._id);
      const archivedForNodeIds = (edge.archivedForNodeIds ?? []).filter(
        (nodeId) => !restoring.has(nodeId),
      );
      edgeUpdates.push({
        edge,
        archivedForNodeIds,
        restore:
          edge.archivedAt !== null &&
          archivedForNodeIds.length === 0 &&
          nodeAActive &&
          nodeBActive,
      });
    }

    const now = Date.now();
    for (const node of nodes) {
      if (node.archivedAt !== null) {
        await ctx.db.patch("thoughtNodes", node._id, {
          archivedAt: null,
          updatedAt: now,
        });
      }
    }
    for (const update of edgeUpdates) {
      await ctx.db.patch(
        "thoughtEdges",
        update.edge._id,
        update.restore
          ? {
              archivedAt: null,
              archivedByNode: false,
              archivedForNodeIds: [],
              updatedAt: now,
            }
          : {
              archivedByNode: true,
              archivedForNodeIds: update.archivedForNodeIds,
              updatedAt: now,
            },
      );
    }
    return args.nodeIds;
  },
});

export const createEdge = mutation({
  args: {
    startupId: v.id("startups"),
    nodeAId: v.id("thoughtNodes"),
    nodeBId: v.id("thoughtNodes"),
    label: v.optional(v.string()),
  },
  returns: v.id("thoughtEdges"),
  handler: async (ctx, args) => {
    if (args.nodeAId === args.nodeBId) {
      throw new Error("Misao ne može biti povezana sama sa sobom.");
    }
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireOwnedNodes(ctx, [args.nodeAId, args.nodeBId], {
      startupId: args.startupId,
    });
    const pair = normalizedPair(args.nodeAId, args.nodeBId);
    const label = cleanNullableText(args.label, "Naziv veze", MAX_EDGE_LABEL);
    const existing = await ctx.db
      .query("thoughtEdges")
      .withIndex("by_ownerProfileId_and_startupId_and_pairKey", (q) =>
        q
          .eq("ownerProfileId", profile._id)
          .eq("startupId", args.startupId)
          .eq("pairKey", pair.pairKey),
      )
      .unique();
    const now = Date.now();
    if (existing !== null) {
      if (existing.archivedAt === null) throw new Error("Veza već postoji.");
      await ctx.db.patch("thoughtEdges", existing._id, {
        ...pair,
        label,
        archivedAt: null,
        archivedByNode: false,
        archivedForNodeIds: [],
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("thoughtEdges", {
      startupId: args.startupId,
      ownerProfileId: profile._id,
      ...pair,
      label,
      archivedAt: null,
      archivedByNode: false,
      archivedForNodeIds: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEdge = mutation({
  args: {
    edgeId: v.id("thoughtEdges"),
    nodeAId: v.optional(v.id("thoughtNodes")),
    nodeBId: v.optional(v.id("thoughtNodes")),
    label: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("thoughtEdges"),
  handler: async (ctx, args) => {
    const { edges } = await requireOwnedEdges(ctx, [args.edgeId]);
    const edge = edges[0];
    const nodeAId = args.nodeAId ?? edge.nodeAId;
    const nodeBId = args.nodeBId ?? edge.nodeBId;
    if (nodeAId === nodeBId) {
      throw new Error("Misao ne može biti povezana sama sa sobom.");
    }
    if (args.nodeAId !== undefined || args.nodeBId !== undefined) {
      await requireOwnedNodes(ctx, [nodeAId, nodeBId], {
        startupId: edge.startupId,
      });
    }
    const pair = normalizedPair(nodeAId, nodeBId);
    const label =
      args.label === undefined
        ? edge.label
        : cleanNullableText(args.label, "Naziv veze", MAX_EDGE_LABEL);
    await ctx.db.patch("thoughtEdges", edge._id, {
      ...pair,
      label,
      updatedAt: Date.now(),
    });
    return edge._id;
  },
});

export const archiveEdges = mutation({
  args: { edgeIds: v.array(v.id("thoughtEdges")) },
  returns: v.array(v.id("thoughtEdges")),
  handler: async (ctx, args) => {
    const { edges } = await requireOwnedEdges(ctx, args.edgeIds, {
      allowArchived: true,
    });
    const now = Date.now();
    for (const edge of edges) {
      if (edge.archivedAt === null || edge.archivedByNode === true) {
        await ctx.db.patch("thoughtEdges", edge._id, {
          archivedAt: edge.archivedAt ?? now,
          archivedByNode: false,
          archivedForNodeIds: [],
          updatedAt: now,
        });
      }
    }
    return args.edgeIds;
  },
});

export const restoreEdges = mutation({
  args: { edgeIds: v.array(v.id("thoughtEdges")) },
  returns: v.array(v.id("thoughtEdges")),
  handler: async (ctx, args) => {
    const { edges, profile, startupId } = await requireOwnedEdges(
      ctx,
      args.edgeIds,
      { allowArchived: true },
    );
    for (const edge of edges) {
      const [nodeA, nodeB] = await Promise.all([
        ctx.db.get("thoughtNodes", edge.nodeAId),
        ctx.db.get("thoughtNodes", edge.nodeBId),
      ]);
      if (
        nodeA === null ||
        nodeB === null ||
        nodeA.startupId !== startupId ||
        nodeB.startupId !== startupId ||
        nodeA.ownerProfileId !== profile._id ||
        nodeB.ownerProfileId !== profile._id ||
        nodeA.archivedAt !== null ||
        nodeB.archivedAt !== null
      ) {
        throw new Error("Obe misli moraju biti aktivne pre vraćanja veze.");
      }
    }
    const now = Date.now();
    for (const edge of edges) {
      if (edge.archivedAt !== null) {
        await ctx.db.patch("thoughtEdges", edge._id, {
          archivedAt: null,
          archivedByNode: false,
          archivedForNodeIds: [],
          updatedAt: now,
        });
      }
    }
    return args.edgeIds;
  },
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function thoughtTextHtml(text: string) {
  return text
    .split(/\n{2,}/u)
    .map(
      (paragraph) =>
        `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
}

function defaultThoughtTitle(node: Doc<"thoughtNodes">) {
  if (node.title !== null) return node.title;
  const firstLine = node.text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return cleanRequiredText(
    (firstLine ?? "Nova misao").slice(0, MAX_THOUGHT_TITLE),
    "Naslov",
    MAX_THOUGHT_TITLE,
  );
}

function combinedNoteHtml(nodes: Doc<"thoughtNodes">[]) {
  const parent = nodes.find((n) => n.isParent);
  if (parent && nodes.length > 1) {
    const children = nodes.filter((n) => n._id !== parent._id);
    const parentTitle = defaultThoughtTitle(parent);
    const parentHeader = `<h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 0.5rem;">${escapeHtml(parentTitle)}</h2>${thoughtTextHtml(parent.text)}`;
    const childrenList = `<ul style="margin-top: 1rem; list-style-type: disc; padding-left: 1.5rem;">${children
      .map(
        (child) =>
          `<li><strong>${escapeHtml(defaultThoughtTitle(child))}</strong>: ${escapeHtml(child.text).replaceAll("\n", "<br>")}</li>`,
      )
      .join("")}</ul>`;
    return parentHeader + childrenList;
  }
  return nodes
    .map(
      (node) =>
        `<h2>${escapeHtml(defaultThoughtTitle(node))}</h2>${thoughtTextHtml(node.text)}`,
    )
    .join("");
}

function combinedTaskHtml(nodes: Doc<"thoughtNodes">[]) {
  const parent = nodes.find((n) => n.isParent);
  if (parent && nodes.length > 1) {
    const children = nodes.filter((n) => n._id !== parent._id);
    const items = children
      .map(
        (node) =>
          `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${escapeHtml(node.text).replaceAll("\n", "<br>")}</p></div></li>`,
      )
      .join("");
    return `<p><strong>${escapeHtml(defaultThoughtTitle(parent))}</strong>: ${escapeHtml(parent.text).replaceAll("\n", "<br>")}</p><ul data-type="taskList">${items}</ul>`;
  }
  const items = nodes
    .map(
      (node) =>
        `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${escapeHtml(node.text).replaceAll("\n", "<br>")}</p></div></li>`,
    )
    .join("");
  return `<ul data-type="taskList">${items}</ul>`;
}

export const convertToIdeas = mutation({
  args: {
    startupId: v.id("startups"),
    nodeIds: v.array(v.id("thoughtNodes")),
  },
  returns: v.object({
    ideaIds: v.array(v.id("ideaNodes")),
    createdEdgeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const { nodes, profile } = await requireOwnedNodes(ctx, args.nodeIds, {
      startupId: args.startupId,
    });
    const sortedNodes = [...nodes].sort(
      (first, second) =>
        first.y - second.y ||
        first.x - second.x ||
        first._id.localeCompare(second._id),
    );
    const selectedNodeIds = new Set<string>(args.nodeIds);
    const sourceEdges = new Map<Id<"thoughtEdges">, Doc<"thoughtEdges">>();

    for (const node of sortedNodes) {
      const [edgesFromA, edgesFromB] = await Promise.all([
        ctx.db
          .query("thoughtEdges")
          .withIndex(
            "by_ownerProfileId_and_startupId_and_nodeAId_and_archivedAt",
            (q) =>
              q
                .eq("ownerProfileId", profile._id)
                .eq("startupId", args.startupId)
                .eq("nodeAId", node._id)
                .eq("archivedAt", null),
          )
          .collect(),
        ctx.db
          .query("thoughtEdges")
          .withIndex(
            "by_ownerProfileId_and_startupId_and_nodeBId_and_archivedAt",
            (q) =>
              q
                .eq("ownerProfileId", profile._id)
                .eq("startupId", args.startupId)
                .eq("nodeBId", node._id)
                .eq("archivedAt", null),
          )
          .collect(),
      ]);

      for (const edge of [...edgesFromA, ...edgesFromB]) {
        if (
          selectedNodeIds.has(edge.nodeAId) &&
          selectedNodeIds.has(edge.nodeBId)
        ) {
          sourceEdges.set(edge._id, edge);
        }
      }
    }

    const now = Date.now();
    const ideaIdByThoughtId = new Map<
      Id<"thoughtNodes">,
      Id<"ideaNodes">
    >();
    const ideaIds: Id<"ideaNodes">[] = [];

    for (const node of sortedNodes) {
      const ideaId = await ctx.db.insert("ideaNodes", {
        startupId: args.startupId,
        authorProfileId: profile._id,
        title: node.title,
        text: node.text,
        x: node.x,
        y: node.y,
        color: node.color,
        isParent: node.isParent ?? false,
        convertedPageId: null,
        convertedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("ideaVotes", {
        startupId: args.startupId,
        ideaId,
        profileId: profile._id,
        voteType: "up",
        createdAt: now,
      });
      ideaIdByThoughtId.set(node._id, ideaId);
      ideaIds.push(ideaId);
    }

    let createdEdgeCount = 0;
    for (const edge of sourceEdges.values()) {
      const firstIdeaId = ideaIdByThoughtId.get(edge.nodeAId);
      const secondIdeaId = ideaIdByThoughtId.get(edge.nodeBId);
      if (firstIdeaId === undefined || secondIdeaId === undefined) continue;
      const [nodeAId, nodeBId] =
        firstIdeaId < secondIdeaId
          ? [firstIdeaId, secondIdeaId]
          : [secondIdeaId, firstIdeaId];
      await ctx.db.insert("ideaEdges", {
        startupId: args.startupId,
        authorProfileId: profile._id,
        nodeAId,
        nodeBId,
        pairKey: `${nodeAId}:${nodeBId}`,
        label: edge.label,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      createdEdgeCount += 1;
    }

    for (const node of nodes) {
      const ideaId = ideaIdByThoughtId.get(node._id);
      if (ideaId === undefined) {
        throw new Error("Konverzija nije povezala svaku misao sa idejom.");
      }
      await ctx.db.patch("thoughtNodes", node._id, {
        conversionCount: node.conversionCount + 1,
        lastConvertedIdeaId: ideaId,
        lastConvertedAt: now,
        updatedAt: now,
      });
    }

    return { ideaIds, createdEdgeCount };
  },
});

export const convertToPages = mutation({
  args: {
    startupId: v.id("startups"),
    nodeIds: v.array(v.id("thoughtNodes")),
    targetAreaId: v.id("startupAreas"),
    targetParentPageId: v.union(v.id("pages"), v.null()),
    layoutMode: v.union(v.literal("combined"), v.literal("separate")),
    pageKind: pageKindValidator,
    combinedTitle: v.optional(v.string()),
    titleOverrides: v.optional(
      v.array(
        v.object({
          nodeId: v.id("thoughtNodes"),
          title: v.string(),
        }),
      ),
    ),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    dueDate: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.object({ pageIds: v.array(v.id("pages")) }),
  handler: async (ctx, args) => {
    const { nodes, profile } = await requireOwnedNodes(ctx, args.nodeIds, {
      startupId: args.startupId,
    });
    if (args.nodeIds.length > 0) {
      throw new Error(
        "Misli se prvo šalju u Ideje. Zadatak ili belešku zatim kreirajte iz odobrene ideje.",
      );
    }

    if (args.layoutMode === "combined" && (args.titleOverrides?.length ?? 0) > 0) {
      throw new Error("Pojedinačni naslovi se koriste samo za odvojene stranice.");
    }
    if (
      args.layoutMode === "separate" &&
      args.combinedTitle !== undefined &&
      args.combinedTitle.trim().length > 0
    ) {
      throw new Error("Zajednički naslov se koristi samo za spojenu stranicu.");
    }

    const selectedIds = new Set<Id<"thoughtNodes">>(args.nodeIds);
    const titleOverrides = new Map<Id<"thoughtNodes">, string>();
    if ((args.titleOverrides?.length ?? 0) > MAX_BULK_ITEMS) {
      throw new Error(
        `Možete zadati najviše ${MAX_BULK_ITEMS} pojedinačnih naslova.`,
      );
    }
    for (const override of args.titleOverrides ?? []) {
      if (!selectedIds.has(override.nodeId)) {
        throw new Error("Naslov je zadat za misao koja nije izabrana.");
      }
      if (titleOverrides.has(override.nodeId)) {
        throw new Error("Naslov iste misli je zadat više puta.");
      }
      titleOverrides.set(
        override.nodeId,
        cleanRequiredText(override.title, "Naslov", MAX_THOUGHT_TITLE),
      );
    }

    const sortedNodes = [...nodes].sort(
      (first, second) =>
        first.y - second.y ||
        first.x - second.x ||
        first._id.localeCompare(second._id),
    );

    const now = Date.now();
    const parentNode = sortedNodes.find((n) => n.isParent);
    const childNodes = parentNode
      ? sortedNodes.filter((n) => n._id !== parentNode._id)
      : [];

    const checkpoints =
      args.pageKind === "task" && parentNode && childNodes.length > 0
        ? childNodes.map((child, idx) => ({
            id: `cp-${now}-${idx}`,
            text: child.title ? `${child.title}: ${child.text}` : child.text,
            completed: false,
          }))
        : undefined;

    const instructions =
      args.pageKind === "task" && parentNode ? parentNode.text : undefined;

    const target = await validateWorkspacePageTarget(ctx, {
      startupId: args.startupId,
      areaId: args.targetAreaId,
      parentPageId: args.targetParentPageId,
      kind: args.pageKind,
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileId: args.assigneeProfileId,
      dueDate: args.dueDate,
      instructions,
      checkpoints,
    });
    const pageInputs =
      args.layoutMode === "combined"
        ? [
            {
              nodes: sortedNodes,
              title: cleanRequiredText(
                (args.combinedTitle?.trim().length ?? 0) > 0
                  ? args.combinedTitle!
                  : parentNode
                    ? defaultThoughtTitle(parentNode)
                    : sortedNodes.length === 1
                      ? defaultThoughtTitle(sortedNodes[0])
                      : "Misli za radni prostor",
                "Naslov",
                MAX_THOUGHT_TITLE,
              ),
              content:
                args.pageKind === "task"
                  ? combinedTaskHtml(sortedNodes)
                  : combinedNoteHtml(sortedNodes),
              position: now,
            },
          ]
        : sortedNodes.map((node, index) => ({
            nodes: [node],
            title: titleOverrides.get(node._id) ?? defaultThoughtTitle(node),
            content: thoughtTextHtml(node.text),
            // List children are ordered descending, so the first visual thought
            // receives the largest position and remains first in the sidebar.
            position: now + (sortedNodes.length - index) / 1_000,
          }));

    // Prepare every page before the first write. This keeps validation failures
    // ahead of page, body, activity, and source-marker changes.
    const preparedPages = pageInputs.map((input) => ({
      ...input,
      page: prepareWorkspacePage(target, {
        title: input.title,
        content: input.content,
        position: input.position,
        now,
      }),
    }));

    const pageIds: Id<"pages">[] = [];
    const convertedPageByNode = new Map<Id<"thoughtNodes">, Id<"pages">>();
    for (const prepared of preparedPages) {
      const pageId = await insertWorkspacePage(ctx, {
        target,
        page: prepared.page,
        actorProfileId: profile._id,
        now,
      });
      pageIds.push(pageId);
      for (const node of prepared.nodes) {
        convertedPageByNode.set(node._id, pageId);
      }
    }
    for (const node of nodes) {
      const pageId = convertedPageByNode.get(node._id);
      if (pageId === undefined) {
        throw new Error("Konverzija nije povezala svaku misao sa stranicom.");
      }
      await ctx.db.patch("thoughtNodes", node._id, {
        conversionCount: node.conversionCount + 1,
        lastConvertedPageId: pageId,
        lastConvertedAt: now,
        updatedAt: now,
      });
    }
    return { pageIds };
  },
});
