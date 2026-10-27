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

describe("oblasti startupa (PROSTOR K20)", () => {
  async function seedAdmin() {
    const base = await seedWorkspace();
    const admin = await base.t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", { email: "admin@example.test" });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: "Admin",
        email: "admin@example.test",
        role: "admin",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    });
    const asAdmin = base.t.withIdentity({
      subject: `${admin.userId}|test-session`,
    });
    return { ...base, asAdmin };
  }

  test("novi startup dobija oblasti Razvoj · Marketing · Prodaja · Ostalo sa starim ključevima", async () => {
    const { t, asAdmin } = await seedAdmin();
    const startupId = await asAdmin.mutation(api.startups.create, {
      name: "Novi",
    });
    const areas = await t.run((ctx) =>
      ctx.db
        .query("startupAreas")
        .withIndex("by_startupId_and_position", (q) => q.eq("startupId", startupId))
        .take(10),
    );
    expect(areas.map((area) => [area.key, area.label, area.position])).toEqual([
      ["dev", "Razvoj", 0],
      ["marketing", "Marketing", 1],
      ["sales", "Prodaja", 2],
      ["other", "Ostalo", 3],
    ]);
  });

  test("pravljenje novog startupa ne dira oblasti postojećeg", async () => {
    const { t, asAdmin, startupId } = await seedAdmin();
    await t.run(async (ctx) => {
      await ctx.db.insert("startupAreas", {
        startupId,
        key: "dev",
        label: "Development",
        position: 0,
        createdAt: Date.now(),
      });
    });
    await asAdmin.mutation(api.startups.create, { name: "Drugi" });
    const stara = await t.run((ctx) =>
      ctx.db
        .query("startupAreas")
        .withIndex("by_startupId_and_position", (q) => q.eq("startupId", startupId))
        .take(10),
    );
    expect(stara.map((area) => area.label)).toEqual(["Development"]);
  });

  test("svaki član preimenuje, dodaje i preuređuje oblasti; nečlan ne može", async () => {
    const { asMember, asOutsider, startupId } = await seedAdmin();
    const first = await asMember.mutation(api.startups.createArea, {
      startupId,
      label: "Podrška",
    });
    const second = await asMember.mutation(api.startups.createArea, {
      startupId,
      label: "Finansije",
    });
    await asMember.mutation(api.startups.updateArea, {
      areaId: first,
      label: "Korisnička podrška",
    });
    await asMember.mutation(api.startups.reorderAreas, {
      startupId,
      orderedAreaIds: [second, first],
    });
    const detail = await asMember.query(api.startups.get, { startupId });
    expect(detail?.areas.map((area) => area.label)).toEqual([
      "Finansije",
      "Korisnička podrška",
    ]);
    await expect(
      asOutsider.mutation(api.startups.updateArea, { areaId: first, label: "X" }),
    ).rejects.toThrow();
    await expect(
      asOutsider.mutation(api.startups.createArea, { startupId, label: "X" }),
    ).rejects.toThrow();
    await expect(
      asMember.mutation(api.startups.updateArea, { areaId: first, label: "   " }),
    ).rejects.toThrow(/obavezno/);
  });

  test("ime, opis i logo menja samo admin", async () => {
    const { asMember, asAdmin, startupId } = await seedAdmin();
    await expect(
      asMember.mutation(api.startups.update, { startupId, name: "Novo ime" }),
    ).rejects.toThrow(/administrator/i);
    await asAdmin.mutation(api.startups.update, { startupId, name: "Novo ime" });
    const detail = await asMember.query(api.startups.get, { startupId });
    expect(detail?.name).toBe("Novo ime");
  });
});
