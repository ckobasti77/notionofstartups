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
  test("automatic layout separates new cards, ghosts, and migrated collisions", async () => {
    const { t, startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const parent = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Layout parent",
    });
    const sibling = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Layout sibling",
    });
    const child = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      kind: "note",
      title: "Existing child",
    });
    const pending = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      kind: "task",
      title: "Proposed child",
    });
    expect(pending.nestingStatus).toBe("pending");

    const rootCanvas = await asActor.query(api.areasV2.getCanvas, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
    });
    const rootPositions = rootCanvas.pages
      .filter(
        (page) => page._id === parent.pageId || page._id === sibling.pageId,
      )
      .map((page) => `${page.x}:${page.y}`);
    expect(new Set(rootPositions).size).toBe(2);

    const childCanvas = await asActor.query(api.areasV2.getCanvas, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
    });
    expect(childCanvas.pages).toEqual([
      expect.objectContaining({ _id: child.pageId }),
    ]);
    expect(childCanvas.ghosts).toHaveLength(1);
    expect(`${childCanvas.pages[0].x}:${childCanvas.pages[0].y}`).not.toBe(
      `${childCanvas.ghosts[0].x}:${childCanvas.ghosts[0].y}`,
    );

    await t.run(async (ctx) => {
      const placements = await Promise.all(
        [parent.pageId, sibling.pageId].map((pageId) =>
          ctx.db
            .query("pageCanvasPlacements")
            .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
            .unique(),
        ),
      );
      for (const placement of placements) {
        if (placement === null) throw new Error("Missing test placement.");
        await ctx.db.patch("pageCanvasPlacements", placement._id, {
          x: 0,
          y: 0,
        });
      }
    });
    const collisionBefore = await t.query(
      internal.areasV2Migrations.verifyAreasV2,
      { stage: "placement_rows", cursor: null, limit: 100 },
    );
    expect(collisionBefore.issueCount).toBe(1);

    const repaired = await t.mutation(
      internal.areasV2Migrations.backfillPlacements,
      { cursor: null, limit: 100 },
    );
    expect(repaired.changed).toBe(1);
    const collisionAfter = await t.query(
      internal.areasV2Migrations.verifyAreasV2,
      { stage: "placement_rows", cursor: null, limit: 100 },
    );
    expect(collisionAfter.issueCount).toBe(0);
    const idempotent = await t.mutation(
      internal.areasV2Migrations.backfillPlacements,
      { cursor: null, limit: 100 },
    );
    expect(idempotent.changed).toBe(0);
  });

  test("pending auto-layout uses source card and pending ghost dimensions", async () => {
    const { t, startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const parentWithObstacle = await asActor.mutation(
      api.areasV2.createPage,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        kind: "note",
        title: "Parent with obstacle",
      },
    );
    const obstacle = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parentWithObstacle.pageId,
      kind: "note",
      title: "Obstacle",
    });
    await asActor.mutation(api.areasV2.movePages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parentWithObstacle.pageId,
      updates: [{ pageId: obstacle.pageId, x: 352, y: 0 }],
    });
    const largeChild = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Large pending child",
    });
    await asMember.mutation(api.areasV2.resizePage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      pageId: largeChild.pageId,
      width: 520,
      height: 420,
    });
    const largeRequest = await asMember.mutation(
      api.areasV2.requestNesting,
      {
        startupId: startupA,
        childPageId: largeChild.pageId,
        targetParentPageId: parentWithObstacle.pageId,
      },
    );
    expect(largeRequest).toMatchObject({
      nestingStatus: "pending",
      requestId: expect.any(String),
    });
    let targetCanvas = await asActor.query(api.areasV2.getCanvas, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parentWithObstacle.pageId,
    });
    expect(
      targetCanvas.ghosts.find((ghost) => ghost.pageId === largeChild.pageId),
    ).toMatchObject({ x: 704, y: 0 });

    await asActor.mutation(api.areasV2.approveNesting, {
      startupId: startupA,
      requestId: largeRequest.requestId!,
    });
    const approvedPlacement = await t.run((ctx) =>
      ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", largeChild.pageId))
        .unique(),
    );
    expect(approvedPlacement).toMatchObject({
      rootPageId: parentWithObstacle.pageId,
      x: 704,
      y: 0,
      width: 520,
      height: 420,
    });

    const ghostParent = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Ghost size parent",
    });
    const largeGhost = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Large ghost",
    });
    await asMember.mutation(api.areasV2.resizePage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      pageId: largeGhost.pageId,
      width: 520,
      height: 420,
    });
    await asMember.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: largeGhost.pageId,
      targetParentPageId: ghostParent.pageId,
      x: 0,
      y: 0,
    });
    const smallGhost = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Small ghost",
    });
    await asMember.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: smallGhost.pageId,
      targetParentPageId: ghostParent.pageId,
    });
    targetCanvas = await asActor.query(api.areasV2.getCanvas, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: ghostParent.pageId,
    });
    expect(
      targetCanvas.ghosts.find((ghost) => ghost.pageId === smallGhost.pageId),
    ).toMatchObject({ x: 704, y: 0 });
  });

  test("collision repair uses the moved card dimensions", async () => {
    const { t, startupA, areaA1, asActor } =
      await seedAreasV2Workspace();
    const canonical = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Canonical placement",
    });
    const large = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Large collision",
    });
    await asActor.mutation(api.areasV2.resizePage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      pageId: large.pageId,
      width: 520,
      height: 420,
    });
    await t.run(async (ctx) => {
      for (const pageId of [canonical.pageId, large.pageId]) {
        const placement = await ctx.db
          .query("pageCanvasPlacements")
          .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
          .unique();
        if (placement === null) throw new Error("Missing placement.");
        await ctx.db.patch("pageCanvasPlacements", placement._id, {
          x: 352,
          y: 0,
        });
      }
    });
    await t.mutation(internal.areasV2Migrations.backfillPlacements, {
      cursor: null,
      limit: 100,
    });
    const repaired = await t.run((ctx) =>
      ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", large.pageId))
        .unique(),
    );
    expect(repaired).toMatchObject({
      x: 704,
      y: 0,
      width: 520,
      height: 420,
    });
  });

  test("archive promotion preserves card dimensions and projects its edge", async () => {
    const { t, startupA, areaA1, asActor } =
      await seedAreasV2Workspace();
    const obstacle = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Root obstacle",
    });
    const parent = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Archived parent",
    });
    await asActor.mutation(api.areasV2.movePages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      updates: [
        { pageId: obstacle.pageId, x: 352, y: 0 },
        { pageId: parent.pageId, x: 10_000, y: 0 },
      ],
    });
    const childA = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      kind: "note",
      title: "Large promoted child",
    });
    const childB = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      kind: "note",
      title: "Connected promoted child",
    });
    await asActor.mutation(api.areasV2.resizePage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      pageId: childA.pageId,
      width: 520,
      height: 420,
    });
    const edgeId = await asActor.mutation(api.areasV2.connectPages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: parent.pageId,
      sourcePageId: childA.pageId,
      targetPageId: childB.pageId,
    });
    await asActor.mutation(api.areasV2.archivePage, {
      startupId: startupA,
      pageId: parent.pageId,
    });
    const pairKey = [childA.pageId, childB.pageId].sort().join(":");
    const state = await t.run(async (ctx) => ({
      placement: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", childA.pageId))
        .unique(),
      edge: await ctx.db.get("pageCanvasEdgesV2", edgeId),
      legacyEdge: await ctx.db
        .query("pageEdges")
        .withIndex("by_areaId_and_pairKey", (q) =>
          q.eq("areaId", areaA1).eq("pairKey", pairKey),
        )
        .unique(),
    }));
    expect(state.placement).toMatchObject({
      rootPageId: null,
      x: 704,
      y: 0,
      width: 520,
      height: 420,
    });
    expect(state.edge).toMatchObject({ rootPageId: null, archivedAt: null });
    expect(state.legacyEdge).toMatchObject({
      startupId: startupA,
      areaId: areaA1,
      pairKey,
      archivedAt: null,
    });
  });

  test("V2 writes keep the legacy rollback projection current", async () => {
    const { t, actor, startupA, areaA1, asActor } =
      await seedAreasV2Workspace();
    const pageA = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Rollback A",
    });
    const pageB = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Rollback B",
    });

    await asActor.mutation(api.areasV2.movePages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      updates: [{ pageId: pageA.pageId, x: 420, y: 260 }],
    });
    await asActor.mutation(api.areasV2.resizePage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      pageId: pageA.pageId,
      width: 510,
      height: 330,
    });
    await asActor.mutation(api.areasV2.saveViewport, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      x: 25,
      y: 35,
      zoom: 3,
    });
    const edgeId = await asActor.mutation(api.areasV2.connectPages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      sourcePageId: pageA.pageId,
      targetPageId: pageB.pageId,
      label: "Rollback veza",
    });
    const pairKey = [pageA.pageId, pageB.pageId].sort().join(":");

    const rollbackProjection = await t.run(async (ctx) => ({
      layout: await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", pageA.pageId))
        .unique(),
      viewports: await ctx.db
        .query("pageCanvases")
        .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
          q.eq("ownerProfileId", actor.profileId).eq("areaId", areaA1),
        )
        .collect(),
      edge: await ctx.db
        .query("pageEdges")
        .withIndex("by_areaId_and_pairKey", (q) =>
          q.eq("areaId", areaA1).eq("pairKey", pairKey),
        )
        .unique(),
    }));
    expect(rollbackProjection.layout).toMatchObject({
      x: 420,
      y: 260,
      width: 510,
      height: 330,
    });
    expect(rollbackProjection.viewports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "note",
          x: 25,
          y: 35,
          zoom: 1.6,
        }),
        expect.objectContaining({
          kind: "task",
          x: 25,
          y: 35,
          zoom: 1.6,
        }),
      ]),
    );
    expect(rollbackProjection.edge).toMatchObject({
      pairKey,
      label: "Rollback veza",
      authorProfileId: actor.profileId,
      archivedAt: null,
    });

    await asActor.mutation(api.areasV2.resetPageSize, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      pageId: pageA.pageId,
    });
    await asActor.mutation(api.areasV2.disconnectPages, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      edgeId,
    });
    const rollbackAfterReset = await t.run(async (ctx) => ({
      layout: await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", pageA.pageId))
        .unique(),
      edge: await ctx.db
        .query("pageEdges")
        .withIndex("by_areaId_and_pairKey", (q) =>
          q.eq("areaId", areaA1).eq("pairKey", pairKey),
        )
        .unique(),
    }));
    expect(rollbackAfterReset.layout).not.toHaveProperty("width");
    expect(rollbackAfterReset.layout).not.toHaveProperty("height");
    expect(rollbackAfterReset.edge?.archivedAt).toEqual(expect.any(Number));
  });

  test("successful cross-area move keeps all sidecars and rollback rows consistent", async () => {
    const {
      t,
      startupA,
      areaA1,
      areaA2,
      asActor,
      asMember,
    } = await seedAreasV2Workspace();
    const occupiedTarget = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "task",
      title: "Zauzeta ciljna pozicija",
    });
    const root = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Grana za premeštanje",
    });
    const sourcePeer = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Ostaje u izvoru",
    });
    const childA = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      kind: "note",
      title: "Dete A",
    });
    const childB = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      kind: "note",
      title: "Dete B",
    });
    const sourceEdgeId = await asActor.mutation(
      api.areasV2.connectPages,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        sourcePageId: root.pageId,
        targetPageId: sourcePeer.pageId,
      },
    );
    const nestedEdgeId = await asActor.mutation(
      api.areasV2.connectPages,
      {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: root.pageId,
        sourcePageId: childA.pageId,
        targetPageId: childB.pageId,
      },
    );
    await asActor.mutation(api.areasV2.saveViewport, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      x: 33,
      y: 44,
      zoom: 1.1,
    });
    const memberParent = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Tuđi roditelj",
    });
    const outgoing = await asActor.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: root.pageId,
      targetParentPageId: memberParent.pageId,
    });
    const memberChild = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Tuđe dete",
    });
    const incoming = await asMember.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: memberChild.pageId,
      targetParentPageId: root.pageId,
    });
    expect(outgoing.nestingStatus).toBe("pending");
    expect(incoming.nestingStatus).toBe("pending");

    await asActor.mutation(api.areasV2.movePage, {
      startupId: startupA,
      pageId: root.pageId,
      targetAreaId: areaA2,
      targetParentPageId: null,
    });

    const stored = await t.run(async (ctx) => {
      const pageIds = [root.pageId, childA.pageId, childB.pageId];
      const [pages, placements, legacyNodes] = await Promise.all([
        Promise.all(pageIds.map((pageId) => ctx.db.get("pages", pageId))),
        Promise.all(
          pageIds.map((pageId) =>
            ctx.db
              .query("pageCanvasPlacements")
              .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
              .unique(),
          ),
        ),
        Promise.all(
          pageIds.map((pageId) =>
            ctx.db
              .query("pageCanvasNodes")
              .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
              .unique(),
          ),
        ),
      ]);
      const sourcePairKey = [root.pageId, sourcePeer.pageId]
        .sort()
        .join(":");
      const nestedPairKey = [childA.pageId, childB.pageId]
        .sort()
        .join(":");
      return {
        pages,
        placements,
        legacyNodes,
        occupiedPlacement: await ctx.db
          .query("pageCanvasPlacements")
          .withIndex("by_pageId", (q) =>
            q.eq("pageId", occupiedTarget.pageId),
          )
          .unique(),
        sourceEdge: await ctx.db.get("pageCanvasEdgesV2", sourceEdgeId),
        nestedEdge: await ctx.db.get("pageCanvasEdgesV2", nestedEdgeId),
        sourceLegacy: await ctx.db
          .query("pageEdges")
          .withIndex("by_areaId_and_pairKey", (q) =>
            q.eq("areaId", areaA1).eq("pairKey", sourcePairKey),
          )
          .first(),
        nestedLegacy: await ctx.db
          .query("pageEdges")
          .withIndex("by_areaId_and_pairKey", (q) =>
            q.eq("areaId", areaA2).eq("pairKey", nestedPairKey),
          )
          .first(),
        viewport: await ctx.db
          .query("pageCanvasViewports")
          .withIndex("by_rootPageId", (q) =>
            q.eq("rootPageId", root.pageId),
          )
          .first(),
        outgoing: await ctx.db.get(
          "pageNestingRequests",
          outgoing.requestId!,
        ),
        incoming: await ctx.db.get(
          "pageNestingRequests",
          incoming.requestId!,
        ),
      };
    });
    expect(stored.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: root.pageId,
          areaId: areaA2,
          parentPageId: null,
        }),
        expect.objectContaining({
          _id: childA.pageId,
          areaId: areaA2,
          parentPageId: root.pageId,
        }),
        expect.objectContaining({
          _id: childB.pageId,
          areaId: areaA2,
          parentPageId: root.pageId,
        }),
      ]),
    );
    expect(stored.placements.every((row) => row?.areaId === areaA2)).toBe(
      true,
    );
    expect(stored.legacyNodes.every((row) => row?.areaId === areaA2)).toBe(
      true,
    );
    expect(
      `${stored.placements[0]?.x}:${stored.placements[0]?.y}`,
    ).not.toBe(
      `${stored.occupiedPlacement?.x}:${stored.occupiedPlacement?.y}`,
    );
    expect(stored.sourceEdge?.archivedAt).not.toBeNull();
    expect(stored.sourceLegacy?.archivedAt).not.toBeNull();
    expect(stored.nestedEdge).toMatchObject({
      areaId: areaA2,
      archivedAt: null,
    });
    expect(stored.nestedLegacy).toBeNull();
    expect(stored.viewport).toMatchObject({ areaId: areaA2 });
    expect(stored.outgoing).toMatchObject({ status: "cancelled" });
    expect(stored.incoming).toMatchObject({ status: "cancelled" });

    const verification = await Promise.all(
      (
        [
          "placements",
          "placement_rows",
          "edges",
          "viewports",
          "requests",
        ] as const
      ).map((stage) =>
        t.query(internal.areasV2Migrations.verifyAreasV2, {
          stage,
          cursor: null,
          limit: 50,
        }),
      ),
    );
    expect(verification.map((result) => result.issueCount)).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  test("mixed canvas i Note↔Task relacije nisu vezani za parent scope", async () => {
    const { member, startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const dueDate = Date.now() + 86_400_000;
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
      assigneeProfileId: member.profileId,
      dueDate,
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
        expect.objectContaining({
          _id: memberTask.pageId,
          kind: "task",
          dueDate,
          assignee: expect.objectContaining({
            _id: member.profileId,
            displayName: "Member",
          }),
        }),
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

  test("relacija spaja stranice iz različitih oblasti i vidi se sa obe strane", async () => {
    const { startupA, areaA1, areaA2, asActor, asMember } =
      await seedAreasV2Workspace();
    const actorNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Beleška u prvoj oblasti",
    });
    const memberTask = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "task",
      title: "Zadatak u drugoj oblasti",
    });
    const relationId = await asActor.mutation(api.areasV2.createRelation, {
      startupId: startupA,
      pageAId: actorNote.pageId,
      pageBId: memberTask.pageId,
    });
    await expect(
      asActor.mutation(api.areasV2.createRelation, {
        startupId: startupA,
        pageAId: memberTask.pageId,
        pageBId: actorNote.pageId,
      }),
    ).resolves.toBe(relationId);

    const [fromNote, fromTask] = await Promise.all([
      asActor.query(api.areasV2.listRelations, {
        startupId: startupA,
        pageId: actorNote.pageId,
      }),
      asMember.query(api.areasV2.listRelations, {
        startupId: startupA,
        pageId: memberTask.pageId,
      }),
    ]);
    expect(fromNote.relations).toEqual([
      expect.objectContaining({
        _id: relationId,
        linkedPage: expect.objectContaining({
          pageId: memberTask.pageId,
          areaId: areaA2,
        }),
      }),
    ]);
    expect(fromTask.relations).toEqual([
      expect.objectContaining({
        _id: relationId,
        linkedPage: expect.objectContaining({
          pageId: actorNote.pageId,
          areaId: areaA1,
        }),
      }),
    ]);

    const candidateNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "note",
      title: "Kandidat iz druge oblasti",
    });
    const listed = await asActor.query(api.areasV2.listRelations, {
      startupId: startupA,
      pageId: actorNote.pageId,
    });
    expect(listed.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: candidateNote.pageId,
          areaId: areaA2,
        }),
      ]),
    );

    const memberNote = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Članova beleška",
    });
    await expect(
      asActor.mutation(api.areasV2.createRelation, {
        startupId: startupA,
        pageAId: memberNote.pageId,
        pageBId: memberTask.pageId,
      }),
    ).rejects.toThrow("samo sa svojom stranicom");
  });

  test("relacija preživljava premeštanje jednog kraja u drugu oblast", async () => {
    const { t, startupA, areaA1, areaA2, asActor } =
      await seedAreasV2Workspace();
    const movingNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Seleća beleška",
    });
    const stayingTask = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Zadatak koji ostaje",
    });
    const relationId = await asActor.mutation(api.areasV2.createRelation, {
      startupId: startupA,
      pageAId: movingNote.pageId,
      pageBId: stayingTask.pageId,
    });
    const result = await asActor.mutation(api.areasV2.movePage, {
      startupId: startupA,
      pageId: movingNote.pageId,
      targetAreaId: areaA2,
      targetParentPageId: null,
    });
    expect(result.nestingStatus).toBe("none");
    const relation = await t.run(async (ctx) =>
      ctx.db.get("pageRelations", relationId),
    );
    expect(relation?.archivedAt).toBeNull();
    expect(relation?.areaId).toBe(areaA1);
    const [fromMoved, fromStaying] = await Promise.all([
      asActor.query(api.areasV2.listRelations, {
        startupId: startupA,
        pageId: movingNote.pageId,
      }),
      asActor.query(api.areasV2.listRelations, {
        startupId: startupA,
        pageId: stayingTask.pageId,
      }),
    ]);
    expect(fromMoved.relations).toEqual([
      expect.objectContaining({
        _id: relationId,
        linkedPage: expect.objectContaining({
          pageId: stayingTask.pageId,
          areaId: areaA1,
        }),
      }),
    ]);
    expect(fromStaying.relations).toEqual([
      expect.objectContaining({
        _id: relationId,
        linkedPage: expect.objectContaining({
          pageId: movingNote.pageId,
          areaId: areaA2,
        }),
      }),
    ]);
  });

  test("relacija se ponovo vezuje za ciljnu oblast kad se krajevi ponovo nađu zajedno", async () => {
    const { t, startupA, areaA1, areaA2, asActor } =
      await seedAreasV2Workspace();
    // Slučaj (a): cross-area relacija pa premeštanje kraja iz izvorne oblasti.
    const noteA1 = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Beleška koja se seli ka zadatku",
    });
    const taskA2 = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "task",
      title: "Zadatak koji čeka",
    });
    const crossRelationId = await asActor.mutation(api.areasV2.createRelation, {
      startupId: startupA,
      pageAId: noteA1.pageId,
      pageBId: taskA2.pageId,
    });
    await asActor.mutation(api.areasV2.movePage, {
      startupId: startupA,
      pageId: noteA1.pageId,
      targetAreaId: areaA2,
      targetParentPageId: null,
    });
    const crossRelation = await t.run(async (ctx) =>
      ctx.db.get("pageRelations", crossRelationId),
    );
    expect(crossRelation?.archivedAt).toBeNull();
    // Oba kraja su sada u areaA2, pa se i kanvas-scope reda seli tamo — bez
    // ovoga linija ne bi postojala ni na jednom kanvasu, a red bi zauvek
    // trošio limit oblasti u kojoj nema nijedan kraj.
    expect(crossRelation?.areaId).toBe(areaA2);

    // Slučaj (b): dva odvojena premeštanja iz iste oblasti.
    const firstNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Prvi putnik",
    });
    const secondNote = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Drugi putnik",
    });
    const pairRelationId = await asActor.mutation(api.areasV2.createRelation, {
      startupId: startupA,
      pageAId: firstNote.pageId,
      pageBId: secondNote.pageId,
    });
    await asActor.mutation(api.areasV2.movePage, {
      startupId: startupA,
      pageId: firstNote.pageId,
      targetAreaId: areaA2,
      targetParentPageId: null,
    });
    const midMove = await t.run(async (ctx) =>
      ctx.db.get("pageRelations", pairRelationId),
    );
    expect(midMove?.areaId).toBe(areaA1);
    await asActor.mutation(api.areasV2.movePage, {
      startupId: startupA,
      pageId: secondNote.pageId,
      targetAreaId: areaA2,
      targetParentPageId: null,
    });
    const reunited = await t.run(async (ctx) =>
      ctx.db.get("pageRelations", pairRelationId),
    );
    expect(reunited?.archivedAt).toBeNull();
    expect(reunited?.areaId).toBe(areaA2);
  });

  test("relacija čija se oba kraja sele menja kanvas-scope na ciljnu oblast", async () => {
    const { t, startupA, areaA1, areaA2, asActor } =
      await seedAreasV2Workspace();
    const root = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Koren grane",
    });
    const child = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      kind: "task",
      title: "Dete grane",
    });
    const relationId = await asActor.mutation(api.areasV2.createRelation, {
      startupId: startupA,
      pageAId: root.pageId,
      pageBId: child.pageId,
    });
    await asActor.mutation(api.areasV2.movePage, {
      startupId: startupA,
      pageId: root.pageId,
      targetAreaId: areaA2,
      targetParentPageId: null,
    });
    const relation = await t.run(async (ctx) =>
      ctx.db.get("pageRelations", relationId),
    );
    expect(relation?.archivedAt).toBeNull();
    expect(relation?.areaId).toBe(areaA2);
  });

  test("limit relacija se meri po oblasti u kojoj red nastaje", async () => {
    const { t, actor, startupA, areaA1, areaA2, asActor } =
      await seedAreasV2Workspace();
    const noteInFull = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Beleška u punoj oblasti",
    });
    const taskInFull = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Zadatak u punoj oblasti",
    });
    const noteElsewhere = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "note",
      title: "Beleška u slobodnoj oblasti",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 400; index += 1) {
        await ctx.db.insert("pageRelations", {
          startupId: startupA,
          areaId: areaA1,
          notePageId: noteInFull.pageId,
          taskPageId: taskInFull.pageId,
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
      asActor.mutation(api.areasV2.createRelation, {
        startupId: startupA,
        pageAId: noteInFull.pageId,
        pageBId: noteElsewhere.pageId,
      }),
    ).rejects.toThrow("najviše 400 relacija");
    await expect(
      asActor.mutation(api.areasV2.createRelation, {
        startupId: startupA,
        pageAId: noteElsewhere.pageId,
        pageBId: taskInFull.pageId,
      }),
    ).resolves.toBeDefined();
  });

  test("članovi dodaju potpisani kontekst u briefing oblasti", async () => {
    const {
      member,
      startupA,
      areaA1,
      asActor,
      asMember,
      asOutsider,
    } = await seedAreasV2Workspace();
    const contributionId = await asMember.mutation(
      api.collaboration.addContribution,
      {
        target: { kind: "area", id: areaA1 },
        content: "Članov kontekst za ovu oblast.",
      },
    );

    const [ownerView, memberView] = await Promise.all([
      asActor.query(api.collaboration.listContributions, {
        target: { kind: "area", id: areaA1 },
      }),
      asMember.query(api.collaboration.listContributions, {
        target: { kind: "area", id: areaA1 },
      }),
    ]);
    expect(ownerView).toEqual([
      expect.objectContaining({
        _id: contributionId,
        targetKind: "area",
        startupId: startupA,
        content: "Članov kontekst za ovu oblast.",
        author: expect.objectContaining({
          _id: member.profileId,
          displayName: "Member",
        }),
        canEdit: false,
      }),
    ]);
    expect(memberView[0]).toMatchObject({
      _id: contributionId,
      canEdit: true,
      canDeleteDirectly: true,
    });
    await expect(
      asOutsider.query(api.collaboration.listContributions, {
        target: { kind: "area", id: areaA1 },
      }),
    ).rejects.toThrow("Nemate pristup");
    await expect(
      asActor.mutation(api.collaboration.updateContribution, {
        contributionId,
        content: "Tuđa izmena",
      }),
    ).rejects.toThrow("samo svoj tekst");
    await expect(
      asMember.mutation(api.collaboration.updateContribution, {
        contributionId,
        content: "Ažuriran članov kontekst.",
      }),
    ).resolves.toBe(contributionId);
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
    // Vezuje se sve sa svim: beleška i zadatak na istom kanvasu smeju
    // direktnu vezu, ne samo relaciju.
    await expect(
      asActor.mutation(api.areasV2.connectPages, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        sourcePageId: note.pageId,
        targetPageId: oppositeTask.pageId,
      }),
    ).resolves.toEqual(expect.any(String));

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
    const archived = await t.run(async (ctx) => {
      const edge = await ctx.db.get("pageCanvasEdgesV2", edgeId);
      return {
        edge,
        legacyEdge:
          edge === null
            ? null
            : await ctx.db
                .query("pageEdges")
                .withIndex("by_areaId_and_pairKey", (q) =>
                  q.eq("areaId", areaA1).eq("pairKey", edge.pairKey),
                )
                .unique(),
        relation: await ctx.db.get("pageRelations", relationId),
      };
    });
    expect(archived.edge?.archivedAt).not.toBeNull();
    expect(archived.legacyEdge?.archivedAt).not.toBeNull();
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

    const [childOwnerView, parentOwnerView] = await Promise.all([
      asActor.query(api.pages.get, { pageId: child.pageId }),
      asMember.query(api.pages.get, { pageId: child.pageId }),
    ]);
    expect(childOwnerView?.permissions.canDetach).toBe(true);
    expect(parentOwnerView?.permissions.canDetach).toBe(true);
    const [childOwnerCanvas, parentOwnerCanvas] = await Promise.all([
      asActor.query(api.areasV2.getCanvas, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: foreignParent.pageId,
      }),
      asMember.query(api.areasV2.getCanvas, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: foreignParent.pageId,
      }),
    ]);
    expect(
      childOwnerCanvas.pages.find((page) => page._id === child.pageId)
        ?.canDetach,
    ).toBe(true);
    expect(
      parentOwnerCanvas.pages.find((page) => page._id === child.pageId)
        ?.canDetach,
    ).toBe(true);

    await asMember.mutation(api.areasV2.detachPage, {
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

      // Relacija sa `pairKey`-em koji ne odgovara svojim endpointima —
      // invarijanta koja važi i posle generalizacije na sve vrste.
      await ctx.db.insert("pageRelations", {
        startupId: startupA,
        areaId: areaA1,
        notePageId: root.pageId,
        taskPageId: nested.pageId,
        pageAId: root.pageId,
        pageBId: nested.pageId,
        pairKey: `${edgePair}:pokvaren`,
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

  test("verifier otkriva cikluse, nevažeći pending target i oštećen viewport", async () => {
    const { t, actor, startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const cycleRoot = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Ciklus A",
    });
    const cycleChild = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: cycleRoot.pageId,
      kind: "note",
      title: "Ciklus B",
    });
    const requestChild = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "task",
      title: "Pending dete",
    });
    const requestParent = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Pending roditelj",
    });
    const request = await asActor.mutation(api.areasV2.requestNesting, {
      startupId: startupA,
      childPageId: requestChild.pageId,
      targetParentPageId: requestParent.pageId,
    });
    expect(request.nestingStatus).toBe("pending");
    await asActor.mutation(api.areasV2.saveViewport, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      x: 10,
      y: 20,
      zoom: 1,
    });

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch("pages", cycleRoot.pageId, {
        parentPageId: cycleChild.pageId,
      });
      await ctx.db.patch("pages", requestParent.pageId, {
        parentPageId: requestChild.pageId,
      });
      await ctx.db.insert("pageCanvasViewports", {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        viewerProfileId: actor.profileId,
        x: 100_001,
        y: 20,
        zoom: 1,
        createdAt: now,
        updatedAt: now,
      });
    });

    const [pages, requests, viewports] = await Promise.all([
      t.query(internal.areasV2Migrations.verifyAreasV2, {
        stage: "pages",
        cursor: null,
        limit: 100,
      }),
      t.query(internal.areasV2Migrations.verifyAreasV2, {
        stage: "requests",
        cursor: null,
        limit: 100,
      }),
      t.query(internal.areasV2Migrations.verifyAreasV2, {
        stage: "viewports",
        cursor: null,
        limit: 100,
      }),
    ]);
    expect(pages.issueCount).toBe(2);
    expect(requests.issueCount).toBe(1);
    expect(viewports.issueCount).toBe(2);
  });

  test("request verifier detects cycles composed only of active pending targets", async () => {
    const { t, actor, member, startupA, areaA1, asActor, asMember } =
      await seedAreasV2Workspace();
    const pageA = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Pending cycle A",
    });
    const pageB = await asMember.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Pending cycle B",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("pageNestingRequests", {
        startupId: startupA,
        areaId: areaA1,
        childPageId: pageA.pageId,
        sourceParentPageId: null,
        targetParentPageId: pageB.pageId,
        requesterProfileId: actor.profileId,
        parentAuthorProfileId: member.profileId,
        expectedTreeRevision: 0,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      });
      await ctx.db.insert("pageNestingRequests", {
        startupId: startupA,
        areaId: areaA1,
        childPageId: pageB.pageId,
        sourceParentPageId: null,
        targetParentPageId: pageA.pageId,
        requesterProfileId: member.profileId,
        parentAuthorProfileId: actor.profileId,
        expectedTreeRevision: 0,
        status: "pending",
        createdAt: now + 1,
        updatedAt: now + 1,
        resolvedAt: null,
      });
    });

    const result = await t.query(
      internal.areasV2Migrations.verifyAreasV2,
      { stage: "requests", cursor: null, limit: 100 },
    );
    expect(result.scanned).toBe(2);
    expect(result.issueCount).toBe(2);
    expect(result.issueSamples).toHaveLength(2);
  });

  test("centered resize atomically stores position and dimensions", async () => {
    const { t, startupA, areaA1, asActor } =
      await seedAreasV2Workspace();
    const page = await asActor.mutation(api.areasV2.createPage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Radial resize",
    });

    await asActor.mutation(api.areasV2.resizePage, {
      startupId: startupA,
      areaId: areaA1,
      rootPageId: null,
      pageId: page.pageId,
      x: -147,
      y: 83,
      width: 480,
      height: 336,
    });
    const placement = await t.run((ctx) =>
      ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", page.pageId))
        .unique(),
    );
    expect(placement).toMatchObject({
      x: -147,
      y: 83,
      width: 480,
      height: 336,
    });
    expect(
      (
        await asActor.query(api.areasV2.getCanvas, {
          startupId: startupA,
          areaId: areaA1,
          rootPageId: null,
        })
      ).pages.find((candidate) => candidate._id === page.pageId),
    ).toMatchObject({
      x: -147,
      y: 83,
      width: 480,
      height: 336,
    });
    await expect(
      asActor.mutation(api.areasV2.resizePage, {
        startupId: startupA,
        areaId: areaA1,
        rootPageId: null,
        pageId: page.pageId,
        x: 0,
        width: 360,
        height: 252,
      }),
    ).rejects.toThrow("i x i y");
  });
});
