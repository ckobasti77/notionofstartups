/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const KEY_A = "sk-groq-aaaabbbb"; // suffix "bbbb"
const KEY_B = "sk-groq-ccccdddd"; // suffix "dddd"
const BASE_URL = "https://api.groq.com/openai/v1";
const MODEL = "llama-3.3-70b-versatile";

async function seedAiWorkspace() {
  const t = convexTest(schema, modules);
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

    const admin = await createPerson("Admin", "admin@example.test", "admin");
    const member = await createPerson("Član", "clan@example.test", "member");
    // Admin drugog startupa — admin rola, ali NIJE član ovog startupa.
    const outsiderAdmin = await createPerson(
      "Tuđ admin",
      "tudj@example.test",
      "admin",
    );

    const startupId = await ctx.db.insert("startups", {
      name: "Startup",
      description: "",
      createdByProfileId: admin.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    for (const profileId of [admin.profileId, member.profileId]) {
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId,
        addedByProfileId: admin.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }

    return { admin, member, outsiderAdmin, startupId };
  });

  const asAdmin = t.withIdentity({
    subject: `${seeded.admin.userId}|test-session`,
  });
  const asMember = t.withIdentity({
    subject: `${seeded.member.userId}|test-session`,
  });
  const asOutsiderAdmin = t.withIdentity({
    subject: `${seeded.outsiderAdmin.userId}|test-session`,
  });

  return { t, asAdmin, asMember, asOutsiderAdmin, ...seeded };
}

describe("aiProviders — disciplina oko ključa", () => {
  test("nijedan javni upit ne vraća apiKey", async () => {
    const { asAdmin, startupId } = await seedAiWorkspace();
    await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    const rows = await asAdmin.query(api.aiProviders.list, { startupId });
    expect(rows).toHaveLength(1);
    for (const row of rows) {
      expect(row).not.toHaveProperty("apiKey");
    }
    // UI vidi samo poslednja 4 znaka.
    expect(rows[0].keySuffix).toBe("bbbb");
  });

  test("apiKey se čita samo kroz internal funkciju", async () => {
    const { t, asAdmin, startupId } = await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    const withKey = await t.query(internal.aiProviders.getWithKey, {
      providerId,
    });
    expect(withKey?.apiKey).toBe(KEY_A);

    const dflt = await t.query(
      internal.aiProviders.getDefaultProviderWithKey,
      { startupId },
    );
    expect(dflt?.apiKey).toBe(KEY_A);
  });

  test("lastError se sanitizuje — ključ ne procuri kroz grešku", async () => {
    const { t, asAdmin, startupId } = await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    await t.mutation(internal.aiProviders.recordError, {
      providerId,
      message: `401 Unauthorized: Authorization: Bearer ${KEY_A}`,
    });

    const rows = await asAdmin.query(api.aiProviders.list, { startupId });
    expect(rows[0].lastError).not.toBeNull();
    expect(rows[0].lastError).not.toContain(KEY_A);
    expect(rows[0].lastError).toContain("[REDACTED]");
  });
});

describe("aiProviders — autorizacija", () => {
  test("član bez admin role ne sme da menja provajdere", async () => {
    const { asAdmin, asMember, startupId } = await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    await expect(
      asMember.mutation(api.aiProviders.create, {
        startupId,
        label: "X",
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: KEY_B,
      }),
    ).rejects.toThrow("administratorski");
    await expect(
      asMember.mutation(api.aiProviders.update, {
        providerId,
        label: "X",
      }),
    ).rejects.toThrow("administratorski");
    await expect(
      asMember.mutation(api.aiProviders.setDefault, { providerId }),
    ).rejects.toThrow("administratorski");
    await expect(
      asMember.mutation(api.aiProviders.remove, { providerId }),
    ).rejects.toThrow("administratorski");
    await expect(
      asMember.query(api.aiProviders.list, { startupId }),
    ).rejects.toThrow("administratorski");
  });

  test("admin koji nije član startupa je odbijen", async () => {
    const { asOutsiderAdmin, startupId } = await seedAiWorkspace();
    await expect(
      asOutsiderAdmin.mutation(api.aiProviders.create, {
        startupId,
        label: "X",
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: KEY_A,
      }),
    ).rejects.toThrow("pristup");
  });
});

