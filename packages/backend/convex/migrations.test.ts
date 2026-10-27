/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const MIGRATION_ARGS = { cursor: null, batchSize: 20, oneBatchOnly: true };

describe("backfillChatReads", () => {
  test("seeduje unread 0 po članu i kanalu, idempotentno, bez nuliranja", async () => {
    const t = convexTest(schema, modules);

    const seed = await t.run(async (ctx) => {
      const now = 1_000;
      const makeProfile = async (name: string) => {
        const userId = await ctx.db.insert("users", {
          name,
          email: `${name}@example.test`,
        });
        return ctx.db.insert("profiles", {
          userId,
          displayName: name,
          email: `${name}@example.test`,
          role: "member",
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      };
      const owner = await makeProfile("owner");
      const member = await makeProfile("member");
      const removed = await makeProfile("removed");

      const startupId = await ctx.db.insert("startups", {
        name: "Reads startup",
        description: "",
        createdByProfileId: owner,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("startupAreas", {
        startupId,
        key: "dev",
        label: "Dev",
        position: 0,
        createdAt: now,
      });
      await ctx.db.insert("startupAreas", {
        startupId,
        key: "marketing",
        label: "Marketing",
        position: 1,
        createdAt: now,
      });

      const addMember = async (
        profileId: Id<"profiles">,
        archivedAt: number | null,
      ) =>
        ctx.db.insert("startupMembers", {
          startupId,
          profileId,
          addedByProfileId: owner,
          archivedAt,
          createdAt: now,
        });
      await addMember(owner, null);
      await addMember(member, null);
      await addMember(removed, now); // arhiviran — ne dobija read

      return { startupId, owner, member, removed };
    });

    // Kanali prvo (opšti + 2 oblasti), pa readovi.
    await t.mutation(internal.migrations.backfillChatChannels, MIGRATION_ARGS);
    await t.mutation(internal.migrations.backfillChatReads, MIGRATION_ARGS);

    const reads = await t.run((ctx) => ctx.db.query("chatReads").collect());

    // 3 kanala (opšti + Dev + Marketing) × 2 aktivna člana = 6 redova.
    expect(reads).toHaveLength(6);
    expect(reads.every((read) => read.unreadCount === 0)).toBe(true);
    expect(reads.every((read) => read.mentionCount === 0)).toBe(true);
    // Arhiviran član nema nijedan read.
    expect(reads.filter((read) => read.profileId === seed.removed)).toHaveLength(
      0,
    );
    // Oba aktivna člana pokrivena po svakom kanalu (3 reda po članu).
    expect(reads.filter((read) => read.profileId === seed.owner)).toHaveLength(
      3,
    );
    expect(reads.filter((read) => read.profileId === seed.member)).toHaveLength(
      3,
    );

    // Simuliraj lenjo kreiran red sa stvarnim unread-om pre ponovnog run-a.
    const target = reads[0];
    await t.run((ctx) =>
      ctx.db.patch("chatReads", target._id, { unreadCount: 5 }),
    );

    // Ponovni run: bez duplikata i bez nuliranja postojećeg brojača.
    await t.mutation(internal.migrations.backfillChatReads, MIGRATION_ARGS);

    const readsAfter = await t.run((ctx) =>
      ctx.db.query("chatReads").collect(),
    );
    expect(readsAfter).toHaveLength(6);
    expect(
      readsAfter.find((read) => read._id === target._id)?.unreadCount,
    ).toBe(5);

    // Verifier ne nalazi propuste (proverava postojanje reda, ne vrednost).
    expect(
      await t.query(internal.migrations.verifyChatReadsBackfill, {}),
    ).toMatchObject({ missingReads: 0, complete: true, truncated: false });
  });

  test("bez kanala (backfillChatReads pre backfillChatChannels) ne upisuje ništa", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const now = 2_000;
      const userId = await ctx.db.insert("users", {
        name: "solo",
        email: "solo@example.test",
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: "solo",
        email: "solo@example.test",
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const startupId = await ctx.db.insert("startups", {
        name: "No channels",
        description: "",
        createdByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId,
        addedByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
      });
    });

    // Namerno preskačemo backfillChatChannels — nema kanala.
    await t.mutation(internal.migrations.backfillChatReads, MIGRATION_ARGS);

    const reads = await t.run((ctx) => ctx.db.query("chatReads").collect());
    expect(reads).toHaveLength(0);
  });
});

/**
 * PROSTOR K03 (P4): zatvaranje starih otvorenih zahteva i listića. Pišu se i
 * testiraju, ali se u runu NE pokreću (Jovan ih pušta posle deploy-a po želji).
 */
describe("closeLegacyRequests", () => {
  test("otvoreni zahtevi i listići → cancelled, ostali netaknuti, drugi prolaz ne menja ništa", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const now = 1_000;
      const userId = await ctx.db.insert("users", {
        name: "solo",
        email: "solo@example.test",
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: "solo",
        email: "solo@example.test",
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const startupId = await ctx.db.insert("startups", {
        name: "Legacy",
        description: "",
        createdByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const areaId = await ctx.db.insert("startupAreas", {
        startupId,
        key: "dev",
        label: "Dev",
        position: 0,
        createdAt: now,
      });
      const page = (title: string) =>
        ctx.db.insert("pages", {
          startupId,
          areaId,
          parentPageId: null,
          kind: "note",
          title,
          searchText: "",
          revision: 0,
          position: 0,
          taskStatus: null,
          taskPriority: null,
          assigneeProfileId: null,
          dueDate: null,
          taskSortAt: now,
          createdByProfileId: profileId,
          updatedByProfileId: profileId,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      const idea = (title: string) =>
        ctx.db.insert("ideaNodes", {
          startupId,
          authorProfileId: profileId,
          title,
          text: title,
          x: 0,
          y: 0,
          color: "neutral",
          convertedPageId: null,
          convertedAt: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      const deletion = (status: "pending" | "approved") =>
        ctx.db.insert("deletionRequests", {
          startupId,
          targetKind: "page",
          targetId: "x",
          targetTitle: "X",
          requesterProfileId: profileId,
          status,
          eligibleCount: 2,
          approveCount: 1,
          rejectCount: 0,
          createdAt: now,
          updatedAt: now,
          resolvedAt: status === "pending" ? null : now,
        });
      const openDeletion = await deletion("pending");
      const closedDeletion = await deletion("approved");
      const ballot = (vote: "pending" | "approve") =>
        ctx.db.insert("deletionBallots", {
          requestId: openDeletion,
          startupId,
          profileId,
          vote,
          createdAt: now,
          updatedAt: now,
        });
      const openBallot = await ballot("pending");
      const castBallot = await ballot("approve");
      const child = await page("Dete");
      const parent = await page("Roditelj");
      const pageNesting = (status: "pending" | "rejected") =>
        ctx.db.insert("pageNestingRequests", {
          startupId,
          areaId,
          childPageId: child,
          sourceParentPageId: null,
          targetParentPageId: parent,
          requesterProfileId: profileId,
          parentAuthorProfileId: profileId,
          expectedTreeRevision: 0,
          status,
          createdAt: now,
          updatedAt: now,
          resolvedAt: status === "pending" ? null : now,
        });
      const openPageNesting = await pageNesting("pending");
      const closedPageNesting = await pageNesting("rejected");
      const childIdea = await idea("Dete");
      const parentIdea = await idea("Roditelj");
      const ideaNesting = (status: "pending" | "withdrawn") =>
        ctx.db.insert("nestingRequests", {
          startupId,
          childIdeaId: childIdea,
          parentIdeaId: parentIdea,
          requesterProfileId: profileId,
          parentAuthorProfileId: profileId,
          status,
          createdAt: now,
          updatedAt: now,
          resolvedAt: status === "pending" ? null : now,
        });
      const openIdeaNesting = await ideaNesting("pending");
      const closedIdeaNesting = await ideaNesting("withdrawn");
      return {
        openDeletion,
        closedDeletion,
        openBallot,
        castBallot,
        openPageNesting,
        closedPageNesting,
        openIdeaNesting,
        closedIdeaNesting,
      };
    });

    const runAll = async () => {
      await t.mutation(
        internal.migrations.closeLegacyDeletionRequests,
        MIGRATION_ARGS,
      );
      await t.mutation(
        internal.migrations.closeLegacyDeletionBallots,
        MIGRATION_ARGS,
      );
      await t.mutation(
        internal.migrations.closeLegacyPageNestingRequests,
        MIGRATION_ARGS,
      );
      await t.mutation(
        internal.migrations.closeLegacyIdeaNestingRequests,
        MIGRATION_ARGS,
      );
    };
    const snapshot = () =>
      t.run(async (ctx) => ({
        openDeletion: await ctx.db.get("deletionRequests", ids.openDeletion),
        closedDeletion: await ctx.db.get("deletionRequests", ids.closedDeletion),
        openBallot: await ctx.db.get("deletionBallots", ids.openBallot),
        castBallot: await ctx.db.get("deletionBallots", ids.castBallot),
        openPageNesting: await ctx.db.get(
          "pageNestingRequests",
          ids.openPageNesting,
        ),
        closedPageNesting: await ctx.db.get(
          "pageNestingRequests",
          ids.closedPageNesting,
        ),
        openIdeaNesting: await ctx.db.get(
          "nestingRequests",
          ids.openIdeaNesting,
        ),
        closedIdeaNesting: await ctx.db.get(
          "nestingRequests",
          ids.closedIdeaNesting,
        ),
      }));
    const before = await snapshot();

    await runAll();
    const first = await snapshot();
    expect(first.openDeletion).toMatchObject({
      status: "cancelled",
      resolvedAt: expect.any(Number),
    });
    expect(first.openBallot?.vote).toBe("cancelled");
    expect(first.openPageNesting).toMatchObject({
      status: "cancelled",
      resolvedAt: expect.any(Number),
    });
    expect(first.openIdeaNesting).toMatchObject({
      status: "cancelled",
      resolvedAt: expect.any(Number),
    });
    // Odlučeni redovi i dati glasovi se ne diraju.
    expect(first.closedDeletion).toEqual(before.closedDeletion);
    expect(first.castBallot).toEqual(before.castBallot);
    expect(first.closedPageNesting).toEqual(before.closedPageNesting);
    expect(first.closedIdeaNesting).toEqual(before.closedIdeaNesting);

    // Idempotentno: drugi prolaz ne menja nijedan red.
    await runAll();
    expect(await snapshot()).toEqual(first);
    // Ništa se ne briše.
    const counts = await t.run(async (ctx) => [
      (await ctx.db.query("deletionRequests").collect()).length,
      (await ctx.db.query("deletionBallots").collect()).length,
      (await ctx.db.query("pageNestingRequests").collect()).length,
      (await ctx.db.query("nestingRequests").collect()).length,
    ]);
    expect(counts).toEqual([2, 2, 2, 2]);
  });
});
