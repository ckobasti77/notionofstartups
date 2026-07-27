import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function contributionTargetKey(
  kind: "idea" | "page" | "area" | "recovered",
  id: string,
) {
  return `${kind}:${id}`;
}

export async function insertContribution(
  ctx: MutationCtx,
  value: {
    startupId: Id<"startups">;
    targetKind: "idea" | "page" | "area" | "recovered";
    targetId: string;
    authorProfileId?: Id<"profiles">;
    attribution?: "author" | "legacy_neutral";
    content: string;
    sourceKind?: "idea_original" | "page_entry" | "page_body";
    sourceId?: string;
    moderationStatus?: "pending" | "approved" | "rejected";
    createdAt?: number;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("contentContributions", {
    startupId: value.startupId,
    targetKind: value.targetKind,
    targetKey: contributionTargetKey(value.targetKind, value.targetId),
    targetId: value.targetId,
    authorProfileId: value.authorProfileId,
    attribution: value.attribution ?? "author",
    content: value.content,
    sourceKind: value.sourceKind,
    sourceId: value.sourceId,
    moderationStatus: value.moderationStatus,
    archivedAt: null,
    createdAt: value.createdAt ?? now,
    updatedAt: now,
  });
}

export async function detachIdeaChildren(
  ctx: MutationCtx,
  parentId: Id<"ideaNodes">,
  now: number,
) {
  const parent = await ctx.db.get("ideaNodes", parentId);
  if (parent === null) return;
  const children = await ctx.db
    .query("ideaNodes")
    .withIndex("by_parentIdeaId_and_archivedAt", (q) =>
      q.eq("parentIdeaId", parentId).eq("archivedAt", null),
    )
    .take(200);
  for (const child of children) {
    await ctx.db.patch("ideaNodes", child._id, {
      parentIdeaId: parent.parentIdeaId,
      x: child.x + parent.x,
      y: child.y + parent.y,
      updatedAt: now,
    });
  }
}

export async function archiveIdeaAndRelations(
  ctx: MutationCtx,
  ideaId: Id<"ideaNodes">,
  now: number,
) {
  const idea = await ctx.db.get("ideaNodes", ideaId);
  if (idea === null || idea.archivedAt !== null) return;
  await detachIdeaChildren(ctx, ideaId, now);
  await ctx.db.patch("ideaNodes", ideaId, { archivedAt: now, updatedAt: now });

  const edges = await ctx.db
    .query("ideaEdges")
    .withIndex("by_startupId_and_archivedAt", (q) =>
      q.eq("startupId", idea.startupId).eq("archivedAt", null),
    )
    .take(500);
  for (const edge of edges) {
    if (edge.nodeAId === ideaId || edge.nodeBId === ideaId) {
      await ctx.db.patch("ideaEdges", edge._id, {
        archivedAt: now,
        updatedAt: now,
      });
    }
  }

  const contributions = await ctx.db
    .query("contentContributions")
    .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
      q
        .eq("targetKey", contributionTargetKey("idea", ideaId))
        .eq("archivedAt", null),
    )
    .take(201);
  if (contributions.length > 200) {
    throw new Error("Ova ideja ima previše izmena za jedno atomsko brisanje.");
  }
  for (const contribution of contributions) {
    await ctx.db.patch("contentContributions", contribution._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
}
