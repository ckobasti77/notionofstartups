import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export async function getCurrentProfile(ctx: ReadCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  return profile?.archivedAt === null ? profile : null;
}

export async function requireProfile(ctx: ReadCtx): Promise<Doc<"profiles">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Niste prijavljeni.");

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  if (profile === null || profile.archivedAt !== null) {
    throw new Error("Vaš nalog čeka važeći poziv ili je deaktiviran.");
  }
  return profile;
}

export async function requireAdmin(ctx: ReadCtx) {
  const profile = await requireProfile(ctx);
  if (profile.role !== "admin") throw new Error("Potreban je administratorski pristup.");
  return profile;
}

export async function requireStartupMember(
  ctx: ReadCtx,
  startupId: Id<"startups">,
) {
  const profile = await requireProfile(ctx);
  const startup = await ctx.db.get("startups", startupId);
  if (startup === null || startup.archivedAt !== null) {
    throw new Error("Startup nije pronađen.");
  }

  const membership = await ctx.db
    .query("startupMembers")
    .withIndex("by_startupId_and_profileId", (q) =>
      q.eq("startupId", startupId).eq("profileId", profile._id),
    )
    .unique();

  if (membership === null || membership.archivedAt !== null) {
    throw new Error("Nemate pristup ovom startupu.");
  }
  return { profile, startup, membership };
}

export async function requireActiveProfile(
  ctx: ReadCtx,
  profileId: Id<"profiles">,
) {
  const profile = await ctx.db.get("profiles", profileId);
  if (profile === null || profile.archivedAt !== null) {
    throw new Error("Član tima nije pronađen.");
  }
  return profile;
}

export async function requireProfileInStartup(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  profileId: Id<"profiles">,
) {
  const profile = await requireActiveProfile(ctx, profileId);
  const membership = await ctx.db
    .query("startupMembers")
    .withIndex("by_startupId_and_profileId", (q) =>
      q.eq("startupId", startupId).eq("profileId", profileId),
    )
    .unique();
  if (membership === null || membership.archivedAt !== null) {
    throw new Error("Dodeljeni član mora pripadati ovom startupu.");
  }
  return profile;
}
