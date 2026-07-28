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
    expect(rows[0].placement).toEqual({ x: 321, y: -123 });
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
});
