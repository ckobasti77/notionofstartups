import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireStartupMember } from "./lib/auth";
import { cleanRequiredText, pageKindValidator, taskPriorityValidator, taskStatusValidator } from "./lib/validators";

const ideaColorValidator = v.union(
  v.literal("neutral"),
  v.literal("violet"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("amber"),
  v.literal("rose"),
);

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
      .collect();

    // Fetch active edges
    const edges = await ctx.db
      .query("ideaEdges")
      .withIndex("by_startupId_and_archivedAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null)
      )
      .collect();

    // Fetch all votes for startup
    const votes = await ctx.db
      .query("ideaVotes")
      .withIndex("by_startupId", (q) => q.eq("startupId", args.startupId))
      .collect();

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
    const processedNodes = nodes.map((node) => {
      const nodeVotes = votes.filter((v) => v.ideaId === node._id);
      const upvotes = nodeVotes.filter((v) => v.voteType === "up").length;
      const downvotes = nodeVotes.filter((v) => v.voteType === "down").length;
      const userVote = nodeVotes.find((v) => v.profileId === profile._id)?.voteType ?? null;

      // Approval rule: upvotes > downvotes
      const isApproved = upvotes > downvotes;

      return {
        ...node,
        author: profilesMap.get(node.authorProfileId.toString()) ?? null,
        upvotes,
        downvotes,
        userVote,
        isApproved,
        netVotes: upvotes - downvotes,
      };
    });

    // Fetch canvas viewport state for user
    const canvasState = await ctx.db
      .query("ideaCanvases")
      .withIndex("by_ownerProfileId_and_startupId", (q) =>
        q.eq("ownerProfileId", profile._id).eq("startupId", args.startupId)
      )
      .unique();

    return {
      nodes: processedNodes,
      edges,
      canvasState: canvasState ?? { x: 0, y: 0, zoom: 1 },
      currentProfileId: profile._id,
    };
  },
});

export const create = mutation({
  args: {
    startupId: v.id("startups"),
    title: v.optional(v.string()),
    text: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    color: v.optional(ideaColorValidator),
    isParent: v.optional(v.boolean()),
    parentIdeaId: v.optional(v.id("ideaNodes")),
    convertedFromThoughtId: v.optional(v.id("thoughtNodes")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const cleanedText = cleanRequiredText(args.text, "Tekst ideje", 12000);
    const cleanedTitle = args.title ? args.title.trim() : null;
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

    // If converted from thought, archive original thought and note conversion
    if (args.convertedFromThoughtId) {
      const thought = await ctx.db.get(args.convertedFromThoughtId);
      if (thought && thought.startupId === args.startupId && thought.ownerProfileId === profile._id) {
        await ctx.db.patch(args.convertedFromThoughtId, {
          archivedAt: now,
          conversionCount: (thought.conversionCount || 0) + 1,
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

    const existingVote = await ctx.db
      .query("ideaVotes")
      .withIndex("by_ideaId_and_profileId", (q) =>
        q.eq("ideaId", args.ideaId).eq("profileId", profile._id)
      )
      .unique();

    if (existingVote) {
      if (existingVote.voteType === args.voteType) {
        await ctx.db.delete(existingVote._id);
        return { action: "removed" };
      } else {
        await ctx.db.patch(existingVote._id, { voteType: args.voteType });
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
    await requireStartupMember(ctx, args.startupId);
    const now = Date.now();
    for (const update of args.updates) {
      const idea = await ctx.db.get(update.id);
      if (idea && idea.startupId === args.startupId && idea.archivedAt === null) {
        await ctx.db.patch(update.id, {
          x: update.x,
          y: update.y,
          updatedAt: now,
        });
      }
    }
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
    await requireStartupMember(ctx, args.startupId);
    const edge = await ctx.db.get(args.edgeId);
    if (edge && edge.startupId === args.startupId) {
      await ctx.db.patch(args.edgeId, {
        archivedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
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
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.startupId !== args.startupId || idea.archivedAt !== null) {
      throw new Error("Ideja nije pronađena.");
    }

    const votes = await ctx.db
      .query("ideaVotes")
      .withIndex("by_ideaId", (q) => q.eq("ideaId", args.ideaId))
      .collect();

    const upvotes = votes.filter((v) => v.voteType === "up").length;
    const downvotes = votes.filter((v) => v.voteType === "down").length;

    if (upvotes <= downvotes) {
      throw new Error("Ideja mora imati više odobrenja nego neodobrenja da bi bila prebačena u task ili note.");
    }

    const area = await ctx.db.get(args.areaId);
    if (!area || area.startupId !== args.startupId) {
      throw new Error("Oblast ne postoji.");
    }

    const pageTitle = args.title?.trim() || idea.title || idea.text.slice(0, 60);
    const now = Date.now();

    const pageId = await ctx.db.insert("pages", {
      startupId: args.startupId,
      areaId: args.areaId,
      parentPageId: null,
      kind: args.kind,
      title: pageTitle,
      searchText: `${pageTitle} ${idea.text}`.toLowerCase(),
      revision: 1,
      position: Date.now(),
      taskStatus: args.kind === "task" ? args.status ?? "backlog" : null,
      taskPriority: args.kind === "task" ? args.priority ?? "medium" : null,
      assigneeProfileId: args.assigneeProfileId ?? null,
      dueDate: null,
      instructions: undefined,
      checkpoints: undefined,
      taskSortAt: now,
      createdByProfileId: profile._id,
      updatedByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("pageBodies", {
      pageId,
      content: `<p>${idea.text.replace(/\n/g, "<br/>")}</p>`,
      updatedAt: now,
    });

    await ctx.db.insert("pageEntries", {
      pageId,
      authorProfileId: idea.authorProfileId,
      content: `<p>${idea.text.replace(/\n/g, "<br/>")}</p>`,
      position: 1,
      createdAt: idea.createdAt,
      updatedAt: now,
    });

    await ctx.db.patch(args.ideaId, {
      convertedPageId: pageId,
      convertedAt: now,
      updatedAt: now,
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
    await requireStartupMember(ctx, args.startupId);
    const idea = await ctx.db.get(args.ideaId);
    if (idea && idea.startupId === args.startupId) {
      await ctx.db.patch(args.ideaId, {
        archivedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
