/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    async function createPerson(
      name: string,
      role: "admin" | "member",
    ) {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    }
    const author = await createPerson("Autor", "member");
    const member = await createPerson("Član", "member");
    const admin = await createPerson("Admin", "admin");
    const startupId = await ctx.db.insert("startups", {
      name: "Test startup",
      description: "",
      createdByProfileId: admin.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [author, member, admin]) {
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId: person.profileId,
        addedByProfileId: admin.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    return { startupId, author, member, admin };
  });
  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|test-session` });
  return {
    t,
    ...seeded,
    asAuthor: asPerson(seeded.author),
    asMember: asPerson(seeded.member),
    asAdmin: asPerson(seeded.admin),
  };
}

describe("demokratske Canvas dozvole", () => {
  test("drugi član i admin ne mogu menjati, pomerati, resize-ovati ili direktno obrisati tuđu ideju", async () => {
    const { t, startupId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      text: "Autorska ideja",
      x: 10,
      y: 20,
    });

    await expect(
      asMember.mutation(api.ideas.update, {
        startupId,
        ideaId,
        title: null,
        text: "Tuđa izmena",
        color: "rose",
      }),
    ).rejects.toThrow("samo svoju ideju");
    await expect(
      asMember.mutation(api.ideas.updateLayout, {
        startupId,
        ideaId,
        x: 100,
        y: 100,
        width: 400,
        height: 300,
      }),
    ).rejects.toThrow("samo svoje kartice");
    await asMember.mutation(api.ideas.updatePositions, {
      startupId,
      updates: [{ id: ideaId, x: 999, y: 999 }],
    });
    const unchanged = await t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(unchanged?.x).toBe(10);
    expect(unchanged?.y).toBe(20);
    await expect(
      asAdmin.mutation(api.ideas.archive, { startupId, ideaId }),
    ).rejects.toThrow("jednoglasnim glasanjem");
  });

  test("cross-owner ugnježđavanje traži autora Parenta, dozvoljava izvlačenje obe strane i odbija ciklus", async () => {
    const { t, startupId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const childIdeaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      text: "Dete",
      x: 300,
      y: 220,
    });
    const parentIdeaId = await asMember.mutation(api.ideas.create, {
      startupId,
      text: "Parent",
      x: 100,
      y: 100,
    });
    const requested = await asAuthor.mutation(
      api.collaboration.requestNesting,
      { startupId, childIdeaId, parentIdeaId },
    );
    expect(requested.status).toBe("pending");
    await asMember.mutation(api.collaboration.resolveNesting, {
      requestId: requested.requestId!,
      approve: true,
    });
    expect(
      (await t.run((ctx) => ctx.db.get("ideaNodes", childIdeaId)))
        ?.parentIdeaId,
    ).toBe(parentIdeaId);
    await expect(
      asAdmin.mutation(api.collaboration.detachIdea, {
        startupId,
        ideaId: childIdeaId,
      }),
    ).rejects.toThrow("autor deteta ili direktnog Parenta");
    await asMember.mutation(api.collaboration.detachIdea, {
      startupId,
      ideaId: childIdeaId,
    });

    const first = await asAuthor.mutation(api.ideas.create, {
      startupId,
      text: "Prva",
    });
    const second = await asAuthor.mutation(api.ideas.create, {
      startupId,
      text: "Druga",
    });
    await asAuthor.mutation(api.collaboration.requestNesting, {
      startupId,
      childIdeaId: first,
      parentIdeaId: second,
    });
    await expect(
      asAuthor.mutation(api.collaboration.requestNesting, {
        startupId,
        childIdeaId: second,
        parentIdeaId: first,
      }),
    ).rejects.toThrow("kružnu hijerarhiju");
  });

  test("brisanje tuđeg sadržaja zahteva jednoglasnost, a prvi glas PROTIV odmah odbija", async () => {
    const { t, startupId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      text: "Za timsko glasanje",
    });
    const requestId = await asMember.mutation(
      api.collaboration.requestDeletion,
      { target: { kind: "idea", id: ideaId } },
    );
    await asAuthor.mutation(api.collaboration.voteOnDeletion, {
      requestId,
      vote: "approve",
    });
    expect(
      (await t.run((ctx) => ctx.db.get("ideaNodes", ideaId)))?.archivedAt,
    ).toBeNull();
    await asAdmin.mutation(api.collaboration.voteOnDeletion, {
      requestId,
      vote: "reject",
    });
    expect(
      (await t.run((ctx) => ctx.db.get("deletionRequests", requestId)))
        ?.status,
    ).toBe("rejected");
    expect(
      (await t.run((ctx) => ctx.db.get("ideaNodes", ideaId)))?.archivedAt,
    ).toBeNull();

    const unanimousId = await asMember.mutation(
      api.collaboration.requestDeletion,
      { target: { kind: "idea", id: ideaId } },
    );
    await asAuthor.mutation(api.collaboration.voteOnDeletion, {
      requestId: unanimousId,
      vote: "approve",
    });
    await asAdmin.mutation(api.collaboration.voteOnDeletion, {
      requestId: unanimousId,
      vote: "approve",
    });
    expect(
      (await t.run((ctx) => ctx.db.get("ideaNodes", ideaId)))?.archivedAt,
    ).toEqual(expect.any(Number));
  });

  test("brisanje sopstvenog kontejnera oporavlja tuđe doprinose i izvlači dete", async () => {
    const { t, startupId, asAuthor, asMember } = await seedWorkspace();
    const parentIdeaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      title: "Kontejner",
      text: "Osnovni sadržaj",
      x: 100,
      y: 100,
    });
    const childIdeaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      text: "Ugnježđeno dete",
      x: 340,
      y: 260,
    });
    await asAuthor.mutation(api.collaboration.requestNesting, {
      startupId,
      childIdeaId,
      parentIdeaId,
    });
    const foreignContributionId = await asMember.mutation(
      api.collaboration.addContribution,
      {
        target: { kind: "idea", id: parentIdeaId },
        content: "Tuđi doprinos koji mora ostati sačuvan",
      },
    );

    const result = await asAuthor.mutation(api.ideas.archive, {
      startupId,
      ideaId: parentIdeaId,
    });
    expect(result.recoveredId).not.toBeNull();
    const [child, foreignContribution] = await t.run(async (ctx) => [
      await ctx.db.get("ideaNodes", childIdeaId),
      await ctx.db.get("contentContributions", foreignContributionId),
    ]);
    expect(child?.archivedAt).toBeNull();
    expect(child?.parentIdeaId).toBeUndefined();
    expect(foreignContribution?.archivedAt).toBeNull();
    expect(foreignContribution?.targetKind).toBe("recovered");
    expect(foreignContribution?.targetId).toBe(result.recoveredId);
  });

  test("admin ne vidi privatne misli drugog člana", async () => {
    const { startupId, asAuthor, asAdmin } = await seedWorkspace();
    await asAuthor.mutation(api.thoughts.createNode, {
      startupId,
      title: "Privatno",
      text: "Samo autor",
      x: 0,
      y: 0,
      color: "violet",
    });
    const adminThoughts = await asAdmin.query(api.thoughts.listNodes, {
      startupId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(adminThoughts.page).toHaveLength(0);
  });

  test("resize privatne misli ostaje kompatibilan sa paginiranim listNodes odgovorom", async () => {
    const { startupId, asAuthor } = await seedWorkspace();
    const nodeId = await asAuthor.mutation(api.thoughts.createNode, {
      startupId,
      title: "Resize misao",
      text: "Sadrzaj koji mora ostati dostupan posle promene velicine.",
      x: 20,
      y: 30,
      color: "green",
    });

    await asAuthor.mutation(api.thoughts.updateNodeLayout, {
      nodeId,
      x: 24,
      y: 36,
      width: 520,
      height: 420,
    });

    const thoughts = await asAuthor.query(api.thoughts.listNodes, {
      startupId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(thoughts.page).toEqual([
      expect.objectContaining({
        _id: nodeId,
        x: 24,
        y: 36,
        width: 520,
        height: 420,
      }),
    ]);
  });

  test("resize ideje se vraca kroz zajednicki canvas odgovor", async () => {
    const { startupId, asAuthor } = await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      title: "Resize ideja",
      text: "Ideja sa sacuvanim dimenzijama.",
      x: 40,
      y: 60,
    });

    await asAuthor.mutation(api.ideas.updateLayout, {
      startupId,
      ideaId,
      x: 48,
      y: 72,
      width: 520,
      height: 420,
    });

    const ideas = await asAuthor.query(api.ideas.list, { startupId });
    expect(ideas.nodes).toContainEqual(
      expect.objectContaining({
        _id: ideaId,
        x: 48,
        y: 72,
        width: 520,
        height: 420,
      }),
    );
  });

  test("resize beleske ili zadatka se vraca kroz area canvas odgovor", async () => {
    const { t, startupId, author, asAuthor } = await seedWorkspace();
    const { areaId, pageId } = await t.run(async (ctx) => {
      const now = Date.now();
      const areaId = await ctx.db.insert("startupAreas", {
        startupId,
        key: "dev",
        label: "Dev notes",
        position: 0,
        createdAt: now,
      });
      const pageId = await ctx.db.insert("pages", {
        startupId,
        areaId,
        parentPageId: null,
        kind: "note",
        title: "Resize beleska",
        searchText: "resize beleska",
        revision: 1,
        position: 0,
        taskStatus: null,
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        createdByProfileId: author.profileId,
        updatedByProfileId: author.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { areaId, pageId };
    });

    await asAuthor.mutation(api.canvases.resizeAreaCanvasPage, {
      startupId,
      pageId,
      width: 520,
      height: 420,
    });

    const canvas = await asAuthor.query(api.canvases.getAreaCanvas, {
      startupId,
      areaId,
      kind: "note",
    });
    expect(canvas.pages).toContainEqual(
      expect.objectContaining({
        _id: pageId,
        width: 520,
        height: 420,
      }),
    );
  });
});
