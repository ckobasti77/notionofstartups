/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_PAGE_FILE_BYTES } from "./lib/page_files";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedFileWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const createPerson = async (name: string) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await createPerson("Owner");
    const member = await createPerson("Member");
    const startupId = await ctx.db.insert("startups", {
      name: "File startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, member]) {
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId: person.profileId,
        addedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    const areaId = await ctx.db.insert("startupAreas", {
      startupId,
      key: "file-area",
      label: "File area",
      position: 0,
      createdAt: now,
    });
    return { owner, member, startupId, areaId };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|file-test` });
  const asOwner = asPerson(seeded.owner);
  const asMember = asPerson(seeded.member);
  const pageId = await asOwner.mutation(api.pages.create, {
    startupId: seeded.startupId,
    areaId: seeded.areaId,
    parentPageId: null,
    kind: "file",
    title: "Ugovori",
  });

  /** Ubacuje blob direktno u skladište, kao da je klijent već završio upload. */
  const store = (body: string, contentType: string) =>
    t.run((ctx) => ctx.storage.store(new Blob([body], { type: contentType })));

  const upload = async (
    name: string,
    contentType: string,
    body = "sadržaj",
  ) => {
    const { token } = await asOwner.mutation(api.pageFiles.generateUploadUrl, {
      pageId,
    });
    const storageId = await store(body, contentType);
    return await asOwner.mutation(api.pageFiles.attach, {
      pageId,
      storageId,
      token,
      name,
    });
  };

  return { t, ...seeded, asOwner, asMember, pageId, store, upload };
}

describe("fajlovi u oblačiću", () => {
  test("više fajlova po oblačiću, kategorija se izvodi sa servera", async () => {
    const { t, pageId, asOwner, upload } = await seedFileWorkspace();

    await upload("plan.pdf", "application/pdf");
    await upload("logo.png", "image/png");
    await upload("snimak.mp4", "video/mp4");

    const files = await asOwner.query(api.pageFiles.list, { pageId });
    expect(files.map((file) => file.category)).toEqual([
      "pdf",
      "image",
      "video",
    ]);
    expect(files.map((file) => file.position)).toEqual([0, 1, 2]);

    // Slika nosi pregled na kanvasu, čak i kad nije prva po redu.
    expect(
      await t.run((ctx) => ctx.db.get("pages", pageId)),
    ).toMatchObject({ fileCount: 3, filePrimaryCategory: "image" });
  });

  test("nepodržan tip se odbija i ne ulazi u spisak", async () => {
    const { pageId, asOwner, store } = await seedFileWorkspace();
    const { token } = await asOwner.mutation(api.pageFiles.generateUploadUrl, {
      pageId,
    });
    const storageId = await store("MZ", "application/x-msdownload");

    await expect(
      asOwner.mutation(api.pageFiles.attach, {
        pageId,
        storageId,
        token,
        name: "virus.exe",
      }),
    ).rejects.toThrow("nije podržan");
    expect(await asOwner.query(api.pageFiles.list, { pageId })).toEqual([]);
  });

  test("istekla ili tuđa dozvola ne prolazi", async () => {
    const { t, pageId, asOwner, asMember, store } = await seedFileWorkspace();
    const { token } = await asOwner.mutation(api.pageFiles.generateUploadUrl, {
      pageId,
    });
    const storageId = await store("x", "image/png");

    await expect(
      asMember.mutation(api.pageFiles.attach, {
        pageId,
        storageId,
        token,
        name: "tudje.png",
      }),
    ).rejects.toThrow("samo njegov autor");

    await t.run(async (ctx) => {
      const upload = await ctx.db.query("pageFileUploads").first();
      if (upload !== null) {
        await ctx.db.patch("pageFileUploads", upload._id, {
          expiresAt: Date.now() - 1,
        });
      }
    });
    await expect(
      asOwner.mutation(api.pageFiles.attach, {
        pageId,
        storageId,
        token,
        name: "kasno.png",
      }),
    ).rejects.toThrow("istekla");
  });

  test("isti blob ne može da visi na dva oblačića", async () => {
    const { startupId, areaId, pageId, asOwner, store } =
      await seedFileWorkspace();
    const first = await asOwner.mutation(api.pageFiles.generateUploadUrl, {
      pageId,
    });
    const storageId = await store("x", "image/png");
    await asOwner.mutation(api.pageFiles.attach, {
      pageId,
      storageId,
      token: first.token,
      name: "prva.png",
    });

    const otherPageId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "file",
      title: "Drugi oblačić",
    });
    const second = await asOwner.mutation(api.pageFiles.generateUploadUrl, {
      pageId: otherPageId,
    });
    await expect(
      asOwner.mutation(api.pageFiles.attach, {
        pageId: otherPageId,
        storageId,
        token: second.token,
        name: "ista.png",
      }),
    ).rejects.toThrow("već zakačen");
  });

  test("brisanje uklanja i blob i prenumeriše preostale", async () => {
    const { t, pageId, asOwner, upload } = await seedFileWorkspace();
    await upload("a.png", "image/png");
    const second = await upload("b.png", "image/png");
    await upload("c.png", "image/png");

    const storageId = await t.run(async (ctx) => {
      const row = await ctx.db.get("pageFiles", second);
      return row?.storageId ?? null;
    });
    await asOwner.mutation(api.pageFiles.remove, { fileId: second });

    const files = await asOwner.query(api.pageFiles.list, { pageId });
    expect(files.map((file) => file.name)).toEqual(["a.png", "c.png"]);
    expect(files.map((file) => file.position)).toEqual([0, 1]);
    expect(
      storageId === null
        ? null
        : await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).toBe(null);
  });

  test("tuđi oblačić ne prima fajlove, ali ih član vidi", async () => {
    const { pageId, asMember } = await seedFileWorkspace();
    await expect(
      asMember.mutation(api.pageFiles.generateUploadUrl, { pageId }),
    ).rejects.toThrow("samo njegov autor");
    expect(await asMember.query(api.pageFiles.list, { pageId })).toEqual([]);
  });

  test("fajl API odbija stranice koje nisu fajl oblačić", async () => {
    const { startupId, areaId, asOwner } = await seedFileWorkspace();
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Nije fajl",
    });
    await expect(
      asOwner.query(api.pageFiles.list, { pageId: taskId }),
    ).rejects.toThrow("nije fajl oblačić");
  });

  test("granica veličine je izražena u bajtovima na serveru", () => {
    expect(MAX_PAGE_FILE_BYTES).toBe(50 * 1024 * 1024);
  });
});
