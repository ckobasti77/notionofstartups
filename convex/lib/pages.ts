import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export async function requireVisiblePage(ctx: ReadCtx, pageId: Id<"pages">) {
  const page = await ctx.db.get("pages", pageId);
  if (page === null || page.archivedAt !== null) throw new Error("Stranica nije pronađena.");

  let parentPageId = page.parentPageId;
  for (let depth = 0; parentPageId !== null && depth < 64; depth += 1) {
    const parent = await ctx.db.get("pages", parentPageId);
    if (parent === null || parent.archivedAt !== null) {
      throw new Error("Stranica nije pronađena.");
    }
    parentPageId = parent.parentPageId;
    if (depth === 63 && parentPageId !== null) {
      throw new Error("Hijerarhija stranica je preduboka.");
    }
  }
  return page;
}

export async function isPageVisible(ctx: ReadCtx, pageId: Id<"pages">) {
  try {
    await requireVisiblePage(ctx, pageId);
    return true;
  } catch {
    return false;
  }
}

export async function getActivePageDescendants(
  ctx: ReadCtx,
  pageId: Id<"pages">,
) {
  const descendants: Doc<"pages">[] = [];
  const queue: Id<"pages">[] = [pageId];
  const visited = new Set<string>([pageId]);

  for (let index = 0; index < queue.length; index += 1) {
    const children = await ctx.db
      .query("pages")
      .withIndex("by_parentPageId_and_archivedAt", (q) =>
        q.eq("parentPageId", queue[index]).eq("archivedAt", null),
      )
      .take(251);
    if (descendants.length + children.length > 250) {
      throw new Error("Ova grana ima više od 250 stranica. Podelite je pre ove radnje.");
    }
    for (const child of children) {
      if (visited.has(child._id)) throw new Error("Hijerarhija stranica sadrži kružnu vezu.");
      visited.add(child._id);
      descendants.push(child);
      queue.push(child._id);
    }
  }
  return descendants;
}

export function summarizePage(page: Doc<"pages">) {
  return {
    _id: page._id,
    _creationTime: page._creationTime,
    startupId: page.startupId,
    areaId: page.areaId,
    parentPageId: page.parentPageId,
    kind: page.kind,
    title: page.title,
    searchText: "",
    revision: page.revision,
    position: page.position,
    taskStatus: page.taskStatus,
    taskPriority: page.taskPriority,
    assigneeProfileId: page.assigneeProfileId,
    dueDate: page.dueDate,
    taskSortAt: page.taskSortAt,
    createdByProfileId: page.createdByProfileId,
    updatedByProfileId: page.updatedByProfileId,
    archivedAt: page.archivedAt,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

export function pageSearchText(title: string, content: string) {
  return `${title}\n${content}`.slice(0, 16_000);
}

export function pageTaskSortAt(dueDate: number | null, updatedAt: number) {
  return dueDate ?? 8_000_000_000_000_000 - updatedAt;
}
