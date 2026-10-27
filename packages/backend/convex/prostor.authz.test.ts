/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * PROSTOR K23 (revizija dozvola): negativni slučajevi koje testovi K02–K06 nisu
 * pokrivali — otključavanje tuđe stranice, opis oblasti, „Poništi" komentara,
 * odlazak sa stranice, Istorija oblasti i ideje, „Oporavljeno" i pretraga
 * obrisanog. Svaki: nečlan (član drugog startupa), uklonjen član, arhiviran
 * profil i, gde ima smisla, drugi startup kroz tuđ `startupId`.
 */

const modules = import.meta.glob("./**/*.ts");
const T0 = Date.UTC(2026, 9, 27, 10, 0);
const FIRST = { numItems: 20, cursor: null };

afterEach(() => {
  vi.useRealTimers();
});

const errorCode = (error: unknown) =>
  (error as { data?: { code?: string } }).data?.code;

async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (
      name: string,
      options: { role?: "admin" | "member"; archived?: boolean } = {},
    ) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role: options.role ?? "member",
        archivedAt: options.archived ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await person("Owner");
    const admin = await person("Admin", { role: "admin" });
    const author = await person("Author");
    const member = await person("Member");
    const other = await person("Other");
    const outsider = await person("Outsider");
    const removed = await person("Removed");
    const archived = await person("Archived", { archived: true });
    const startup = (name: string, createdBy: Id<"profiles">) =>
      ctx.db.insert("startups", {
        name,
        description: "",
        createdByProfileId: createdBy,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    const startupA = await startup("Startup A", owner.profileId);
    const startupB = await startup("Startup B", outsider.profileId);
    const join = (
      startupId: Id<"startups">,
      profileId: Id<"profiles">,
      archivedAt: number | null = null,
    ) =>
      ctx.db.insert("startupMembers", {
        startupId,
        profileId,
        addedByProfileId: owner.profileId,
        archivedAt,
        createdAt: now,
      });
    for (const p of [owner, admin, author, member, other, archived]) {
      await join(startupA, p.profileId);
    }
    await join(startupA, removed.profileId, now);
    await join(startupB, outsider.profileId);
    const area = (startupId: Id<"startups">) =>
      ctx.db.insert("startupAreas", {
        startupId,
        key: "dev",
        label: "Razvoj",
        position: 0,
        createdAt: now,
      });
    const areaA = await area(startupA);
    const areaB = await area(startupB);
    return {
      owner,
      admin,
      author,
      member,
      other,
      outsider,
      removed,
      archived,
      startupA,
      startupB,
      areaA,
      areaB,
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|k23` });
  const asAuthor = as(seeded.author);
  const pageId = await asAuthor.mutation(api.pages.create, {
    startupId: seeded.startupA,
    areaId: seeded.areaA,
    parentPageId: null,
    kind: "note",
    title: "Specifikacija",
    content: "<p>Telo</p>",
  });
  return {
    t,
    ...seeded,
    pageId,
    asOwner: as(seeded.owner),
    asAdmin: as(seeded.admin),
    asAuthor,
    asMember: as(seeded.member),
    asOther: as(seeded.other),
    asOutsider: as(seeded.outsider),
    asRemoved: as(seeded.removed),
    asArchived: as(seeded.archived),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function removeMember(s: Seeded, profileId: Id<"profiles">) {
  await s.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_profileId", (q) =>
        q.eq("startupId", s.startupA).eq("profileId", profileId),
      )
      .unique();
    await ctx.db.patch("startupMembers", membership!._id, {
      archivedAt: Date.now(),
    });
  });
}

describe("zaključavanje: tuđa stranica i spoljni pristupi", () => {
  test("član ne otključava tuđu zaključanu stranicu; nečlan, uklonjen i arhiviran ne zaključavaju ni ne otključavaju", async () => {
    const s = await seed();
    const locked = await s.asAuthor.mutation(api.pages.lock, {
      pageId: s.pageId,
    });

    const memberError = await s.asMember
      .mutation(api.pages.unlock, { pageId: s.pageId })
      .catch((error: unknown) => error);
    expect(errorCode(memberError)).toBe("NEMA_DOZVOLU");

    for (const actor of [s.asOutsider, s.asRemoved]) {
      await expect(
        actor.mutation(api.pages.unlock, { pageId: s.pageId }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
      await expect(
        actor.mutation(api.pages.lock, { pageId: s.pageId }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
    }
    await expect(
      s.asArchived.mutation(api.pages.unlock, { pageId: s.pageId }),
    ).rejects.toThrow("deaktiviran");

    const page = await s.t.run((ctx) => ctx.db.get("pages", s.pageId));
    expect(page).toMatchObject({
      lockedAt: locked.lockedAt,
      lockedByProfileId: s.author.profileId,
    });
  });
});

describe("opis oblasti: čitanje i upis van startupa", () => {
  test("nečlan, uklonjen član, arhiviran profil i oblast drugog startupa ne čitaju ni ne menjaju opis", async () => {
    const s = await seed();
    await s.asMember.mutation(api.areasV2.updateAreaBody, {
      startupId: s.startupA,
      areaId: s.areaA,
      content: "<p>Opis tima</p>",
      expectedRevision: 0,
    });
    const read = (actor: Seeded["asMember"], startupId: Id<"startups">) =>
      actor.query(api.areasV2.getAreaBody, { startupId, areaId: s.areaA });

    for (const actor of [s.asOutsider, s.asRemoved]) {
      await expect(read(actor, s.startupA)).rejects.toThrow(
        "Nemate pristup ovom startupu.",
      );
    }
    await expect(read(s.asArchived, s.startupA)).rejects.toThrow("deaktiviran");
    // Član startupa B ne dolazi do oblasti iz A ni kroz svoj startupId.
    await expect(read(s.asOutsider, s.startupB)).rejects.toThrow(
      "Oblast nije pronađena u ovom startupu.",
    );
    await expect(
      s.asOutsider.mutation(api.areasV2.updateAreaBody, {
        startupId: s.startupB,
        areaId: s.areaA,
        content: "Upad",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("Oblast nije pronađena u ovom startupu.");

    const body = await s.asMember.query(api.areasV2.getAreaBody, {
      startupId: s.startupA,
      areaId: s.areaA,
    });
    expect(body).toMatchObject({ content: "<p>Opis tima</p>", revision: 1 });
  });
});

describe("komentari: „Poništi” van startupa", () => {
  test("nečlan, uklonjen član i arhiviran profil ne vraćaju uklonjen komentar ni u roku od 8 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const s = await seed();
    const commentId = await s.asOther.mutation(api.comments.add, {
      target: { kind: "page", id: s.pageId },
      content: "Prolazan",
    });
    await s.asOther.mutation(api.comments.remove, { commentId });
    // Autor komentara je uklonjen iz startupa odmah posle brisanja.
    await removeMember(s, s.other.profileId);

    vi.setSystemTime(T0 + 2_000);
    for (const actor of [s.asOutsider, s.asRemoved, s.asOther]) {
      await expect(
        actor.mutation(api.comments.restore, { commentId }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
    }
    await expect(
      s.asArchived.mutation(api.comments.restore, { commentId }),
    ).rejects.toThrow("deaktiviran");

    const row = await s.t.run((ctx) =>
      ctx.db.get("contentContributions", commentId),
    );
    expect(row?.archivedAt).toBe(T0);
  });
});

describe("komentari: granica strane", () => {
  test("comments.list prima najviše 100 redova po strani", async () => {
    const s = await seed();
    const target = { kind: "page" as const, id: s.pageId };
    await s.asMember.mutation(api.comments.add, { target, content: "Prvi" });
    const full = await s.asMember.query(api.comments.list, {
      target,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(full.page).toHaveLength(1);
    for (const numItems of [0, 101, 10_000]) {
      await expect(
        s.asMember.query(api.comments.list, {
          target,
          paginationOpts: { numItems, cursor: null },
        }),
      ).rejects.toThrow("najviše 100 komentara");
    }
  });
});

describe("prisustvo: odlazak van startupa", () => {
  test("nečlan, uklonjen član i arhiviran profil ne diraju tuđe prisustvo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const s = await seed();
    await s.asMember.mutation(api.presence.heartbeat, {
      pageId: s.pageId,
      editing: true,
    });
    for (const actor of [s.asOutsider, s.asRemoved]) {
      await expect(
        actor.mutation(api.presence.leave, { pageId: s.pageId }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
    }
    await expect(
      s.asArchived.mutation(api.presence.leave, { pageId: s.pageId }),
    ).rejects.toThrow("deaktiviran");
    const present = await s.asAuthor.query(api.presence.listForPage, {
      pageId: s.pageId,
    });
    expect(present).toEqual([
      expect.objectContaining({ displayName: "Member", editing: true }),
    ]);
  });
});

describe("Istorija izmena oblasti i ideje", () => {
  test("nečlan i uklonjen član ne čitaju ni ne vraćaju; ideja u Korpi nema istoriju", async () => {
    const s = await seed();
    await s.asMember.mutation(api.areasV2.updateAreaBody, {
      startupId: s.startupA,
      areaId: s.areaA,
      content: "<p>Prvi opis</p>",
      expectedRevision: 0,
    });
    await s.asAuthor.mutation(api.areasV2.updateAreaBody, {
      startupId: s.startupA,
      areaId: s.areaA,
      content: "<p>Drugi opis</p>",
      expectedRevision: 1,
    });
    const ideaId = await s.asAuthor.mutation(api.ideas.create, {
      startupId: s.startupA,
      title: "Ideja",
      text: "Prvi tekst",
    });
    await s.asMember.mutation(api.ideas.update, {
      startupId: s.startupA,
      ideaId,
      title: "Ideja",
      text: "Drugi tekst",
      color: "neutral",
    });
    const areaTarget = { kind: "area" as const, id: s.areaA };
    const ideaTarget = { kind: "idea" as const, id: ideaId };
    const areaRows = (
      await s.asMember.query(api.history.list, {
        target: areaTarget,
        paginationOpts: FIRST,
      })
    ).page;
    const ideaRows = (
      await s.asMember.query(api.history.list, {
        target: ideaTarget,
        paginationOpts: FIRST,
      })
    ).page;
    expect(areaRows.length).toBeGreaterThan(1);
    expect(ideaRows.length).toBeGreaterThan(1);

    for (const actor of [s.asOutsider, s.asRemoved]) {
      for (const target of [areaTarget, ideaTarget]) {
        await expect(
          actor.query(api.history.list, { target, paginationOpts: FIRST }),
        ).rejects.toThrow("Nemate pristup ovom startupu.");
      }
      await expect(
        actor.query(api.history.get, { revisionId: ideaRows[0]._id }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
      await expect(
        actor.mutation(api.history.restore, {
          revisionId: areaRows[areaRows.length - 1]._id,
          expectedRevision: 2,
        }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
      await expect(
        actor.mutation(api.history.restore, {
          revisionId: ideaRows[ideaRows.length - 1]._id,
        }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
    }
    await expect(
      s.asArchived.query(api.history.list, {
        target: areaTarget,
        paginationOpts: FIRST,
      }),
    ).rejects.toThrow("deaktiviran");

    // Opis i ideja su nepromenjeni.
    const body = await s.asMember.query(api.areasV2.getAreaBody, {
      startupId: s.startupA,
      areaId: s.areaA,
    });
    expect(body.content).toBe("<p>Drugi opis</p>");
    const idea = await s.t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(idea?.text).toBe("Drugi tekst");

    // Ideja u Korpi: istorija se ne čita i ne vraća dok je ideja ne vrati.
    await s.asMember.mutation(api.ideas.archive, {
      startupId: s.startupA,
      ideaId,
    });
    await expect(
      s.asMember.query(api.history.list, {
        target: ideaTarget,
        paginationOpts: FIRST,
      }),
    ).rejects.toThrow("Ideja nije pronađena.");
    await expect(
      s.asOwner.mutation(api.history.restore, {
        revisionId: ideaRows[ideaRows.length - 1]._id,
      }),
    ).rejects.toThrow("Ideja nije pronađena.");
  });
});

describe("Korpa › Oporavljeno: uklonjen član i arhiviran profil", () => {
  test("ne vide ni ne uklanjaju — ni sopstveni sačuvan sadržaj posle uklanjanja", async () => {
    const s = await seed();
    const recoveredId = await s.t.run((ctx) =>
      ctx.db.insert("recoveredContent", {
        startupId: s.startupA,
        title: "Sačuvan tekst",
        sourceKind: "page",
        sourceTargetId: s.pageId,
        createdByProfileId: s.member.profileId,
        archivedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await removeMember(s, s.member.profileId);
    for (const actor of [s.asMember, s.asRemoved, s.asOutsider]) {
      await expect(
        actor.query(api.trash.list, {
          startupId: s.startupA,
          kind: "recovered",
          paginationOpts: FIRST,
        }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
      await expect(
        actor.mutation(api.trash.dismissRecovered, { recoveredId }),
      ).rejects.toThrow("Nemate pristup ovom startupu.");
    }
    await expect(
      s.asArchived.mutation(api.trash.dismissRecovered, { recoveredId }),
    ).rejects.toThrow("deaktiviran");
    const row = await s.t.run((ctx) => ctx.db.get("recoveredContent", recoveredId));
    expect(row?.archivedAt).toBeNull();
  });
});

describe("pretraga i Korpa (P21)", () => {
  test("stranica u Korpi se ne vraća u pretrazi, a posle „Vrati” opet se vraća", async () => {
    const s = await seed();
    const secretId = await s.asAuthor.mutation(api.pages.create, {
      startupId: s.startupA,
      areaId: s.areaA,
      parentPageId: null,
      kind: "note",
      title: "Tajni plan lansiranja",
      content: "<p>Detalji</p>",
    });
    const search = () =>
      s.asMember.query(api.search.pages, {
        query: "Tajni plan",
        startupId: s.startupA,
      });
    expect((await search()).map((row) => row._id)).toContain(secretId);

    await s.asMember.mutation(api.pages.archive, { pageId: secretId });
    expect((await search()).map((row) => row._id)).not.toContain(secretId);

    await s.asOther.mutation(api.trash.restore, {
      target: { kind: "page", id: secretId },
    });
    expect((await search()).map((row) => row._id)).toContain(secretId);
    // Nečlan ne pretražuje startup.
    await expect(
      s.asOutsider.query(api.search.pages, {
        query: "Tajni plan",
        startupId: s.startupA,
      }),
    ).rejects.toThrow("Nemate pristup ovom startupu.");
  });
});
