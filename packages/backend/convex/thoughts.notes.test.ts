/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const first = { numItems: 50, cursor: null };

/**
 * Beleške u „Ja" (PROSTOR P7, K05). Startupi: A (ja, Ana, Admin), B (ja), C
 * (samo Ana), D (moje članstvo arhivirano), E (arhiviran startup, ja član).
 * Beleške iz D i E su upisane pre nego što sam izgubio pristup.
 */
async function seed() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (
      name: string,
      options: { role?: "admin" | "member"; archived?: boolean } = {},
    ) => {
      const email = `${name.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: name,
        email,
        role: options.role ?? "member",
        archivedAt: options.archived === true ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const me = await person("Jovan");
    const ana = await person("Ana");
    const admin = await person("Admin", { role: "admin" });
    const gone = await person("Bivsi", { archived: true });

    const startup = async (
      name: string,
      members: Array<{ profileId: Id<"profiles">; archived?: boolean }>,
      archived = false,
    ) => {
      const startupId = await ctx.db.insert("startups", {
        name,
        description: "",
        createdByProfileId: members[0].profileId,
        archivedAt: archived ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      for (const member of members) {
        await ctx.db.insert("startupMembers", {
          startupId,
          profileId: member.profileId,
          addedByProfileId: members[0].profileId,
          archivedAt: member.archived === true ? now : null,
          createdAt: now,
        });
      }
      await ctx.db.insert("startupAreas", {
        startupId,
        key: "dev",
        label: `${name} dev`,
        position: 0,
        createdAt: now,
      });
      return startupId;
    };
    const a = await startup("Cluck Rush", [
      { profileId: me.profileId },
      { profileId: ana.profileId },
      { profileId: admin.profileId },
      { profileId: gone.profileId },
    ]);
    const b = await startup("Scan Me", [{ profileId: me.profileId }]);
    const c = await startup("Tuđi", [{ profileId: ana.profileId }]);
    const d = await startup("Napušten", [
      { profileId: ana.profileId },
      { profileId: me.profileId, archived: true },
    ]);
    const e = await startup("Arhiviran", [{ profileId: me.profileId }], true);

    const insertNote = async (
      startupId: Id<"startups"> | null,
      owner: Id<"profiles">,
      title: string,
    ) =>
      await ctx.db.insert("thoughtNodes", {
        startupId,
        ownerProfileId: owner,
        title,
        text: `${title} tekst`,
        searchText: `${title}\n${title} tekst`,
        x: 0,
        y: 0,
        color: "neutral",
        conversionCount: 0,
        lastConvertedPageId: null,
        lastConvertedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    return {
      me,
      ana,
      admin,
      gone,
      a,
      b,
      c,
      d,
      e,
      leftNote: await insertNote(d, me.profileId, "Napuštena beleška"),
      archivedStartupNote: await insertNote(e, me.profileId, "Arhivirana beleška"),
      anaPersonal: await insertNote(null, ana.profileId, "Anina lična"),
      anaInA: await insertNote(a, ana.profileId, "Anina u startupu"),
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|notes-test` });
  return {
    t,
    ...s,
    as,
    asMe: as(s.me),
    asAna: as(s.ana),
    asAdmin: as(s.admin),
    asGone: as(s.gone),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const idsOf = (page: ReadonlyArray<{ _id: Id<"thoughtNodes"> }>) =>
  page.map((item) => item._id).sort();

async function canvasesOf(s: Seeded, owner: Id<"profiles">) {
  return await s.t.run((ctx) =>
    ctx.db
      .query("thoughtCanvases")
      .collect()
      .then((rows) => rows.filter((row) => row.ownerProfileId === owner)),
  );
}

describe("Beleške: lična beleška", () => {
  test("lična beleška nastaje bez Mape i vidi je samo vlasnik", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: null,
      text: "Lična ideja za vikend\nDrugi red",
    });
    const inA = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      title: "Plan lansiranja",
      text: "Šta radimo prvo",
    });

    const doc = await s.t.run((ctx) => ctx.db.get("thoughtNodes", personal));
    expect(doc).toMatchObject({
      startupId: null,
      ownerProfileId: s.me.profileId,
      title: "Lična ideja za vikend",
      x: 0,
      y: 0,
      color: "neutral",
      archivedAt: null,
    });
    // Mapa postoji samo po startupu: lična beleška je ne pravi.
    const canvases = await canvasesOf(s, s.me.profileId);
    expect(canvases.map((row) => row.startupId)).toEqual([s.a]);

    // Sve moje: lične + aktivni startupi, bez napuštenog i arhiviranog.
    const all = await s.asMe.query(api.thoughts.listMine, { paginationOpts: first });
    expect(idsOf(all.page)).toEqual([personal, inA].sort());
    expect(all.page.find((item) => item._id === personal)).toMatchObject({
      startupId: null,
      startup: null,
      title: "Lična ideja za vikend",
      parentThoughtId: null,
      isParent: false,
      conversionCount: 0,
      lastConvertedIdeaId: null,
    });
    expect(all.page.find((item) => item._id === inA)?.startup).toEqual({
      _id: s.a,
      name: "Cluck Rush",
      logoUrl: null,
    });

    // Filter: lično / jedan startup.
    const personalOnly = await s.asMe.query(api.thoughts.listMine, {
      startupId: null,
      paginationOpts: first,
    });
    expect(idsOf(personalOnly.page)).toEqual([personal]);
    const onlyA = await s.asMe.query(api.thoughts.listMine, {
      startupId: s.a,
      paginationOpts: first,
    });
    expect(idsOf(onlyA.page)).toEqual([inA]);
    for (const startupId of [s.c, s.d, s.e]) {
      await expect(
        s.asMe.query(api.thoughts.listMine, { startupId, paginationOpts: first }),
      ).rejects.toThrow();
    }

    // Tuđe beleške nikad — ni admin ne vidi moje.
    const ana = await s.asAna.query(api.thoughts.listMine, { paginationOpts: first });
    expect(idsOf(ana.page)).toEqual([s.anaPersonal, s.anaInA].sort());
    const admin = await s.asAdmin.query(api.thoughts.listMine, { paginationOpts: first });
    expect(admin.page).toEqual([]);

    // Mapa startupa ne prikazuje lične beleške.
    const map = await s.asMe.query(api.thoughts.listNodes, {
      startupId: s.a,
      paginationOpts: first,
    });
    expect(idsOf(map.page)).toEqual([inA]);
    expect(map.page[0].startupId).toBe(s.a);

    // Arhiviran profil i neprijavljen ne čitaju i ne pišu.
    await expect(
      s.asGone.query(api.thoughts.listMine, { paginationOpts: first }),
    ).rejects.toThrow();
    await expect(
      s.asGone.mutation(api.thoughts.createNote, { startupId: null, text: "x" }),
    ).rejects.toThrow();
    await expect(
      s.t.query(api.thoughts.listMine, { paginationOpts: first }),
    ).rejects.toThrow();
    // Ne pravi se beleška u startupu gde nisam aktivan član.
    for (const startupId of [s.c, s.d, s.e]) {
      await expect(
        s.asMe.mutation(api.thoughts.createNote, { startupId, text: "Ne" }),
      ).rejects.toThrow();
    }
  });

  test("izmena, arhiva i vraćanje lične beleške rade samo vlasniku", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: null,
      title: "Lično",
      text: "Prvi tekst",
    });

    for (const client of [s.asAna, s.asAdmin, s.asGone]) {
      await expect(
        client.mutation(api.thoughts.updateNode, { nodeId: personal, text: "Tuđe" }),
      ).rejects.toThrow();
      await expect(
        client.mutation(api.thoughts.archiveNodes, { nodeIds: [personal] }),
      ).rejects.toThrow();
    }

    await s.asMe.mutation(api.thoughts.updateNode, {
      nodeId: personal,
      title: "Lično, izmenjeno",
      text: "Drugi tekst",
    });
    const updated = await s.t.run((ctx) => ctx.db.get("thoughtNodes", personal));
    expect(updated).toMatchObject({
      title: "Lično, izmenjeno",
      text: "Drugi tekst",
      searchText: "Lično, izmenjeno\nDrugi tekst",
      startupId: null,
    });

    await s.asMe.mutation(api.thoughts.archiveNodes, { nodeIds: [personal] });
    const archived = await s.asMe.query(api.thoughts.listMine, {
      startupId: null,
      paginationOpts: first,
    });
    expect(archived.page).toEqual([]);
    await expect(
      s.asAna.mutation(api.thoughts.restoreNodes, { nodeIds: [personal] }),
    ).rejects.toThrow();
    await s.asMe.mutation(api.thoughts.restoreNodes, { nodeIds: [personal] });
    const restored = await s.asMe.query(api.thoughts.listMine, {
      startupId: null,
      paginationOpts: first,
    });
    expect(idsOf(restored.page)).toEqual([personal]);

    // Beleška iz startupa koji sam napustio se ne menja.
    await expect(
      s.asMe.mutation(api.thoughts.updateNode, { nodeId: s.leftNote, text: "Ne" }),
    ).rejects.toThrow();
  });

  test("podbeleška i Mapa: slobodno mesto, roditelj iz istog opsega", async () => {
    const s = await seed();
    const one = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      title: "",
      text: "Prva na Mapi",
    });
    const two = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      text: "Druga na Mapi",
    });
    const [oneDoc, twoDoc] = await s.t.run(async (ctx) => [
      await ctx.db.get("thoughtNodes", one),
      await ctx.db.get("thoughtNodes", two),
    ]);
    expect(oneDoc?.title).toBe("Prva na Mapi");
    expect(oneDoc?.x !== twoDoc?.x || oneDoc?.y !== twoDoc?.y).toBe(true);
    expect((await canvasesOf(s, s.me.profileId)).length).toBe(1);

    const child = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      text: "Pod prvom",
      parentThoughtId: one,
    });
    const childDoc = await s.t.run((ctx) => ctx.db.get("thoughtNodes", child));
    expect(childDoc?.parentThoughtId).toBe(one);
    const listed = await s.asMe.query(api.thoughts.listMine, {
      startupId: s.a,
      paginationOpts: first,
    });
    expect(listed.page.find((item) => item._id === child)?.parentThoughtId).toBe(one);

    const personalParent = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: null,
      text: "Lični roditelj",
    });
    await expect(
      s.asMe.mutation(api.thoughts.createNote, {
        startupId: null,
        text: "Lično dete",
        parentThoughtId: personalParent,
      }),
    ).resolves.toBeTruthy();
    // Roditelj iz drugog opsega ili tuđ roditelj → greška.
    await expect(
      s.asMe.mutation(api.thoughts.createNote, {
        startupId: s.a,
        text: "Mešano",
        parentThoughtId: personalParent,
      }),
    ).rejects.toThrow(/Misao nije pronađena/);
    await expect(
      s.asMe.mutation(api.thoughts.createNote, {
        startupId: null,
        text: "Tuđe",
        parentThoughtId: s.anaPersonal,
      }),
    ).rejects.toThrow(/Misao nije pronađena/);
  });
});

