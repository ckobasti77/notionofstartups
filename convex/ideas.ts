import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { findAvailableCanvasPosition } from "./canvasPlacement";
import { recordActivity } from "./lib/activity";
import { requireStartupMember } from "./lib/auth";
import {
  contributionTargetKey,
  detachIdeaChildren,
  insertContribution,
} from "./lib/collaboration";
import { createNotification, notificationCopy } from "./lib/notifications";
import {
  prepareWorkspacePage,
  validateWorkspacePageTarget,
  workspaceCanvasPreview,
} from "./lib/page_creation";
import { pageSearchText } from "./lib/pages";
import {
  cleanRequiredText,
  pageKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";

const ideaColorValidator = v.union(
  v.literal("neutral"),
  v.literal("violet"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("amber"),
  v.literal("rose"),
);

const MAX_IDEA_TITLE = 200;
const MAX_IDEA_TEXT = 12_000;
const MAX_EDGE_LABEL = 120;
const MIN_IDEA_WIDTH = 264;
const MAX_IDEA_WIDTH = 720;
const MIN_IDEA_HEIGHT = 196;
const MAX_IDEA_HEIGHT = 1_000;
const MAX_AREA_CANVAS_PAGES = 200;
const MAX_IDEA_VOTES = 5_000;

function cleanOptionalText(
  value: string | null,
  label: string,
  maxLength: number,
) {
  const cleaned = value?.trim() ?? "";
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

function finiteWithin(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} mora biti između ${minimum} i ${maximum}.`);
  }
  return value;
}

export const list = query({
  args: { startupId: v.id("startups") },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    
    // Fetch active idea nodes
    const nodes = await ctx.db
      .query("ideaNodes")
      .withIndex("by_startupId_and_archivedAt_and_updatedAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null)
      )
      .take(500);

    // Fetch active edges
    const edges = await ctx.db
      .query("ideaEdges")
      .withIndex("by_startupId_and_archivedAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null)
      )
      .take(1_000);

    // Fetch all votes for startup
    const votes = await ctx.db
      .query("ideaVotes")
      .withIndex("by_startupId", (q) => q.eq("startupId", args.startupId))
      .take(5_000);

    const pendingDeletionRequests = await ctx.db
      .query("deletionRequests")
      .withIndex("by_startupId_and_status_and_createdAt", (q) =>
        q.eq("startupId", args.startupId).eq("status", "pending"),
      )
      .take(500);
    const pendingDeletionByIdeaId = new Map(
      pendingDeletionRequests
        .filter((request) => request.targetKind === "idea")
        .map((request) => [request.targetId, request]),
    );
    const [pendingNesting, rejectedNestingByRequester, rejectedNestingByParent] =
      await Promise.all([
        ctx.db
          .query("nestingRequests")
          .withIndex("by_startupId_and_status_and_updatedAt", (q) =>
            q.eq("startupId", args.startupId).eq("status", "pending"),
          )
          .order("desc")
          .take(500),
        ctx.db
          .query("nestingRequests")
          .withIndex("by_requesterProfileId_and_status_and_createdAt", (q) =>
            q.eq("requesterProfileId", profile._id).eq("status", "rejected"),
          )
          .order("desc")
          .take(500),
        ctx.db
          .query("nestingRequests")
          .withIndex("by_parentAuthorProfileId_and_status_and_createdAt", (q) =>
            q.eq("parentAuthorProfileId", profile._id).eq("status", "rejected"),
          )
          .order("desc")
          .take(500),
      ]);
    const visibleNestingByChildId = new Map<
      Id<"ideaNodes">,
      (typeof pendingNesting)[number]
    >();
    for (const request of [
      ...pendingNesting,
      ...rejectedNestingByRequester,
      ...rejectedNestingByParent,
    ]) {
      if (request.startupId !== args.startupId) continue;
      const current = visibleNestingByChildId.get(request.childIdeaId);
      if (current === undefined || current.updatedAt < request.updatedAt) {
        visibleNestingByChildId.set(request.childIdeaId, request);
      }
    }
    const baseNodesById = new Map(nodes.map((node) => [node._id, node]));
    const absolutePosition = (nodeId: Id<"ideaNodes">) => {
      let node = baseNodesById.get(nodeId);
      let x = 0;
      let y = 0;
      const seen = new Set<string>();
      for (let depth = 0; node !== undefined && depth < 512; depth += 1) {
        if (seen.has(node._id)) break;
        seen.add(node._id);
        x += node.x;
        y += node.y;
        node =
          node.parentIdeaId === undefined
            ? undefined
            : baseNodesById.get(node.parentIdeaId);
      }
      return { x, y };
    };

    // Map profiles for author info
    const profileIds = new Set<Id<"profiles">>();
    nodes.forEach((n) => profileIds.add(n.authorProfileId));
    votes.forEach((v) => profileIds.add(v.profileId));

    const profilesMap = new Map();
    for (const pid of Array.from(profileIds)) {
      const p = await ctx.db.get(pid);
      if (p) {
        let avatarUrl = null;
        if (p.avatarStorageId) {
          avatarUrl = await ctx.storage.getUrl(p.avatarStorageId);
        }
        profilesMap.set(pid.toString(), {
          _id: p._id,
          displayName: p.displayName,
          email: p.email,
          avatarUrl,
        });
      }
    }

    // Process nodes with vote metrics & author info
    const processedNodes = await Promise.all(nodes.map(async (node) => {
      const nodeVotes = votes.filter((v) => v.ideaId === node._id);
      const upvotes = nodeVotes.filter((v) => v.voteType === "up").length;
      const downvotes = nodeVotes.filter((v) => v.voteType === "down").length;
      const userVote = nodeVotes.find((v) => v.profileId === profile._id)?.voteType ?? null;

      // Approval rule: upvotes > downvotes
      const isApproved = upvotes > downvotes;

      const contributions = await ctx.db
        .query("contentContributions")
        .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
          q
            .eq("targetKey", contributionTargetKey("idea", node._id))
            .eq("archivedAt", null),
        )
        .order("desc")
        .take(200);
      const ownsNode = node.authorProfileId === profile._id;
      const visibleContributions = contributions.filter(
        (item) =>
          item.sourceKind !== "idea_original" &&
          (item.moderationStatus !== "rejected" ||
            item.authorProfileId === profile._id ||
            ownsNode),
      );
      const nestingRequest = visibleNestingByChildId.get(node._id);
      const effectiveParentId =
        nestingRequest?.parentIdeaId ?? node.parentIdeaId;
      const parent =
        effectiveParentId === undefined
          ? null
          : await ctx.db.get("ideaNodes", effectiveParentId);
      const childAbsolute = absolutePosition(node._id);
      const parentAbsolute =
        effectiveParentId === undefined
          ? null
          : absolutePosition(effectiveParentId);
      const x =
        nestingRequest === undefined
          ? node.x
          : nestingRequest.proposedX ??
            childAbsolute.x - (parentAbsolute?.x ?? 0);
      const y =
        nestingRequest === undefined
          ? node.y
          : nestingRequest.proposedY ??
            childAbsolute.y - (parentAbsolute?.y ?? 0);

      return {
        ...node,
        x,
        y,
        parentIdeaId: effectiveParentId,
        author: profilesMap.get(node.authorProfileId.toString()) ?? null,
        upvotes,
        downvotes,
        userVote,
        isApproved,
        netVotes: upvotes - downvotes,
        contributionCount: visibleContributions.length,
        pendingDeletionRequest:
          pendingDeletionByIdeaId.get(node._id) ?? null,
        canEdit: ownsNode,
        canMove: true,
        canResize: ownsNode,
        canDeleteDirectly: ownsNode,
        canRequestDeletion: !ownsNode,
        canDetach:
          effectiveParentId !== undefined &&
          (nestingRequest === undefined
            ? ownsNode || parent?.authorProfileId === profile._id
            : nestingRequest.requesterProfileId === profile._id ||
              nestingRequest.parentAuthorProfileId === profile._id),
        nestingRequestId: nestingRequest?._id ?? null,
        nestingModerationStatus:
          nestingRequest?.status === "pending" ||
          nestingRequest?.status === "rejected"
            ? nestingRequest.status
            : null,
        canModerateNesting:
          nestingRequest?.status === "pending" &&
          nestingRequest.parentAuthorProfileId === profile._id,
      };
    }));

    // Fetch canvas viewport state for user
    const canvasState = await ctx.db
      .query("ideaCanvases")
      .withIndex("by_ownerProfileId_and_startupId", (q) =>
        q.eq("ownerProfileId", profile._id).eq("startupId", args.startupId)
      )
      .unique();

    return {
      nodes: processedNodes,
      edges: edges.map((edge) => ({
        ...edge,
        canEdit: edge.authorProfileId === profile._id,
        canDeleteDirectly: edge.authorProfileId === profile._id,
        canRequestDeletion: edge.authorProfileId !== profile._id,
      })),
      canvasState: canvasState ?? { x: 0, y: 0, zoom: 1 },
      currentProfileId: profile._id,
    };
  },
});

export const create = mutation({
  args: {
    startupId: v.id("startups"),
    title: v.string(),
    text: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    color: v.optional(ideaColorValidator),
    isParent: v.optional(v.boolean()),
    parentIdeaId: v.optional(v.id("ideaNodes")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const cleanedText = cleanRequiredText(args.text, "Tekst ideje", 12000);
    const cleanedTitle = cleanRequiredText(
      args.title,
      "Naslov ideje",
      MAX_IDEA_TITLE,
    );
    const now = Date.now();

    const ideaId = await ctx.db.insert("ideaNodes", {
      startupId: args.startupId,
      authorProfileId: profile._id,
      title: cleanedTitle,
      text: cleanedText,
      x: args.x ?? Math.round((Math.random() - 0.5) * 300),
      y: args.y ?? Math.round((Math.random() - 0.5) * 300),
      color: args.color ?? "violet",
      isParent: args.isParent ?? false,
      convertedPageId: null,
      convertedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await insertContribution(ctx, {
      startupId: args.startupId,
      targetKind: "idea",
      targetId: ideaId,
      authorProfileId: profile._id,
      content: cleanedText,
      sourceKind: "idea_original",
      sourceId: ideaId,
      moderationStatus: "approved",
      createdAt: now,
    });

    // Auto upvote by creator
    await ctx.db.insert("ideaVotes", {
      startupId: args.startupId,
      ideaId,
      profileId: profile._id,
      voteType: "up",
      createdAt: now,
    });

    // If parentIdeaId provided, create connecting edge
    if (args.parentIdeaId) {
      const parentIdea = await ctx.db.get(args.parentIdeaId);
      if (parentIdea && parentIdea.startupId === args.startupId) {
        const pairKey = [args.parentIdeaId, ideaId].sort().join(":");
        await ctx.db.insert("ideaEdges", {
          startupId: args.startupId,
          authorProfileId: profile._id,
          nodeAId: args.parentIdeaId,
          nodeBId: ideaId,
          pairKey,
          label: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return ideaId;
  },
});

export const vote = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
    voteType: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.startupId !== args.startupId || idea.archivedAt !== null) {
      throw new Error("Ideja nije pronađena.");
    }
    if (idea.authorProfileId !== profile._id) {
      throw new Error("Samo autor ideje može promeniti njen osnovni status.");
    }

    const existingVote = await ctx.db
      .query("ideaVotes")
      .withIndex("by_ideaId_and_profileId", (q) =>
        q.eq("ideaId", args.ideaId).eq("profileId", profile._id)
      )
      .unique();

    // Skidanje glasa nikoga ne obaveštava — samo dat ili promenjen glas.
    async function notifyAuthor() {
      const ideaLabel = idea!.title ?? idea!.text.slice(0, 60);
      const copy = notificationCopy.ideaVoted(
        ideaLabel,
        profile.displayName,
        args.voteType,
      );
      await createNotification(ctx, {
        recipientProfileId: idea!.authorProfileId,
        startupId: args.startupId,
        type: "idea_voted",
        title: copy.title,
        targetType: "ideas",
        targetId: args.ideaId,
        actorProfileId: profile._id,
      });
    }

    if (existingVote) {
      if (existingVote.voteType === args.voteType) {
        await ctx.db.delete(existingVote._id);
        return { action: "removed" };
      } else {
        await ctx.db.patch(existingVote._id, { voteType: args.voteType });
        await notifyAuthor();
        return { action: "updated" };
      }
    } else {
      await ctx.db.insert("ideaVotes", {
        startupId: args.startupId,
        ideaId: args.ideaId,
        profileId: profile._id,
        voteType: args.voteType,
        createdAt: Date.now(),
      });
      await notifyAuthor();
      return { action: "created" };
    }
  },
});

export const updatePositions = mutation({
  args: {
    startupId: v.id("startups"),
    updates: v.array(
      v.object({
        id: v.id("ideaNodes"),
        x: v.number(),
        y: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const now = Date.now();
    const [pendingNesting, rejectedAsRequester, rejectedAsParent] =
      await Promise.all([
        ctx.db
          .query("nestingRequests")
          .withIndex("by_startupId_and_status_and_updatedAt", (q) =>
            q.eq("startupId", args.startupId).eq("status", "pending"),
          )
          .order("desc")
          .take(500),
        ctx.db
          .query("nestingRequests")
          .withIndex("by_requesterProfileId_and_status_and_createdAt", (q) =>
            q.eq("requesterProfileId", profile._id).eq("status", "rejected"),
          )
          .order("desc")
          .take(500),
        ctx.db
          .query("nestingRequests")
          .withIndex("by_parentAuthorProfileId_and_status_and_createdAt", (q) =>
            q.eq("parentAuthorProfileId", profile._id).eq("status", "rejected"),
          )
          .order("desc")
          .take(500),
      ]);
    const visibleNestingByChildId = new Map<
      Id<"ideaNodes">,
      (typeof pendingNesting)[number]
    >();
    for (const request of [
      ...pendingNesting,
      ...rejectedAsRequester,
      ...rejectedAsParent,
    ]) {
      if (request.startupId !== args.startupId) continue;
      const current = visibleNestingByChildId.get(request.childIdeaId);
      if (current === undefined || current.updatedAt < request.updatedAt) {
        visibleNestingByChildId.set(request.childIdeaId, request);
      }
    }
    for (const update of args.updates) {
      const x = finiteWithin(update.x, "X pozicija", -100_000, 100_000);
      const y = finiteWithin(update.y, "Y pozicija", -100_000, 100_000);
      const idea = await ctx.db.get(update.id);
      if (
        idea &&
        idea.startupId === args.startupId &&
        idea.archivedAt === null
      ) {
        const nestingRequest = visibleNestingByChildId.get(update.id);
        if (nestingRequest !== undefined) {
          await ctx.db.patch("nestingRequests", nestingRequest._id, {
            proposedX: x,
            proposedY: y,
            updatedAt: now,
          });
        } else {
          await ctx.db.patch(update.id, { x, y, updatedAt: now });
        }
      }
    }
  },
});

export const update = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
    title: v.string(),
    text: v.string(),
    color: ideaColorValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.startupId !== args.startupId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    if (idea.authorProfileId !== profile._id) {
      throw new Error("Možete urediti samo svoju ideju.");
    }

    const title = cleanRequiredText(
      args.title,
      "Naslov ideje",
      MAX_IDEA_TITLE,
    );
    const text = cleanRequiredText(args.text, "Tekst ideje", MAX_IDEA_TEXT);
    await ctx.db.patch(args.ideaId, {
      title,
      text,
      color: args.color,
      updatedAt: Date.now(),
    });
    const original = await ctx.db
      .query("contentContributions")
      .withIndex("by_sourceKind_and_sourceId", (q) =>
        q.eq("sourceKind", "idea_original").eq("sourceId", args.ideaId),
      )
      .unique();
    if (original !== null && original.authorProfileId === profile._id) {
      await ctx.db.patch("contentContributions", original._id, {
        content: text,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const updateLayout = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.startupId !== args.startupId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    if (idea.authorProfileId !== profile._id) {
      throw new Error("Možete promeniti veličinu samo svoje kartice.");
    }

    await ctx.db.patch(args.ideaId, {
      x: finiteWithin(args.x, "Horizontalna pozicija", -10_000_000, 10_000_000),
      y: finiteWithin(args.y, "Vertikalna pozicija", -10_000_000, 10_000_000),
      width: finiteWithin(
        args.width,
        "Širina oblačića",
        MIN_IDEA_WIDTH,
        MAX_IDEA_WIDTH,
      ),
      height: finiteWithin(
        args.height,
        "Visina oblačića",
        MIN_IDEA_HEIGHT,
        MAX_IDEA_HEIGHT,
      ),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const resetLayoutSize = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.startupId !== args.startupId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    if (idea.authorProfileId !== profile._id) {
      throw new Error("Možete promeniti veličinu samo svoje kartice.");
    }

    await ctx.db.patch(args.ideaId, {
      width: undefined,
      height: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const saveViewport = mutation({
  args: {
    startupId: v.id("startups"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const now = Date.now();

    const existing = await ctx.db
      .query("ideaCanvases")
      .withIndex("by_ownerProfileId_and_startupId", (q) =>
        q.eq("ownerProfileId", profile._id).eq("startupId", args.startupId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        x: args.x,
        y: args.y,
        zoom: args.zoom,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("ideaCanvases", {
        startupId: args.startupId,
        ownerProfileId: profile._id,
        x: args.x,
        y: args.y,
        zoom: args.zoom,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const connect = mutation({
  args: {
    startupId: v.id("startups"),
    nodeAId: v.id("ideaNodes"),
    nodeBId: v.id("ideaNodes"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    if (args.nodeAId === args.nodeBId) throw new Error("Ne možete povezati ideju sa samom sobom.");

    const [nodeA, nodeB] = await Promise.all([
      ctx.db.get("ideaNodes", args.nodeAId),
      ctx.db.get("ideaNodes", args.nodeBId),
    ]);
    if (
      nodeA === null ||
      nodeB === null ||
      nodeA.startupId !== args.startupId ||
      nodeB.startupId !== args.startupId ||
      nodeA.archivedAt !== null ||
      nodeB.archivedAt !== null
    ) {
      throw new Error("Ideje nisu pronađene u ovom startupu.");
    }
    if (
      nodeA.authorProfileId !== profile._id &&
      nodeB.authorProfileId !== profile._id
    ) {
      throw new Error("Vezu možete napraviti samo ako posedujete bar jednu karticu.");
    }

    const pairKey = [args.nodeAId, args.nodeBId].sort().join(":");
    const existing = await ctx.db
      .query("ideaEdges")
      .withIndex("by_startupId_and_pairKey", (q) =>
        q.eq("startupId", args.startupId).eq("pairKey", pairKey)
      )
      .first();

    const now = Date.now();
    if (existing) {
      if (existing.archivedAt !== null) {
        await ctx.db.patch(existing._id, {
          archivedAt: null,
          authorProfileId: profile._id,
          label: args.label ? args.label.trim() : existing.label,
          updatedAt: now,
        });
        return existing._id;
      }
      return existing._id;
    }

    return await ctx.db.insert("ideaEdges", {
      startupId: args.startupId,
      authorProfileId: profile._id,
      nodeAId: args.nodeAId,
      nodeBId: args.nodeBId,
      pairKey,
      label: args.label ? args.label.trim() : null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const disconnect = mutation({
  args: {
    startupId: v.id("startups"),
    edgeId: v.id("ideaEdges"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const edge = await ctx.db.get(args.edgeId);
    if (
      edge &&
      edge.startupId === args.startupId &&
      edge.authorProfileId === profile._id
    ) {
      await ctx.db.patch(args.edgeId, {
        archivedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const updateEdgeLabel = mutation({
  args: {
    startupId: v.id("startups"),
    edgeId: v.id("ideaEdges"),
    label: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const edge = await ctx.db.get(args.edgeId);
    if (
      edge === null ||
      edge.startupId !== args.startupId ||
      edge.archivedAt !== null
    ) {
      throw new Error("Veza nije pronađena.");
    }
    if (edge.authorProfileId !== profile._id) {
      throw new Error("Naziv veze može menjati samo njen autor.");
    }
    await ctx.db.patch(args.edgeId, {
      label: cleanOptionalText(args.label, "Naziv veze", MAX_EDGE_LABEL),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const convertToPage = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
    areaId: v.id("startupAreas"),
    kind: pageKindValidator,
    title: v.optional(v.string()),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.startupId !== args.startupId || idea.archivedAt !== null) {
      throw new Error("Ideja nije pronađena.");
    }

    const votes = await ctx.db
      .query("ideaVotes")
      .withIndex("by_ideaId", (q) => q.eq("ideaId", args.ideaId))
      .take(MAX_IDEA_VOTES + 1);
    if (votes.length > MAX_IDEA_VOTES) {
      throw new Error("Ideja ima previše glasova za bezbednu konverziju.");
    }

    const upvotes = votes.filter((v) => v.voteType === "up").length;
    const downvotes = votes.filter((v) => v.voteType === "down").length;

    if (upvotes <= downvotes) {
      throw new Error("Ideja mora imati više odobrenja nego neodobrenja da bi bila prebačena u task ili note.");
    }

    const now = Date.now();
    const pageContent = `<p>${idea.text.replace(/\n/g, "<br/>")}</p>`;
    const target = await validateWorkspacePageTarget(ctx, {
      startupId: args.startupId,
      areaId: args.areaId,
      parentPageId: null,
      kind: args.kind,
      taskStatus: args.status,
      taskPriority: args.priority,
      assigneeProfileId: args.assigneeProfileId,
    });
    const page = prepareWorkspacePage(target, {
      title: args.title?.trim() || idea.title || idea.text.slice(0, 60),
      content: pageContent,
      now,
    });
    const [activeRootPages, occupiedPlacements] = await Promise.all([
      ctx.db
        .query("pages")
        .withIndex(
          "by_startup_area_parent_active_position",
          (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("areaId", args.areaId)
              .eq("parentPageId", null)
              .eq("archivedAt", null),
        )
        .take(MAX_AREA_CANVAS_PAGES + 1),
      ctx.db
        .query("pageCanvasPlacements")
        .withIndex(
          "by_startupId_and_areaId_and_rootPageId",
          (q) =>
            q
              .eq("startupId", args.startupId)
              .eq("areaId", args.areaId)
              .eq("rootPageId", null),
        )
        .take(MAX_AREA_CANVAS_PAGES + 1),
    ]);
    if (
      activeRootPages.length >= MAX_AREA_CANVAS_PAGES ||
      occupiedPlacements.length > MAX_AREA_CANVAS_PAGES
    ) {
      throw new Error(
        `Jedan kanvas može imati najviše ${MAX_AREA_CANVAS_PAGES} direktnih kartica.`,
      );
    }
    const canvasPosition = findAvailableCanvasPosition(
      occupiedPlacements.map((placement) => ({
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      })),
    );

    const pageId = await ctx.db.insert("pages", {
      startupId: target.startupId,
      areaId: target.areaId,
      parentPageId: target.parentPageId,
      kind: target.kind,
      title: page.title,
      searchText: pageSearchText(page.title, page.content),
      revision: 0,
      treeRevision: 0,
      canvasPreview: workspaceCanvasPreview(
        page.title,
        page.content,
        target.instructions,
      ),
      position: page.position,
      taskStatus: target.taskStatus,
      taskPriority: target.taskPriority,
      assigneeProfileId: target.assigneeProfileId,
      dueDate: target.dueDate,
      ...(target.instructions === null
        ? {}
        : { instructions: target.instructions }),
      ...(target.checkpoints === null
        ? {}
        : { checkpoints: target.checkpoints }),
      taskSortAt: page.taskSortAt,
      completedAt:
        target.kind === "task" && target.taskStatus === "done" ? now : null,
      createdByProfileId: profile._id,
      updatedByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("pageBodies", {
      pageId,
      content: page.content,
      updatedAt: now,
    });

    await ctx.db.insert("pageCanvasPlacements", {
      startupId: args.startupId,
      areaId: args.areaId,
      rootPageId: null,
      pageId,
      x: canvasPosition.x,
      y: canvasPosition.y,
      updatedByProfileId: profile._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("pageCanvasNodes", {
      startupId: args.startupId,
      areaId: args.areaId,
      pageId,
      x: canvasPosition.x,
      y: canvasPosition.y,
      updatedAt: now,
    });

    await ctx.db.insert("pageEntries", {
      pageId,
      authorProfileId: idea.authorProfileId,
      content: page.content,
      position: 1,
      createdAt: idea.createdAt,
      updatedAt: now,
    });

    await insertContribution(ctx, {
      startupId: args.startupId,
      targetKind: "page",
      targetId: pageId,
      authorProfileId: idea.authorProfileId,
      content: page.content,
      sourceKind: "page_entry",
      sourceId: `idea:${idea._id}`,
      createdAt: idea.createdAt,
    });

    await ctx.db.patch(args.ideaId, {
      convertedPageId: pageId,
      convertedAt: now,
      updatedAt: now,
    });

    // Autor ideje treba da zna gde mu je ideja završila; link vodi na rezultat.
    const ideaLabel = idea.title ?? idea.text.slice(0, 60);
    const convertedCopy = notificationCopy.ideaConverted(
      ideaLabel,
      args.kind,
      profile.displayName,
    );
    await createNotification(ctx, {
      recipientProfileId: idea.authorProfileId,
      startupId: args.startupId,
      type: "idea_converted",
      title: convertedCopy.title,
      body: convertedCopy.body,
      targetType: "page",
      targetId: pageId,
      actorProfileId: profile._id,
    });

    return pageId;
  },
});

export const archive = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.startupId !== args.startupId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    if (idea.authorProfileId !== profile._id) {
      throw new Error("Tuđa ideja se briše samo jednoglasnim glasanjem.");
    }
    const contributions = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q
          .eq("targetKey", contributionTargetKey("idea", idea._id))
          .eq("archivedAt", null),
      )
      .take(201);
    if (contributions.length > 200) {
      throw new Error("Ideja ima previše izmena za jedno atomsko brisanje.");
    }
    const now = Date.now();
    const foreign = contributions.filter(
      (item) =>
        item.authorProfileId !== undefined &&
        item.authorProfileId !== profile._id,
    );
    let recoveredId: Id<"recoveredContent"> | null = null;
    if (foreign.length > 0) {
      recoveredId = await ctx.db.insert("recoveredContent", {
        startupId: args.startupId,
        title: `Oporavljeno iz „${idea.title ?? idea.text.slice(0, 60)}“`,
        sourceKind: "idea",
        sourceTargetId: idea._id,
        createdByProfileId: profile._id,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      for (const contribution of foreign) {
        await ctx.db.patch("contentContributions", contribution._id, {
          targetKind: "recovered",
          targetKey: contributionTargetKey("recovered", recoveredId),
          targetId: recoveredId,
          updatedAt: now,
        });
      }
      await recordActivity(ctx, {
        startupId: args.startupId,
        actorProfileId: profile._id,
        action: "content_recovered",
        targetType: "recovered",
        targetId: recoveredId,
        title: "Tuđe izmene su sačuvane u Oporavljeno",
      });
    }
    const foreignIds = new Set(foreign.map((item) => item._id));
    for (const contribution of contributions) {
      if (!foreignIds.has(contribution._id)) {
        await ctx.db.patch("contentContributions", contribution._id, {
          archivedAt: now,
          updatedAt: now,
        });
      }
    }
    await detachIdeaChildren(ctx, idea._id, now);
    await ctx.db.patch("ideaNodes", idea._id, {
      archivedAt: now,
      updatedAt: now,
    });
    const edges = await ctx.db
      .query("ideaEdges")
      .withIndex("by_startupId_and_archivedAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null),
      )
      .take(500);
    for (const edge of edges) {
      if (edge.nodeAId === idea._id || edge.nodeBId === idea._id) {
        await ctx.db.patch("ideaEdges", edge._id, {
          archivedAt: now,
          updatedAt: now,
        });
      }
    }
    await recordActivity(ctx, {
      startupId: args.startupId,
      actorProfileId: profile._id,
      action: "content_soft_deleted",
      targetType: "idea",
      targetId: idea._id,
      title: "Ideja je premeštena u korpu",
    });
    return { ideaId: idea._id, recoveredId, undoUntil: now + 8_000 };
  },
});

export const restoreOwn = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.startupId !== args.startupId ||
      idea.archivedAt === null ||
      idea.authorProfileId !== profile._id
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    const recovered = await ctx.db
      .query("recoveredContent")
      .withIndex("by_startupId_and_archivedAt_and_createdAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null),
      )
      .order("desc")
      .take(50);
    if (recovered.some((item) => item.sourceTargetId === idea._id)) {
      throw new Error(
        "Ideja sa izdvojenim tuđim izmenama ne može se vratiti Undo akcijom.",
      );
    }
    const now = Date.now();
    await ctx.db.patch("ideaNodes", idea._id, {
      archivedAt: null,
      updatedAt: now,
    });
    const contributions = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q.eq("targetKey", contributionTargetKey("idea", idea._id)),
      )
      .take(200);
    for (const contribution of contributions) {
      if (contribution.authorProfileId === profile._id) {
        await ctx.db.patch("contentContributions", contribution._id, {
          archivedAt: null,
          updatedAt: now,
        });
      }
    }
    return idea._id;
  },
});
