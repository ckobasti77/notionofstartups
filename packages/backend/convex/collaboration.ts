import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { requireStartupMember } from "./lib/auth";
import { contributionTargetKey } from "./lib/collaboration";
import {
  addComment,
  isCommentVisible,
  removeComment,
  restoreComment,
  updateComment,
} from "./lib/comments";
import {
  LEGACY_DELETION_VOTE_MESSAGE,
  LEGACY_NESTING_MESSAGE,
  commentPermissions,
  permissionError,
  type Actor,
} from "./lib/permissions";
import {
  archiveTargetForLegacyRequest,
  type LegacyDeletionTarget,
} from "./lib/trash";

const targetValidator = v.union(
  v.object({ kind: v.literal("idea"), id: v.id("ideaNodes") }),
  v.object({ kind: v.literal("idea_edge"), id: v.id("ideaEdges") }),
  v.object({ kind: v.literal("page"), id: v.id("pages") }),
  v.object({
    kind: v.literal("task_checkpoint"),
    id: v.id("taskCheckpoints"),
  }),
  v.object({
    kind: v.literal("page_edge"),
    id: v.id("pageCanvasEdgesV2"),
  }),
  v.object({
    kind: v.literal("page_relation"),
    id: v.id("pageRelations"),
  }),
  v.object({
    kind: v.literal("task_checkpoint_edge"),
    id: v.id("taskCheckpointCanvasEdges"),
  }),
  v.object({
    kind: v.literal("contribution"),
    id: v.id("contentContributions"),
  }),
  v.object({ kind: v.literal("recovered"), id: v.id("recoveredContent") }),
);

const contributionTargetValidator = v.union(
  v.object({ kind: v.literal("idea"), id: v.id("ideaNodes") }),
  v.object({ kind: v.literal("page"), id: v.id("pages") }),
  v.object({ kind: v.literal("area"), id: v.id("startupAreas") }),
  v.object({
    kind: v.literal("task_checkpoint"),
    id: v.id("taskCheckpoints"),
  }),
  v.object({ kind: v.literal("recovered"), id: v.id("recoveredContent") }),
);
const contributionTargetKindValidator = v.union(
  v.literal("idea"),
  v.literal("page"),
  v.literal("area"),
  v.literal("task_checkpoint"),
  v.literal("recovered"),
);
const contributionSourceKindValidator = v.union(
  v.literal("idea_original"),
  v.literal("page_entry"),
  v.literal("page_body"),
);
const contributionModerationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);
const contributionAuthorValidator = v.union(
  v.object({
    _id: v.id("profiles"),
    displayName: v.string(),
    email: v.string(),
    avatarUrl: v.union(v.string(), v.null()),
  }),
  v.null(),
);
const presentedContributionValidator = v.object({
  _id: v.id("contentContributions"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  targetKind: contributionTargetKindValidator,
  targetKey: v.string(),
  targetId: v.string(),
  authorProfileId: v.optional(v.id("profiles")),
  attribution: v.union(
    v.literal("author"),
    v.literal("legacy_neutral"),
  ),
  content: v.string(),
  sourceKind: v.optional(contributionSourceKindValidator),
  sourceId: v.optional(v.string()),
  moderationStatus: contributionModerationStatusValidator,
  mentionProfileIds: v.optional(v.array(v.id("profiles"))),
  editedAt: v.optional(v.number()),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  author: contributionAuthorValidator,
  canEdit: v.boolean(),
  canDeleteDirectly: v.boolean(),
  canRequestDeletion: v.boolean(),
  canModerate: v.boolean(),
});

type ReadCtx = QueryCtx | MutationCtx;
type DeletionTarget = LegacyDeletionTarget;

async function getProfileSummary(ctx: ReadCtx, profileId: Id<"profiles">) {
  const profile = await ctx.db.get("profiles", profileId);
  if (profile === null) return null;
  const avatarUrl = profile.avatarStorageId
    ? await ctx.storage.getUrl(profile.avatarStorageId)
    : null;
  return {
    _id: profile._id,
    displayName: profile.displayName,
    email: profile.email,
    avatarUrl,
  };
}

async function requireContributionTarget(
  ctx: ReadCtx,
  target:
    | { kind: "idea"; id: Id<"ideaNodes"> }
    | { kind: "page"; id: Id<"pages"> }
    | { kind: "area"; id: Id<"startupAreas"> }
    | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> }
    | { kind: "recovered"; id: Id<"recoveredContent"> },
) {
  if (target.kind === "idea") {
    const idea = await ctx.db.get("ideaNodes", target.id);
    if (idea === null || idea.archivedAt !== null) {
      throw new Error("Ideja nije pronađena.");
    }
    return {
      kind: target.kind,
      startupId: idea.startupId,
      targetId: idea._id,
      ownerProfileId: idea.authorProfileId,
    };
  }
  if (target.kind === "page") {
    const page = await ctx.db.get("pages", target.id);
    if (page === null || page.archivedAt !== null) {
      throw new Error("Stranica nije pronađena.");
    }
    return {
      kind: target.kind,
      startupId: page.startupId,
      targetId: page._id,
      ownerProfileId: page.createdByProfileId,
    };
  }
  if (target.kind === "area") {
    const area = await ctx.db.get("startupAreas", target.id);
    const startup =
      area === null ? null : await ctx.db.get("startups", area.startupId);
    if (
      area === null ||
      startup === null ||
      startup.archivedAt !== null
    ) {
      throw new Error("Oblast nije pronađena.");
    }
    return {
      kind: target.kind,
      startupId: area.startupId,
      targetId: area._id,
      ownerProfileId: startup.createdByProfileId,
    };
  }
  if (target.kind === "task_checkpoint") {
    const checkpoint = await ctx.db.get("taskCheckpoints", target.id);
    const page =
      checkpoint === null ? null : await ctx.db.get("pages", checkpoint.taskPageId);
    if (
      checkpoint === null ||
      checkpoint.archivedAt !== null ||
      page === null ||
      page.archivedAt !== null ||
      page.kind !== "task"
    ) {
      throw new Error("Checkpoint nije pronađen.");
    }
    return {
      kind: target.kind,
      startupId: checkpoint.startupId,
      targetId: checkpoint._id,
      ownerProfileId: page.createdByProfileId,
    };
  }
  const recovered = await ctx.db.get("recoveredContent", target.id);
  if (recovered === null || recovered.archivedAt !== null) {
    throw new Error("Oporavljeni sadržaj nije pronađen.");
  }
  return {
    kind: target.kind,
    startupId: recovered.startupId,
    targetId: recovered._id,
    ownerProfileId: recovered.createdByProfileId,
  };
}

