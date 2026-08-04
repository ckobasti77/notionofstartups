/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedCheckpointWorkspace() {
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
    const assignee = await createPerson("Assignee");
    const member = await createPerson("Member");
    const startupId = await ctx.db.insert("startups", {
      name: "Checkpoint startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, assignee, member]) {
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
      key: "checkpoint-area",
      label: "Checkpoint area",
      position: 0,
      createdAt: now,
    });
    return { owner, assignee, member, startupId, areaId };
  });
  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|checkpoint-test` });
  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asAssignee: asPerson(seeded.assignee),
    asMember: asPerson(seeded.member),
  };
}

describe("task checkpoint entiteti", () => {
  test("checkpoint API odbija beleške i ostaje isključivo u task scope-u", async () => {
    const { startupId, areaId, asOwner } =
      await seedCheckpointWorkspace();
    const noteId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "note",
      title: "Nije zadatak",
    });
    await expect(
      asOwner.query(api.taskCheckpoints.listForTask, {
        taskPageId: noteId,
      }),
    ).rejects.toThrow("nije zadatak");
  });

  test("pet checkpointa je live, nezavisno od revision-a editora i uz uloge", async () => {
    const {
      t,
      startupId,
      areaId,
      assignee,
      asOwner,
      asAssignee,
      asMember,
    } = await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Lansiranje",
      assigneeProfileId: assignee.profileId,
      checkpoints: Array.from({ length: 5 }, (_, index) => ({
        id: `cp-${index + 1}`,
        text: `Korak ${index + 1}`,
        completed: false,
      })),
    });

    let rows = await asMember.query(api.taskCheckpoints.listForTask, {
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => !row.completed)).toBe(true);
    expect(rows.map((row) => row.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0]).toMatchObject({
      text: "Korak 1",
      canEdit: false,
      canToggle: false,
      canRequestDeletion: true,
    });

    await expect(
      asMember.mutation(api.taskCheckpoints.setCompleted, {
        checkpointId: rows[0]._id,
        completed: true,
      }),
    ).rejects.toThrow("autor ili osoba kojoj je zadatak dodeljen");
    await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId: rows[0]._id,
      completed: true,
    });
    await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId: rows[0]._id,
      completed: true,
    });

    const pageAfterToggle = await t.run((ctx) =>
      ctx.db.get("pages", taskId),
    );
    expect(pageAfterToggle).toMatchObject({
      revision: 0,
      checkpointTotal: 5,
      checkpointCompleted: 1,
      checkpointRevision: 2,
    });
    const parentCanvas = await asOwner.query(api.areasV2.getCanvas, {
      startupId,
      areaId,
      rootPageId: null,
    });
    expect(
      parentCanvas.pages.find((page) => page._id === taskId),
    ).toMatchObject({
      checkpointTotal: 5,
      checkpointCompleted: 1,
    });

    await expect(
      asAssignee.mutation(api.taskCheckpoints.updateText, {
        checkpointId: rows[0]._id,
        text: "Tuđa izmena",
      }),
    ).rejects.toThrow("samo autor");
    await asOwner.mutation(api.taskCheckpoints.updateText, {
      checkpointId: rows[0]._id,
      text: "Potvrdi finalni plan",
    });
    await asMember.mutation(api.collaboration.addContribution, {
      target: { kind: "task_checkpoint", id: rows[0]._id },
      content: "Dodao sam proveru pristupačnosti.",
    });
    expect(
      await asOwner.query(api.collaboration.listContributions, {
        target: { kind: "task_checkpoint", id: rows[0]._id },
      }),
    ).toEqual([
      expect.objectContaining({
        content: "Dodao sam proveru pristupačnosti.",
      }),
    ]);

    await asOwner.mutation(api.taskCheckpoints.saveCanvasPlacement, {
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
      x: 321,
      y: -123,
    });
    rows = await asOwner.query(api.taskCheckpoints.listForTask, {
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows[0].placement).toEqual({
      x: 321,
      y: -123,
      width: null,
      height: null,
    });

    await asOwner.mutation(api.taskCheckpoints.saveCanvasPlacement, {
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
      x: 321,
      y: -123,
      width: 360,
      height: 240,
    });
    await asOwner.mutation(api.taskCheckpoints.saveCanvasPlacement, {
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
      x: 400,
      y: 75,
    });
    rows = await asOwner.query(api.taskCheckpoints.listForTask, {
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows[0].placement).toEqual({
      x: 400,
      y: 75,
      width: 360,
      height: 240,
    });
    await expect(
      asAssignee.mutation(api.taskCheckpoints.resetCanvasSize, {
        checkpointId: rows[0]._id,
        canvasRootPageId: null,
      }),
    ).rejects.toThrow("samo autor");
    await asOwner.mutation(api.taskCheckpoints.resetCanvasSize, {
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
    });
    rows = await asOwner.query(api.taskCheckpoints.listForTask, {
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows[0].placement).toEqual({
      x: 400,
      y: 75,
      width: null,
      height: null,
    });
    const persisted = await t.run(async (ctx) => {
      const checkpoint = await ctx.db.get("taskCheckpoints", rows[0]._id);
      const placements = await ctx.db
        .query("taskCheckpointCanvasPlacements")
        .withIndex("by_checkpointId_and_canvasRootPageId", (q) =>
          q
            .eq("checkpointId", rows[0]._id)
            .eq("canvasRootPageId", null),
        )
        .collect();
      return { checkpoint, placements };
    });
    expect(persisted.checkpoint).not.toBeNull();
    expect(persisted.placements).toHaveLength(1);
  });

  test("aktivni checkpointi imaju determinističan hronološki red i izvedene brojeve", async () => {
    const { t, startupId, areaId, owner, asOwner } =
      await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Hronologija",
      checkpoints: [],
    });
    const baseTime = Date.now() - 10_000;
    await t.run(async (ctx) => {
      for (const checkpoint of [
        { legacyId: "same-2", text: "Treći po poziciji", position: 2 },
        { legacyId: "same-0", text: "Prvi po poziciji", position: 0 },
        { legacyId: "same-1", text: "Drugi po poziciji", position: 1 },
      ]) {
        await ctx.db.insert("taskCheckpoints", {
          startupId,
          areaId,
          taskPageId: taskId,
          legacyId: checkpoint.legacyId,
          text: checkpoint.text,
          completed: false,
          position: checkpoint.position,
          createdByProfileId: owner.profileId,
          archivedAt: null,
          createdAt: baseTime,
          updatedAt: baseTime,
        });
      }
      await ctx.db.insert("taskCheckpoints", {
        startupId,
        areaId,
        taskPageId: taskId,
        legacyId: "older",
        text: "Najstariji",
        completed: false,
        position: 99,
        createdByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: baseTime - 1,
        updatedAt: baseTime,
      });
    });

    const rows = await asOwner.query(api.taskCheckpoints.listForTask, {
      taskPageId: taskId,
    });
    expect(rows.map((row) => row.text)).toEqual([
      "Najstariji",
      "Prvi po poziciji",
      "Drugi po poziciji",
      "Treći po poziciji",
    ]);
    expect(rows.map((row) => row.ordinal)).toEqual([1, 2, 3, 4]);
  });

  test("arhiviranje ima Undo, član traži brisanje, a limit ostaje 100", async () => {
    const { startupId, areaId, asOwner, asMember } =
      await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Arhiviranje",
      checkpoints: Array.from({ length: 100 }, (_, index) => ({
        id: `cp-${index}`,
        text: `Korak ${index}`,
        completed: false,
      })),
    });
    let rows = await asOwner.query(api.taskCheckpoints.listForTask, {
      taskPageId: taskId,
    });
    const oldestCheckpointId = rows[0]._id;
    await expect(
      asOwner.mutation(api.taskCheckpoints.create, {
        taskPageId: taskId,
        text: "Višak",
      }),
    ).rejects.toThrow("najviše 100");

    await asMember.mutation(api.collaboration.requestDeletion, {
      target: { kind: "task_checkpoint", id: rows[0]._id },
    });
    await asOwner.mutation(api.taskCheckpoints.archiveOwn, {
      checkpointId: rows[0]._id,
    });
    expect(
      await asOwner.query(api.taskCheckpoints.listForTask, {
        taskPageId: taskId,
      }),
    ).toHaveLength(99);
    await asOwner.mutation(api.taskCheckpoints.restoreOwn, {
      checkpointId: rows[0]._id,
    });
    rows = await asOwner.query(api.taskCheckpoints.listForTask, {
      taskPageId: taskId,
    });
    expect(rows).toHaveLength(100);
    expect(rows.map((row) => row.ordinal)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    expect(rows[0]._id).toBe(oldestCheckpointId);
  });

  test("legacy backfill je idempotentan i verifikacija ne nalazi propuste", async () => {
    const { t, startupId, areaId, asOwner } =
      await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Legacy task",
      checkpoints: [
        { id: "legacy-a", text: "Prvi", completed: true },
        { id: "legacy-b", text: "Drugi", completed: false },
      ],
    });
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("taskCheckpoints")
        .withIndex(
          "by_taskPageId_and_archivedAt_and_position",
          (q) => q.eq("taskPageId", taskId).eq("archivedAt", null),
        )
        .collect();
      for (const row of rows) {
        await ctx.db.delete("taskCheckpoints", row._id);
      }
    });

    const migrationArgs = {
      cursor: null,
      batchSize: 5,
      oneBatchOnly: true,
    };
    await t.mutation(
      internal.migrations.backfillTaskCheckpoints,
      migrationArgs,
    );
    await t.mutation(
      internal.migrations.backfillTaskCheckpoints,
      migrationArgs,
    );
    const storedRows = await t.run((ctx) =>
      ctx.db
        .query("taskCheckpoints")
        .withIndex(
          "by_taskPageId_and_archivedAt_and_position",
          (q) => q.eq("taskPageId", taskId).eq("archivedAt", null),
        )
        .collect(),
    );
    expect(storedRows).toHaveLength(2);
    expect(storedRows.map((row) => row.legacyId)).toEqual([
      "legacy-a",
      "legacy-b",
    ]);
    expect(
      await t.query(internal.migrations.verifyTaskCheckpointBackfill, {}),
    ).toMatchObject({
      missingRows: 0,
      mismatchedCounts: 0,
      complete: true,
    });
  });

  test("checkpoint veze pokrivaju checkpoint, task i note uz dozvole, approval i soft unlink", async () => {
    const {
      t,
      startupId,
      areaId,
      asOwner,
      asAssignee,
      asMember,
    } = await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Izvorni zadatak",
      checkpoints: [
        { id: "source-a", text: "Prvi checkpoint", completed: false },
        { id: "source-b", text: "Drugi checkpoint", completed: false },
      ],
    });
    const targetTaskId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Ciljni zadatak",
      checkpoints: [],
    });
    const noteId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "note",
      title: "Ciljna beleška",
    });
    const checkpoints = await asOwner.query(
      api.taskCheckpoints.listForTask,
      {
        taskPageId: taskId,
        canvasRootPageId: null,
      },
    );
    const [checkpointA, checkpointB] = checkpoints;
    const checkpointEndpointA = {
      kind: "task_checkpoint" as const,
      id: checkpointA._id,
    };
    const checkpointEndpointB = {
      kind: "task_checkpoint" as const,
      id: checkpointB._id,
    };
    const taskEndpoint = {
      kind: "page" as const,
      id: targetTaskId,
    };
    const noteEndpoint = {
      kind: "page" as const,
      id: noteId,
    };
    const scope = { startupId, areaId, rootPageId: null };

    await expect(
      asMember.mutation(api.taskCheckpointCanvasEdges.connect, {
        ...scope,
        source: checkpointEndpointA,
        target: noteEndpoint,
      }),
    ).rejects.toThrow("svojoj stavci");

    const checkpointPairId = await asOwner.mutation(
      api.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointA,
        target: checkpointEndpointB,
      },
    );
    expect(
      await asOwner.mutation(api.taskCheckpointCanvasEdges.connect, {
        ...scope,
        source: checkpointEndpointB,
        target: checkpointEndpointA,
      }),
    ).toBe(checkpointPairId);
    const checkpointTaskId = await asOwner.mutation(
      api.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointA,
        target: taskEndpoint,
      },
    );
    const checkpointNoteId = await asOwner.mutation(
      api.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointB,
        target: noteEndpoint,
      },
    );

    const canvas = await asOwner.query(api.areasV2.getCanvas, scope);
    expect(canvas.checkpointEdges).toHaveLength(3);
    expect(
      canvas.checkpointEdges.map((edge) => edge._id),
    ).toEqual(
      expect.arrayContaining([
        checkpointPairId,
        checkpointTaskId,
        checkpointNoteId,
      ]),
    );

    await expect(
      asMember.mutation(api.taskCheckpointCanvasEdges.disconnect, {
        ...scope,
        edgeId: checkpointTaskId,
      }),
    ).rejects.toThrow("samo vezu koju ste napravili");
    await asOwner.mutation(api.taskCheckpointCanvasEdges.disconnect, {
      ...scope,
      edgeId: checkpointTaskId,
    });
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", checkpointTaskId),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: expect.any(Number) }));

    const requestId = await asMember.mutation(
      api.collaboration.requestDeletion,
      {
        target: {
          kind: "task_checkpoint_edge",
          id: checkpointNoteId,
        },
      },
    );
    await asAssignee.mutation(api.collaboration.voteOnDeletion, {
      requestId,
      vote: "approve",
    });
    await asOwner.mutation(api.collaboration.voteOnDeletion, {
      requestId,
      vote: "approve",
    });
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", checkpointNoteId),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: expect.any(Number) }));

    await asOwner.mutation(api.taskCheckpoints.archiveOwn, {
      checkpointId: checkpointA._id,
    });
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", checkpointPairId),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: expect.any(Number) }));

    const edgeToArchivedPage = await asOwner.mutation(
      api.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointB,
        target: noteEndpoint,
      },
    );
    await asOwner.mutation(api.pages.archive, { pageId: noteId });
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", edgeToArchivedPage),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: expect.any(Number) }));
  });
});

describe("lanac checkpointa", () => {
  async function seedChainedTask(checkpointCount = 3) {
    const context = await seedCheckpointWorkspace();
    const taskId = await context.asOwner.mutation(api.pages.create, {
      startupId: context.startupId,
      areaId: context.areaId,
      parentPageId: null,
      kind: "task",
      title: "Sekvencijalni zadatak",
      assigneeProfileId: context.assignee.profileId,
      checkpoints: Array.from({ length: checkpointCount }, (_, index) => ({
        id: `cp-${index + 1}`,
        text: `Korak ${index + 1}`,
        completed: false,
      })),
    });
    const list = () =>
      context.asOwner.query(api.taskCheckpoints.listForTask, {
        taskPageId: taskId,
      });
    return { ...context, taskId, list };
  }

  test("nevezani koraci se štikliraju bilo kojim redom", async () => {
    const { asAssignee, list } = await seedChainedTask();
    const rows = await list();

    expect(rows.every((row) => !row.chainedToPrevious && !row.locked)).toBe(
      true,
    );
    await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId: rows[2]._id,
      completed: true,
    });
    expect((await list())[2].completed).toBe(true);
  });

  test("vezan korak je zaključan dok prethodni nije završen", async () => {
    const { taskId, asOwner, asAssignee, list } = await seedChainedTask();
    expect(
      await asOwner.mutation(api.taskCheckpoints.setAllChained, {
        taskPageId: taskId,
        chained: true,
      }),
    ).toBe(2);

    let rows = await list();
    expect(rows.map((row) => row.chainedToPrevious)).toEqual([
      false,
      true,
      true,
    ]);
    expect(rows.map((row) => row.locked)).toEqual([false, true, true]);
    expect(rows[1].blockedByOrdinal).toBe(1);

    await expect(
      asAssignee.mutation(api.taskCheckpoints.setCompleted, {
        checkpointId: rows[1]._id,
        completed: true,
      }),
    ).rejects.toThrow("Korak #2 je zaključan dok se ne završi korak #1.");

    await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId: rows[0]._id,
      completed: true,
    });
    rows = await list();
    expect(rows.map((row) => row.locked)).toEqual([false, false, true]);

    await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId: rows[1]._id,
      completed: true,
    });
    expect((await list()).map((row) => row.locked)).toEqual([
      false,
      false,
      false,
    ]);
  });

  test("završen prefiks se ne može razbiti otvaranjem ranijeg koraka", async () => {
    const { taskId, asOwner, asAssignee, list } = await seedChainedTask();
    await asOwner.mutation(api.taskCheckpoints.setAllChained, {
      taskPageId: taskId,
      chained: true,
    });
    const rows = await list();
    for (const row of rows.slice(0, 2)) {
      await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
        checkpointId: row._id,
        completed: true,
      });
    }

    await expect(
      asAssignee.mutation(api.taskCheckpoints.setCompleted, {
        checkpointId: rows[0]._id,
        completed: false,
      }),
    ).rejects.toThrow(
      "Korak #1 se ne može ponovo otvoriti dok je vezani korak #2 završen.",
    );

    await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId: rows[1]._id,
      completed: false,
    });
    await asAssignee.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId: rows[0]._id,
      completed: false,
    });
    expect((await list()).every((row) => !row.completed)).toBe(true);
  });

  test("razvezivanje jednog koraka otključava samo njega", async () => {
    const { taskId, asOwner, list } = await seedChainedTask();
    await asOwner.mutation(api.taskCheckpoints.setAllChained, {
      taskPageId: taskId,
      chained: true,
    });
    const rows = await list();

    await asOwner.mutation(api.taskCheckpoints.setChainedToPrevious, {
      checkpointId: rows[1]._id,
      chained: false,
    });
    expect((await list()).map((row) => row.locked)).toEqual([
      false,
      false,
      true,
    ]);
  });

  test("prvi korak ne može biti vezan i lanac menja samo autor", async () => {
    const { taskId, asOwner, asAssignee, list } = await seedChainedTask();
    const rows = await list();

    await expect(
      asOwner.mutation(api.taskCheckpoints.setChainedToPrevious, {
        checkpointId: rows[0]._id,
        chained: true,
      }),
    ).rejects.toThrow("Prvi korak nema prethodni korak");
    await expect(
      asAssignee.mutation(api.taskCheckpoints.setChainedToPrevious, {
        checkpointId: rows[1]._id,
        chained: true,
      }),
    ).rejects.toThrow("samo autor");
    await expect(
      asAssignee.mutation(api.taskCheckpoints.setAllChained, {
        taskPageId: taskId,
        chained: true,
      }),
    ).rejects.toThrow("samo autor");

    await asOwner.mutation(api.taskCheckpoints.setAllChained, {
      taskPageId: taskId,
      chained: true,
    });
    expect((await list())[0].chainedToPrevious).toBe(false);
  });

  test("novi korak nasleđuje lanac poslednjeg", async () => {
    const { taskId, asOwner, list } = await seedChainedTask(2);
    await asOwner.mutation(api.taskCheckpoints.setAllChained, {
      taskPageId: taskId,
      chained: true,
    });
    await asOwner.mutation(api.taskCheckpoints.create, {
      taskPageId: taskId,
      text: "Korak 3",
    });
    expect((await list()).map((row) => row.chainedToPrevious)).toEqual([
      false,
      true,
      true,
    ]);

    await asOwner.mutation(api.taskCheckpoints.setAllChained, {
      taskPageId: taskId,
      chained: false,
    });
    await asOwner.mutation(api.taskCheckpoints.create, {
      taskPageId: taskId,
      text: "Korak 4",
    });
    expect((await list()).map((row) => row.chainedToPrevious)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test("brisanje koraka prelinkuje lanac na preostale korake", async () => {
    const { taskId, asOwner, list } = await seedChainedTask();
    await asOwner.mutation(api.taskCheckpoints.setAllChained, {
      taskPageId: taskId,
      chained: true,
    });
    const rows = await list();

    // Prvi korak odlazi; drugi postaje prvi i time gubi katanac, iako mu je
    // zastavica i dalje uključena.
    await asOwner.mutation(api.taskCheckpoints.archiveOwn, {
      checkpointId: rows[0]._id,
    });
    const remaining = await list();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((row) => row.ordinal)).toEqual([1, 2]);
    expect(remaining.map((row) => row.chainedToPrevious)).toEqual([
      false,
      true,
    ]);
    expect(remaining.map((row) => row.locked)).toEqual([false, true]);
  });
});
