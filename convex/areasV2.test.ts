/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedAreasV2Workspace() {
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
    const actor = await createPerson("Actor");
    const member = await createPerson("Member");
    const outsider = await createPerson("Outsider");
    const startupA = await ctx.db.insert("startups", {
      name: "Startup A",
      description: "",
      createdByProfileId: actor.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const startupB = await ctx.db.insert("startups", {
      name: "Startup B",
      description: "",
      createdByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const profileId of [actor.profileId, member.profileId]) {
      await ctx.db.insert("startupMembers", {
        startupId: startupA,
        profileId,
        addedByProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    await ctx.db.insert("startupMembers", {
      startupId: startupB,
      profileId: outsider.profileId,
      addedByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
    });
    const createArea = (
      startupId: Id<"startups">,
      key: string,
      position: number,
    ) =>
      ctx.db.insert("startupAreas", {
        startupId,
        key,
        label: key,
        position,
        createdAt: now,
      });
    const areaA1 = await createArea(startupA, "a-1", 0);
    const areaA2 = await createArea(startupA, "a-2", 1);
    const areaB = await createArea(startupB, "b", 0);
    return {
      actor,
      member,
      outsider,
      startupA,
      startupB,
      areaA1,
      areaA2,
      areaB,
    };
  });
  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|areas-v2-test` });
  return {
    t,
    ...seeded,
    asActor: asPerson(seeded.actor),
    asMember: asPerson(seeded.member),
    asOutsider: asPerson(seeded.outsider),
  };
}

describe("Areas V2 backend", () => {
  test("mixed canvas i Note↔Task relacije nisu vezani za parent scope", async () => {
    const { startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const actorRoot = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Plan",
    });
    const memberTask = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Isporuka",
    });
    const nestedNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: actorRoot.pageId,
      kind: "note",
      title: "Specifikacija",
    });

    const relationId = await asActor.mutation(
      api.areasV2.createRelation,
      {
        startupId: startupA,
        pageAId: nestedNote.pageId,
        pageBId: memberTask.pageId,
      },
    );
    const canvas = await asActor.query(api.areasV2.getCanvas, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
    });
    expect(canvas.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: actorRoot.pageId, kind: "note" }),
        expect.objectContaining({ _id: memberTask.pageId, kind: "task" }),
      ]),
    );
    const listed = await asActor.query(api.areasV2.listRelations, {
      startupId: startupA,
      pageId: nestedNote.pageId,
    });
    expect(listed.relations).toEqual([
      expect.objectContaining({
        _id: relationId,
        linkedPage: expect.objectContaining({ pageId: memberTask.pageId }),
      }),
    ]);
  });

  test("layout i edge autorizacija su vlasnički i tenant-scope ostaje zatvoren", async () => {
    const {
      t,
      startupA,
      startupB,
      areaA1,
      areaB,
      asActor,
      asMember,
      asOutsider,
    } = await seedAreasV2Workspace();
    const note = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Autorska kartica",
    });
    const task = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Članova beleška",
    });
    await expect(
      asMember.mutation(api.areasV2.movePages, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        updates: [{ pageId: note.pageId, x: 10, y: 20 }],
      }),
    ).rejects.toThrow("svoje kartice");
    await expect(
      asMember.mutation(api.areasV2.resizePage, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        pageId: note.pageId,
        width: 400,
        height: 300,
      }),
    ).rejects.toThrow("svoje kartice");
    const edgeId = await asActor.mutation(api.areasV2.connectPages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      sourcePageId: note.pageId,
      targetPageId: task.pageId,
    });
    await expect(
      asMember.mutation(api.areasV2.disconnectPages, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        edgeId,
      }),
    ).rejects.toThrow("koju ste napravili");
    const oppositeTask = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Task za relation guard",
    });
    await expect(
      asActor.mutation(api.areasV2.connectPages, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        sourcePageId: note.pageId,
        targetPageId: oppositeTask.pageId,
      }),
    ).rejects.toThrow("Note↔Task");

    const nested = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: note.pageId,
      kind: "note",
      title: "Drugi scope",
    });
    await expect(
      asActor.mutation(api.areasV2.connectPages, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        sourcePageId: nested.pageId,
        targetPageId: task.pageId,
      }),
    ).rejects.toThrow("ovom kanvasu");

    const foreign = await asOutsider.mutation(api.areasV2.createPage, {
      startupId: startupB,
      areaId: areaB,
      rootPageId: null,
      kind: "note",
      title: "Tajni naslov",
    });
    await t.run((ctx) =>
      ctx.db.patch("pages", foreign.pageId, { areaId: areaA1 }),
    );
    const canvas = await asActor.query(api.areasV2.getCanvas, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
    });
    expect(canvas.pages.map((page) => page._id)).not.toContain(foreign.pageId);
  });

  test("tuđ V2 edge i relacija se arhiviraju samo kroz jednoglasni approval", async () => {
    const {
      t,
      startupA,
      areaA1,
      asActor,
      asMember,
      asOutsider,
    } = await seedAreasV2Workspace();
    const actorNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Autorova beleška",
    });
    const memberNote = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Članova beleška",
    });
    const memberTask = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Članov task",
    });
    const edgeId = await asActor.mutation(api.areasV2.connectPages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      sourcePageId: actorNote.pageId,
      targetPageId: memberNote.pageId,
    });
    const relationId = await asActor.mutation(
      api.areasV2.createRelation,
      {
        startupId: startupA,
        pageAId: actorNote.pageId,
        pageBId: memberTask.pageId,
      },
    );

    const [memberCanvas, ownerCanvas, memberRelations] = await Promise.all([
      asMember.query(api.areasV2.getCanvas, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
      }),
      asActor.query(api.areasV2.getCanvas, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
      }),
      asMember.query(api.areasV2.listRelations, {
        startupId: startupA,
        pageId: actorNote.pageId,
      }),
    ]);
    expect(memberCanvas.edges.find((edge) => edge._id === edgeId)).toMatchObject({
      canDelete: false,
      canRequestDeletion: true,
    });
    expect(
      memberCanvas.relations.find((relation) => relation._id === relationId),
    ).toMatchObject({ canDelete: false, canRequestDeletion: true });
    expect(ownerCanvas.edges.find((edge) => edge._id === edgeId)).toMatchObject({
      canDelete: true,
      canRequestDeletion: false,
    });
    expect(memberRelations.relations[0]).toMatchObject({
      _id: relationId,
      canDelete: false,
      canRequestDeletion: true,
    });

    await expect(
      asActor.mutation(api.collaboration.requestDeletion, {
        target: { kind: "page_edge", id: edgeId },
      }),
    ).rejects.toThrow("Sopstveni sadržaj");
    await expect(
      asOutsider.mutation(api.collaboration.requestDeletion, {
        target: { kind: "page_edge", id: edgeId },
      }),
    ).rejects.toThrow("Nemate pristup");
    await expect(
      asMember.mutation(api.areasV2.deleteRelation, {
        startupId: startupA,
        relationId,
      }),
    ).rejects.toThrow("koju ste napravili");

    const [edgeRequestId, relationRequestId] = await Promise.all([
      asMember.mutation(api.collaboration.requestDeletion, {
        target: { kind: "page_edge", id: edgeId },
      }),
      asMember.mutation(api.collaboration.requestDeletion, {
        target: { kind: "page_relation", id: relationId },
      }),
    ]);
    await asActor.mutation(api.collaboration.voteOnDeletion, {
      requestId: edgeRequestId,
      vote: "approve",
    });
    await asActor.mutation(api.collaboration.voteOnDeletion, {
      requestId: relationRequestId,
      vote: "approve",
    });
    const archived = await t.run(async (ctx) => ({
      edge: await ctx.db.get("pageCanvasEdgesV2", edgeId),
      relation: await ctx.db.get("pageRelations", relationId),
    }));
    expect(archived.edge?.archivedAt).not.toBeNull();
    expect(archived.relation?.archivedAt).not.toBeNull();
  });

  test("nesting prolazi pending/approve, stale cancel i cycle zaštitu", async () => {
    const { t, startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const child = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Dete",
    });
    const foreignParent = await asMember.mutation(
      api.areasV2.createPage,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        kind: "note",
        title: "Tuđi roditelj",
      },
    );
    const request = await asActor.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: child.pageId,
      targetParentPageId: foreignParent.pageId,
      x: 45,
      y: 60,
    });
    expect(request.nestingStatus).toBe("pending");
    expect(
      await t.run((ctx) => ctx.db.get("pages", child.pageId)),
    ).toMatchObject({ parentPageId: null });
    await expect(
      asMember.mutation(api.areasV2.approveNesting, {
        startupId: startupA,
        requestId: request.requestId!,
      }),
    ).resolves.toEqual({ status: "approved" });
    expect(
      await t.run((ctx) => ctx.db.get("pages", child.pageId)),
    ).toMatchObject({ parentPageId: foreignParent.pageId });

    await asActor.mutation(api.areasV2.detachPage, {
      startupId: startupA,
      pageId: child.pageId,
    });
    const stale = await asActor.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: child.pageId,
      targetParentPageId: foreignParent.pageId,
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.get("pages", child.pageId);
      await ctx.db.patch("pages", child.pageId, {
        treeRevision: (row?.treeRevision ?? 0) + 1,
      });
    });
    await expect(
      asMember.mutation(api.areasV2.approveNesting, {
        startupId: startupA,
        requestId: stale.requestId!,
      }),
    ).resolves.toEqual({ status: "cancelled" });

    const ownedParent = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Roditelj",
    });
    const ownedChild = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: ownedParent.pageId,
      kind: "note",
      title: "Potomak",
    });
    await expect(
      asActor.mutation(api.areasV2.movePage, {
        startupId: startupA,
        pageId: ownedParent.pageId,
        targetAreaId: areaA1,
        targetParentPageId: ownedChild.pageId,
      }),
    ).rejects.toThrow("kružnu");
  });

  test("cross-area move odbija granu sa aktivnim stranim autorom", async () => {
    const { t, startupA, areaA1, areaA2, asActor, asMember } =
      await seedAreasV2Workspace();
    const root = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Grana",
    });
    const foreignChild = await asMember.mutation(
      api.areasV2.createPage,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: root.pageId,
        kind: "task",
        title: "Tuđi potomak",
      },
    );
    expect(foreignChild.nestingStatus).toBe("pending");
    await asActor.mutation(api.areasV2.approveNesting, {
      startupId: startupA,
      requestId: foreignChild.requestId!,
    });
    await expect(
      asActor.mutation(api.areasV2.movePage, {
        startupId: startupA,
        pageId: root.pageId,
        targetAreaId: areaA2,
        targetParentPageId: null,
      }),
    ).rejects.toThrow("drugih autora");
    expect(await t.run((ctx) => ctx.db.get("pages", root.pageId))).toMatchObject(
      { areaId: areaA1 },
    );
  });

  test("cross-area move ne može prepuniti relacije ciljne oblasti", async () => {
    const { t, actor, startupA, areaA1, areaA2, asActor } =
      await seedAreasV2Workspace();
    const root = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Relacijska grana",
    });
    const child = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      kind: "task",
      title: "Relacijski potomak",
    });
    const movingRelationId = await asActor.mutation(
      api.areasV2.createRelation,
      {
        startupId: startupA,
        pageAId: root.pageId,
        pageBId: child.pageId,
      },
    );
    const targetNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "note",
      title: "Target note",
    });
    const targetTask = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "task",
      title: "Target task",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 400; index += 1) {
        await ctx.db.insert("pageRelations", {
          startupId: startupA,
          areaId: areaA2,
          notePageId: targetNote.pageId,
          taskPageId: targetTask.pageId,
          pairKey: `filler:${index}`,
          label: null,
          authorProfileId: actor.profileId,
          archivedAt: null,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
    });
    await expect(
      asActor.mutation(api.areasV2.movePage, {
        startupId: startupA,
        pageId: root.pageId,
        targetAreaId: areaA2,
        targetParentPageId: null,
      }),
    ).rejects.toThrow("najviše 400 relacija");
    const state = await t.run(async (ctx) => ({
      root: await ctx.db.get("pages", root.pageId),
      child: await ctx.db.get("pages", child.pageId),
      relation: await ctx.db.get("pageRelations", movingRelationId),
    }));
    expect(state.root?.areaId).toBe(areaA1);
    expect(state.child?.areaId).toBe(areaA1);
    expect(state.relation?.areaId).toBe(areaA1);
  });

  test("odobrena timska arhiva koristi istu V2 sidecar semantiku", async () => {
    const { t, startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const parent = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Stranica za glasanje",
    });
    const childA = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      kind: "note",
      title: "Dete A",
    });
    const childB = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      kind: "note",
      title: "Dete B",
    });
    const edgeId = await asActor.mutation(api.areasV2.connectPages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      sourcePageId: childA.pageId,
      targetPageId: childB.pageId,
    });
    const memberTask = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Povezan task",
    });
    const relationId = await asMember.mutation(
      api.areasV2.createRelation,
      {
        startupId: startupA,
        pageAId: parent.pageId,
        pageBId: memberTask.pageId,
      },
    );
    const pendingChild = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      kind: "note",
      title: "Ghost zahtev",
    });
    expect(pendingChild.nestingStatus).toBe("pending");

    const requestId = await asMember.mutation(
      api.collaboration.requestDeletion,
      { target: { kind: "page", id: parent.pageId } },
    );
    await asActor.mutation(api.collaboration.voteOnDeletion, {
      requestId,
      vote: "approve",
    });

    const state = await t.run(async (ctx) => ({
      parent: await ctx.db.get("pages", parent.pageId),
      childA: await ctx.db.get("pages", childA.pageId),
      childB: await ctx.db.get("pages", childB.pageId),
      placementA: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", childA.pageId))
        .unique(),
      edge: await ctx.db.get("pageCanvasEdgesV2", edgeId),
      relation: await ctx.db.get("pageRelations", relationId),
      nesting: await ctx.db.get(
        "pageNestingRequests",
        pendingChild.requestId!,
      ),
    }));
    expect(state.parent?.archivedAt).not.toBeNull();
    expect(state.childA?.parentPageId).toBeNull();
    expect(state.childB?.parentPageId).toBeNull();
    expect(state.placementA?.rootPageId).toBeNull();
    expect(state.edge).toMatchObject({ rootPageId: null, archivedAt: null });
    expect(state.relation?.archivedAt).not.toBeNull();
    expect(state.nesting?.status).toBe("cancelled");
  });

  test("backfill je idempotentan, čuva legacy i karantiniše nevalidnu vezu", async () => {
    const {
      t,
      actor,
      startupA,
      areaA1,
      areaA2,
      asActor,
    } = await seedAreasV2Workspace();
    const noteId = await asActor.mutation(api.pages.create, {
      startupId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Legacy beleška",
    });
    const taskId = await asActor.mutation(api.pages.create, {
      startupId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Legacy druga beleška",
    });
    const nestedId = await asActor.mutation(api.pages.create, {
      startupId: startupA,
      areaId: areaA1,
      parentPageId: noteId,
      kind: "task",
      title: "Drugi parent",
    });
    const staleScopeId = await asActor.mutation(api.pages.create, {
      startupId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Pogresan placement scope",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const pageId of [noteId, taskId, nestedId]) {
        const placements = await ctx.db
          .query("pageCanvasPlacements")
          .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
          .take(10);
        for (const placement of placements) {
          await ctx.db.delete("pageCanvasPlacements", placement._id);
        }
        await ctx.db.patch("pages", pageId, {
          treeRevision: undefined,
          canvasPreview: undefined,
        });
      }
      const stalePlacement = await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", staleScopeId))
        .unique();
      if (stalePlacement === null) {
        throw new Error("Test fixture nema stale placement.");
      }
      await ctx.db.patch("pageCanvasPlacements", stalePlacement._id, {
        areaId: areaA2,
        rootPageId: noteId,
      });
      await ctx.db.insert("pageCanvasNodes", {
        startupId: startupA,
        areaId: areaA1,
        pageId: noteId,
        x: 10,
        y: 20,
        updatedAt: now,
      });
      await ctx.db.insert("pageCanvasNodes", {
        startupId: startupA,
        areaId: areaA1,
        pageId: taskId,
        x: 30,
        y: 40,
        width: 340,
        height: 220,
        updatedAt: now,
      });
      await ctx.db.insert("pageEdges", {
        startupId: startupA,
        areaId: areaA1,
        nodeAId: noteId,
        nodeBId: taskId,
        pairKey: [noteId, taskId].sort().join(":"),
        label: null,
        authorProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("pageEdges", {
        startupId: startupA,
        areaId: areaA1,
        nodeAId: taskId,
        nodeBId: nestedId,
        pairKey: [taskId, nestedId].sort().join(":"),
        label: null,
        archivedAt: null,
        createdAt: now,
      });
      await ctx.db.insert("pageCanvases", {
        startupId: startupA,
        areaId: areaA1,
        ownerProfileId: actor.profileId,
        kind: "note",
        x: 5,
        y: 6,
        zoom: 0.9,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("pageCanvases", {
        startupId: startupA,
        areaId: areaA1,
        ownerProfileId: actor.profileId,
        kind: "task",
        x: 50,
        y: 60,
        zoom: 1.2,
        createdAt: now + 1,
        updatedAt: now + 1,
      });
    });

    const args = { cursor: null, limit: 100 };
    const first = await Promise.all([
      t.mutation(internal.areasV2Migrations.backfillAreaBodies, args),
      t.mutation(internal.areasV2Migrations.backfillPages, args),
      t.mutation(internal.areasV2Migrations.backfillPlacements, args),
      t.mutation(internal.areasV2Migrations.backfillEdges, args),
      t.mutation(internal.areasV2Migrations.backfillViewports, args),
    ]);
    expect(first[1].changed).toBeGreaterThanOrEqual(3);
    expect(first[2].changed).toBe(4);
    expect(first[3]).toMatchObject({ changed: 1, quarantined: 1 });
    expect(first[4].changed).toBe(1);

    const second = await Promise.all([
      t.mutation(internal.areasV2Migrations.backfillAreaBodies, args),
      t.mutation(internal.areasV2Migrations.backfillPages, args),
      t.mutation(internal.areasV2Migrations.backfillPlacements, args),
      t.mutation(internal.areasV2Migrations.backfillEdges, args),
      t.mutation(internal.areasV2Migrations.backfillViewports, args),
    ]);
    expect(second.map((row) => row.changed)).toEqual([0, 0, 0, 0, 0]);

    const stored = await t.run(async (ctx) => ({
      legacyEdges: await ctx.db.query("pageEdges").collect(),
      v2Edges: await ctx.db.query("pageCanvasEdgesV2").collect(),
      placements: await ctx.db.query("pageCanvasPlacements").collect(),
      viewports: await ctx.db.query("pageCanvasViewports").collect(),
      issues: await ctx.db.query("areasMigrationIssues").collect(),
    }));
    expect(stored.legacyEdges).toHaveLength(2);
    expect(stored.v2Edges).toHaveLength(1);
    expect(stored.placements).toHaveLength(4);
    expect(stored.placements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: nestedId,
          rootPageId: noteId,
          x: 0,
          y: 0,
        }),
        expect.objectContaining({
          pageId: staleScopeId,
          areaId: areaA1,
          rootPageId: null,
        }),
      ]),
    );
    expect(stored.viewports).toEqual([
      expect.objectContaining({ x: 50, y: 60, zoom: 1.2 }),
    ]);
    expect(stored.issues).toHaveLength(1);

    const verified = await t.query(
      internal.areasV2Migrations.verifyAreasV2,
      { stage: "edges", cursor: null, limit: 100 },
    );
    expect(verified.issueCount).toBe(0);
    const verifiedPlacements = await Promise.all(
      ["placements", "placement_rows"].map((stage) =>
        t.query(internal.areasV2Migrations.verifyAreasV2, {
          stage: stage as "placements" | "placement_rows",
          cursor: null,
          limit: 100,
        }),
      ),
    );
    expect(verifiedPlacements.map((result) => result.issueCount)).toEqual([
      0, 0,
    ]);
  });

  test("verifier prijavljuje samo aktivna V2 ostecenja i pronalazi placement sirocad", async () => {
    const {
      t,
      actor,
      startupA,
      startupB,
      areaA1,
      asActor,
      asMember,
    } = await seedAreasV2Workspace();
    const root = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Koren",
    });
    const nested = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      kind: "note",
      title: "Ugnjezdena beleska",
    });
    const missingPlacement = await asActor.mutation(
      api.areasV2.createPage,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        kind: "note",
        title: "Bez pozicije",
      },
    );
    const duplicatePlacement = await asActor.mutation(
      api.areasV2.createPage,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        kind: "note",
        title: "Dupla pozicija",
      },
    );
    const orphanPlacement = await asActor.mutation(
      api.areasV2.createPage,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        kind: "note",
        title: "Siroce",
      },
    );
    const requestChild = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Dete zahteva",
    });
    const foreignParent = await asMember.mutation(
      api.areasV2.createPage,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        kind: "note",
        title: "Tudji roditelj",
      },
    );
    const pending = await asActor.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: requestChild.pageId,
      targetParentPageId: foreignParent.pageId,
    });
    expect(pending.nestingStatus).toBe("pending");
    expect(pending.requestId).not.toBeNull();

    await t.run(async (ctx) => {
      const now = Date.now();
      const missingRows = await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) =>
          q.eq("pageId", missingPlacement.pageId),
        )
        .take(2);
      for (const placement of missingRows) {
        await ctx.db.delete("pageCanvasPlacements", placement._id);
      }

      const canonicalDuplicate = await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) =>
          q.eq("pageId", duplicatePlacement.pageId),
        )
        .unique();
      if (canonicalDuplicate === null) {
        throw new Error("Test fixture nema kanonsku poziciju.");
      }
      await ctx.db.insert("pageCanvasPlacements", {
        startupId: canonicalDuplicate.startupId,
        areaId: canonicalDuplicate.areaId,
        rootPageId: canonicalDuplicate.rootPageId,
        pageId: canonicalDuplicate.pageId,
        x: canonicalDuplicate.x + 10,
        y: canonicalDuplicate.y + 10,
        updatedByProfileId: canonicalDuplicate.updatedByProfileId,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.delete("pages", orphanPlacement.pageId);

      const edgePair = [root.pageId, nested.pageId].sort().join(":");
      await ctx.db.insert("pageCanvasEdgesV2", {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        nodeAId: root.pageId,
        nodeBId: nested.pageId,
        pairKey: edgePair,
        label: null,
        authorProfileId: actor.profileId,
        attribution: "author",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("pageCanvasEdgesV2", {
        startupId: startupB,
        areaId: areaA1,
        rootPageId: null,
        nodeAId: root.pageId,
        nodeBId: nested.pageId,
        pairKey: edgePair,
        label: null,
        attribution: "legacy_neutral",
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("pageRelations", {
        startupId: startupA,
        areaId: areaA1,
        notePageId: root.pageId,
        taskPageId: nested.pageId,
        pairKey: edgePair,
        label: null,
        authorProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("pageRelations", {
        startupId: startupB,
        areaId: areaA1,
        notePageId: root.pageId,
        taskPageId: nested.pageId,
        pairKey: edgePair,
        label: null,
        authorProfileId: actor.profileId,
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const child = await ctx.db.get("pages", requestChild.pageId);
      if (child === null) {
        throw new Error("Test fixture nema dete zahteva.");
      }
      await ctx.db.patch("pages", child._id, {
        treeRevision: (child.treeRevision ?? 0) + 1,
      });
      await ctx.db.insert("pageNestingRequests", {
        startupId: startupB,
        areaId: areaA1,
        childPageId: root.pageId,
        sourceParentPageId: null,
        targetParentPageId: nested.pageId,
        requesterProfileId: actor.profileId,
        parentAuthorProfileId: actor.profileId,
        expectedTreeRevision: 0,
        status: "rejected",
        createdAt: now,
        updatedAt: now,
        resolvedAt: now,
      });
    });

    const verify = (stage:
      | "placements"
      | "placement_rows"
      | "edges"
      | "relations"
      | "requests") =>
      t.query(internal.areasV2Migrations.verifyAreasV2, {
        stage,
        cursor: null,
        limit: 100,
      });
    const [placements, placementRows, edges, relations, requests] =
      await Promise.all([
        verify("placements"),
        verify("placement_rows"),
        verify("edges"),
        verify("relations"),
        verify("requests"),
      ]);

    expect(placements.issueCount).toBe(2);
    expect(placementRows.issueCount).toBe(3);
    expect(edges.issueCount).toBe(1);
    expect(relations.issueCount).toBe(1);
    expect(requests.issueCount).toBe(1);
  });
});