describe("Beleške: pretraga", () => {
  test("searchMine nalazi samo moje beleške iz dozvoljenog opsega; pretraga startupa ne vidi lične", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: null,
      title: "Tajni recept",
      text: "samo za mene",
    });
    const inA = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      title: "Recept za tim",
      text: "u startupu",
    });

    const all = await s.asMe.query(api.thoughts.searchMine, { query: "recept" });
    expect(all.map((item) => item._id).sort()).toEqual([personal, inA].sort());
    expect(all.find((item) => item._id === personal)?.startupId).toBeNull();
    const personalOnly = await s.asMe.query(api.thoughts.searchMine, {
      query: "recept",
      startupId: null,
    });
    expect(personalOnly.map((item) => item._id)).toEqual([personal]);
    const onlyA = await s.asMe.query(api.thoughts.searchMine, {
      query: "recept",
      startupId: s.a,
    });
    expect(onlyA.map((item) => item._id)).toEqual([inA]);
    // Napuštena i arhivirana beleška startupa se ne nalaze.
    expect(
      await s.asMe.query(api.thoughts.searchMine, { query: "beleška" }),
    ).toEqual([]);
    // Tuđe nikad, ni adminu.
    expect(await s.asAna.query(api.thoughts.searchMine, { query: "recept" })).toEqual([]);
    expect(await s.asAdmin.query(api.thoughts.searchMine, { query: "recept" })).toEqual([]);
    await expect(
      s.asMe.query(api.thoughts.searchMine, { query: "recept", startupId: s.c }),
    ).rejects.toThrow();

    // Pretraga startupa: lična beleška se ne pojavljuje.
    const startupSearch = await s.asMe.query(api.search.ideasAndThoughts, {
      startupId: s.a,
      query: "recept",
    });
    expect(startupSearch.thoughts.map((item) => item._id)).toEqual([inA]);
    expect(startupSearch.thoughts[0].startupId).toBe(s.a);
  });
});