describe("aiProviders — CRUD i podrazumevani model", () => {
  test("prvi provajder je podrazumevani i uključen; keySuffix je poslednja 4", async () => {
    const { asAdmin, startupId } = await seedAiWorkspace();
    await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const rows = await asAdmin.query(api.aiProviders.list, { startupId });
    expect(rows[0].isDefault).toBe(true);
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].keySuffix).toBe("bbbb");
  });

  test("izmena bez apiKey ne dira ključ; sa apiKey menja suffix", async () => {
    const { t, asAdmin, startupId } = await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    // Izmena samo naziva — ključ ostaje netaknut.
    await asAdmin.mutation(api.aiProviders.update, {
      providerId,
      label: "Groq — Llama",
    });
    let withKey = await t.query(internal.aiProviders.getWithKey, {
      providerId,
    });
    expect(withKey?.apiKey).toBe(KEY_A);
    expect(withKey?.label).toBe("Groq — Llama");

    // Izmena sa novim ključem — suffix se preračunava.
    await asAdmin.mutation(api.aiProviders.update, {
      providerId,
      apiKey: KEY_B,
    });
    withKey = await t.query(internal.aiProviders.getWithKey, { providerId });
    expect(withKey?.apiKey).toBe(KEY_B);
    const rows = await asAdmin.query(api.aiProviders.list, { startupId });
    expect(rows[0].keySuffix).toBe("dddd");
  });

  test("setDefault ostavlja tačno jedan podrazumevani", async () => {
    const { asAdmin, startupId } = await seedAiWorkspace();
    const p1 = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "P1",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const p2 = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "P2",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_B,
    });

    await asAdmin.mutation(api.aiProviders.setDefault, { providerId: p2 });
    const rows = await asAdmin.query(api.aiProviders.list, { startupId });
    const defaults = rows.filter((r) => r.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]._id).toBe(p2);
    expect(rows.find((r) => r._id === p1)?.isDefault).toBe(false);
  });

  test("brisanje podrazumevanog promoviše drugi uključeni", async () => {
    const { asAdmin, startupId } = await seedAiWorkspace();
    const p1 = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "P1",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const p2 = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "P2",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_B,
    });

    await asAdmin.mutation(api.aiProviders.remove, { providerId: p1 });
    const rows = await asAdmin.query(api.aiProviders.list, { startupId });
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(p2);
    expect(rows[0].isDefault).toBe(true);
  });

  test("gašenje podrazumevanog promoviše drugi uključeni", async () => {
    const { asAdmin, startupId } = await seedAiWorkspace();
    const p1 = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "P1",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const p2 = await asAdmin.mutation(api.aiProviders.create, {
      startupId,
      label: "P2",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_B,
    });

    await asAdmin.mutation(api.aiProviders.update, {
      providerId: p1,
      enabled: false,
    });
    const rows = await asAdmin.query(api.aiProviders.list, { startupId });
    expect(rows.find((r) => r._id === p1)?.isDefault).toBe(false);
    expect(rows.find((r) => r._id === p2)?.isDefault).toBe(true);
  });

  test("prekratak ključ je odbijen", async () => {
    const { asAdmin, startupId } = await seedAiWorkspace();
    await expect(
      asAdmin.mutation(api.aiProviders.create, {
        startupId,
        label: "Groq",
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: "short",
      }),
    ).rejects.toThrow("prekratak");
  });

  test("neispravan baseUrl je odbijen", async () => {
    const { asAdmin, startupId } = await seedAiWorkspace();
    await expect(
      asAdmin.mutation(api.aiProviders.create, {
        startupId,
        label: "Groq",
        baseUrl: "ftp://nije-ok",
        model: MODEL,
        apiKey: KEY_A,
      }),
    ).rejects.toThrow("https");
  });
});
