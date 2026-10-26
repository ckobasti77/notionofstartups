/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * PROSTOR K03 (P4, R5, R6, D4, D6, D20): slobodno premeštanje i ugnežđavanje.
 * Član premešta tuđe stranice i grane; zaključana stranica i spisak dece
 * zaključanog roditelja ostaju autoru i menadžeru; ciklus, dubina i opseg i
 * dalje važe; nečlan i uklonjen član ne premeštaju ništa.
 */

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (name: string) => {
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
    const owner = await person("Owner");
    const author = await person("Author");
    const member = await person("Member");
    const outsider = await person("Outsider");
    const removed = await person("Removed");
    const startupId = await ctx.db.insert("startups", {
      name: "Startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const [p, archivedAt] of [
      [owner, null],
      [author, null],
      [member, null],
      [removed, now],
    ] as const) {
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId: p.profileId,
        addedByProfileId: owner.profileId,
        archivedAt,
        createdAt: now,
      });
    }
    const area = (key: string, position: number) =>
      ctx.db.insert("startupAreas", {
        startupId,
        key,
        label: key,
        position,
        createdAt: now,
      });
    return {
      owner,
      author,
      member,
      outsider,
      removed,
      startupId,
      areaA: await area("dev", 0),
      areaB: await area("marketing", 1),
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|k03-moves` });
  return {
    t,
    ...seeded,
    asOwner: as(seeded.owner),
    asAuthor: as(seeded.author),
    asMember: as(seeded.member),
    asOutsider: as(seeded.outsider),
    asRemoved: as(seeded.removed),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function authorPage(
  s: Seeded,
  title: string,
  rootPageId: Id<"pages"> | null = null,
  areaId: Id<"startupAreas"> = s.areaA,
) {
  return (
    await s.asAuthor.mutation(api.areasV2.createPage, {
      startupId: s.startupId,
      areaId,
      rootPageId,
      kind: "note",
      title,
    })
  ).pageId;
}

const getPage = (s: Seeded, pageId: Id<"pages">) =>
  s.t.run((ctx) => ctx.db.get("pages", pageId));
const errorCode = (error: unknown) =>
  (error as { data?: { code?: string } }).data?.code;

describe("slobodno premeštanje (R5)", () => {
  test("član premešta tuđu stranicu pod tuđu stranicu i nazad, bez zahteva", async () => {
    const s = await seed();
    const target = await authorPage(s, "Cilj");
    const moving = await authorPage(s, "Selica");
    await s.asMember.mutation(api.pages.move, {
      pageId: moving,
      areaId: s.areaA,
      parentPageId: target,
    });
    expect(await getPage(s, moving)).toMatchObject({ parentPageId: target });
    await expect(
      s.asMember.mutation(api.areasV2.detachPage, {
        startupId: s.startupId,
        pageId: moving,
      }),
    ).resolves.toEqual({ status: "detached" });
    expect(await getPage(s, moving)).toMatchObject({ parentPageId: null });
    const activities = await s.t.run((ctx) =>
      ctx.db
        .query("activities")
        .withIndex("by_startupId_and_createdAt", (q) =>
          q.eq("startupId", s.startupId),
        )
        .collect(),
    );
    expect(
      activities.filter(
        (row) =>
          row.action === "page_moved" &&
          row.actorProfileId === s.member.profileId,
      ),
    ).toHaveLength(1);
  });

  test("član seli tuđu granu u drugu oblast (i pod stranicu u njoj)", async () => {
    const s = await seed();
    const root = await authorPage(s, "Grana");
    const child = await authorPage(s, "Dete", root);
    const grandchild = await authorPage(s, "Unuk", child);
    const otherParent = await authorPage(s, "Tamo", null, s.areaB);

    await s.asMember.mutation(api.pages.move, {
      pageId: root,
      areaId: s.areaB,
      parentPageId: null,
    });
    for (const id of [root, child, grandchild]) {
      expect((await getPage(s, id))?.areaId).toBe(s.areaB);
    }
    // Nazad u prvu oblast, odmah pod tuđu stranicu.
    const back = await authorPage(s, "Natrag", null, s.areaA);
    await expect(
      s.asMember.mutation(api.areasV2.movePage, {
        startupId: s.startupId,
        pageId: root,
        targetAreaId: s.areaA,
        targetParentPageId: back,
      }),
    ).resolves.toEqual({ nestingStatus: "none", requestId: null });
    expect(await getPage(s, root)).toMatchObject({
      areaId: s.areaA,
      parentPageId: back,
    });
    expect(await getPage(s, grandchild)).toMatchObject({
      areaId: s.areaA,
      parentPageId: child,
    });
    expect((await getPage(s, otherParent))?.areaId).toBe(s.areaB);
  });

  test("ciklus, sopstveni roditelj i opseg i dalje se odbijaju", async () => {
    const s = await seed();
    const root = await authorPage(s, "Koren");
    const child = await authorPage(s, "Dete", root);
    await expect(
      s.asMember.mutation(api.pages.move, {
        pageId: root,
        areaId: s.areaA,
        parentPageId: child,
      }),
    ).rejects.toThrow("kružnu");
    await expect(
      s.asMember.mutation(api.areasV2.requestNesting, {
        startupId: s.startupId,
        childPageId: root,
        targetParentPageId: child,
      }),
    ).rejects.toThrow("kružnu");
    await expect(
      s.asMember.mutation(api.pages.move, {
        pageId: root,
        areaId: s.areaA,
        parentPageId: root,
      }),
    ).rejects.toThrow("sopstveni roditelj");
    const elsewhere = await authorPage(s, "Druga oblast", null, s.areaB);
    await expect(
      s.asMember.mutation(api.areasV2.requestNesting, {
        startupId: s.startupId,
        childPageId: root,
        targetParentPageId: elsewhere,
      }),
    ).rejects.toThrow("iste oblasti");
  });

  test("nečlan i uklonjen član ne premeštaju", async () => {
    const s = await seed();
    const page = await authorPage(s, "Stranica");
    const target = await authorPage(s, "Cilj");
    for (const actor of [s.asOutsider, s.asRemoved]) {
      await expect(
        actor.mutation(api.pages.move, {
          pageId: page,
          areaId: s.areaA,
          parentPageId: target,
        }),
      ).rejects.toThrow("Nemate pristup");
      await expect(
        actor.mutation(api.areasV2.requestNesting, {
          startupId: s.startupId,
          childPageId: page,
          targetParentPageId: target,
        }),
      ).rejects.toThrow("Nemate pristup");
    }
    expect((await getPage(s, page))?.parentPageId).toBeNull();
  });
});

describe("zaključavanje i premeštanje (D4, D6)", () => {
  test("zaključanu stranicu i decu zaključanog roditelja premešta samo autor ili menadžer", async () => {
    const s = await seed();
    const lockedParent = await authorPage(s, "Zaključan roditelj");
    const child = await authorPage(s, "Dete", lockedParent);
    const loose = await authorPage(s, "Slobodna");
    await s.asAuthor.mutation(api.pages.lock, { pageId: lockedParent });

    // Izlaz iz zaključanog roditelja (R6 nad starim roditeljem).
    const outError = await s.asMember
      .mutation(api.areasV2.detachPage, { startupId: s.startupId, pageId: child })
      .catch((error: unknown) => error);
    expect(errorCode(outError)).toBe("ZAKLJUCANO");
    expect(String(outError)).toContain("Zaključan roditelj");
    // Ulaz u zaključanog roditelja (R6 nad novim roditeljem).
    const inError = await s.asMember
      .mutation(api.pages.move, {
        pageId: loose,
        areaId: s.areaA,
        parentPageId: lockedParent,
      })
      .catch((error: unknown) => error);
    expect(errorCode(inError)).toBe("ZAKLJUCANO");
    // Sama zaključana stranica (R5).
    const target = await authorPage(s, "Cilj");
    const selfError = await s.asMember
      .mutation(api.pages.move, {
        pageId: lockedParent,
        areaId: s.areaA,
        parentPageId: target,
      })
      .catch((error: unknown) => error);
    expect(errorCode(selfError)).toBe("ZAKLJUCANO");
    // Grana sa zaključanom stranicom u drugu oblast (D6).
    const branchRoot = await authorPage(s, "Grana");
    await s.asMember.mutation(api.pages.move, {
      pageId: target,
      areaId: s.areaA,
      parentPageId: branchRoot,
    });
    await s.asAuthor.mutation(api.pages.lock, { pageId: target });
    const branchError = await s.asMember
      .mutation(api.pages.move, {
        pageId: branchRoot,
        areaId: s.areaB,
        parentPageId: null,
      })
      .catch((error: unknown) => error);
    expect(errorCode(branchError)).toBe("ZAKLJUCANO");
    expect((await getPage(s, branchRoot))?.areaId).toBe(s.areaA);

    // Autor i vlasnik startupa mogu.
    await s.asAuthor.mutation(api.areasV2.detachPage, {
      startupId: s.startupId,
      pageId: child,
    });
    await s.asOwner.mutation(api.pages.move, {
      pageId: branchRoot,
      areaId: s.areaB,
      parentPageId: null,
    });
    expect(await getPage(s, child)).toMatchObject({ parentPageId: null });
    expect((await getPage(s, target))?.areaId).toBe(s.areaB);
    // Raspored zaključane kartice menja svaki član (D20).
    await expect(
      s.asMember.mutation(api.areasV2.movePages, {
        startupId: s.startupId,
        areaId: s.areaA,
        rootPageId: null,
        updates: [{ pageId: lockedParent, x: 900, y: 40 }],
      }),
    ).resolves.toBeNull();
  });
});

describe("raspored, veze i relacije tuđih kartica (D20)", () => {
  test("član povezuje i razvezuje tuđe kartice, pravi i briše tuđu relaciju", async () => {
    const s = await seed();
    const a = await authorPage(s, "A");
    const b = await authorPage(s, "B");
    const edgeId = await s.asMember.mutation(api.areasV2.connectPages, {
      startupId: s.startupId,
      areaId: s.areaA,
      rootPageId: null,
      sourcePageId: a,
      targetPageId: b,
    });
    const relationId = await s.asMember.mutation(api.areasV2.createRelation, {
      startupId: s.startupId,
      pageAId: a,
      pageBId: b,
    });
    const relations = await s.asMember.query(api.areasV2.listRelations, {
      startupId: s.startupId,
      pageId: a,
    });
    expect(relations.relations).toEqual([
      expect.objectContaining({
        _id: relationId,
        canDelete: true,
        canRequestDeletion: false,
      }),
    ]);
    await s.asAuthor.mutation(api.areasV2.disconnectPages, {
      startupId: s.startupId,
      areaId: s.areaA,
      rootPageId: null,
      edgeId,
    });
    await s.asAuthor.mutation(api.areasV2.deleteRelation, {
      startupId: s.startupId,
      relationId,
    });
    const state = await s.t.run(async (ctx) => ({
      edge: await ctx.db.get("pageCanvasEdgesV2", edgeId),
      relation: await ctx.db.get("pageRelations", relationId),
    }));
    expect(state.edge?.archivedAt).toEqual(expect.any(Number));
    expect(state.relation?.archivedAt).toEqual(expect.any(Number));
    await expect(
      s.asOutsider.mutation(api.areasV2.connectPages, {
        startupId: s.startupId,
        areaId: s.areaA,
        rootPageId: null,
        sourcePageId: a,
        targetPageId: b,
      }),
    ).rejects.toThrow("Nemate pristup");
  });

  test("veze ideja: svaki član povezuje, menja naziv i razvezuje tuđe", async () => {
    const s = await seed();
    const ideaA = await s.asAuthor.mutation(api.ideas.create, {
      startupId: s.startupId,
      title: "A",
      text: "A",
    });
    const ideaB = await s.asAuthor.mutation(api.ideas.create, {
      startupId: s.startupId,
      title: "B",
      text: "B",
    });
    const edgeId = await s.asMember.mutation(api.ideas.connect, {
      startupId: s.startupId,
      nodeAId: ideaA,
      nodeBId: ideaB,
    });
    await s.asAuthor.mutation(api.ideas.updateEdgeLabel, {
      startupId: s.startupId,
      edgeId,
      label: "zavisi od",
    });
    await s.asAuthor.mutation(api.ideas.disconnect, {
      startupId: s.startupId,
      edgeId,
    });
    expect(
      await s.t.run((ctx) => ctx.db.get("ideaEdges", edgeId)),
    ).toMatchObject({ label: "zavisi od", archivedAt: expect.any(Number) });
  });
});
