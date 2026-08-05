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
