/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    async function createPerson(displayName: string, email: string) {
      const userId = await ctx.db.insert("users", { email });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName,
        email,
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId, email };
    }

    const member = await createPerson("Član", "clan@example.test");
    const outsider = await createPerson("Autsajder", "autsajder@example.test");

    const startupId = await ctx.db.insert("startups", {
      name: "Startup",
      description: "",
      createdByProfileId: member.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("startupMembers", {
      startupId,
      profileId: member.profileId,
      addedByProfileId: member.profileId,
      archivedAt: null,
      createdAt: now,
    });

    const archivedMembershipStartupId = await ctx.db.insert("startups", {
      name: "Startup sa arhiviranim članstvom",
      description: "",
      createdByProfileId: member.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("startupMembers", {
      startupId: archivedMembershipStartupId,
      profileId: member.profileId,
      addedByProfileId: member.profileId,
      archivedAt: now,
      createdAt: now,
    });

    const archivedStartupId = await ctx.db.insert("startups", {
      name: "Arhiviran startup",
      description: "",
      createdByProfileId: member.profileId,
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("startupMembers", {
      startupId: archivedStartupId,
      profileId: member.profileId,
      addedByProfileId: member.profileId,
      archivedAt: null,
      createdAt: now,
    });

    return {
      member,
      outsider,
      startupId,
      archivedMembershipStartupId,
      archivedStartupId,
    };
  });

  const asMember = t.withIdentity({
    subject: `${seeded.member.userId}|test-session`,
  });
  const asOutsider = t.withIdentity({
    subject: `${seeded.outsider.userId}|test-session`,
  });
  return { t, asMember, asOutsider, ...seeded };
}

describe("startups.isCurrentMember", () => {
  test("T1 — aktivan član → true", async () => {
    const { asMember, startupId } = await seedWorkspace();
    await expect(
      asMember.query(api.startups.isCurrentMember, { startupId }),
    ).resolves.toBe(true);
  });

  test("T2 — profil bez članstva → false, ne baca", async () => {
    const { asOutsider, startupId } = await seedWorkspace();
    await expect(
      asOutsider.query(api.startups.isCurrentMember, { startupId }),
    ).resolves.toBe(false);
  });

  test("T3 — arhivirano članstvo → false", async () => {
    const { asMember, archivedMembershipStartupId } = await seedWorkspace();
    await expect(
      asMember.query(api.startups.isCurrentMember, {
        startupId: archivedMembershipStartupId,
      }),
    ).resolves.toBe(false);
  });

  test("T4 — član, ali startup je arhiviran → false", async () => {
    const { asMember, archivedStartupId } = await seedWorkspace();
    await expect(
      asMember.query(api.startups.isCurrentMember, {
        startupId: archivedStartupId,
      }),
    ).resolves.toBe(false);
  });

  test("T5 — neprijavljen → baca", async () => {
    const { t, startupId } = await seedWorkspace();
    await expect(
      t.query(api.startups.isCurrentMember, { startupId }),
    ).rejects.toThrow();
  });
});
