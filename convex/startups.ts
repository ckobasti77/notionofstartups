import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { pageTaskSortAt } from "./lib/pages";
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

async function getAreas(
  ctx: Parameters<typeof requireProfile>[0],
  startupId: Parameters<typeof requireStartupMember>[1],
) {
  return await ctx.db
    .query("startupAreas")
    .withIndex("by_startupId_and_position", (q) => q.eq("startupId", startupId))
    .take(4);
}

export const listForCurrent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const limit = boundedLimit(args.limit, 12, 20);
    const memberships = await ctx.db
      .query("startupMembers")
      .withIndex("by_profileId_and_startupId", (q) =>
        q.eq("profileId", profile._id),
      )
      .take(limit);
    const result = [];
    for (const membership of memberships) {
      if (membership.archivedAt !== null) continue;
      const startup = await ctx.db.get("startups", membership.startupId);
      if (startup !== null && startup.archivedAt === null) {
        result.push({ ...startup, areas: await getAreas(ctx, startup._id) });
      }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { startupId: v.id("startups") },
  handler: async (ctx, args) => {
    const { startup } = await requireStartupMember(ctx, args.startupId);
    return { ...startup, areas: await getAreas(ctx, startup._id) };
  },
});

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const name = cleanRequiredText(args.name, "Naziv startupa", 100);
    const description = cleanOptionalText(args.description, "Opis", 500) ?? "";
    const now = Date.now();
    const startupId = await ctx.db.insert("startups", {
      name,
      description,
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
    const assignedTasks = await ctx.db
      .query("pages")
      .withIndex("by_startupId_and_assigneeProfileId_and_archivedAt", (q) =>
        q
          .eq("startupId", startup._id)
          .eq("assigneeProfileId", profile._id)
          .eq("archivedAt", null),
      )
      .take(251);
    if (assignedTasks.length > 250) {
      throw new Error("Član ima više od 250 dodeljenih zadataka. Prvo ih preraspodelite.");
    }
    const now = Date.now();
    await Promise.all(
      assignedTasks.map((task) =>
        ctx.db.patch("pages", task._id, {
          assigneeProfileId: null,
          taskSortAt: pageTaskSortAt(task.dueDate, now),
          updatedByProfileId: admin._id,
          updatedAt: now,
        }),
      ),
    );
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
