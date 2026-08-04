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
  test("naslovi ideje i privatne misli ne mogu biti prazni", async () => {
    const { startupId, asAuthor } = await seedWorkspace();
    await expect(
      asAuthor.mutation(api.ideas.create, {
        startupId,
        title: "   ",
        text: "Tekst ideje",
      }),
    ).rejects.toThrow("Naslov ideje");
    await expect(
      asAuthor.mutation(api.thoughts.createNode, {
        startupId,
        title: "",
        text: "Privatni tekst",
        x: 0,
        y: 0,
        color: "violet",
      }),
    ).rejects.toThrow("Naslov misli");
  });

  test("izmene članova prolaze pending, reject, ponovno slanje i approve bez dupliranja osnove", async () => {
    const { startupId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      title: "Moderacija",
      text: "Originalna ideja",
    });

    expect(
      await asAuthor.query(api.collaboration.listContributions, {
        target: { kind: "idea", id: ideaId },
      }),
    ).toHaveLength(0);

    const textId = await asMember.mutation(
      api.collaboration.addContribution,
      {
        target: { kind: "idea", id: ideaId },
        content: "Predlog člana",
      },
    );
    expect(
      await asAdmin.query(api.collaboration.listContributions, {
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "pending",
        content: "Predlog člana",
      }),
    ]);
    await expect(
      asMember.mutation(api.collaboration.moderateContribution, {
        contributionId: textId,
        decision: "approve",
      }),
    ).rejects.toThrow("Samo osnivač");

    await asAuthor.mutation(api.collaboration.moderateContribution, {
      contributionId: textId,
      decision: "reject",
    });
    expect(
      await asAdmin.query(api.collaboration.listContributions, {
        target: { kind: "idea", id: ideaId },
      }),
    ).toHaveLength(0);
    expect(
      await asMember.query(api.collaboration.listContributions, {
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "rejected",
      }),
    ]);

    await asMember.mutation(api.collaboration.updateContribution, {
      contributionId: textId,
      content: "Dorađen predlog člana",
    });
    expect(
      await asAdmin.query(api.collaboration.listContributions, {
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "pending",
        content: "Dorađen predlog člana",
      }),
    ]);

    await asAuthor.mutation(api.collaboration.moderateContribution, {
      contributionId: textId,
      decision: "approve",
    });
    expect(
      await asAdmin.query(api.collaboration.listContributions, {
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "approved",
      }),
    ]);
  });

  test("tim može pomerati tuđu ideju, ali samo autor menja sadržaj i veličinu", async () => {
    const { t, startupId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      title: "Autorska ideja",
      text: "Autorska ideja",
      x: 10,
      y: 20,
    });

    await expect(
      asMember.mutation(api.ideas.update, {
        startupId,
        ideaId,
        title: "Tuđa izmena",
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
    const moved = await t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(moved?.x).toBe(999);
    expect(moved?.y).toBe(999);
    await expect(
      asAdmin.mutation(api.ideas.archive, { startupId, ideaId }),
    ).rejects.toThrow("jednoglasnim glasanjem");
  });

  test("cross-owner ugnježđavanje traži autora Parenta, dozvoljava izvlačenje obe strane i odbija ciklus", async () => {
    const { t, startupId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const childIdeaId = await asAuthor.mutation(api.ideas.create, {
      startupId,
      title: "Dete",
      text: "Dete",
      x: 300,
      y: 220,
    });
    const parentIdeaId = await asMember.mutation(api.ideas.create, {
      startupId,
      title: "Parent",
      text: "Parent",
      x: 100,
      y: 100,
    });
    const requested = await asAuthor.mutation(
      api.collaboration.requestNesting,
      { startupId, childIdeaId, parentIdeaId },
    );
    expect(requested.status).toBe("pending");
    expect(
      (await asAdmin.query(api.ideas.list, { startupId })).nodes.find(
        (node) => node._id === childIdeaId,
      ),
    ).toEqual(
      expect.objectContaining({
        parentIdeaId,
        nestingModerationStatus: "pending",
        canMove: true,
      }),
    );
    expect(
      (await t.run((ctx) => ctx.db.get("ideaNodes", childIdeaId)))
        ?.parentIdeaId,
    ).toBeUndefined();
    await expect(
      asMember.mutation(api.collaboration.requestNesting, {
        startupId,
        childIdeaId: parentIdeaId,
        parentIdeaId: childIdeaId,
      }),
    ).rejects.toThrow("kružnu hijerarhiju");
    await asMember.mutation(api.collaboration.resolveNesting, {
      requestId: requested.requestId!,
      approve: false,
    });
    expect(
      (await asAdmin.query(api.ideas.list, { startupId })).nodes.find(
        (node) => node._id === childIdeaId,
      )?.parentIdeaId,
    ).toBeUndefined();
    expect(
      (await asAuthor.query(api.ideas.list, { startupId })).nodes.find(
        (node) => node._id === childIdeaId,
      ),
    ).toEqual(
      expect.objectContaining({
        parentIdeaId,
        nestingModerationStatus: "rejected",
      }),
    );
    expect(
      (await asMember.query(api.ideas.list, { startupId })).nodes.find(
        (node) => node._id === childIdeaId,
      ),
    ).toEqual(
      expect.objectContaining({
        parentIdeaId,
        nestingModerationStatus: "rejected",
      }),
    );
    await asAuthor.mutation(api.collaboration.detachIdea, {
      startupId,
      ideaId: childIdeaId,
    });
    const requestedAgain = await asAuthor.mutation(
      api.collaboration.requestNesting,
      { startupId, childIdeaId, parentIdeaId },
    );
    await asMember.mutation(api.collaboration.resolveNesting, {
      requestId: requestedAgain.requestId!,
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
      title: "Prva",
      text: "Prva",
    });
    const second = await asAuthor.mutation(api.ideas.create, {
      startupId,
      title: "Druga",
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
      title: "Za timsko glasanje",
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
      title: "Ugnježđeno dete",
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

    await asAuthor.mutation(api.thoughts.resetNodeLayoutSize, { nodeId });
    const resetThoughts = await asAuthor.query(api.thoughts.listNodes, {
      startupId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(resetThoughts.page[0]).not.toHaveProperty("width");
    expect(resetThoughts.page[0]).not.toHaveProperty("height");
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

    await asAuthor.mutation(api.ideas.resetLayoutSize, {
      startupId,
      ideaId,
    });
    const resetIdeas = await asAuthor.query(api.ideas.list, { startupId });
    const resetIdea = resetIdeas.nodes.find((idea) => idea._id === ideaId);
    expect(resetIdea).not.toHaveProperty("width");
    expect(resetIdea).not.toHaveProperty("height");
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

    await asAuthor.mutation(api.canvases.resetAreaCanvasPageSize, {
      startupId,
      pageId,
    });
    const resetCanvas = await asAuthor.query(api.canvases.getAreaCanvas, {
      startupId,
      areaId,
      kind: "note",
    });
    expect(resetCanvas.pages).toContainEqual(
      expect.objectContaining({
        _id: pageId,
        width: 288,
        height: 196,
      }),
    );
    expect(
      await asAuthor.query(api.canvases.getPageCanvasSize, {
        startupId,
        pageId,
      }),
    ).toEqual({});
  });
});
