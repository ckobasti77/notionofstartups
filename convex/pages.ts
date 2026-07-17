import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { recordActivity } from "./lib/activity";
import { requireProfileInStartup, requireStartupMember } from "./lib/auth";
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

function cleanContent(content: string) {
  if (content.length > 80_000) throw new Error("Sadržaj može imati najviše 80.000 znakova.");
  return content;
}

function cleanPosition(position: number | undefined) {
  if (position === undefined) return Date.now();
  if (!Number.isFinite(position)) throw new Error("Pozicija stranice nije ispravna.");
  return position;
}

async function requireArea(
  ctx: Parameters<typeof requireStartupMember>[0],
  startupId: Id<"startups">,
  areaId: Id<"startupAreas">,
) {
  const area = await ctx.db.get("startupAreas", areaId);
  if (area === null || area.startupId !== startupId) {
    throw new Error("Oblast nije pronađena u ovom startupu.");
  }
  return area;
}

async function requireParent(
  ctx: Parameters<typeof requireStartupMember>[0],
  startupId: Id<"startups">,
  areaId: Id<"startupAreas">,
  parentPageId: Id<"pages"> | null,
) {
  if (parentPageId === null) return null;
  const parent = await requireVisiblePage(ctx, parentPageId);
  if (parent.startupId !== startupId || parent.areaId !== areaId) {
    throw new Error("Roditeljska stranica mora biti u istoj oblasti.");
  }
  return parent;
}

export const listChildren = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    await requireArea(ctx, args.startupId, args.areaId);
    await requireParent(ctx, args.startupId, args.areaId, args.parentPageId);
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
    await requireStartupMember(ctx, page.startupId);
    const [body, creator, updater, assignee] = await Promise.all([
      ctx.db
        .query("pageBodies")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique(),
      ctx.db.get("profiles", page.createdByProfileId),
      ctx.db.get("profiles", page.updatedByProfileId),
      page.assigneeProfileId === null
        ? Promise.resolve(null)
        : ctx.db.get("profiles", page.assigneeProfileId),
    ]);
    return { ...page, content: body?.content ?? "", creator, updater, assignee };
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
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireArea(ctx, args.startupId, args.areaId);
    await requireParent(ctx, args.startupId, args.areaId, args.parentPageId);
    if (args.kind === "note" && (
      args.taskStatus !== undefined ||
      args.taskPriority !== undefined ||
      args.assigneeProfileId !== undefined ||
      args.dueDate !== undefined
    )) {
      throw new Error("Task podaci se mogu dodati samo task stranici.");
    }
    if (args.assigneeProfileId !== undefined) {
      await requireProfileInStartup(ctx, args.startupId, args.assigneeProfileId);
    }
    if (args.dueDate !== undefined && (!Number.isFinite(args.dueDate) || args.dueDate < 0)) {
      throw new Error("Rok nije ispravan.");
    }

    const title = cleanRequiredText(args.title, "Naslov", 200);
    const content = cleanContent(args.content ?? "");
    const now = Date.now();
    const pageId = await ctx.db.insert("pages", {
      startupId: args.startupId,
      areaId: args.areaId,
      parentPageId: args.parentPageId,
      kind: args.kind,
      title,
      searchText: pageSearchText(title, content),
      revision: 0,
      position: cleanPosition(args.position),
      taskStatus: args.kind === "task" ? args.taskStatus ?? "backlog" : null,
      taskPriority: args.kind === "task" ? args.taskPriority ?? "medium" : null,
      assigneeProfileId:
        args.kind === "task" ? args.assigneeProfileId ?? null : null,
      dueDate: args.kind === "task" ? args.dueDate ?? null : null,
      taskSortAt: pageTaskSortAt(
        args.kind === "task" ? args.dueDate ?? null : null,
        now,
      ),
      createdByProfileId: profile._id,
      updatedByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("pageBodies", { pageId, content, updatedAt: now });
    await recordActivity(ctx, {
      startupId: args.startupId,
      actorProfileId: profile._id,
      action: "page_created",
      targetType: "page",
      targetId: pageId,
      title: `${args.kind === "task" ? "Task" : "Stranica"} „${title}” je kreiran/a`,
    });
    return pageId;
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
    const content = args.content === undefined ? currentContent : cleanContent(args.content);
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
    await requireArea(ctx, page.startupId, args.areaId);
    if (args.parentPageId === page._id) throw new Error("Stranica ne može biti sopstveni roditelj.");
    const parent = await requireParent(ctx, page.startupId, args.areaId, args.parentPageId);
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
      position: cleanPosition(args.position),
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
    const now = Date.now();
    const descendants = await getActivePageDescendants(ctx, page._id);
    await ctx.db.patch("pages", page._id, {
      archivedAt: now,
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    await Promise.all(
      descendants.map((descendant) =>
        ctx.db.patch("pages", descendant._id, {
          archivedAt: now,
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