async function presentContribution(
  ctx: ReadCtx,
  row: Doc<"contentContributions">,
  actor: Actor,
  ownerProfileId: Id<"profiles">,
) {
  const permissions = commentPermissions(actor, row);
  return {
    ...row,
    moderationStatus: row.moderationStatus ?? "approved",
    author:
      row.authorProfileId === undefined
        ? null
        : await getProfileSummary(ctx, row.authorProfileId),
    // PROSTOR P5: izmena je autorova (R13), uklanja autor ili menadžer (R14);
    // glasanje o brisanju ne postoji, `canRequestDeletion` ostaje za stare klijente.
    canEdit: permissions.canEdit,
    canDeleteDirectly: permissions.canRemove,
    canRequestDeletion: false,
    canModerate:
      ownerProfileId === actor.profile._id &&
      row.authorProfileId !== actor.profile._id,
  };
}

async function deletionTargetInfo(
  ctx: ReadCtx,
  target: DeletionTarget,
): Promise<{
  startupId: Id<"startups">;
  title: string;
  ownerProfileId: Id<"profiles"> | null;
}> {
  if (target.kind === "idea") {
    const idea = await ctx.db.get("ideaNodes", target.id);
    if (idea === null || idea.archivedAt !== null) {
      throw new Error("Ideja nije pronađena.");
    }
    return {
      startupId: idea.startupId,
      title: idea.title ?? idea.text.slice(0, 80),
      ownerProfileId: idea.authorProfileId,
    };
  }
  if (target.kind === "idea_edge") {
    const edge = await ctx.db.get("ideaEdges", target.id);
    if (edge === null || edge.archivedAt !== null) {
      throw new Error("Veza nije pronađena.");
    }
    return {
      startupId: edge.startupId,
      title: edge.label ?? "Veza između ideja",
      ownerProfileId: edge.authorProfileId,
    };
  }
  if (target.kind === "page") {
    const page = await ctx.db.get("pages", target.id);
    if (page === null || page.archivedAt !== null) {
      throw new Error("Stranica nije pronađena.");
    }
    return {
      startupId: page.startupId,
      title: page.title,
      ownerProfileId: page.createdByProfileId,
    };
  }
  if (target.kind === "page_edge") {
    const edge = await ctx.db.get("pageCanvasEdgesV2", target.id);
    if (edge === null || edge.archivedAt !== null) {
      throw new Error("Veza stranica nije pronađena.");
    }
    return {
      startupId: edge.startupId,
      title: edge.label ?? "Veza između stranica",
      ownerProfileId: edge.authorProfileId ?? null,
    };
  }
  if (target.kind === "page_relation") {
    const relation = await ctx.db.get("pageRelations", target.id);
    if (relation === null || relation.archivedAt !== null) {
      throw new Error("Relacija stranica nije pronađena.");
    }
    return {
      startupId: relation.startupId,
      title: relation.label ?? "Note ↔ Task relacija",
      ownerProfileId: relation.authorProfileId,
    };
  }
  if (target.kind === "task_checkpoint_edge") {
    const edge = await ctx.db.get("taskCheckpointCanvasEdges", target.id);
    if (edge === null || edge.archivedAt !== null) {
      throw new Error("Checkpoint veza nije pronađena.");
    }
    return {
      startupId: edge.startupId,
      title: "Veza checkpointa na Canvas-u",
      ownerProfileId: edge.authorProfileId,
    };
  }
  if (target.kind === "task_checkpoint") {
    const checkpoint = await ctx.db.get("taskCheckpoints", target.id);
    if (checkpoint === null || checkpoint.archivedAt !== null) {
      throw new Error("Checkpoint nije pronađen.");
    }
    const page = await ctx.db.get("pages", checkpoint.taskPageId);
    if (page === null || page.archivedAt !== null || page.kind !== "task") {
      throw new Error("Zadatak checkpointa nije pronađen.");
    }
    return {
      startupId: checkpoint.startupId,
      title: checkpoint.text,
      ownerProfileId: page.createdByProfileId,
    };
  }
  if (target.kind === "contribution") {
    const contribution = await ctx.db.get("contentContributions", target.id);
    if (contribution === null || contribution.archivedAt !== null) {
      throw new Error("Tekst nije pronađen.");
    }
    return {
      startupId: contribution.startupId,
      title: contribution.content.replace(/<[^>]+>/g, " ").slice(0, 80),
      ownerProfileId: contribution.authorProfileId ?? null,
    };
  }
  const recovered = await ctx.db.get("recoveredContent", target.id);
  if (recovered === null || recovered.archivedAt !== null) {
    throw new Error("Oporavljeni sadržaj nije pronađen.");
  }
  return {
    startupId: recovered.startupId,
    title: recovered.title,
    ownerProfileId: null,
  };
}

