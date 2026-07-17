import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { getCurrentProfile, requireAdmin } from "./lib/auth";
import {
  authorizeSignup,
  completeSignup,
  generateInviteCode,
  hashInviteCode,
} from "./lib/onboarding";
import {
  boundedLimit,
  cleanRequiredText,
  normalizeEmail,
} from "./lib/validators";

export const create = mutation({
  args: {
    startupId: v.id("startups"),
    email: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const startup = await ctx.db.get("startups", args.startupId);
    if (startup === null || startup.archivedAt !== null) {
      throw new Error("Startup nije pronađen.");
    }
    const email = normalizeEmail(args.email);
    const now = Date.now();
    const expiresAt = args.expiresAt ?? now + 7 * 24 * 60 * 60 * 1_000;
    if (expiresAt <= now + 60 * 60 * 1_000 || expiresAt > now + 30 * 24 * 60 * 60 * 1_000) {
      throw new Error("Poziv mora važiti između jednog sata i 30 dana.");
    }

    const previous = await ctx.db
      .query("invites")
      .withIndex("by_email_and_startupId", (q) =>
        q.eq("email", email).eq("startupId", startup._id),
      )
      .order("desc")
      .take(50);
    for (const invite of previous) {
      if (invite.claimedAt === null && invite.revokedAt === null) {
        await ctx.db.patch("invites", invite._id, { revokedAt: now });
      }
    }

    const code = generateInviteCode();
    const inviteId = await ctx.db.insert("invites", {
      email,
      startupId: startup._id,
      codeHash: await hashInviteCode(code),
      createdByProfileId: admin._id,
      createdAt: now,
      expiresAt,
      claimedAt: null,
      claimedByProfileId: null,
      revokedAt: null,
    });
    await recordActivity(ctx, {
      startupId: startup._id,
      actorProfileId: admin._id,
      action: "invite_created",
      targetType: "invite",
      targetId: inviteId,
      title: `Poziv je poslat za ${email}`,
    });
    return { inviteId, code, email, expiresAt, startupId: startup._id };
  },
});

export const list = query({
  args: { startupId: v.id("startups"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = boundedLimit(args.limit, 25, 50);
    const startup = await ctx.db.get("startups", args.startupId);
    if (startup === null) throw new Error("Startup nije pronađen.");
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_startupId_and_createdAt", (q) =>
        q.eq("startupId", startup._id),
      )
      .order("desc")
      .take(limit);
    return await Promise.all(
      invites.map(async (invite) => ({
        ...invite,
        claimedBy:
          invite.claimedByProfileId === null
            ? null
            : await ctx.db.get("profiles", invite.claimedByProfileId),
      })),
    );
  },
});

export const validate = query({
  args: { email: v.string(), code: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    let email: string;
    try {
      email = normalizeEmail(args.email);
    } catch {
      return { valid: false as const, startupName: null, expiresAt: null };
    }
    const codeHash = await hashInviteCode(args.code);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
      .unique();
    if (
      invite === null ||
      invite.email !== email ||
      invite.revokedAt !== null ||
      invite.claimedAt !== null ||
      invite.expiresAt <= args.now
    ) {
      return { valid: false as const, startupName: null, expiresAt: null };
    }
    const startup = await ctx.db.get("startups", invite.startupId);
    if (startup === null || startup.archivedAt !== null) {
      return { valid: false as const, startupName: null, expiresAt: null };
    }
    return {
      valid: true as const,
      startupName: startup.name,
      expiresAt: invite.expiresAt,
    };
  },
});

export const claim = mutation({
  args: { email: v.string(), code: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Morate biti prijavljeni.");
    const user = await ctx.db.get("users", userId);
    if (user === null || !user.email) throw new Error("Nalog nema email adresu.");
    const accountEmail = normalizeEmail(user.email);
    const requestedEmail = normalizeEmail(args.email);
    if (accountEmail !== requestedEmail) {
      throw new Error("Poziv pripada drugoj email adresi.");
    }

    const authorization = await authorizeSignup(ctx, {
      email: requestedEmail,
      inviteCode: args.code,
    });
    const existingProfile = await getCurrentProfile(ctx);
    if (existingProfile === null) {
      const displayName = cleanRequiredText(
        args.displayName ?? user.name ?? requestedEmail.split("@")[0],
        "Ime",
        80,
      );
      const profileId = await completeSignup(ctx, {
        userId,
        email: requestedEmail,
        displayName,
        authorization,
      });
      return { profileId, startupId: authorization.kind === "invite" ? (await ctx.db.get("invites", authorization.inviteId))?.startupId ?? null : null };
    }

    if (authorization.kind !== "invite") {
      throw new Error("Poziv nije potreban za početni administratorski nalog.");
    }
    const invite = await ctx.db.get("invites", authorization.inviteId);
    if (invite === null) throw new Error("Poziv nije pronađen.");
    const membership = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_profileId", (q) =>
        q.eq("startupId", invite.startupId).eq("profileId", existingProfile._id),
      )
      .unique();
    const now = Date.now();
    if (membership === null) {
      await ctx.db.insert("startupMembers", {
        startupId: invite.startupId,
        profileId: existingProfile._id,
        addedByProfileId: invite.createdByProfileId,
        archivedAt: null,
        createdAt: now,
      });
    } else if (membership.archivedAt !== null) {
      await ctx.db.patch("startupMembers", membership._id, {
        archivedAt: null,
        addedByProfileId: invite.createdByProfileId,
        createdAt: now,
      });
    }
    await ctx.db.patch("invites", invite._id, {
      claimedAt: now,
      claimedByProfileId: existingProfile._id,
    });
    await recordActivity(ctx, {
      startupId: invite.startupId,
      actorProfileId: existingProfile._id,
      action: "invite_claimed",
      targetType: "invite",
      targetId: invite._id,
      title: `${existingProfile.displayName} se pridružio/la startupu`,
    });
    return { profileId: existingProfile._id, startupId: invite.startupId };
  },
});

export const revoke = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const invite = await ctx.db.get("invites", args.inviteId);
    if (invite === null) throw new Error("Poziv nije pronađen.");
    if (invite.claimedAt !== null) throw new Error("Iskorišćen poziv se ne može opozvati.");
    if (invite.revokedAt === null) {
      await ctx.db.patch("invites", invite._id, { revokedAt: Date.now() });
      await recordActivity(ctx, {
        startupId: invite.startupId,
        actorProfileId: admin._id,
        action: "invite_revoked",
        targetType: "invite",
        targetId: invite._id,
        title: `Poziv za ${invite.email} je opozvan`,
      });
    }
    return invite._id;
  },
});
