/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  MAX_TASK_CHECKPOINT_ID_LENGTH,
  MAX_TASK_CHECKPOINTS,
  MAX_TASK_DUE_DATE,
  MAX_TASK_INSTRUCTIONS_LENGTH,
  MAX_TASK_PAGE_SIZE,
} from "./lib/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedTaskWorkspace() {
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
    const outsider = await createPerson("Outsider");
    const startup = await ctx.db.insert("startups", {
      name: "Task startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const foreignStartup = await ctx.db.insert("startups", {
      name: "Foreign startup",
      description: "",
      createdByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const profileId of [owner.profileId, member.profileId]) {
      await ctx.db.insert("startupMembers", {
        startupId: startup,
        profileId,
        addedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    await ctx.db.insert("startupMembers", {
      startupId: foreignStartup,
      profileId: outsider.profileId,
      addedByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
    });
    const area = await ctx.db.insert("startupAreas", {
      startupId: startup,
      key: "task-area",
      label: "Task area",
      position: 0,
      createdAt: now,
    });
    const foreignArea = await ctx.db.insert("startupAreas", {
      startupId: foreignStartup,
      key: "foreign-area",
      label: "Foreign area",
      position: 0,
      createdAt: now,
    });
    return {
      owner,
      member,
      outsider,
      startup,
      foreignStartup,
      area,
      foreignArea,
    };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|test-session` });

  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asMember: asPerson(seeded.member),
    asOutsider: asPerson(seeded.outsider),
  };
}

describe("task metadata ugovori", () => {
  test("kreiranje normalizuje metadata i list upiti poštuju povratne ugovore", async () => {
    const { t, startup, area, member, asOwner, asMember } =
      await seedTaskWorkspace();
    const dueDate = Date.UTC(2030, 0, 2, 12);
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "  Priprema lansiranja  ",
      assigneeProfileId: member.profileId,
      dueDate,
      instructions: "  Pripremi plan.\nSačuvaj detalje.  ",
      checkpoints: [
        {
          id: "  cp-plan  ",
          text: "  Napiši plan  ",
          completed: false,
        },
      ],
    });

    const page = await asOwner.query(api.pages.get, { pageId: taskId });
    expect(page).toMatchObject({
      _id: taskId,
      title: "Priprema lansiranja",
      taskStatus: "backlog",
      taskPriority: "medium",
      assigneeProfileId: member.profileId,
      dueDate,
      instructions: "Pripremi plan.\nSačuvaj detalje.",
      checkpoints: [
        { id: "cp-plan", text: "Napiši plan", completed: false },
      ],
    });

    const v2State = await t.run(async (ctx) => {
      const storedPage = await ctx.db.get("pages", taskId);
      const placements = await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", taskId))
        .collect();
      return { storedPage, placements };
    });
    expect(v2State.storedPage).toMatchObject({
      treeRevision: 0,
      canvasPreview: "Pripremi plan.\nSačuvaj detalje.",
    });
    expect(v2State.placements).toEqual([
      expect.objectContaining({
        startupId: startup,
        areaId: area,
        rootPageId: null,
        pageId: taskId,
      }),
    ]);

    const startupTasks = await asOwner.query(api.tasks.listForStartup, {
      startupId: startup,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(startupTasks.page).toEqual([
      expect.objectContaining({
        _id: taskId,
        searchText: "",
        instructions: "Pripremi plan.\nSačuvaj detalje.",
      }),
    ]);

    const memberTasks = await asMember.query(api.tasks.listMine, {});
    expect(memberTasks).toEqual([
      expect.objectContaining({
        _id: taskId,
        startup: expect.objectContaining({ _id: startup }),
        area: expect.objectContaining({ _id: area }),
      }),
    ]);
  });

  test("kreator menja task metadata, a null vrednosti ih čiste", async () => {
    const {
      t,
      startup,
      area,
      member,
      outsider,
      asOwner,
      asMember,
    } = await seedTaskWorkspace();
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Autorski task",
    });
    const noteId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "note",
      title: "Beleška",
    });

    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        status: "done",
      }),
    ).rejects.toThrow("Status menja kreator zadatka ili osoba kojoj je dodeljen.");
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: noteId,
        status: "done",
      }),
    ).rejects.toThrow("nije task");
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        assigneeProfileId: outsider.profileId,
      }),
    ).rejects.toThrow("mora pripadati ovom startupu");

    const dueDate = Date.UTC(2031, 3, 5, 12);
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        status: "in_progress",
        priority: "urgent",
        assigneeProfileId: member.profileId,
        dueDate,
        instructions: "  Jasna instrukcija  ",
        checkpoints: [
          { id: "  cp-1 ", text: "  Prvi korak ", completed: true },
        ],
      }),
    ).resolves.toBe(taskId);

    let stored = await t.run((ctx) => ctx.db.get("pages", taskId));
    expect(stored).toMatchObject({
      taskStatus: "in_progress",
      taskPriority: "urgent",
      assigneeProfileId: member.profileId,
      dueDate,
      instructions: "Jasna instrukcija",
      checkpoints: [{ id: "cp-1", text: "Prvi korak", completed: true }],
      revision: 1,
      canvasPreview: "Jasna instrukcija",
    });

    await asOwner.mutation(api.tasks.updateMetadata, {
      pageId: taskId,
      assigneeProfileId: null,
      dueDate: null,
      instructions: null,
      checkpoints: null,
    });
    stored = await t.run((ctx) => ctx.db.get("pages", taskId));
    expect(stored).toMatchObject({
      assigneeProfileId: null,
      dueDate: null,
    });
    expect(stored?.instructions).toBeUndefined();
    expect(stored?.checkpoints).toEqual([]);
    expect(stored).toMatchObject({
      revision: 2,
      canvasPreview: "Autorski task",
      checkpointTotal: 0,
      checkpointCompleted: 0,
    });

    await asOwner.mutation(api.tasks.updateMetadata, {
      pageId: taskId,
      status: "in_progress",
      assigneeProfileId: null,
      dueDate: null,
      instructions: null,
      checkpoints: null,
    });
    const unchanged = await t.run((ctx) => ctx.db.get("pages", taskId));
    expect(unchanged?.revision).toBe(2);
  });

  test("granice instrukcija i checkpointa važe na kreiranju i izmeni", async () => {
    const { t, startup, area, asOwner } = await seedTaskWorkspace();
    const exactCheckpoints = Array.from(
      { length: MAX_TASK_CHECKPOINTS },
      (_, index) => ({
        id: `cp-${index}`,
        text: `Korak ${index}`,
        completed: false,
      }),
    );
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Granični task",
      instructions: "i".repeat(MAX_TASK_INSTRUCTIONS_LENGTH),
      checkpoints: exactCheckpoints,
    });
    const emptyInstructionsTaskId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Task bez instrukcije",
      instructions: "   ",
      checkpoints: [],
    });
    const emptyInstructionsTask = await t.run((ctx) =>
      ctx.db.get("pages", emptyInstructionsTaskId),
    );
    expect(emptyInstructionsTask?.instructions).toBeUndefined();
    expect(emptyInstructionsTask?.checkpoints).toEqual([]);

    await expect(
      asOwner.mutation(api.pages.create, {
        startupId: startup,
        areaId: area,
        parentPageId: null,
        kind: "task",
        title: "Preduga instrukcija",
        instructions: "i".repeat(MAX_TASK_INSTRUCTIONS_LENGTH + 1),
      }),
    ).rejects.toThrow("Instrukcije mogu imati najviše");
    await expect(
      asOwner.mutation(api.pages.create, {
        startupId: startup,
        areaId: area,
        parentPageId: null,
        kind: "task",
        title: "Previše checkpointa",
        checkpoints: [
          ...exactCheckpoints,
          { id: "previše", text: "Višak", completed: false },
        ],
      }),
    ).rejects.toThrow("najviše 100 checkpointa");

    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        checkpoints: [
          {
            id: "i".repeat(MAX_TASK_CHECKPOINT_ID_LENGTH),
            text: "t".repeat(10_000),
            completed: false,
          },
        ],
      }),
    ).resolves.toBe(taskId);

    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        instructions: "i".repeat(MAX_TASK_INSTRUCTIONS_LENGTH + 1),
      }),
    ).rejects.toThrow("Instrukcije mogu imati najviše");
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        checkpoints: [
          ...exactCheckpoints,
          { id: "previše", text: "Višak", completed: false },
        ],
      }),
    ).rejects.toThrow("najviše 100 checkpointa");
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        checkpoints: [
          {
            id: "i".repeat(MAX_TASK_CHECKPOINT_ID_LENGTH + 1),
            text: "Validan tekst",
            completed: false,
          },
        ],
      }),
    ).rejects.toThrow("ID checkpointa može imati najviše");
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        checkpoints: [
          { id: "isti", text: "Prvi", completed: false },
          { id: " isti ", text: "Drugi", completed: false },
        ],
      }),
    ).rejects.toThrow("moraju biti jedinstveni");
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        checkpoints: [{ id: "  ", text: "Tekst", completed: false }],
      }),
    ).rejects.toThrow("ID checkpointa je obavezno");
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        checkpoints: [{ id: "cp-empty", text: "  ", completed: false }],
      }),
    ).rejects.toThrow("Tekst checkpointa je obavezno");
  });

  test("rok i list filteri odbijaju nejasne ili prevelike argumente", async () => {
    const {
      startup,
      area,
      member,
      outsider,
      asOwner,
    } = await seedTaskWorkspace();
    const dueDate = Date.UTC(2032, 5, 10, 12);
    const taskId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Filtrirani task",
      taskStatus: "next",
      assigneeProfileId: member.profileId,
      dueDate,
    });

    const byDueDate = await asOwner.query(api.tasks.listForStartup, {
      startupId: startup,
      dueStart: dueDate - 1,
      dueEnd: dueDate + 1,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(byDueDate.page.map((page) => page._id)).toEqual([taskId]);
    const byStatus = await asOwner.query(api.tasks.listForStartup, {
      startupId: startup,
      status: "next",
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(byStatus.page.map((page) => page._id)).toEqual([taskId]);
    const byAssignee = await asOwner.query(api.tasks.listForStartup, {
      startupId: startup,
      assigneeProfileId: member.profileId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(byAssignee.page.map((page) => page._id)).toEqual([taskId]);

    await expect(
      asOwner.query(api.tasks.listForStartup, {
        startupId: startup,
        dueStart: dueDate - 1,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("početak i kraj");
    await expect(
      asOwner.query(api.tasks.listForStartup, {
        startupId: startup,
        dueStart: dueDate,
        dueEnd: dueDate,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("mora biti pre kraja");
    await expect(
      asOwner.query(api.tasks.listForStartup, {
        startupId: startup,
        dueStart: dueDate - 1,
        dueEnd: dueDate + 1,
        status: "next",
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("ne kombinuje");
    await expect(
      asOwner.query(api.tasks.listForStartup, {
        startupId: startup,
        assigneeProfileId: outsider.profileId,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("mora pripadati ovom startupu");
    await expect(
      asOwner.query(api.tasks.listForStartup, {
        startupId: startup,
        paginationOpts: { numItems: MAX_TASK_PAGE_SIZE + 1, cursor: null },
      }),
    ).rejects.toThrow("između 1 i 100");

    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId: taskId,
        dueDate: MAX_TASK_DUE_DATE,
      }),
    ).resolves.toBe(taskId);
    for (const invalidDueDate of [
      -1,
      1.5,
      MAX_TASK_DUE_DATE + 1,
      Number.NaN,
    ]) {
      await expect(
        asOwner.mutation(api.tasks.updateMetadata, {
          pageId: taskId,
          dueDate: invalidDueDate,
        }),
      ).rejects.toThrow("Rok nije ispravan");
    }
  });

  test("task metadata se ne mogu poslati belešci", async () => {
    const { startup, area, asOwner } = await seedTaskWorkspace();
    await expect(
      asOwner.mutation(api.pages.create, {
        startupId: startup,
        areaId: area,
        parentPageId: null,
        kind: "note",
        title: "Beleška sa task podacima",
        instructions: "",
      }),
    ).rejects.toThrow("samo task stranici");
  });
});

describe("komandni centar", () => {
  test("vraća sav otvoren posao startupa, bez završenog i arhiviranog", async () => {
    const { t, startup, foreignStartup, area, foreignArea, owner, asOwner, asOutsider } =
      await seedTaskWorkspace();

    const openStatuses = ["backlog", "next", "in_progress", "blocked"] as const;
    const openIds: Array<Id<"pages">> = [];
    for (const status of openStatuses) {
      const pageId = await asOwner.mutation(api.pages.create, {
        startupId: startup,
        areaId: area,
        parentPageId: null,
        kind: "task",
        title: `Otvoren ${status}`,
      });
      if (status !== "backlog") {
        await asOwner.mutation(api.tasks.updateMetadata, { pageId, status });
      }
      openIds.push(pageId);
    }

    const doneId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Završen",
    });
    await asOwner.mutation(api.tasks.updateMetadata, {
      pageId: doneId,
      status: "done",
    });

    const archivedId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Arhiviran",
    });
    await asOwner.mutation(api.areasV2.archivePage, {
      startupId: startup,
      pageId: archivedId,
    });

    await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "note",
      title: "Beleška nije zadatak",
    });

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("pages", {
        startupId: foreignStartup,
        areaId: foreignArea,
        parentPageId: null,
        kind: "task",
        title: "Tuđi zadatak",
        searchText: "",
        revision: 1,
        position: 0,
        taskStatus: "next",
        taskPriority: "medium",
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        createdByProfileId: owner.profileId,
        updatedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    const overview = await asOwner.query(api.tasks.commandCenter, {
      startupId: startup,
    });

    expect(overview.hasMore).toBe(false);
    expect(new Set(overview.tasks.map((task) => task._id))).toEqual(
      new Set(openIds),
    );
    for (const task of overview.tasks) {
      expect(task.kind).toBe("task");
      expect(task.searchText).toBe("");
    }

    await expect(
      asOutsider.query(api.tasks.commandCenter, { startupId: startup }),
    ).rejects.toThrow("Nemate pristup ovom startupu.");
  });
});

describe("dozvole za brze akcije", () => {
  async function seedAssignedTask() {
    const context = await seedTaskWorkspace();
    const pageId = await context.asOwner.mutation(api.pages.create, {
      startupId: context.startup,
      areaId: context.area,
      parentPageId: null,
      kind: "task",
      title: "Zadatak sa dodelom",
      assigneeProfileId: context.member.profileId,
    });
    return { ...context, pageId };
  }

  test("dodeljena osoba menja status, ali ne i ostale podatke", async () => {
    const { pageId, asMember } = await seedAssignedTask();

    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        status: "in_progress",
      }),
    ).resolves.toBe(pageId);

    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        priority: "urgent",
      }),
    ).rejects.toThrow("Prioritet menja samo kreator zadatka.");
    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        dueDate: Date.UTC(2032, 0, 5, 12),
      }),
    ).rejects.toThrow("Rok menja samo kreator zadatka.");
    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        instructions: "Menjam instrukcije",
      }),
    ).rejects.toThrow("Instrukcije menja samo kreator zadatka.");
    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        checkpoints: [{ id: "cp", text: "Korak", completed: false }],
      }),
    ).rejects.toThrow("Checkpointe menja samo kreator zadatka.");
  });

  test("dodeljen zadatak ne može preuzeti drugi član", async () => {
    const { pageId, owner, asOwner, asMember } = await seedAssignedTask();

    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        assigneeProfileId: owner.profileId,
      }),
    ).rejects.toThrow("dodelu menja njegov kreator");

    // Kreator i dalje sme sve.
    await expect(
      asOwner.mutation(api.tasks.updateMetadata, {
        pageId,
        assigneeProfileId: owner.profileId,
      }),
    ).resolves.toBe(pageId);
  });

  test("nedodeljen zadatak član preuzima na sebe i to ostaje u istoriji", async () => {
    const { t, startup, area, member, owner, asOwner, asMember } =
      await seedTaskWorkspace();
    const pageId = await asOwner.mutation(api.pages.create, {
      startupId: startup,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Nedodeljen zadatak",
    });

    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        assigneeProfileId: owner.profileId,
      }),
    ).rejects.toThrow("Zadatak možeš dodeliti samo sebi.");

    await expect(
      asMember.mutation(api.tasks.updateMetadata, {
        pageId,
        assigneeProfileId: member.profileId,
      }),
    ).resolves.toBe(pageId);

    const { assignee, detail } = await t.run(async (ctx) => {
      const page = await ctx.db.get("pages", pageId);
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_startupId_and_createdAt", (q) =>
          q.eq("startupId", startup),
        )
        .order("desc")
        .take(1);
      return {
        assignee: page?.assigneeProfileId ?? null,
        detail: activities[0]?.detail ?? null,
      };
    });

    expect(assignee).toBe(member.profileId);
    expect(detail).toBe("Preuzeo/la: Member");
  });
});