export const listContributions = query({
  args: { target: contributionTargetValidator },
  returns: v.array(presentedContributionValidator),
  handler: async (ctx, args) => {
    const resolved = await requireContributionTarget(ctx, args.target);
    const actor = await requireStartupMember(ctx, resolved.startupId);
    const rows = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q
          .eq(
            "targetKey",
            contributionTargetKey(args.target.kind, resolved.targetId),
          )
          .eq("archivedAt", null),
      )
      .order("asc")
      .take(200);
    return await Promise.all(
      rows
        .filter((row) =>
          isCommentVisible(row, actor.profile._id, resolved.ownerProfileId),
        )
        .map((row) =>
          presentContribution(ctx, row, actor, resolved.ownerProfileId),
        ),
    );
  },
});

export const listContributionsPaginated = query({
  args: {
    target: contributionTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(presentedContributionValidator),
  handler: async (ctx, args) => {
    const resolved = await requireContributionTarget(ctx, args.target);
    const actor = await requireStartupMember(ctx, resolved.startupId);
    const result = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q
          .eq(
            "targetKey",
            contributionTargetKey(args.target.kind, resolved.targetId),
          )
          .eq("archivedAt", null),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    const visibleRows = result.page.filter((row) =>
      isCommentVisible(row, actor.profile._id, resolved.ownerProfileId),
    );
    return {
      ...result,
      page: await Promise.all(
        visibleRows.map((row) =>
          presentContribution(ctx, row, actor, resolved.ownerProfileId),
        ),
      ),
    };
  },
});

export const addContribution = mutation({
  args: {
    target: contributionTargetValidator,
    content: v.string(),
    mentionProfileIds: v.optional(v.array(v.id("profiles"))),
  },
  returns: v.id("contentContributions"),
  handler: async (ctx, args) => {
    // PROSTOR P5: komentar je odmah vidljiv (bez moderacije); isti tok kao
    // `comments.add`, pa i obaveštenja i aktivnost `comment_created`.
    return await addComment(ctx, {
      target: args.target,
      content: args.content,
      mentionProfileIds: args.mentionProfileIds,
    });
  },
});

export const updateContribution = mutation({
  args: {
    contributionId: v.id("contentContributions"),
    content: v.string(),
    mentionProfileIds: v.optional(v.array(v.id("profiles"))),
  },
  returns: v.id("contentContributions"),
  handler: async (ctx, args) => {
    // Izmena ne vraća komentar na ideji u „na čekanju" (P5).
    return await updateComment(ctx, {
      commentId: args.contributionId,
      content: args.content,
      mentionProfileIds: args.mentionProfileIds,
    });
  },
});

export const moderateContribution = mutation({
  args: {
    contributionId: v.id("contentContributions"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contribution = await ctx.db.get(
      "contentContributions",
      args.contributionId,
    );
    if (
      contribution === null ||
      contribution.archivedAt !== null ||
      contribution.targetKind !== "idea" ||
      contribution.sourceKind === "idea_original"
    ) {
      throw new Error("Tekst nije pronađen.");
    }
    const ideaId = ctx.db.normalizeId("ideaNodes", contribution.targetId);
    const idea = ideaId === null ? null : await ctx.db.get("ideaNodes", ideaId);
    if (
      idea === null ||
      idea.archivedAt !== null ||
      idea.startupId !== contribution.startupId
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    const { profile } = await requireStartupMember(ctx, idea.startupId);
    if (idea.authorProfileId !== profile._id) {
      throw new Error("Samo osnivač ideje može da odluči o ovom tekstu.");
    }
    if (contribution.authorProfileId === profile._id) {
      throw new Error("Svoj tekst uređujete direktno.");
    }

    const moderationStatus =
      args.decision === "approve" ? "approved" : "rejected";
    await ctx.db.patch("contentContributions", contribution._id, {
      moderationStatus,
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      startupId: idea.startupId,
      actorProfileId: profile._id,
      action: "contribution_updated",
      targetType: "contribution",
      targetId: contribution._id,
      title:
        args.decision === "approve" ? "Tekst je odobren" : "Tekst je odbijen",
    });
    return null;
  },
});

export const deleteOwnContribution = mutation({
  args: { contributionId: v.id("contentContributions") },
  returns: v.object({
    contributionId: v.id("contentContributions"),
    undoUntil: v.number(),
  }),
  handler: async (ctx, args) => {
    // R14: autor svoj, vlasnik startupa i admin tuđi; red se arhivira (8 s „Poništi").
    const result = await removeComment(ctx, args.contributionId);
    return { contributionId: result.commentId, undoUntil: result.undoUntil };
  },
});

export const restoreOwnContribution = mutation({
  args: { contributionId: v.id("contentContributions") },
  returns: v.id("contentContributions"),
  handler: async (ctx, args) => {
    return await restoreComment(ctx, args.contributionId);
  },
});

/**
 * Stari tok „Zatraži brisanje" (PROSTOR P4, ODLUKA K03-1): umesto glasanja
 * stavka se uklanja odmah po novom pravilu — stranica i ideja u Korpu, veze i
 * relacije direktno, korak po pravu izmene zadatka, komentar po pravu
 * uklanjanja. Ne pravi red u `deletionRequests`, listiće ni obaveštenja, pa
 * vraća `null` (stari klijenti povratnu vrednost ne koriste).
 */
export const requestDeletion = mutation({
  args: { target: targetValidator },
  returns: v.union(v.id("deletionRequests"), v.null()),
  handler: async (ctx, args) => {
    const target = args.target as DeletionTarget;
    const info = await deletionTargetInfo(ctx, target);
    const actor = await requireStartupMember(ctx, info.startupId);
    await archiveTargetForLegacyRequest(ctx, {
      actor,
      target,
      now: Date.now(),
    });
    return null;
  },
});

export const voteOnDeletion = mutation({
  args: {
    requestId: v.id("deletionRequests"),
    vote: v.union(v.literal("approve"), v.literal("reject")),
  },
  returns: v.id("deletionRequests"),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("deletionRequests", args.requestId);
    if (request === null) throw new Error("Glasanje više nije otvoreno.");
    await requireStartupMember(ctx, request.startupId);
    // PROSTOR P4: glasanje o brisanju je ugašeno — glas se ne upisuje.
    throw permissionError("STARI_TOK", LEGACY_DELETION_VOTE_MESSAGE);
  },
});

export const withdrawDeletion = mutation({
  args: { requestId: v.id("deletionRequests") },
  returns: v.id("deletionRequests"),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("deletionRequests", args.requestId);
    if (request === null || request.status !== "pending") {
      throw new Error("Glasanje više nije otvoreno.");
    }
    const { profile } = await requireStartupMember(ctx, request.startupId);
    if (request.requesterProfileId !== profile._id) {
      throw new Error("Samo podnosilac može povući zahtev.");
    }
    await ctx.db.patch("deletionRequests", request._id, {
      status: "withdrawn",
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return request._id;
  },
});

async function absoluteIdeaPosition(
  ctx: ReadCtx,
  idea: Doc<"ideaNodes">,
) {
  let x = idea.x;
  let y = idea.y;
  let parentId = idea.parentIdeaId;
  const seen = new Set<string>([idea._id]);
  for (let depth = 0; parentId !== undefined && depth < 512; depth += 1) {
    if (seen.has(parentId)) throw new Error("Otkrivena je kružna hijerarhija.");
    seen.add(parentId);
    const parent = await ctx.db.get("ideaNodes", parentId);
    if (parent === null || parent.archivedAt !== null) break;
    x += parent.x;
    y += parent.y;
    parentId = parent.parentIdeaId;
  }
  return { x, y };
}

async function assertNoIdeaCycle(
  ctx: ReadCtx,
  childId: Id<"ideaNodes">,
  parentId: Id<"ideaNodes">,
) {
  if (childId === parentId) throw new Error("Ideja ne može biti sopstveni Parent.");
  let cursor: Id<"ideaNodes"> | undefined = parentId;
  for (let depth = 0; cursor !== undefined && depth < 512; depth += 1) {
    if (cursor === childId) {
      throw new Error("Ugnježđavanje bi napravilo kružnu hijerarhiju.");
    }
    const node: Doc<"ideaNodes"> | null = await ctx.db.get(
      "ideaNodes",
      cursor,
    );
    cursor = node?.parentIdeaId;
  }
  if (cursor !== undefined) {
    throw new Error("Hijerarhija je preduboka za bezbednu proveru.");
  }
}

async function assertNoPendingIdeaCycle(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  childId: Id<"ideaNodes">,
  parentId: Id<"ideaNodes">,
) {
  const pending = await ctx.db
    .query("nestingRequests")
    .withIndex("by_startupId_and_status_and_updatedAt", (q) =>
      q.eq("startupId", startupId).eq("status", "pending"),
    )
    .order("desc")
    .take(500);
  const pendingParentByChildId = new Map<
    Id<"ideaNodes">,
    Id<"ideaNodes">
  >();
  for (const request of pending) {
    if (!pendingParentByChildId.has(request.childIdeaId)) {
      pendingParentByChildId.set(request.childIdeaId, request.parentIdeaId);
    }
  }
  let cursor: Id<"ideaNodes"> | undefined = parentId;
  const seen = new Set<string>();
  for (let depth = 0; cursor !== undefined && depth < 512; depth += 1) {
    if (cursor === childId || seen.has(cursor)) {
      throw new Error("Ugnježđavanje bi napravilo kružnu hijerarhiju.");
    }
    seen.add(cursor);
    const pendingParent = pendingParentByChildId.get(cursor);
    if (pendingParent !== undefined) {
      cursor = pendingParent;
      continue;
    }
    const node: Doc<"ideaNodes"> | null = await ctx.db.get(
      "ideaNodes",
      cursor,
    );
    cursor = node?.parentIdeaId;
  }
  if (cursor !== undefined) {
    throw new Error("Hijerarhija je preduboka za bezbednu proveru.");
  }
}

async function applyIdeaNesting(
  ctx: MutationCtx,
  child: Doc<"ideaNodes">,
  parent: Doc<"ideaNodes">,
  proposedPosition?: { x: number; y: number },
) {
  await assertNoIdeaCycle(ctx, child._id, parent._id);
  const childAbsolute =
    proposedPosition === undefined
      ? await absoluteIdeaPosition(ctx, child)
      : null;
  const parentAbsolute =
    proposedPosition === undefined
      ? await absoluteIdeaPosition(ctx, parent)
      : null;
  await ctx.db.patch("ideaNodes", child._id, {
    parentIdeaId: parent._id,
    x:
      proposedPosition?.x ??
      (childAbsolute?.x ?? 0) - (parentAbsolute?.x ?? 0),
    y:
      proposedPosition?.y ??
      (childAbsolute?.y ?? 0) - (parentAbsolute?.y ?? 0),
    updatedAt: Date.now(),
  });
}

/** Stari zahtevi deteta koji UI još prikazuje kao ugnežđavanje „na čekanju". */
async function legacyNestingForChild(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  childId: Id<"ideaNodes">,
  profileId: Id<"profiles">,
) {
  const [pending, rejectedAsRequester, rejectedAsParent] = await Promise.all([
    ctx.db
      .query("nestingRequests")
      .withIndex("by_startupId_and_status_and_updatedAt", (q) =>
        q.eq("startupId", startupId).eq("status", "pending"),
      )
      .order("desc")
      .take(500),
    ctx.db
      .query("nestingRequests")
      .withIndex("by_requesterProfileId_and_status_and_createdAt", (q) =>
        q.eq("requesterProfileId", profileId).eq("status", "rejected"),
      )
      .order("desc")
      .take(500),
    ctx.db
      .query("nestingRequests")
      .withIndex("by_parentAuthorProfileId_and_status_and_createdAt", (q) =>
        q.eq("parentAuthorProfileId", profileId).eq("status", "rejected"),
      )
      .order("desc")
      .take(500),
  ]);
  return [...pending, ...rejectedAsRequester, ...rejectedAsParent].filter(
    (request) =>
      request.startupId === startupId && request.childIdeaId === childId,
  );
}

/**
 * Ugnežđavanje ideje (PROSTOR P4): svaki član ugnežđava odmah, ciklus se i dalje
 * odbija. Stari zahtev za isto dete se zatvara; novi se ne pravi.
 */
export const requestNesting = mutation({
  args: {
    startupId: v.id("startups"),
    childIdeaId: v.id("ideaNodes"),
    parentIdeaId: v.id("ideaNodes"),
  },
  // Uvek `approved`; tip ostaje širok zbog starih klijenata (P25).
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "approved" | "pending";
    requestId: Id<"nestingRequests"> | null;
  }> => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const [child, parent] = await Promise.all([
      ctx.db.get("ideaNodes", args.childIdeaId),
      ctx.db.get("ideaNodes", args.parentIdeaId),
    ]);
    if (
      child === null ||
      parent === null ||
      child.archivedAt !== null ||
      parent.archivedAt !== null ||
      child.startupId !== args.startupId ||
      parent.startupId !== args.startupId
    ) {
      throw new Error("Ideja nije pronađena u ovom startupu.");
    }
    await assertNoIdeaCycle(ctx, child._id, parent._id);
    await assertNoPendingIdeaCycle(
      ctx,
      args.startupId,
      child._id,
      parent._id,
    );
    await applyIdeaNesting(ctx, child, parent);
    const now = Date.now();
    const legacy = await legacyNestingForChild(
      ctx,
      args.startupId,
      child._id,
      profile._id,
    );
    for (const request of legacy) {
      await ctx.db.patch("nestingRequests", request._id, {
        status: "cancelled",
        resolvedAt: now,
        updatedAt: now,
      });
    }
    return { status: "approved" as const, requestId: null };
  },
});

export const resolveNesting = mutation({
  args: {
    requestId: v.id("nestingRequests"),
    approve: v.boolean(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get("nestingRequests", args.requestId);
    if (request === null) throw new Error("Zahtev više nije otvoren.");
    await requireStartupMember(ctx, request.startupId);
    // PROSTOR P4: odobravanje ugnežđavanja je ugašeno.
    throw permissionError("STARI_TOK", LEGACY_NESTING_MESSAGE);
  },
});

/**
 * Izvlačenje ideje iz roditelja (PROSTOR P4): svaki član. Ako UI dete prikazuje
 * kroz stari zahtev (na čekanju ili odbijen), izvlačenje taj zahtev zatvara.
 */
export const detachIdea = mutation({
  args: {
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const child = await ctx.db.get("ideaNodes", args.ideaId);
    if (
      child === null ||
      child.archivedAt !== null ||
      child.startupId !== args.startupId
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    const legacy = await legacyNestingForChild(
      ctx,
      args.startupId,
      child._id,
      profile._id,
    );
    const virtualRequest = legacy.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (virtualRequest !== undefined) {
      const now = Date.now();
      await ctx.db.patch("nestingRequests", virtualRequest._id, {
        status: "cancelled",
        resolvedAt: now,
        updatedAt: now,
      });
      return child._id;
    }
    if (child.parentIdeaId === undefined) {
      throw new Error("Ugnježđena ideja nije pronađena.");
    }
    const absolute = await absoluteIdeaPosition(ctx, child);
    await ctx.db.patch("ideaNodes", child._id, {
      parentIdeaId: undefined,
      x: absolute.x,
      y: absolute.y,
      updatedAt: Date.now(),
    });
    return child._id;
  },
});

export const overview = query({
  args: { startupId: v.id("startups") },
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    // PROSTOR P4: glasanja i zahteva više nema — stari otvoreni se ne nude kao
    // radnje (oblik ostaje zbog starih klijenata, P25). Oporavljeno i istorija
    // ostaju dok ih klijenti ne čitaju iz Korpe.
    const recovered = await ctx.db
      .query("recoveredContent")
      .withIndex("by_startupId_and_archivedAt_and_createdAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null),
      )
      .order("desc")
      .take(100);
    const requestsForVote: Doc<"deletionRequests">[] = [];
    const nestingForMe: Array<
      Doc<"nestingRequests"> & {
        child: Doc<"ideaNodes"> | null;
        parent: Doc<"ideaNodes"> | null;
        requester: Awaited<ReturnType<typeof getProfileSummary>>;
      }
    > = [];
    const myDeletion: Doc<"deletionRequests">[] = [];
    const myNesting: Doc<"nestingRequests">[] = [];
    const historyStatuses = [
      "approved",
      "rejected",
      "withdrawn",
      "cancelled",
    ] as const;
    const history = (
      await Promise.all(
        historyStatuses.map((status) =>
          ctx.db
            .query("deletionRequests")
            .withIndex("by_startupId_and_status_and_createdAt", (q) =>
              q.eq("startupId", args.startupId).eq("status", status),
            )
            .order("desc")
            .take(25),
        ),
      )
    )
      .flat()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);

    const recoveredWithContributions = await Promise.all(
      recovered.map(async (item) => {
        const contributions = await ctx.db
          .query("contentContributions")
          .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
            q
              .eq("targetKey", contributionTargetKey("recovered", item._id))
              .eq("archivedAt", null),
          )
          .order("asc")
          .take(100);
        return {
          ...item,
          contributions: await Promise.all(
            contributions.map(async (contribution) => ({
              ...contribution,
              author:
                contribution.authorProfileId === undefined
                  ? null
                  : await getProfileSummary(
                      ctx,
                      contribution.authorProfileId,
                    ),
            })),
          ),
        };
      }),
    );

    return {
      pendingCount: 0,
      requestsForVote,
      nestingForMe,
      myRequests: {
        deletion: myDeletion,
        nesting: myNesting,
      },
      recovered: recoveredWithContributions,
      history,
    };
  },
});
