import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  archiveCanvasEdgeWithLegacyProjection,
  archivePageWithV2Sidecars,
} from "./areasV2";
import { recordActivity } from "./lib/activity";
import { requireStartupMember } from "./lib/auth";
import {
  archiveIdeaAndRelations,
  contributionTargetKey,
  insertContribution,
} from "./lib/collaboration";
import { cleanPageContent } from "./lib/page_creation";

const targetValidator = v.union(
  v.object({ kind: v.literal("idea"), id: v.id("ideaNodes") }),
  v.object({ kind: v.literal("idea_edge"), id: v.id("ideaEdges") }),
  v.object({ kind: v.literal("page"), id: v.id("pages") }),
  v.object({
    kind: v.literal("page_edge"),
    id: v.id("pageCanvasEdgesV2"),
  }),
  v.object({
    kind: v.literal("page_relation"),
    id: v.id("pageRelations"),
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
  v.object({ kind: v.literal("recovered"), id: v.id("recoveredContent") }),
);
const contributionTargetKindValidator = v.union(
  v.literal("idea"),
  v.literal("page"),
  v.literal("area"),
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
type DeletionTarget =
  | { kind: "idea"; id: Id<"ideaNodes"> }
  | { kind: "idea_edge"; id: Id<"ideaEdges"> }
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "page_edge"; id: Id<"pageCanvasEdgesV2"> }
  | { kind: "page_relation"; id: Id<"pageRelations"> }
  | { kind: "contribution"; id: Id<"contentContributions"> }
  | { kind: "recovered"; id: Id<"recoveredContent"> };

function cleanContribution(value: string) {
  const content = cleanPageContent(value);
  if (!content.trim()) throw new Error("Tekst ne može biti prazan.");
  if (content.length > 20_000) {
    throw new Error("Tekst može imati najviše 20.000 znakova.");
  }
  return content;
}

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

function contributionIsVisible(
  row: Doc<"contentContributions">,
  profileId: Id<"profiles">,
  ownerProfileId: Id<"profiles">,
) {
  if (row.moderationStatus !== "rejected") return true;
  return row.authorProfileId === profileId || ownerProfileId === profileId;
}

async function presentContribution(
  ctx: ReadCtx,
  row: Doc<"contentContributions">,
  profileId: Id<"profiles">,
  ownerProfileId: Id<"profiles">,
) {
  return {
    ...row,
    moderationStatus: row.moderationStatus ?? "approved",
    author:
      row.authorProfileId === undefined
        ? null
        : await getProfileSummary(ctx, row.authorProfileId),
    canEdit: row.authorProfileId === profileId,
    canDeleteDirectly: row.authorProfileId === profileId,
    canRequestDeletion:
      row.authorProfileId !== profileId && ownerProfileId !== profileId,
    canModerate:
      ownerProfileId === profileId && row.authorProfileId !== profileId,
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

export async function applyApprovedDeletion(
  ctx: MutationCtx,
  request: Doc<"deletionRequests">,
) {
  const now = Date.now();
  if (request.targetKind === "idea") {
    const id = ctx.db.normalizeId("ideaNodes", request.targetId);
    if (id !== null) await archiveIdeaAndRelations(ctx, id, now);
    return;
  }
  if (request.targetKind === "idea_edge") {
    const id = ctx.db.normalizeId("ideaEdges", request.targetId);
    const edge = id === null ? null : await ctx.db.get("ideaEdges", id);
    if (edge !== null && edge.archivedAt === null) {
      await ctx.db.patch("ideaEdges", edge._id, {
        archivedAt: now,
        updatedAt: now,
      });
    }
    return;
  }
  if (request.targetKind === "contribution") {
    const id = ctx.db.normalizeId("contentContributions", request.targetId);
    const contribution =
      id === null ? null : await ctx.db.get("contentContributions", id);
    if (contribution !== null && contribution.archivedAt === null) {
      await ctx.db.patch("contentContributions", contribution._id, {
        archivedAt: now,
        updatedAt: now,
      });
    }
    return;
  }
  if (request.targetKind === "page") {
    const id = ctx.db.normalizeId("pages", request.targetId);
    const page = id === null ? null : await ctx.db.get("pages", id);
    if (page !== null && page.archivedAt === null) {
      await archivePageWithV2Sidecars(
        ctx,
        page,
        request.requesterProfileId,
        now,
      );
    }
    return;
  }
  if (request.targetKind === "page_edge") {
    const id = ctx.db.normalizeId("pageCanvasEdgesV2", request.targetId);
    const edge =
      id === null ? null : await ctx.db.get("pageCanvasEdgesV2", id);
    if (
      edge !== null &&
      edge.archivedAt === null &&
      edge.startupId === request.startupId
    ) {
      await archiveCanvasEdgeWithLegacyProjection(ctx, edge, now);
    }
    return;
  }
  if (request.targetKind === "page_relation") {
    const id = ctx.db.normalizeId("pageRelations", request.targetId);
    const relation =
      id === null ? null : await ctx.db.get("pageRelations", id);
    if (
      relation !== null &&
      relation.archivedAt === null &&
      relation.startupId === request.startupId
    ) {
      await ctx.db.patch("pageRelations", relation._id, {
        archivedAt: now,
        updatedAt: now,
      });
    }
    return;
  }
  const id = ctx.db.normalizeId("recoveredContent", request.targetId);
  const recovered =
    id === null ? null : await ctx.db.get("recoveredContent", id);
  if (recovered !== null && recovered.archivedAt === null) {
    await ctx.db.patch("recoveredContent", recovered._id, {
      archivedAt: now,
      updatedAt: now,
    });
    const contributions = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q
          .eq(
            "targetKey",
            contributionTargetKey("recovered", recovered._id),
          )
          .eq("archivedAt", null),
      )
      .take(200);
    for (const contribution of contributions) {
      await ctx.db.patch("contentContributions", contribution._id, {
        archivedAt: now,
        updatedAt: now,
      });
    }
  }
}

export const listContributions = query({
  args: { target: contributionTargetValidator },
  returns: v.array(presentedContributionValidator),
  handler: async (ctx, args) => {
    const resolved = await requireContributionTarget(ctx, args.target);
    const { profile } = await requireStartupMember(ctx, resolved.startupId);
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
        .filter(
          (row) =>
            !(args.target.kind === "idea" && row.sourceKind === "idea_original") &&
            !(args.target.kind === "page" && row.sourceKind === "page_body") &&
            contributionIsVisible(row, profile._id, resolved.ownerProfileId),
        )
        .map((row) =>
          presentContribution(
            ctx,
            row,
            profile._id,
            resolved.ownerProfileId,
          ),
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
    const { profile } = await requireStartupMember(ctx, resolved.startupId);
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
    const visibleRows = result.page.filter(
      (row) =>
        !(args.target.kind === "idea" && row.sourceKind === "idea_original") &&
        !(args.target.kind === "page" && row.sourceKind === "page_body") &&
        contributionIsVisible(row, profile._id, resolved.ownerProfileId),
    );
    return {
      ...result,
      page: await Promise.all(
        visibleRows.map((row) =>
          presentContribution(
            ctx,
            row,
            profile._id,
            resolved.ownerProfileId,
          ),
        ),
      ),
    };
  },
});

export const addContribution = mutation({
  args: {
    target: contributionTargetValidator,
    content: v.string(),
  },
  returns: v.id("contentContributions"),
  handler: async (ctx, args) => {
    const resolved = await requireContributionTarget(ctx, args.target);
    const { profile } = await requireStartupMember(ctx, resolved.startupId);
    const contributionId = await insertContribution(ctx, {
      startupId: resolved.startupId,
      targetKind: args.target.kind,
      targetId: resolved.targetId,
      authorProfileId: profile._id,
      content: cleanContribution(args.content),
      moderationStatus:
        args.target.kind === "idea" ? "pending" : "approved",
    });
    await recordActivity(ctx, {
      startupId: resolved.startupId,
      actorProfileId: profile._id,
      action: "contribution_created",
      targetType: "contribution",
      targetId: contributionId,
      title: "Dodat je novi tekst",
    });
    return contributionId;
  },
});

export const updateContribution = mutation({
  args: {
    contributionId: v.id("contentContributions"),
    content: v.string(),
  },
  returns: v.id("contentContributions"),
  handler: async (ctx, args) => {
    const contribution = await ctx.db.get(
      "contentContributions",
      args.contributionId,
    );
    if (contribution === null || contribution.archivedAt !== null) {
      throw new Error("Tekst nije pronađen.");
    }
    const { profile } = await requireStartupMember(
      ctx,
      contribution.startupId,
    );
    if (contribution.authorProfileId !== profile._id) {
      throw new Error("Možete urediti samo svoj tekst.");
    }
    await ctx.db.patch("contentContributions", contribution._id, {
      content: cleanContribution(args.content),
      moderationStatus:
        contribution.targetKind === "idea" &&
        contribution.sourceKind !== "idea_original"
          ? "pending"
          : contribution.moderationStatus,
      updatedAt: Date.now(),
    });
    if (
      contribution.sourceKind === "page_entry" &&
      contribution.sourceId !== undefined
    ) {
      const entryId = ctx.db.normalizeId(
        "pageEntries",
        contribution.sourceId,
      );
      const entry =
        entryId === null ? null : await ctx.db.get("pageEntries", entryId);
      if (entry !== null && entry.authorProfileId === profile._id) {
        await ctx.db.patch("pageEntries", entry._id, {
          content: cleanContribution(args.content),
          updatedAt: Date.now(),
        });
      }
    }
    await recordActivity(ctx, {
      startupId: contribution.startupId,
      actorProfileId: profile._id,
      action: "contribution_updated",
      targetType: "contribution",
      targetId: contribution._id,
      title: "Tekst je izmenjen",
    });
    return contribution._id;
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
    const contribution = await ctx.db.get(
      "contentContributions",
      args.contributionId,
    );
    if (contribution === null || contribution.archivedAt !== null) {
      throw new Error("Tekst nije pronađen.");
    }
    const { profile } = await requireStartupMember(
      ctx,
      contribution.startupId,
    );
    if (contribution.authorProfileId !== profile._id) {
      throw new Error("Tuđa izmena se uklanja samo jednoglasnim glasanjem.");
    }
    const now = Date.now();
    await ctx.db.patch("contentContributions", contribution._id, {
      archivedAt: now,
      updatedAt: now,
    });
    return { contributionId: contribution._id, undoUntil: now + 8_000 };
  },
});

export const restoreOwnContribution = mutation({
  args: { contributionId: v.id("contentContributions") },
  returns: v.id("contentContributions"),
  handler: async (ctx, args) => {
    const contribution = await ctx.db.get(
      "contentContributions",
      args.contributionId,
    );
    if (contribution === null || contribution.archivedAt === null) {
      throw new Error("Tekst nije pronađen.");
    }
    const { profile } = await requireStartupMember(
      ctx,
      contribution.startupId,
    );
    if (contribution.authorProfileId !== profile._id) {
      throw new Error("Možete vratiti samo svoj tekst.");
    }
    if (Date.now() - contribution.archivedAt > 8_000) {
      throw new Error("Vreme za Undo je isteklo.");
    }
    await ctx.db.patch("contentContributions", contribution._id, {
      archivedAt: null,
      updatedAt: Date.now(),
    });
    return contribution._id;
  },
});

export const requestDeletion = mutation({
  args: { target: targetValidator },
  returns: v.id("deletionRequests"),
  handler: async (ctx, args) => {
    const target = args.target as DeletionTarget;
    const info = await deletionTargetInfo(ctx, target);
    const { profile } = await requireStartupMember(ctx, info.startupId);
    if (info.ownerProfileId === profile._id) {
      throw new Error("Sopstveni sadržaj brišete direktno.");
    }
    const existing = await ctx.db
      .query("deletionRequests")
      .withIndex("by_targetKind_and_targetId_and_status", (q) =>
        q
          .eq("targetKind", target.kind)
          .eq("targetId", target.id)
          .eq("status", "pending"),
      )
      .unique();
    if (existing !== null) {
      throw new Error("Za ovaj sadržaj već postoji otvoreno glasanje.");
    }
    const members = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_archivedAt_and_profileId", (q) =>
        q.eq("startupId", info.startupId).eq("archivedAt", null),
      )
      .take(501);
    if (members.length > 500) {
      throw new Error("Biračko telo je preveliko za jedno atomsko glasanje.");
    }
    const now = Date.now();
    const requestId = await ctx.db.insert("deletionRequests", {
      startupId: info.startupId,
      targetKind: target.kind,
      targetId: target.id,
      targetTitle: info.title,
      requesterProfileId: profile._id,
      status: "pending",
      eligibleCount: members.length,
      approveCount: 1,
      rejectCount: 0,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    });
    for (const membership of members) {
      await ctx.db.insert("deletionBallots", {
        requestId,
        startupId: info.startupId,
        profileId: membership.profileId,
        vote:
          membership.profileId === profile._id ? "approve" : "pending",
        createdAt: now,
        updatedAt: now,
      });
    }
    await recordActivity(ctx, {
      startupId: info.startupId,
      actorProfileId: profile._id,
      action: "deletion_requested",
      targetType: "request",
      targetId: requestId,
      title: `Pokrenuto je glasanje za brisanje: ${info.title}`,
    });
    if (members.length === 1) {
      const request = await ctx.db.get("deletionRequests", requestId);
      if (request !== null) {
        await applyApprovedDeletion(ctx, request);
        await ctx.db.patch("deletionRequests", requestId, {
          status: "approved",
          resolvedAt: now,
          updatedAt: now,
        });
      }
    }
    return requestId;
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
    if (request === null || request.status !== "pending") {
      throw new Error("Glasanje više nije otvoreno.");
    }
    const { profile } = await requireStartupMember(ctx, request.startupId);
    const ballot = await ctx.db
      .query("deletionBallots")
      .withIndex("by_requestId_and_profileId", (q) =>
        q.eq("requestId", request._id).eq("profileId", profile._id),
      )
      .unique();
    if (ballot === null || ballot.vote !== "pending") {
      throw new Error("Nemate otvoren glas za ovaj zahtev.");
    }
    const now = Date.now();
    await ctx.db.patch("deletionBallots", ballot._id, {
      vote: args.vote,
      updatedAt: now,
    });
    const approveCount =
      request.approveCount + (args.vote === "approve" ? 1 : 0);
    const rejectCount =
      request.rejectCount + (args.vote === "reject" ? 1 : 0);
    if (args.vote === "reject") {
      await ctx.db.patch("deletionRequests", request._id, {
        status: "rejected",
        approveCount,
        rejectCount,
        resolvedAt: now,
        updatedAt: now,
      });
    } else if (approveCount === request.eligibleCount) {
      await applyApprovedDeletion(ctx, request);
      await ctx.db.patch("deletionRequests", request._id, {
        status: "approved",
        approveCount,
        rejectCount,
        resolvedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("deletionRequests", request._id, {
        approveCount,
        rejectCount,
        updatedAt: now,
      });
    }
    await recordActivity(ctx, {
      startupId: request.startupId,
      actorProfileId: profile._id,
      action: "deletion_voted",
      targetType: "request",
      targetId: request._id,
      title:
        args.vote === "approve"
          ? "Glas ZA brisanje je zabeležen"
          : "Glas PROTIV je odbio brisanje",
    });
    return request._id;
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

export const requestNesting = mutation({
  args: {
    startupId: v.id("startups"),
    childIdeaId: v.id("ideaNodes"),
    parentIdeaId: v.id("ideaNodes"),
  },
  handler: async (ctx, args) => {
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
    if (child.authorProfileId !== profile._id) {
      throw new Error("Možete ugnjezditi samo svoju karticu.");
    }
    await assertNoIdeaCycle(ctx, child._id, parent._id);
    await assertNoPendingIdeaCycle(
      ctx,
      args.startupId,
      child._id,
      parent._id,
    );
    if (parent.authorProfileId === profile._id) {
      await applyIdeaNesting(ctx, child, parent);
      return { status: "approved" as const, requestId: null };
    }
    const childAbsolute = await absoluteIdeaPosition(ctx, child);
    const parentAbsolute = await absoluteIdeaPosition(ctx, parent);
    const previousPending = await ctx.db
      .query("nestingRequests")
      .withIndex("by_requesterProfileId_and_status_and_createdAt", (q) =>
        q
          .eq("requesterProfileId", profile._id)
          .eq("status", "pending"),
      )
      .take(100);
    const now = Date.now();
    for (const request of previousPending) {
      if (
        request.startupId === args.startupId &&
        request.childIdeaId === child._id
      ) {
        await ctx.db.patch("nestingRequests", request._id, {
          status: "cancelled",
          resolvedAt: now,
          updatedAt: now,
        });
      }
    }
    const requestId = await ctx.db.insert("nestingRequests", {
      startupId: args.startupId,
      childIdeaId: child._id,
      parentIdeaId: parent._id,
      requesterProfileId: profile._id,
      parentAuthorProfileId: parent.authorProfileId,
      proposedX: childAbsolute.x - parentAbsolute.x,
      proposedY: childAbsolute.y - parentAbsolute.y,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    });
    await recordActivity(ctx, {
      startupId: args.startupId,
      actorProfileId: profile._id,
      action: "nesting_requested",
      targetType: "request",
      targetId: requestId,
      title: "Poslat je zahtev za ugnježđavanje ideje",
    });
    return { status: "pending" as const, requestId };
  },
});

export const resolveNesting = mutation({
  args: {
    requestId: v.id("nestingRequests"),
    approve: v.boolean(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get("nestingRequests", args.requestId);
    if (request === null || request.status !== "pending") {
      throw new Error("Zahtev više nije otvoren.");
    }
    const { profile } = await requireStartupMember(ctx, request.startupId);
    if (request.parentAuthorProfileId !== profile._id) {
      throw new Error("Samo autor Parent kartice odlučuje o ovom zahtevu.");
    }
    const [child, parent] = await Promise.all([
      ctx.db.get("ideaNodes", request.childIdeaId),
      ctx.db.get("ideaNodes", request.parentIdeaId),
    ]);
    const now = Date.now();
    if (
      child === null ||
      parent === null ||
      child.archivedAt !== null ||
      parent.archivedAt !== null
    ) {
      await ctx.db.patch("nestingRequests", request._id, {
        status: "cancelled",
        resolvedAt: now,
        updatedAt: now,
      });
      throw new Error("Jedna od kartica više ne postoji.");
    }
    if (args.approve) {
      await applyIdeaNesting(
        ctx,
        child,
        parent,
        request.proposedX === undefined || request.proposedY === undefined
          ? undefined
          : { x: request.proposedX, y: request.proposedY },
      );
    }
    await ctx.db.patch("nestingRequests", request._id, {
      status: args.approve ? "approved" : "rejected",
      resolvedAt: now,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      startupId: request.startupId,
      actorProfileId: profile._id,
      action: "nesting_resolved",
      targetType: "request",
      targetId: request._id,
      title: args.approve
        ? "Ugnježđavanje je odobreno"
        : "Ugnježđavanje je odbijeno",
    });
    return request._id;
  },
});

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
    const [pending, rejectedAsRequester, rejectedAsParent] = await Promise.all([
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
    const virtualRequest = [
      ...pending,
      ...rejectedAsRequester,
      ...rejectedAsParent,
    ]
      .filter((request) => request.childIdeaId === child._id)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (virtualRequest !== undefined) {
      if (
        virtualRequest.requesterProfileId !== profile._id &&
        virtualRequest.parentAuthorProfileId !== profile._id
      ) {
        throw new Error(
          "Predlog može povući autor ili odbiti vlasnik Parent ideje.",
        );
      }
      const now = Date.now();
      await ctx.db.patch("nestingRequests", virtualRequest._id, {
        status:
          virtualRequest.status === "pending" &&
          virtualRequest.parentAuthorProfileId === profile._id
            ? "rejected"
            : "cancelled",
        resolvedAt: now,
        updatedAt: now,
      });
      return child._id;
    }
    if (child.parentIdeaId === undefined) {
      throw new Error("Ugnježđena ideja nije pronađena.");
    }
    const parent = await ctx.db.get("ideaNodes", child.parentIdeaId);
    if (
      child.authorProfileId !== profile._id &&
      parent?.authorProfileId !== profile._id
    ) {
      throw new Error("Karticu mogu izvući autor deteta ili direktnog Parenta.");
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
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const [ballots, nestingForMe, myDeletionRequests, myNestingRequests, recovered] =
      await Promise.all([
        ctx.db
          .query("deletionBallots")
          .withIndex("by_profileId_and_vote_and_createdAt", (q) =>
            q.eq("profileId", profile._id).eq("vote", "pending"),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("nestingRequests")
          .withIndex("by_parentAuthorProfileId_and_status_and_createdAt", (q) =>
            q
              .eq("parentAuthorProfileId", profile._id)
              .eq("status", "pending"),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("deletionRequests")
          .withIndex("by_requesterProfileId_and_status_and_createdAt", (q) =>
            q
              .eq("requesterProfileId", profile._id)
              .eq("status", "pending"),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("nestingRequests")
          .withIndex("by_requesterProfileId_and_status_and_createdAt", (q) =>
            q
              .eq("requesterProfileId", profile._id)
              .eq("status", "pending"),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("recoveredContent")
          .withIndex("by_startupId_and_archivedAt_and_createdAt", (q) =>
            q.eq("startupId", args.startupId).eq("archivedAt", null),
          )
          .order("desc")
          .take(100),
      ]);

    const requestsForVote = (
      await Promise.all(
        ballots.map((ballot) => ctx.db.get("deletionRequests", ballot.requestId)),
      )
    ).filter(
      (request): request is Doc<"deletionRequests"> =>
        request !== null &&
        request.startupId === args.startupId &&
        request.status === "pending",
    );
    const validNestingForMe = nestingForMe.filter(
      (request) => request.startupId === args.startupId,
    );
    const validMyDeletion = myDeletionRequests.filter(
      (request) => request.startupId === args.startupId,
    );
    const validMyNesting = myNestingRequests.filter(
      (request) => request.startupId === args.startupId,
    );
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
      pendingCount: requestsForVote.length + validNestingForMe.length,
      requestsForVote,
      nestingForMe: await Promise.all(
        validNestingForMe.map(async (request) => ({
          ...request,
          child: await ctx.db.get("ideaNodes", request.childIdeaId),
          parent: await ctx.db.get("ideaNodes", request.parentIdeaId),
          requester: await getProfileSummary(
            ctx,
            request.requesterProfileId,
          ),
        })),
      ),
      myRequests: {
        deletion: validMyDeletion,
        nesting: validMyNesting,
      },
      recovered: recoveredWithContributions,
      history,
    };
  },
});
