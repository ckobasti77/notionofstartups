import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { cleanRequiredText, normalizeEmail } from "./validators";

export type OnboardingMutationCtx = MutationCtx;

export type SignupAuthorization =
  | { kind: "bootstrap" }
  | { kind: "invite"; inviteId: Id<"invites"> };

export async function hashInviteCode(code: string) {
  const normalized = code.trim().toLocaleUpperCase("en-US");
  const bytes = new TextEncoder().encode(`notion-clone-invite:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function generateInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const value = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .toLocaleUpperCase("en-US");
  return `${value.slice(0, 6)}-${value.slice(6, 12)}-${value.slice(12, 18)}-${value.slice(18)}`;
}

export async function authorizeSignup(
  ctx: OnboardingMutationCtx,
  args: {
    email: string;
    inviteCode?: string;
    authenticatedUserId?: Id<"users">;
  },
): Promise<SignupAuthorization> {
  const email = normalizeEmail(args.email);
  const state = await ctx.db
    .query("appState")
    .withIndex("by_key", (q) => q.eq("key", "singleton"))
    .unique();

  if (state === null) {
    const profiles = await ctx.db.query("profiles").take(1);
    const users = await ctx.db.query("users").take(2);
    const isPristineSignup =
      args.authenticatedUserId === undefined && users.length === 0;
    const isOnlyAuthenticatedUser =
      args.authenticatedUserId !== undefined &&
      users.length === 1 &&
      users[0]._id === args.authenticatedUserId;
    if (profiles.length === 0 && (isPristineSignup || isOnlyAuthenticatedUser)) {
      const expectedCode = process.env.BOOTSTRAP_ADMIN_CODE?.trim();
      if (!expectedCode) {
        throw new Error("Osnivački kod nije podešen na serveru.");
      }
      if (args.inviteCode?.trim() !== expectedCode) {
        throw new Error("Osnivački kod nije ispravan.");
      }
      return { kind: "bootstrap" };
    }
    throw new Error("Početno podešavanje administratora više nije dostupno.");
  }
  if (!args.inviteCode?.trim()) throw new Error("Potreban je važeći poziv.");

  const codeHash = await hashInviteCode(args.inviteCode);
  const rawInvites = await ctx.db
    .query("invites")
    .withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
    .unique();
  const invite = rawInvites as Doc<"invites"> | null;
  if (
    invite === null ||
    invite.email !== email ||
    invite.revokedAt !== null ||
    invite.claimedAt !== null ||
    invite.expiresAt <= Date.now()
  ) {
    throw new Error("Poziv nije ispravan ili je istekao.");
  }

  const startup = (await ctx.db.get(
    "startups",
    invite.startupId,
  )) as Doc<"startups"> | null;
  if (startup === null || startup.archivedAt !== null) {
    throw new Error("Startup iz poziva više nije dostupan.");
  }
  return { kind: "invite", inviteId: invite._id };
}

export async function completeSignup(
  ctx: OnboardingMutationCtx,
  args: {
    userId: Id<"users">;
    email: string;
    displayName: string;
    authorization: SignupAuthorization;
  },
): Promise<Id<"profiles">> {
  const email = normalizeEmail(args.email);
  const displayName = cleanRequiredText(args.displayName, "Ime", 80);
  const existingRaw = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .unique();
  const existing = existingRaw as Doc<"profiles"> | null;
  const now = Date.now();
  if (existing !== null) {
    if (existing.archivedAt === null) return existing._id;
    if (args.authorization.kind !== "invite") {
      throw new Error("Deaktiviran nalog može ponovo aktivirati samo administrator novim pozivom.");
    }

    const rawInvite = await ctx.db.get("invites", args.authorization.inviteId);
    const invite = rawInvite as Doc<"invites"> | null;
    if (
      invite === null ||
      invite.email !== email ||
      invite.revokedAt !== null ||
      invite.claimedAt !== null ||
      invite.expiresAt <= now
    ) {
      throw new Error("Poziv nije ispravan ili je istekao.");
    }

    await ctx.db.patch("profiles", existing._id, {
      displayName,
      email,
      role: "member",
      archivedAt: null,
      updatedAt: now,
    });

    const memberships = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_profileId", (q) =>
        q.eq("startupId", invite.startupId).eq("profileId", existing._id),
      )
      .take(2);
    const membership = memberships[0] ?? null;
    if (membership === null) {
      await ctx.db.insert("startupMembers", {
        startupId: invite.startupId,
        profileId: existing._id,
        addedByProfileId: invite.createdByProfileId,
        archivedAt: null,
        createdAt: now,
      });
    } else if (membership.archivedAt !== null) {
      await ctx.db.patch("startupMembers", membership._id, {
        addedByProfileId: invite.createdByProfileId,
        archivedAt: null,
      });
    }

    await ctx.db.patch("invites", invite._id, {
      claimedAt: now,
      claimedByProfileId: existing._id,
    });
    await ctx.db.insert("activities", {
      startupId: invite.startupId,
      actorProfileId: existing._id,
      action: "invite_claimed",
      targetType: "invite",
      targetId: invite._id,
      title: `${displayName} je ponovo aktivirao/la nalog`,
      createdAt: now,
    });
    return existing._id;
  }

  if (args.authorization.kind === "bootstrap") {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "singleton"))
      .unique();
    if (state !== null) throw new Error("Početno podešavanje administratora je već završeno.");

    const profileId = (await ctx.db.insert("profiles", {
      userId: args.userId,
      displayName,
      email,
      role: "admin",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    })) as Id<"profiles">;
    await ctx.db.insert("appState", {
      key: "singleton",
      bootstrappedAt: now,
      bootstrappedByUserId: args.userId,
      bootstrappedByProfileId: profileId,
    });
    return profileId;
  }

  const rawInvite = await ctx.db.get("invites", args.authorization.inviteId);
  const invite = rawInvite as Doc<"invites"> | null;
  if (
    invite === null ||
    invite.email !== email ||
    invite.revokedAt !== null ||
    invite.claimedAt !== null ||
    invite.expiresAt <= now
  ) {
    throw new Error("Poziv nije ispravan ili je istekao.");
  }

  const profileId = (await ctx.db.insert("profiles", {
    userId: args.userId,
    displayName,
    email,
    role: "member",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  })) as Id<"profiles">;
  await ctx.db.insert("startupMembers", {
    startupId: invite.startupId,
    profileId,
    addedByProfileId: invite.createdByProfileId,
    archivedAt: null,
    createdAt: now,
  });
  await ctx.db.patch("invites", invite._id, {
    claimedAt: now,
    claimedByProfileId: profileId,
  });
  await ctx.db.insert("activities", {
    startupId: invite.startupId,
    actorProfileId: profileId,
    action: "invite_claimed",
    targetType: "invite",
    targetId: invite._id,
    title: `${displayName} se pridružio/la startupu`,
    createdAt: now,
  });
  return profileId;
}
