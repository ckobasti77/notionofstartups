import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { recordActivity } from "./lib/activity";
import { archiveAssignmentsForProfile } from "./lib/task_assignees";
import {
  requireActiveProfile,
  requireAdmin,
  requireProfile,
  requireStartupMember,
} from "./lib/auth";
import {
  AREA_DEFINITIONS,
  boundedLimit,
  cleanOptionalText,
  cleanRequiredText,
} from "./lib/validators";
import { applyApprovedDeletion } from "./collaboration";

async function getAreas(
  ctx: Parameters<typeof requireProfile>[0],
  startupId: Parameters<typeof requireStartupMember>[1],
) {
  return await ctx.db
    .query("startupAreas")
    .withIndex("by_startupId_and_position", (q) => q.eq("startupId", startupId))
    .take(50);
}

async function withStartupDetails(
  ctx: Parameters<typeof requireProfile>[0],
  startup: Doc<"startups">,
) {
  return {
    ...startup,
    logoUrl:
      startup.logoStorageId === undefined
        ? null
        : await ctx.storage.getUrl(startup.logoStorageId),
    areas: await getAreas(ctx, startup._id),
  };
}

async function validateLogo(
  ctx: Parameters<typeof requireProfile>[0],
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (metadata === null) throw new Error("Logo nije pronađen.");
  if (!metadata.contentType?.startsWith("image/")) {
    throw new Error("Logo mora biti slika.");
  }
  if (metadata.size > 2 * 1024 * 1024) {
    throw new Error("Logo može imati najviše 2 MB.");
  }
}

export const listForCurrent = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const memberships = await ctx.db
      .query("startupMembers")
      .withIndex("by_profileId_and_createdAt", (q) =>
        q.eq("profileId", profile._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const result = [];
    for (const membership of memberships.page) {
      if (membership.archivedAt !== null) continue;
      const startup = await ctx.db.get("startups", membership.startupId);
      if (startup !== null && startup.archivedAt === null) {
        result.push(await withStartupDetails(ctx, startup));
      }
    }
    return {
      ...memberships,
      page: result.sort((a, b) => b.updatedAt - a.updatedAt),
    };
  },
});

