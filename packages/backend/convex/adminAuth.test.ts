/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** 12+ znakova, veliko/malo/broj/specijalni — prolazi validatePasswordRequirements. */
const STRONG = "NovaLozinka123!";

/**
 * Seed: admin + član (u dva aktivna i jednom arhiviranom startupu) + arhiviran
 * profil. Auth helperi (`modifyAccountCredentials`/`invalidateSessions`) traže
 * `authAccounts` + auth store i pokrivaju se ručno u devu (ZA-POPRAVKU Z6); ovde
 * se testira ono što je naše: autorizacija i activity zapis (bez lozinke).
 */
async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    async function person(
      displayName: string,
      email: string,
      role: "admin" | "member",
      archivedAt: number | null = null,
    ) {
      const userId = await ctx.db.insert("users", { email });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName,
        email,
        role,
        archivedAt,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId, email, displayName };
    }

    const admin = await person("Admin", "admin@example.test", "admin");
    const member = await person("Član", "clan@example.test", "member");
    const archivedMember = await person(
      "Bivši",
      "bivsi@example.test",
      "member",
      now,
    );

    async function startup(name: string) {
      return await ctx.db.insert("startups", {
        name,
        description: "",
        createdByProfileId: admin.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    const startupA = await startup("A");
    const startupB = await startup("B");
    const startupC = await startup("C");

    async function member_(
      startupId: typeof startupA,
      profileId: typeof member.profileId,
      archivedAt: number | null = null,
    ) {
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId,
        addedByProfileId: admin.profileId,
        archivedAt,
        createdAt: now,
      });
    }
    await member_(startupA, admin.profileId);
    await member_(startupA, member.profileId);
    await member_(startupB, member.profileId);
    // Arhivirano članstvo — NE sme da proizvede activity zapis.
    await member_(startupC, member.profileId, now);

    return { admin, member, archivedMember, startupA, startupB, startupC };
  });

  const asAdmin = t.withIdentity({
    subject: `${seeded.admin.userId}|test-session`,
  });
  const asMember = t.withIdentity({
    subject: `${seeded.member.userId}|test-session`,
  });

  return { t, asAdmin, asMember, ...seeded };
}

describe("adminAuth.authorizeSetPassword — autorizacija", () => {
  test("ne-admin (član) je odbijen", async () => {
    const { asMember, member } = await seed();
    await expect(
      asMember.query(internal.adminAuth.authorizeSetPassword, {
        profileId: member.profileId,
      }),
    ).rejects.toThrow("administratorski");
  });

  test("admin ne može sebi da menja lozinku ovim putem", async () => {
    const { asAdmin, admin } = await seed();
    await expect(
      asAdmin.query(internal.adminAuth.authorizeSetPassword, {
        profileId: admin.profileId,
      }),
    ).rejects.toThrow("Sopstvenu");
  });

  test("arhiviran član je odbijen", async () => {
    const { asAdmin, archivedMember } = await seed();
    await expect(
      asAdmin.query(internal.adminAuth.authorizeSetPassword, {
        profileId: archivedMember.profileId,
      }),
    ).rejects.toThrow("nije pronađen");
  });

  test("vraća email/userId/imena za validnog člana (bez lozinke)", async () => {
    const { asAdmin, admin, member } = await seed();
    const info = await asAdmin.query(internal.adminAuth.authorizeSetPassword, {
      profileId: member.profileId,
    });
    expect(info.email).toBe(member.email);
    expect(info.userId).toBe(member.userId);
    expect(info.targetName).toBe("Član");
    expect(info.adminProfileId).toBe(admin.profileId);
    expect(info.adminName).toBe("Admin");
  });
});

describe("adminAuth.adminSetPassword — javni gard", () => {
  test("neprijavljen pozivalac je odbijen", async () => {
    const { t, member } = await seed();
    await expect(
      t.action(api.adminAuth.adminSetPassword, {
        profileId: member.profileId,
        newPassword: STRONG,
      }),
    ).rejects.toThrow("prijavljeni");
  });
});

describe("adminAuth.recordPasswordChange — activity bez lozinke", () => {
  test("upisuje po jedan zapis za svaki AKTIVAN startup mete, preskače arhiviran", async () => {
    const { t, admin, member, startupA, startupB, startupC } = await seed();

    await t.mutation(internal.adminAuth.recordPasswordChange, {
      actorProfileId: admin.profileId,
      targetProfileId: member.profileId,
      adminName: "Admin",
      targetName: "Član",
    });

    const activities = await t.run((ctx) =>
      ctx.db.query("activities").collect(),
    );

    expect(activities).toHaveLength(2);
    const startupIds = activities.map((a) => a.startupId).sort();
    expect(startupIds).toEqual([startupA, startupB].sort());
    expect(startupIds).not.toContain(startupC);

    for (const a of activities) {
      expect(a.action).toBe("member_password_changed");
      expect(a.targetType).toBe("profile");
      expect(a.targetId).toBe(member.profileId);
      expect(a.actorProfileId).toBe(admin.profileId);
      expect(a.title).toContain("Admin");
      expect(a.title).toContain("Član");
      // Lozinka ne sme nigde da procuri.
      expect(a.title).not.toContain(STRONG);
      expect(typeof a.createdAt).toBe("number");
    }
  });
});
