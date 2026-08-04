/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_TASK_ASSIGNEES } from "./lib/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedAssigneeWorkspace(memberCount = 3) {
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
    const admin = await createPerson("Admin");
    await ctx.db.patch("profiles", admin.profileId, { role: "admin" });
    const members = [];
    for (let index = 0; index < memberCount; index += 1) {
      members.push(await createPerson(`Clan${index + 1}`));
    }
    const startupId = await ctx.db.insert("startups", {
      name: "Assignee startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, admin, ...members]) {
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
      key: "assignee-area",
      label: "Assignee area",
      position: 0,
      createdAt: now,
    });
    return { owner, admin, members, startupId, areaId };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|assignee-test` });
  const asOwner = asPerson(seeded.owner);
  const taskPageId = await asOwner.mutation(api.pages.create, {
    startupId: seeded.startupId,
    areaId: seeded.areaId,
    parentPageId: null,
    kind: "task",
    title: "Zajednički zadatak",
  });

  return {
    t,
    ...seeded,
    asPerson,
    asOwner,
    taskPageId,
    ids: () =>
      asOwner
        .query(api.taskAssignees.listForTask, { taskPageId })
        .then((rows) => rows.map((row) => row.profileId)),
  };
}

describe("spisak izvršilaca zadatka", () => {
  test("kreator postavlja spisak, projekcija prati prvog", async () => {
    const { t, taskPageId, members, asOwner, ids } =
      await seedAssigneeWorkspace();

    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });
    expect(await ids()).toEqual([members[0].profileId, members[1].profileId]);
    expect(
      (await t.run((ctx) => ctx.db.get("pages", taskPageId)))
        ?.assigneeProfileId,
    ).toBe(members[0].profileId);

    // Skidanje prvog pomera projekciju na sledećeg u redu.
    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[1].profileId],
    });
    expect(
      (await t.run((ctx) => ctx.db.get("pages", taskPageId)))
        ?.assigneeProfileId,
    ).toBe(members[1].profileId);

    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [],
    });
    expect(
      (await t.run((ctx) => ctx.db.get("pages", taskPageId)))
        ?.assigneeProfileId,
    ).toBeNull();
  });

  test("svaki član sam sebe dodaje i skida, tuđe učešće menja kreator", async () => {
    const { taskPageId, members, asPerson, asOwner, ids } =
      await seedAssigneeWorkspace();
    const asFirst = asPerson(members[0]);
    const asSecond = asPerson(members[1]);

    await asFirst.mutation(api.taskAssignees.join, { taskPageId });
    await asSecond.mutation(api.taskAssignees.join, { taskPageId });
    expect(await ids()).toEqual([members[0].profileId, members[1].profileId]);

    // Ponovno priključivanje ne pravi duplikat.
    await asFirst.mutation(api.taskAssignees.join, { taskPageId });
    expect(await ids()).toHaveLength(2);

    await expect(
      asFirst.mutation(api.taskAssignees.remove, {
        taskPageId,
        profileId: members[1].profileId,
      }),
    ).rejects.toThrow("uklanja autor zadatka");

    await asFirst.mutation(api.taskAssignees.leave, { taskPageId });
    expect(await ids()).toEqual([members[1].profileId]);

    await asOwner.mutation(api.taskAssignees.remove, {
      taskPageId,
      profileId: members[1].profileId,
    });
    expect(await ids()).toEqual([]);
  });

  test("spisak menja samo kreator i staje na gornjoj granici", async () => {
    const { taskPageId, members, asPerson } = await seedAssigneeWorkspace(
      MAX_TASK_ASSIGNEES + 1,
    );

    await expect(
      asPerson(members[0]).mutation(api.taskAssignees.setAssignees, {
        taskPageId,
        profileIds: [members[0].profileId],
      }),
    ).rejects.toThrow("samo autor zadatka");
  });

  test("preko granice izvršilaca mutacija pada", async () => {
    const { taskPageId, members, asOwner } = await seedAssigneeWorkspace(
      MAX_TASK_ASSIGNEES + 1,
    );

    await expect(
      asOwner.mutation(api.taskAssignees.setAssignees, {
        taskPageId,
        profileIds: members.map((member) => member.profileId),
      }),
    ).rejects.toThrow(`najviše ${MAX_TASK_ASSIGNEES} izvršilaca`);
  });

  test("svaki izvršilac menja status i štiklira checkpointe", async () => {
    const { taskPageId, members, asPerson, asOwner } =
      await seedAssigneeWorkspace();
    const asSecond = asPerson(members[1]);

    const checkpointId = await asOwner.mutation(api.taskCheckpoints.create, {
      taskPageId,
      text: "Prvi korak",
    });
    await expect(
      asSecond.mutation(api.taskCheckpoints.setCompleted, {
        checkpointId,
        completed: true,
      }),
    ).rejects.toThrow("autor ili osoba kojoj je zadatak dodeljen");

    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });

    await asSecond.mutation(api.taskCheckpoints.setCompleted, {
      checkpointId,
      completed: true,
    });
    await expect(
      asSecond.mutation(api.tasks.updateMetadata, {
        pageId: taskPageId,
        status: "in_progress",
      }),
    ).resolves.toBe(taskPageId);
  });

  test("„Moji zadaci” vide svi izvršioci, ne samo prvi", async () => {
    const { taskPageId, members, asPerson, asOwner } =
      await seedAssigneeWorkspace();

    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });

    for (const member of [members[0], members[1]]) {
      const mine = await asPerson(member).query(api.tasks.listMine, {});
      expect(mine.map((task) => task._id)).toContain(taskPageId);
    }
    expect(
      (await asPerson(members[2]).query(api.tasks.listMine, {})).map(
        (task) => task._id,
      ),
    ).not.toContain(taskPageId);
  });

  test("ogledala statusa i roka prate zadatak", async () => {
    const { t, taskPageId, members, asOwner, asPerson } =
      await seedAssigneeWorkspace();
    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });
    await asOwner.mutation(api.tasks.updateMetadata, {
      pageId: taskPageId,
      status: "in_progress",
      dueDate: 1_900_000_000_000,
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("taskAssignees")
        .withIndex("by_task_active_created", (q) =>
          q.eq("taskPageId", taskPageId).eq("archivedAt", null),
        )
        .collect(),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.taskStatus).toBe("in_progress");
      expect(row.taskSortAt).toBe(1_900_000_000_000);
    }

    // Filtriranje po statusu čita ista ogledala.
    const filtered = await asPerson(members[1]).query(api.tasks.listMine, {
      status: "in_progress",
    });
    expect(filtered.map((task) => task._id)).toContain(taskPageId);
  });

  test("uklanjanje člana iz startupa ga skida sa zadatka bez rušenja ostalih", async () => {
    const { taskPageId, members, admin, asOwner, asPerson, startupId, ids } =
      await seedAssigneeWorkspace();
    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });

    await asPerson(admin).mutation(api.startups.removeMember, {
      startupId,
      profileId: members[0].profileId,
    });

    expect(await ids()).toEqual([members[1].profileId]);
  });

  test("arhiviranje profila ga skida sa svih zadataka", async () => {
    const { taskPageId, members, admin, asOwner, asPerson, ids } =
      await seedAssigneeWorkspace();
    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });

    await asPerson(admin).mutation(api.profiles.archive, {
      profileId: members[1].profileId,
    });

    expect(await ids()).toEqual([members[0].profileId]);
  });

  test("legacy zadatak bez join redova čita staru kolonu i sam se popravi", async () => {
    const { t, taskPageId, members, asOwner, asPerson, ids } =
      await seedAssigneeWorkspace();

    // Stanje pre migracije: skalarna kolona popunjena, join tabela prazna.
    await t.run(async (ctx) => {
      await ctx.db.patch("pages", taskPageId, {
        assigneeProfileId: members[0].profileId,
      });
    });
    expect(await ids()).toEqual([members[0].profileId]);

    // Priključivanje drugog člana ne sme da izgubi zatečenog izvršioca.
    await asPerson(members[1]).mutation(api.taskAssignees.join, { taskPageId });
    expect(await ids()).toEqual([members[0].profileId, members[1].profileId]);

    // Prvi upis je ujedno i popravka: join redovi sada postoje za oba člana.
    const rows = await t.run((ctx) =>
      ctx.db
        .query("taskAssignees")
        .withIndex("by_task_active_created", (q) =>
          q.eq("taskPageId", taskPageId).eq("archivedAt", null),
        )
        .collect(),
    );
    expect(rows.map((row) => row.profileId)).toEqual([
      members[0].profileId,
      members[1].profileId,
    ]);
    void asOwner;
  });

  test("verifier prijavljuje zadatke koji čekaju backfill", async () => {
    const { t, taskPageId, members, asOwner } = await seedAssigneeWorkspace();

    // Zadatak sa skalarnom kolonom, bez join redova — tačno stanje pre migracije.
    await t.run(async (ctx) => {
      await ctx.db.patch("pages", taskPageId, {
        assigneeProfileId: members[2].profileId,
      });
    });
    expect(
      await t.query(internal.migrations.verifyTaskAssigneeBackfill, {}),
    ).toMatchObject({ missingRows: 1, complete: false });

    // Posle upisa spiska verifier je čist.
    await asOwner.mutation(api.taskAssignees.setAssignees, {
      taskPageId,
      profileIds: [members[2].profileId],
    });
    expect(
      await t.query(internal.migrations.verifyTaskAssigneeBackfill, {}),
    ).toMatchObject({ missingRows: 0, driftedProjections: 0, complete: true });
  });
});
