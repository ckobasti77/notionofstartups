import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getCurrentProfile, requireAdmin, requireProfile, requireStartupMember } from "./lib/auth";
import { authorizeSignup, completeSignup } from "./lib/onboarding";
import { pageTaskSortAt } from "./lib/pages";
import {
  boundedLimit,
  cleanRequiredText,
  normalizeEmail,
  roleValidator,
} from "./lib/validators";

async function withAvatarUrl(
  ctx: Parameters<typeof getCurrentProfile>[0],
  profile: Doc<"profiles">,
) {
  return {
    ...profile,
    avatarUrl:
      profile.avatarStorageId === undefined
        ? null
        : await ctx.storage.getUrl(profile.avatarStorageId),
  };
}

export const getBootstrapState = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "singleton"))
      .unique();
    return { needsBootstrap: state === null };
  },
});

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const profile = await getCurrentProfile(ctx);
    return profile === null ? null : await withAvatarUrl(ctx, profile);
  },
});

export const ensureCurrent = mutation({
  args: {
    displayName: v.optional(v.string()),
    inviteCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await getCurrentProfile(ctx);
    if (existing !== null) return await withAvatarUrl(ctx, existing);

    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Niste prijavljeni.");
    const user = await ctx.db.get("users", userId);
    if (user === null || !user.email) throw new Error("Vašem nalogu je potrebna email adresa.");

    const email = normalizeEmail(user.email);
    const displayName = cleanRequiredText(
      args.displayName ?? user.name ?? email.split("@")[0],
      "Ime",
      80,
    );
    const authorization = await authorizeSignup(ctx, {
      email,
      inviteCode: args.inviteCode,
      authenticatedUserId: userId,
    });
    const profileId = await completeSignup(ctx, {
      userId,
      email,
      displayName,
      authorization,
    });
    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null) throw new Error("Kreiranje profila nije uspelo.");
    return await withAvatarUrl(ctx, profile);
  },
});

export const updateCurrent = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const displayName = cleanRequiredText(args.displayName, "Ime", 80);
    await ctx.db.patch("profiles", profile._id, {
      displayName,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get("profiles", profile._id);
    if (updated === null) throw new Error("Profil nije pronađen.");
    return await withAvatarUrl(ctx, updated);
  },
});

export const listForStartup = query({
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
      if (profile !== null && profile.archivedAt === null) {
        result.push(await withAvatarUrl(ctx, profile));
      }
    }
    return result;
  },
});

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = boundedLimit(args.limit, 25, 50);
    const admins = await ctx.db
      .query("profiles")
      .withIndex("by_role_and_archivedAt", (q) =>
        q.eq("role", "admin").eq("archivedAt", null),
      )
      .take(limit);
    const members = await ctx.db
      .query("profiles")
      .withIndex("by_role_and_archivedAt", (q) =>
        q.eq("role", "member").eq("archivedAt", null),
      )
      .take(limit);
    const profiles = [...admins, ...members]
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "sr-Latn"))
      .slice(0, limit);
    return await Promise.all(profiles.map((profile) => withAvatarUrl(ctx, profile)));
  },
});

export const setRole = mutation({
  args: { profileId: v.id("profiles"), role: roleValidator },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.profileId && args.role !== "admin") {
      throw new Error("Ne možete sebi ukloniti administratorsku ulogu.");
    }
    const profile = await ctx.db.get("profiles", args.profileId);
    if (profile === null || profile.archivedAt !== null) {
      throw new Error("Profil nije pronađen.");
    }
    await ctx.db.patch("profiles", profile._id, {
      role: args.role,
      updatedAt: Date.now(),
    });
    return profile._id;
  },
});

export const archive = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.profileId) throw new Error("Ne možete arhivirati sopstveni profil.");
    const profile = await ctx.db.get("profiles", args.profileId);
    if (profile === null) throw new Error("Profil nije pronađen.");
    if (profile.archivedAt === null) {
      const archivedAt = Date.now();
      const assignedTasks = await ctx.db
        .query("pages")
        .withIndex("by_assigneeProfileId_and_kind_and_archivedAt", (q) =>
          q
            .eq("assigneeProfileId", profile._id)
            .eq("kind", "task")
            .eq("archivedAt", null),
        )
        .take(251);
      if (assignedTasks.length > 250) {
        throw new Error("Profil ima više od 250 dodeljenih zadataka. Prvo ih preraspodelite.");
      }
      await ctx.db.patch("profiles", profile._id, {
        archivedAt,
        updatedAt: archivedAt,
      });
      await Promise.all(
        assignedTasks.map((task) =>
          ctx.db.patch("pages", task._id, {
            assigneeProfileId: null,
            taskSortAt: pageTaskSortAt(task.dueDate, archivedAt),
            updatedByProfileId: admin._id,
            updatedAt: archivedAt,
          }),
        ),
      );
      const memberships = await ctx.db
        .query("startupMembers")
        .withIndex("by_profileId_and_startupId", (q) => q.eq("profileId", profile._id))
        .take(50);
      await Promise.all(
        memberships
          .filter((membership) => membership.archivedAt === null)
          .map((membership) => ctx.db.patch("startupMembers", membership._id, { archivedAt })),
      );
    }
    return profile._id;
  },
});
