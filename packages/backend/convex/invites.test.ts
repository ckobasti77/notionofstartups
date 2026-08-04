/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { hashInviteCode } from "./lib/onboarding";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedInviteWorkspace() {
  const t = convexTest(schema, modules);
  const code = "ABCDEF-123456-ABCDEF-123456";
  const joinedCode = "111111-222222-333333-444444";
  const expiredCode = "AAAAAA-BBBBBB-CCCCCC-DDDDDD";
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    async function createPerson(
      displayName: string,
      email: string,
      role: "admin" | "member",
    ) {
      const userId = await ctx.db.insert("users", { email });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName,
        email,
        role,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId, email };
    }

    const admin = await createPerson(
      "Admin",
      "admin@example.test",
      "admin",
    );
    const member = await createPerson(
      "Član",
      "clan@example.test",
      "member",
    );
    const firstStartupId = await ctx.db.insert("startups", {
      name: "Prvi startup",
      description: "",
      createdByProfileId: admin.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const secondStartupId = await ctx.db.insert("startups", {
      name: "Drugi startup",
      description: "",
      createdByProfileId: admin.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    for (const startupId of [firstStartupId, secondStartupId]) {
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId: admin.profileId,
        addedByProfileId: admin.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    await ctx.db.insert("startupMembers", {
      startupId: firstStartupId,
      profileId: member.profileId,
      addedByProfileId: admin.profileId,
      archivedAt: null,
      createdAt: now,
    });

    await ctx.db.insert("invites", {
      email: member.email,
      startupId: firstStartupId,
      codeHash: await hashInviteCode(code),
      createdByProfileId: admin.profileId,
      createdAt: now,
      expiresAt: now + 86_400_000,
      claimedAt: now,
      claimedByProfileId: member.profileId,
      revokedAt: null,
    });
    const joinInviteId = await ctx.db.insert("invites", {
      email: member.email,
      startupId: secondStartupId,
      codeHash: await hashInviteCode(joinedCode),
      createdByProfileId: admin.profileId,
      createdAt: now,
      expiresAt: now + 86_400_000,
      claimedAt: null,
      claimedByProfileId: null,
      revokedAt: null,
    });
    await ctx.db.insert("invites", {
      email: member.email,
      startupId: secondStartupId,
      codeHash: await hashInviteCode(expiredCode),
      createdByProfileId: admin.profileId,
      createdAt: now - 172_800_000,
      expiresAt: now - 86_400_000,
      claimedAt: null,
      claimedByProfileId: null,
      revokedAt: null,
    });
    return {
      admin,
      member,
      firstStartupId,
      secondStartupId,
      joinInviteId,
    };
  });

  const asMember = t.withIdentity({
    subject: `${seeded.member.userId}|test-session`,
  });
  return { t, asMember, code, joinedCode, expiredCode, ...seeded };
}

describe("prihvatanje pozivnice", () => {
  test("ponovljeni poziv za isto aktivno članstvo je bezbedan uspeh", async () => {
    const { asMember, member, firstStartupId, code } =
      await seedInviteWorkspace();

    await expect(
      asMember.mutation(api.invites.claim, {
        email: member.email,
        code,
      }),
    ).resolves.toEqual({
      status: "already_member",
      profileId: member.profileId,
      startupId: firstStartupId,
    });
  });

  test("postojeći profil može pozivom da se pridruži drugom startupu", async () => {
    const {
      t,
      asMember,
      member,
      secondStartupId,
      joinInviteId,
      joinedCode,
    } = await seedInviteWorkspace();

    await expect(
      asMember.mutation(api.invites.claim, {
        email: member.email,
        code: joinedCode,
      }),
    ).resolves.toEqual({
      status: "joined",
      profileId: member.profileId,
      startupId: secondStartupId,
    });

    const state = await t.run(async (ctx) => {
      const invite = await ctx.db.get("invites", joinInviteId);
      const membership = await ctx.db
        .query("startupMembers")
        .withIndex("by_startupId_and_profileId", (q) =>
          q
            .eq("startupId", secondStartupId)
            .eq("profileId", member.profileId),
        )
        .unique();
      return { invite, membership };
    });
    expect(state.invite?.claimedByProfileId).toBe(member.profileId);
    expect(state.invite?.claimedAt).not.toBeNull();
    expect(state.membership?.archivedAt).toBeNull();
  });

  test("istekao poziv vraća jasnu korisničku grešku", async () => {
    const { asMember, member, expiredCode } = await seedInviteWorkspace();

    await expect(
      asMember.mutation(api.invites.claim, {
        email: member.email,
        code: expiredCode,
      }),
    ).rejects.toThrow("Poziv je istekao");
  });
});
