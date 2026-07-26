import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { requireStartupMember } from "./lib/auth";
import {
  contributionTargetKey,
  insertContribution,
} from "./lib/collaboration";
import {
  cleanPageContent,
  cleanPagePosition,
  insertWorkspacePage,
  prepareWorkspacePage,
  requirePageArea,
  requirePageParent,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import {
  getActivePageDescendants,
  pageSearchText,
  pageTaskSortAt,
  requireVisiblePage,
  summarizePage,
} from "./lib/pages";
import {
  cleanRequiredText,
  pageKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";

export const listChildren = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);
    await requirePageParent(ctx, args.startupId, args.areaId, args.parentPageId);
    const result = await ctx.db
      .query("pages")
      .withIndex(
        "by_areaId_and_parentPageId_and_archivedAt_and_position",
        (q) =>
          q
            .eq("areaId", args.areaId)
            .eq("parentPageId", args.parentPageId)
            .eq("archivedAt", null),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(summarizePage) };
  },
});

export const get = query({
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const [body, creator, updater, assignee, rawEntries, pageContributions] = await Promise.all([
      ctx.db
        .query("pageBodies")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique(),
      ctx.db.get("profiles", page.createdByProfileId),
      ctx.db.get("profiles", page.updatedByProfileId),
      page.assigneeProfileId === null
        ? Promise.resolve(null)
        : ctx.db.get("profiles", page.assigneeProfileId),
      ctx.db
        .query("pageEntries")
        .withIndex("by_pageId_and_position", (q) => q.eq("pageId", page._id))
        .collect(),
      ctx.db
        .query("contentContributions")
        .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
          q
            .eq("targetKey", contributionTargetKey("page", page._id))
            .eq("archivedAt", null),
        )
        .take(200),
    ]);

    // Format author avatars and profiles for entries
    const entries = await Promise.all(
      rawEntries.map(async (entry) => {
        const author = await ctx.db.get("profiles", entry.authorProfileId);
        const contribution = await ctx.db
          .query("contentContributions")
          .withIndex("by_sourceKind_and_sourceId", (q) =>
            q.eq("sourceKind", "page_entry").eq("sourceId", entry._id),
          )
          .unique();
        let avatarUrl = null;
        if (author?.avatarStorageId) {
          avatarUrl = await ctx.storage.getUrl(author.avatarStorageId);
        }
        return {
          ...entry,
          author: author
            ? {
                _id: author._id,
                displayName: author.displayName,
                email: author.email,
                avatarUrl,
              }
            : null,
          canEdit: entry.authorProfileId === profile._id,
          canDeleteDirectly: entry.authorProfileId === profile._id,
          canRequestDeletion: entry.authorProfileId !== profile._id,
          contributionId: contribution?._id ?? null,
        };
      })
    );

    let creatorAvatarUrl = null;
    if (creator?.avatarStorageId) {
      creatorAvatarUrl = await ctx.storage.getUrl(creator.avatarStorageId);
    }
    const creatorWithAvatar = creator ? { ...creator, avatarUrl: creatorAvatarUrl } : null;

    return {
      ...page,
      content: body?.content ?? "",
      creator: creatorWithAvatar,
      updater,
      assignee,
      entries,
      permissions: {
        canEdit: page.createdByProfileId === profile._id,
        canEditBody:
          page.createdByProfileId === profile._id &&
          pageContributions.some(
            (contribution) =>
              contribution.sourceKind === "page_body" &&
              contribution.attribution === "author" &&
              contribution.authorProfileId === profile._id,
          ),
        canMove: page.createdByProfileId === profile._id,
        canResize: page.createdByProfileId === profile._id,
        canDeleteDirectly: page.createdByProfileId === profile._id,
        canRequestDeletion: page.createdByProfileId !== profile._id,
      },
    };
  },
});

export const getBreadcrumbs = query({
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    await requireStartupMember(ctx, page.startupId);
    const breadcrumbs = [{ _id: page._id, title: page.title, kind: page.kind }];
    let parentPageId = page.parentPageId;
    for (let depth = 0; parentPageId !== null && depth < 64; depth += 1) {
      const parent = await ctx.db.get("pages", parentPageId);
      if (parent === null || parent.archivedAt !== null) break;
      breadcrumbs.push({ _id: parent._id, title: parent.title, kind: parent.kind });
      parentPageId = parent.parentPageId;
    }
    return breadcrumbs.reverse();
  },
});