export const get = query({
  args: { startupId: v.id("startups") },
  handler: async (ctx, args) => {
    const { startup } = await requireStartupMember(ctx, args.startupId);
    return await withStartupDetails(ctx, startup);
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setLogo = mutation({
  args: { startupId: v.id("startups"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const startup = await ctx.db.get("startups", args.startupId);
    if (startup === null || startup.archivedAt !== null) {
      throw new Error("Startup nije pronađen.");
    }
    await validateLogo(ctx, args.storageId);
    if (
      startup.logoStorageId !== undefined &&
      startup.logoStorageId !== args.storageId
    ) {
      await ctx.storage.delete(startup.logoStorageId);
    }
    await ctx.db.patch("startups", startup._id, {
      logoStorageId: args.storageId,
      updatedAt: Date.now(),
    });
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const removeLogo = mutation({
  args: { startupId: v.id("startups") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const startup = await ctx.db.get("startups", args.startupId);
    if (startup === null || startup.archivedAt !== null) {
      throw new Error("Startup nije pronađen.");
    }
    if (startup.logoStorageId !== undefined) {
      await ctx.storage.delete(startup.logoStorageId);
      await ctx.db.patch("startups", startup._id, {
        logoStorageId: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const name = cleanRequiredText(args.name, "Naziv startupa", 100);
    const description = cleanOptionalText(args.description, "Opis", 500) ?? "";
    if (args.logoStorageId !== undefined) {
      await validateLogo(ctx, args.logoStorageId);
    }
    const now = Date.now();
    const startupId = await ctx.db.insert("startups", {
      name,
      description,
      ...(args.logoStorageId === undefined
        ? {}
        : { logoStorageId: args.logoStorageId }),
      createdByProfileId: admin._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("startupMembers", {
      startupId,
      profileId: admin._id,
      addedByProfileId: admin._id,
      archivedAt: null,
      createdAt: now,
    });
    for (const area of AREA_DEFINITIONS) {
      await ctx.db.insert("startupAreas", {
        startupId,
        ...area,
        createdAt: now,
      });
    }
    await recordActivity(ctx, {
      startupId,
      actorProfileId: admin._id,
      action: "startup_created",
      targetType: "startup",
      targetId: startupId,
      title: `Startup „${name}” je kreiran`,
    });
    return startupId;
  },
});

export const update = mutation({
  args: {
    startupId: v.id("startups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const startup = await ctx.db.get("startups", args.startupId);
    if (startup === null || startup.archivedAt !== null) {
      throw new Error("Startup nije pronađen.");
    }
    const patch = {
      ...(args.name === undefined
        ? {}
        : { name: cleanRequiredText(args.name, "Naziv startupa", 100) }),
      ...(args.description === undefined
        ? {}
        : { description: cleanOptionalText(args.description, "Opis", 500) ?? "" }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch("startups", startup._id, patch);
    await recordActivity(ctx, {
      startupId: startup._id,
      actorProfileId: admin._id,
      action: "startup_updated",
      targetType: "startup",
      targetId: startup._id,
      title: `Startup „${patch.name ?? startup.name}” je izmenjen`,
    });
    return startup._id;
  },
});

export const archive = mutation({
  args: { startupId: v.id("startups") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const startup = await ctx.db.get("startups", args.startupId);
    if (startup === null) throw new Error("Startup nije pronađen.");
    if (startup.archivedAt === null) {
      await recordActivity(ctx, {
        startupId: startup._id,
        actorProfileId: admin._id,
        action: "startup_archived",
        targetType: "startup",
        targetId: startup._id,
        title: `Startup „${startup.name}” je arhiviran`,
      });
      await ctx.db.patch("startups", startup._id, {
        archivedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return startup._id;
  },
});

export const addMember = mutation({
  args: { startupId: v.id("startups"), profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const startup = await ctx.db.get("startups", args.startupId);
    if (startup === null || startup.archivedAt !== null) {
      throw new Error("Startup nije pronađen.");
    }
    const profile = await requireActiveProfile(ctx, args.profileId);
    const existing = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_profileId", (q) =>
        q.eq("startupId", startup._id).eq("profileId", profile._id),
      )
      .unique();
    const now = Date.now();
    if (existing === null) {
      await ctx.db.insert("startupMembers", {
        startupId: startup._id,
        profileId: profile._id,
        addedByProfileId: admin._id,
        archivedAt: null,
        createdAt: now,
      });
    } else if (existing.archivedAt !== null) {
      await ctx.db.patch("startupMembers", existing._id, {
        archivedAt: null,
        addedByProfileId: admin._id,
        createdAt: now,
      });
    } else {
      return existing._id;
    }
    await recordActivity(ctx, {
      startupId: startup._id,
      actorProfileId: admin._id,
      action: "member_added",
      targetType: "profile",
      targetId: profile._id,
      title: `${profile.displayName} je dodat/a u startup`,
    });
    return profile._id;
  },
});

export const removeMember = mutation({
  args: { startupId: v.id("startups"), profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.profileId) {
      throw new Error("Ne možete ukloniti sebe iz startupa.");
    }
    const startup = await ctx.db.get("startups", args.startupId);
    const profile = await ctx.db.get("profiles", args.profileId);
    if (startup === null || profile === null) throw new Error("Član nije pronađen.");
    const membership = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_profileId", (q) =>
        q.eq("startupId", startup._id).eq("profileId", profile._id),
      )
      .unique();
    if (membership === null || membership.archivedAt !== null) {
      throw new Error("Član nije pronađen.");
    }
    const now = Date.now();
    // Uklonjen član se skida sa svojih zadataka u ovom startupu; ostali
    // izvršioci ostaju, a projekcija na stranici se preračunava iz spiska.
    await archiveAssignmentsForProfile(ctx, {
      profileId: profile._id,
      startupId: startup._id,
      now,
      limit: 250,
    });
    const pendingBallots = await ctx.db
      .query("deletionBallots")
      .withIndex("by_profileId_and_vote_and_createdAt", (q) =>
        q.eq("profileId", profile._id).eq("vote", "pending"),
      )
      .take(200);
    for (const ballot of pendingBallots) {
      if (ballot.startupId !== startup._id) continue;
      const request = await ctx.db.get("deletionRequests", ballot.requestId);
      if (request === null || request.status !== "pending") continue;
      const eligibleCount = Math.max(0, request.eligibleCount - 1);
      await ctx.db.patch("deletionBallots", ballot._id, {
        vote: "excused",
        updatedAt: now,
      });
      if (request.approveCount === eligibleCount) {
        await applyApprovedDeletion(ctx, request);
        await ctx.db.patch("deletionRequests", request._id, {
          status: "approved",
          eligibleCount,
          resolvedAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch("deletionRequests", request._id, {
          eligibleCount,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch("startupMembers", membership._id, { archivedAt: now });
    await recordActivity(ctx, {
      startupId: startup._id,
      actorProfileId: admin._id,
      action: "member_removed",
      targetType: "profile",
      targetId: profile._id,
      title: `${profile.displayName} je uklonjen/a iz startupa`,
    });
    return membership._id;
  },
});

export const listMembers = query({
  args: { startupId: v.id("startups"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    const limit = boundedLimit(args.limit, 25, 50);
    const memberships = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_profileId", (q) =>
        q.eq("startupId", args.startupId),
      )
      .take(limit);
    const result = [];
    for (const membership of memberships) {
      if (membership.archivedAt !== null) continue;
      const profile = await ctx.db.get("profiles", membership.profileId);
      if (profile === null || profile.archivedAt !== null) continue;
      result.push({
        membershipId: membership._id,
        profile: {
          ...profile,
          avatarUrl:
            profile.avatarStorageId === undefined
              ? null
              : await ctx.storage.getUrl(profile.avatarStorageId),
        },
      });
    }
    return result;
  },
});

export const createArea = mutation({
  args: {
    startupId: v.id("startups"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const cleanedLabel = cleanRequiredText(args.label, "Naziv oblasti", 100);

    const existingAreas = await ctx.db
      .query("startupAreas")
      .withIndex("by_startupId_and_position", (q) => q.eq("startupId", args.startupId))
      .take(50);

    const maxPosition = existingAreas.reduce((max, area) => Math.max(max, area.position), -1);
    const key = `custom_${Date.now()}`;
    const now = Date.now();

    const areaId = await ctx.db.insert("startupAreas", {
      startupId: args.startupId,
      key,
      label: cleanedLabel,
      position: maxPosition + 1,
      createdAt: now,
    });

    await recordActivity(ctx, {
      startupId: args.startupId,
      actorProfileId: profile._id,
      action: "startup_updated",
      targetType: "startup",
      targetId: args.startupId,
      title: `Nova oblast „${cleanedLabel}“ je kreirana`,
    });

    return areaId;
  },
});

export const updateArea = mutation({
  args: {
    areaId: v.id("startupAreas"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const area = await ctx.db.get("startupAreas", args.areaId);
    if (area === null) {
      throw new Error("Oblast nije pronađena.");
    }
    const { profile } = await requireStartupMember(ctx, area.startupId);
    const cleanedLabel = cleanRequiredText(args.label, "Naziv oblasti", 100);

    await ctx.db.patch("startupAreas", area._id, {
      label: cleanedLabel,
    });

    await recordActivity(ctx, {
      startupId: area.startupId,
      actorProfileId: profile._id,
      action: "startup_updated",
      targetType: "startup",
      targetId: area.startupId,
      title: `Naziv oblasti je promenjen u „${cleanedLabel}“`,
    });

    return area._id;
  },
});

export const reorderAreas = mutation({
  args: {
    startupId: v.id("startups"),
    orderedAreaIds: v.array(v.id("startupAreas")),
  },
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    for (let i = 0; i < args.orderedAreaIds.length; i++) {
      const areaId = args.orderedAreaIds[i];
      const area = await ctx.db.get("startupAreas", areaId);
      if (area && area.startupId === args.startupId) {
        await ctx.db.patch("startupAreas", areaId, {
          position: i,
        });
      }
    }
    return true;
  },
});