describe("Beleške: Pošalji u startup", () => {
  test("lična i startup beleška postaju ideje (Predlog) u startupu gde sam član", async () => {
    const s = await seed();
    const personalOne = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: null,
      title: "Lična 1",
      text: "Prva",
    });
    const personalTwo = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: null,
      title: "Lična 2",
      text: "Druga",
    });
    const fromA = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      title: "Iz A",
      text: "Treća",
    });

    // Već postojeća ideja na (0, 0) ciljnog startupa.
    const existingIdea = await s.asMe.mutation(api.ideas.create, {
      startupId: s.b,
      title: "Postojeća",
      text: "Na početku kanvasa",
      x: 0,
      y: 0,
    });

    // Redosled izbora: druga pa prva.
    const personalResult = await s.asMe.mutation(api.thoughts.convertToIdeas, {
      startupId: s.b,
      nodeIds: [personalTwo, personalOne],
    });
    expect(personalResult.ideaIds).toHaveLength(2);
    const ideas = await s.t.run(async (ctx) =>
      Promise.all(personalResult.ideaIds.map((id) => ctx.db.get("ideaNodes", id))),
    );
    expect(ideas.map((idea) => idea?.title)).toEqual(["Lična 2", "Lična 1"]);
    for (const idea of ideas) {
      expect(idea).toMatchObject({
        startupId: s.b,
        authorProfileId: s.me.profileId,
        convertedPageId: null,
        archivedAt: null,
      });
      expect(idea?.stage).toBeUndefined();
    }
    const note = await s.t.run((ctx) => ctx.db.get("thoughtNodes", personalOne));
    expect(note).toMatchObject({ startupId: null, conversionCount: 1 });
    expect(note?.lastConvertedIdeaId).toBe(personalResult.ideaIds[1]);

    // Druga serija iz iste lične beleške ne pada na prvu ni na postojeću ideju.
    const again = await s.asMe.mutation(api.thoughts.convertToIdeas, {
      startupId: s.b,
      nodeIds: [personalOne],
    });
    const positions = await s.t.run(async (ctx) =>
      Promise.all(
        [existingIdea, ...personalResult.ideaIds, ...again.ideaIds].map(
          async (id) => {
            const idea = await ctx.db.get("ideaNodes", id);
            return `${idea?.x}:${idea?.y}`;
          },
        ),
      ),
    );
    expect(new Set(positions).size).toBe(positions.length);

    const bList = await s.asMe.query(api.ideas.list, { startupId: s.b });
    expect(bList.nodes.map((node) => node.stage)).toEqual([
      "predlog",
      "predlog",
      "predlog",
      "predlog",
    ]);

    // Beleška iz startupa A ide u startup B.
    const crossResult = await s.asMe.mutation(api.thoughts.convertToIdeas, {
      startupId: s.b,
      nodeIds: [fromA],
    });
    const crossIdea = await s.t.run((ctx) =>
      ctx.db.get("ideaNodes", crossResult.ideaIds[0]),
    );
    expect(crossIdea?.startupId).toBe(s.b);
  });

  test("cilj gde nisam član, tuđa i napuštena beleška i mešan izbor se odbijaju bez izmena", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: null,
      text: "Lična",
    });
    const fromA = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      text: "Iz A",
    });
    const attempts: Array<{ startupId: Id<"startups">; nodeIds: Id<"thoughtNodes">[] }> = [
      { startupId: s.c, nodeIds: [personal] },
      { startupId: s.d, nodeIds: [personal] },
      { startupId: s.e, nodeIds: [fromA] },
      { startupId: s.b, nodeIds: [s.anaPersonal] },
      { startupId: s.a, nodeIds: [s.anaInA] },
      { startupId: s.b, nodeIds: [s.leftNote] },
      { startupId: s.b, nodeIds: [s.archivedStartupNote] },
      { startupId: s.b, nodeIds: [personal, fromA] },
    ];
    for (const attempt of attempts) {
      await expect(
        s.asMe.mutation(api.thoughts.convertToIdeas, attempt),
      ).rejects.toThrow();
    }
    // Admin ne šalje tuđu belešku.
    await expect(
      s.asAdmin.mutation(api.thoughts.convertToIdeas, {
        startupId: s.a,
        nodeIds: [s.anaInA],
      }),
    ).rejects.toThrow();

    const ideas = await s.t.run((ctx) => ctx.db.query("ideaNodes").collect());
    expect(ideas).toEqual([]);
    // Stranica iz beleške i dalje ide preko ideje (K01 D10).
    await expect(
      s.asMe.mutation(api.thoughts.convertToPages, {
        startupId: s.a,
        nodeIds: [fromA],
        targetAreaId: (await s.t.run((ctx) =>
          ctx.db
            .query("startupAreas")
            .withIndex("by_startupId_and_position", (q) => q.eq("startupId", s.a))
            .first(),
        ))!._id,
        targetParentPageId: null,
        layoutMode: "separate",
        pageKind: "note",
      }),
    ).rejects.toThrow(/Misli se prvo šalju u Ideje/);
  });

  test("stari klijent (isti startup) i dalje prenosi veze među izabranim mislima", async () => {
    const s = await seed();
    const one = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      text: "Jedan",
    });
    const two = await s.asMe.mutation(api.thoughts.createNote, {
      startupId: s.a,
      text: "Dva",
    });
    await s.asMe.mutation(api.thoughts.createEdge, {
      startupId: s.a,
      nodeAId: one,
      nodeBId: two,
      label: "vodi ka",
    });
    const result = await s.asMe.mutation(api.thoughts.convertToIdeas, {
      startupId: s.a,
      nodeIds: [one, two],
    });
    expect(result.createdEdgeCount).toBe(1);
    const edges = await s.t.run((ctx) => ctx.db.query("ideaEdges").collect());
    expect(edges).toEqual([
      expect.objectContaining({ startupId: s.a, label: "vodi ka" }),
    ]);
  });
});