export const create = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: pageKindValidator,
    title: v.string(),
    content: v.optional(v.string()),
    position: v.optional(v.number()),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.id("profiles")),
    dueDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
    checkpoints: v.optional(v.array(v.object({ id: v.string(), text: v.string(), completed: v.boolean() }))),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const now = Date.now();
    const target = await validateWorkspacePageTarget(ctx, {
      startupId: args.startupId,
      areaId: args.areaId,
      parentPageId: args.parentPageId,
      kind: args.kind,
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileId: args.assigneeProfileId,
      dueDate: args.dueDate,
      instructions: args.instructions,
      checkpoints: args.checkpoints,
    });
    const page = prepareWorkspacePage(target, {
      title: args.title,
      content: args.content ?? "",
      position: args.position,
      now,
    });
    return await insertWorkspacePage(ctx, {
      target,
      page,
      actorProfileId: profile._id,
      now,
    });
  },
});

export const update = mutation({
  args: {
    pageId: v.id("pages"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (page.createdByProfileId !== profile._id) {
      throw new Error(
        "Naslov i osnovni sadržaj menja samo kreator. Dodajte svoj doprinos.",
      );
    }
    if (page.revision !== args.expectedRevision) {
      throw new Error("KONFLIKT_IZMENA: Neko iz tima je u međuvremenu izmenio ovu stranicu.");
    }
    const body = await ctx.db
      .query("pageBodies")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique();
    const title = args.title === undefined
      ? page.title
      : cleanRequiredText(args.title, "Naslov", 200);
    const currentContent = body?.content ?? "";
    const content = args.content === undefined ? currentContent : cleanPageContent(args.content);
    const bodyContributions = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q
          .eq("targetKey", contributionTargetKey("page", page._id))
          .eq("archivedAt", null),
      )
      .take(200);
    const authoredBodyContribution = bodyContributions.find(
      (contribution) =>
        contribution.sourceKind === "page_body" &&
        contribution.attribution === "author" &&
        contribution.authorProfileId === profile._id,
    );
    if (
      content !== currentContent &&
      authoredBodyContribution === undefined
    ) {
      throw new Error(
        "Raniji zajednički sadržaj je zaključan. Dodajte svoj potpisani doprinos.",
      );
    }
    if (title === page.title && content === currentContent) {
      return { pageId: page._id, revision: page.revision, updatedAt: page.updatedAt };
    }
    const now = Date.now();
    const revision = page.revision + 1;
    await ctx.db.patch("pages", page._id, {
      title,
      searchText: pageSearchText(title, content),
      revision,
      taskSortAt: pageTaskSortAt(page.dueDate, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    if (body === null) {
      await ctx.db.insert("pageBodies", { pageId: page._id, content, updatedAt: now });
    } else if (content !== currentContent) {
      await ctx.db.patch("pageBodies", body._id, { content, updatedAt: now });
    }
    if (
      content !== currentContent &&
      authoredBodyContribution !== undefined
    ) {
      await ctx.db.patch(
        "contentContributions",
        authoredBodyContribution._id,
        { content, updatedAt: now },
      );
    }
    if (title !== page.title || now - page.updatedAt >= 5 * 60 * 1_000) {
      await recordActivity(ctx, {
        startupId: page.startupId,
        actorProfileId: profile._id,
        action: "page_updated",
        targetType: "page",
        targetId: page._id,
        title: `„${title}” je izmenjen/a`,
      });
    }
    return { pageId: page._id, revision, updatedAt: now };
  },
});

export const move = mutation({
  args: {
    pageId: v.id("pages"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (page.createdByProfileId !== profile._id) {
      throw new Error("Možete pomerati samo svoju stranicu.");
    }
    await requirePageArea(ctx, page.startupId, args.areaId);
    if (args.parentPageId === page._id) throw new Error("Stranica ne može biti sopstveni roditelj.");
    const parent = await requirePageParent(ctx, page.startupId, args.areaId, args.parentPageId);
    if (
      parent !== null &&
      parent.createdByProfileId !== profile._id
    ) {
      throw new Error(
        "Za ugnježđavanje u tuđu stranicu potrebno je odobrenje njenog autora.",
      );
    }
    let cursor = parent;
    for (let depth = 0; cursor !== null && depth < 64; depth += 1) {
      if (cursor._id === page._id) throw new Error("Premeštanje bi napravilo kružnu hijerarhiju.");
      cursor = cursor.parentPageId === null
        ? null
        : await requireVisiblePage(ctx, cursor.parentPageId);
    }
    const descendants =
      page.areaId === args.areaId ? [] : await getActivePageDescendants(ctx, page._id);
    const now = Date.now();
    await ctx.db.patch("pages", page._id, {
      areaId: args.areaId,
      parentPageId: args.parentPageId,
      position: cleanPagePosition(args.position, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    await Promise.all(
      descendants.map((descendant) =>
        ctx.db.patch("pages", descendant._id, {
          areaId: args.areaId,
          updatedByProfileId: profile._id,
          updatedAt: now,
        }),
      ),
    );
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: profile._id,
      action: "page_moved",
      targetType: "page",
      targetId: page._id,
      title: `„${page.title}” je premešten/a`,
    });
    return page._id;
  },
});

export const archive = mutation({
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (page.createdByProfileId !== profile._id) {
      throw new Error("Tuđa stranica se briše samo jednoglasnim glasanjem.");
    }
    const now = Date.now();
    const children = await ctx.db
      .query("pages")
      .withIndex("by_parentPageId_and_archivedAt", (q) =>
        q.eq("parentPageId", page._id).eq("archivedAt", null),
      )
      .take(200);
    await ctx.db.patch("pages", page._id, {
      archivedAt: now,
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    await Promise.all(
      children.map((child) =>
        ctx.db.patch("pages", child._id, {
          parentPageId: page.parentPageId,
          updatedByProfileId: profile._id,
          updatedAt: now,
        }),
      ),
    );
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: profile._id,
      action: "page_archived",
      targetType: "page",
      targetId: page._id,
      title: `„${page.title}” je arhiviran/a`,
    });
    return page._id;
  },
});

export const addEntry = mutation({
  args: {
    pageId: v.id("pages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const cleaned = cleanPageContent(args.content);
    if (!cleaned.trim()) throw new Error("Sadržaj unosa ne može biti prazan.");

    const existingEntries = await ctx.db
      .query("pageEntries")
      .withIndex("by_pageId_and_position", (q) => q.eq("pageId", page._id))
      .collect();

    const maxPosition = existingEntries.reduce((max, e) => Math.max(max, e.position), 0);
    const now = Date.now();

    const entryId = await ctx.db.insert("pageEntries", {
      pageId: page._id,
      authorProfileId: profile._id,
      content: cleaned,
      position: maxPosition + 1,
      createdAt: now,
      updatedAt: now,
    });

    await insertContribution(ctx, {
      startupId: page.startupId,
      targetKind: "page",
      targetId: page._id,
      authorProfileId: profile._id,
      content: cleaned,
      sourceKind: "page_entry",
      sourceId: entryId,
      createdAt: now,
    });

    await ctx.db.patch("pages", page._id, {
      updatedByProfileId: profile._id,
      updatedAt: now,
    });

    return entryId;
  },
});

export const updateEntry = mutation({
  args: {
    pageId: v.id("pages"),
    entryId: v.id("pageEntries"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const entry = await ctx.db.get("pageEntries", args.entryId);
    if (entry === null || entry.pageId !== page._id) {
      throw new Error("Doprinos nije pronađen.");
    }
    if (entry.authorProfileId !== profile._id) {
      throw new Error("Možete urediti samo svoj doprinos.");
    }
    const content = cleanPageContent(args.content);
    if (!content.trim()) throw new Error("Doprinos ne može biti prazan.");
    const now = Date.now();
    await ctx.db.patch("pageEntries", entry._id, { content, updatedAt: now });
    const contribution = await ctx.db
      .query("contentContributions")
      .withIndex("by_sourceKind_and_sourceId", (q) =>
        q.eq("sourceKind", "page_entry").eq("sourceId", entry._id),
      )
      .unique();
    if (contribution !== null) {
      await ctx.db.patch("contentContributions", contribution._id, {
        content,
        updatedAt: now,
      });
    }
    return entry._id;
  },
});

export const deleteEntry = mutation({
  args: {
    pageId: v.id("pages"),
    entryId: v.id("pageEntries"),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const entry = await ctx.db.get("pageEntries", args.entryId);
    if (entry && entry.pageId === page._id) {
      if (entry.authorProfileId !== profile._id) {
        throw new Error(
          "Tuđ doprinos se uklanja samo jednoglasnim glasanjem.",
        );
      }
      await ctx.db.delete("pageEntries", args.entryId);
      const contribution = await ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_entry").eq("sourceId", entry._id),
        )
        .unique();
      if (contribution !== null) {
        await ctx.db.patch("contentContributions", contribution._id, {
          archivedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const listAreaCanvasPages = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    kind: v.optional(pageKindValidator),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const pagesQuery = ctx.db
      .query("pages")
      .withIndex("by_areaId_and_parentPageId_and_archivedAt_and_position", (q) =>
        q.eq("areaId", args.areaId).eq("parentPageId", null).eq("archivedAt", null)
      );

    const pages = await pagesQuery.collect();
    const filteredPages = args.kind ? pages.filter((p) => p.kind === args.kind) : pages;

    const edges = await ctx.db
      .query("pageEdges")
      .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
      .collect();

    // Map creator details for each page
    const pagesWithDetails = await Promise.all(
      filteredPages.map(async (p) => {
        const creator = await ctx.db.get("profiles", p.createdByProfileId);
        let creatorAvatarUrl = null;
        if (creator?.avatarStorageId) {
          creatorAvatarUrl = await ctx.storage.getUrl(creator.avatarStorageId);
        }
        return {
          ...p,
          creator: creator ? { displayName: creator.displayName, avatarUrl: creatorAvatarUrl } : null,
          canEdit: p.createdByProfileId === profile._id,
          canMove: p.createdByProfileId === profile._id,
          canResize: p.createdByProfileId === profile._id,
          canDeleteDirectly: p.createdByProfileId === profile._id,
          canRequestDeletion: p.createdByProfileId !== profile._id,
        };
      })
    );

    return {
      pages: pagesWithDetails,
      edges: edges
        .filter((edge) => edge.archivedAt !== undefined ? edge.archivedAt === null : true)
        .map((edge) => ({
          ...edge,
          canEdit: edge.authorProfileId === profile._id,
          canDeleteDirectly: edge.authorProfileId === profile._id,
          canRequestDeletion: edge.authorProfileId !== profile._id,
        })),
    };
  },
});

export const connectCanvasPages = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    nodeAId: v.id("pages"),
    nodeBId: v.id("pages"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    if (args.nodeAId === args.nodeBId) throw new Error("Ne možete povezati istu stavku.");
    const [nodeA, nodeB] = await Promise.all([
      ctx.db.get("pages", args.nodeAId),
      ctx.db.get("pages", args.nodeBId),
    ]);
    if (
      nodeA === null ||
      nodeB === null ||
      nodeA.startupId !== args.startupId ||
      nodeB.startupId !== args.startupId ||
      (nodeA.createdByProfileId !== profile._id &&
        nodeB.createdByProfileId !== profile._id)
    ) {
      throw new Error(
        "Vezu možete napraviti samo ako posedujete bar jednu karticu.",
      );
    }

    const pairKey = [args.nodeAId, args.nodeBId].sort().join(":");
    const existing = await ctx.db
      .query("pageEdges")
      .withIndex("by_areaId_and_pairKey", (q) =>
        q.eq("areaId", args.areaId).eq("pairKey", pairKey)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("pageEdges", {
      startupId: args.startupId,
      areaId: args.areaId,
      nodeAId: args.nodeAId,
      nodeBId: args.nodeBId,
      pairKey,
      label: args.label ? args.label.trim() : null,
      authorProfileId: profile._id,
      archivedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const disconnectCanvasPages = mutation({
  args: {
    startupId: v.id("startups"),
    edgeId: v.id("pageEdges"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const edge = await ctx.db.get("pageEdges", args.edgeId);
    if (
      edge &&
      edge.startupId === args.startupId &&
      edge.authorProfileId === profile._id
    ) {
      await ctx.db.patch("pageEdges", args.edgeId, {
        archivedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
