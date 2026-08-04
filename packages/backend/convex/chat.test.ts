/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NO_CURSOR = { numItems: 50, cursor: null };

describe("chat schema", () => {
  test("kanali, poruke, reakcije, unread i pretraga rade preko svojih indeksa", async () => {
    const t = convexTest(schema, modules);

    const seed = await t.run(async (ctx) => {
      const now = Date.now();
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
      const profileA = await makeProfile("a");
      const profileB = await makeProfile("b");

      const startupId = await ctx.db.insert("startups", {
        name: "Chat startup",
        description: "",
        createdByProfileId: profileA,
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

      const channelBase = {
        startupId,
        areaId: null,
        anchorType: null,
        anchorId: null,
        dmKey: null,
        isPrivate: false,
        lastMessageAt: now,
        lastMessagePreview: "",
        lastMessageAuthorId: null,
        messageCount: 0,
        createdByProfileId: profileA,
        archivedAt: null,
        createdAt: now,
      };

      const general = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "startup",
        name: "Opšte",
      });
      const areaChannel = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "area",
        areaId,
        name: "Dev",
      });
      const thread = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "thread",
        anchorType: "page",
        anchorId: "page_anchor_1",
        name: "Thread",
      });
      const dmKey = [profileA, profileB].sort().join(":");
      const dm = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "dm",
        isPrivate: true,
        dmKey,
        name: "DM",
      });

      await ctx.db.insert("chatMembers", {
        channelId: dm,
        profileId: profileB,
        startupId,
        role: "member",
        joinedAt: now,
        leftAt: null,
      });

      const messageBase = {
        startupId,
        authorProfileId: profileA,
        mentions: [profileB],
        kind: "text" as const,
        attachmentName: null,
        attachmentType: null,
        attachmentSize: null,
        voiceDurationMs: null,
        replyToMessageId: null,
        editedAt: null,
        createdAt: now,
      };
      const liveMessage = await ctx.db.insert("chatMessages", {
        ...messageBase,
        channelId: general,
        body: "Zdravo tim ananas",
        deletedAt: null,
      });
      await ctx.db.insert("chatMessages", {
        ...messageBase,
        channelId: general,
        body: "obrisana poruka",
        deletedAt: now,
      });

      await ctx.db.insert("chatReactions", {
        messageId: liveMessage,
        profileId: profileB,
        emoji: "👍",
        createdAt: now,
      });
      await ctx.db.insert("chatReads", {
        channelId: general,
        profileId: profileB,
        startupId,
        lastReadAt: 0,
        lastReadMessageId: null,
        unreadCount: 1,
        mentionCount: 1,
        notificationLevel: "mentions",
        updatedAt: now,
      });

      return {
        startupId,
        areaId,
        profileB,
        dmKey,
        general,
        areaChannel,
        thread,
        dm,
        liveMessage,
      };
    });

    await t.run(async (ctx) => {
      // Opšti kanal je jedinstven po (startup, kind) — osnov `startupChannel` helpera.
      const general = await ctx.db
        .query("chatChannels")
        .withIndex("by_startup_and_kind", (q) =>
          q
            .eq("startupId", seed.startupId)
            .eq("kind", "startup")
            .eq("archivedAt", null),
        )
        .unique();
      expect(general?._id).toBe(seed.general);

      const areaChannel = await ctx.db
        .query("chatChannels")
        .withIndex("by_area", (q) =>
          q.eq("areaId", seed.areaId).eq("archivedAt", null),
        )
        .unique();
      expect(areaChannel?._id).toBe(seed.areaChannel);

      // by_anchor — lazy thread lookup (sendToAnchor / channelForAnchor).
      const thread = await ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", "page_anchor_1"),
        )
        .unique();
      expect(thread?._id).toBe(seed.thread);

      // by_startup_and_dmKey — openDirectMessage idempotentnost.
      const dm = await ctx.db
        .query("chatChannels")
        .withIndex("by_startup_and_dmKey", (q) =>
          q.eq("startupId", seed.startupId).eq("dmKey", seed.dmKey),
        )
        .unique();
      expect(dm?._id).toBe(seed.dm);

      // Lista poruka uključuje tombstone; by_channel_active vraća samo žive.
      const all = await ctx.db
        .query("chatMessages")
        .withIndex("by_channel_and_createdAt", (q) =>
          q.eq("channelId", seed.general),
        )
        .collect();
      expect(all).toHaveLength(2);
      const active = await ctx.db
        .query("chatMessages")
        .withIndex("by_channel_active", (q) =>
          q.eq("channelId", seed.general).eq("deletedAt", null),
        )
        .collect();
      expect(active).toHaveLength(1);
      expect(active[0]._id).toBe(seed.liveMessage);

      // search_body — dokaz da search indeks (searchMessages) postoji i radi.
      const found = await ctx.db
        .query("chatMessages")
        .withSearchIndex("search_body", (q) =>
          q
            .search("body", "ananas")
            .eq("startupId", seed.startupId)
            .eq("channelId", seed.general)
            .eq("deletedAt", null),
        )
        .collect();
      expect(found).toHaveLength(1);
      expect(found[0]._id).toBe(seed.liveMessage);

      // toggleReaction lookup.
      const reaction = await ctx.db
        .query("chatReactions")
        .withIndex("by_message_and_profile_and_emoji", (q) =>
          q
            .eq("messageId", seed.liveMessage)
            .eq("profileId", seed.profileB)
            .eq("emoji", "👍"),
        )
        .unique();
      expect(reaction).not.toBeNull();

      // chatMembers by_profile_and_startup — skopirano skeniranje za listDirectMessages.
      const memberships = await ctx.db
        .query("chatMembers")
        .withIndex("by_profile_and_startup", (q) =>
          q.eq("profileId", seed.profileB).eq("startupId", seed.startupId),
        )
        .collect();
      expect(memberships).toHaveLength(1);
      expect(memberships[0].channelId).toBe(seed.dm);

      // Nivo obaveštenja živi na chatReads (odluka D), uparuje se preko by_profile_and_startup.
      const reads = await ctx.db
        .query("chatReads")
        .withIndex("by_profile_and_startup", (q) =>
          q.eq("profileId", seed.profileB).eq("startupId", seed.startupId),
        )
        .collect();
      expect(reads).toHaveLength(1);
      expect(reads[0].notificationLevel).toBe("mentions");
      expect(reads[0].unreadCount).toBe(1);
    });
  });

  test("sourceMessageId povezuje zadatak sa porukom iz koje je nastao", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        name: "a",
        email: "a@example.test",
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: "a",
        email: "a@example.test",
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const startupId = await ctx.db.insert("startups", {
        name: "S",
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
      const channelId = await ctx.db.insert("chatChannels", {
        startupId,
        kind: "startup",
        areaId: null,
        anchorType: null,
        anchorId: null,
        dmKey: null,
        name: "Opšte",
        isPrivate: false,
        lastMessageAt: now,
        lastMessagePreview: "",
        lastMessageAuthorId: null,
        messageCount: 0,
        createdByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
      });
      const messageId = await ctx.db.insert("chatMessages", {
        channelId,
        startupId,
        authorProfileId: profileId,
        body: "ideja za zadatak",
        mentions: [],
        kind: "text",
        attachmentName: null,
        attachmentType: null,
        attachmentSize: null,
        voiceDurationMs: null,
        replyToMessageId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: now,
      });

      const pageId = await ctx.db.insert("pages", {
        startupId,
        areaId,
        parentPageId: null,
        kind: "task",
        title: "Zadatak iz poruke",
        searchText: "zadatak iz poruke",
        revision: 0,
        position: 0,
        taskStatus: "backlog",
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        sourceMessageId: messageId,
        createdByProfileId: profileId,
        updatedByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const page = await ctx.db.get("pages", pageId);
      expect(page?.sourceMessageId).toBe(messageId);
    });
  });
});

async function seedChatWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const makePerson = async (name: string, role: "admin" | "member") => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name}@example.test`,
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: name,
        email: `${name}@example.test`,
        role,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };

    const owner = await makePerson("Owner", "admin");
    const member = await makePerson("Member", "member");
    const bystander = await makePerson("Bystander", "member");
    const outsider = await makePerson("Outsider", "member");

    const startupId = await ctx.db.insert("startups", {
      name: "Chat startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, member, bystander]) {
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
      key: "dev",
      label: "Dev",
      position: 0,
      createdAt: now,
    });
    // Opšti kanal u produkciji pravi migracija; ovde ga sejemo ručno.
    const general = await ctx.db.insert("chatChannels", {
      startupId,
      kind: "startup",
      areaId: null,
      anchorType: null,
      anchorId: null,
      dmKey: null,
      name: "Opšte",
      isPrivate: false,
      lastMessageAt: now,
      lastMessagePreview: "",
      lastMessageAuthorId: null,
      messageCount: 0,
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
    });

    return { now, owner, member, bystander, outsider, startupId, areaId, general };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|test-session` });

  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asMember: asPerson(seeded.member),
    asBystander: asPerson(seeded.bystander),
    asOutsider: asPerson(seeded.outsider),
  };
}

type ChatWorkspace = Awaited<ReturnType<typeof seedChatWorkspace>>;

function readFor(
  s: ChatWorkspace,
  channelId: Id<"chatChannels">,
  profileId: Id<"profiles">,
) {
  return s.t.run((ctx) =>
    ctx.db
      .query("chatReads")
      .withIndex("by_channel_and_profile", (q) =>
        q.eq("channelId", channelId).eq("profileId", profileId),
      )
      .unique(),
  );
}

describe("chat funkcije", () => {
  test("unread raste za primaoca, autor ostaje na nuli, čitanje nulira", async () => {
    const s = await seedChatWorkspace();
    for (const body of ["prva", "druga", "treća"]) {
      await s.asOwner.mutation(api.chat.sendMessage, {
        channelId: s.general,
        body,
      });
    }

    expect((await readFor(s, s.general, s.member.profileId))?.unreadCount).toBe(3);
    // Autor nikad ne dobija unread za svoju poruku.
    expect(await readFor(s, s.general, s.owner.profileId)).toBeNull();

    await s.asMember.mutation(api.chat.markChannelRead, { channelId: s.general });
    const cleared = await readFor(s, s.general, s.member.profileId);
    expect(cleared?.unreadCount).toBe(0);
    expect(cleared?.mentionCount).toBe(0);
  });

  test("pominjanje diže mentionCount", async () => {
    const s = await seedChatWorkspace();
    await s.asOwner.mutation(api.chat.sendMessage, {
      channelId: s.general,
      body: "hej Member",
      mentions: [s.member.profileId],
    });
    const read = await readFor(s, s.general, s.member.profileId);
    expect(read?.unreadCount).toBe(1);
    expect(read?.mentionCount).toBe(1);
  });

  test("outsider ne vidi listu niti šalje u startup", async () => {
    const s = await seedChatWorkspace();
    await expect(
      s.asOutsider.query(api.chat.listChannels, { startupId: s.startupId }),
    ).rejects.toThrow("Nemate pristup ovom startupu.");
    await expect(
      s.asOutsider.mutation(api.chat.sendMessage, {
        channelId: s.general,
        body: "upad",
      }),
    ).rejects.toThrow("Nemate pristup ovom startupu.");
  });

  test("DM je idempotentan i zatvoren za nečlana razgovora", async () => {
    const s = await seedChatWorkspace();
    const dm1 = await s.asOwner.mutation(api.chat.openDirectMessage, {
      startupId: s.startupId,
      otherProfileId: s.member.profileId,
    });
    const dm2 = await s.asMember.mutation(api.chat.openDirectMessage, {
      startupId: s.startupId,
      otherProfileId: s.owner.profileId,
    });
    expect(dm1).toBe(dm2);

    // Bystander je član startupa ali ne i DM-a → pada na channel-nivo dozvole.
    await expect(
      s.asBystander.query(api.chat.messages, {
        channelId: dm1,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
  });

  test("lazy thread nastaje pri prvoj poruci i idempotentan je", async () => {
    const s = await seedChatWorkspace();
    const pageId = await s.t.run((ctx) =>
      ctx.db.insert("pages", {
        startupId: s.startupId,
        areaId: s.areaId,
        parentPageId: null,
        kind: "task",
        title: "Zadatak",
        searchText: "zadatak",
        revision: 0,
        position: 0,
        taskStatus: "backlog",
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: s.now,
        createdByProfileId: s.owner.profileId,
        updatedByProfileId: s.owner.profileId,
        archivedAt: null,
        createdAt: s.now,
        updatedAt: s.now,
      }),
    );

    const before = await s.asOwner.query(api.chat.channelForAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(before).toBeNull();

    await s.asOwner.mutation(api.chat.sendToAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
      body: "prvo pitanje",
    });
    await s.asMember.mutation(api.chat.sendToAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
      body: "drugo pitanje",
    });

    const after = await s.asOwner.query(api.chat.channelForAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(after).not.toBeNull();

    const threads = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", pageId),
        )
        .collect(),
    );
    expect(threads).toHaveLength(1);
  });

  test("createChannel od poruke pravi message-thread, idempotentno", async () => {
    const s = await seedChatWorkspace();
    const messageId = await s.asOwner.mutation(api.chat.sendMessage, {
      channelId: s.general,
      body: "vredna poruka",
    });
    const threadId = await s.asMember.mutation(api.chat.createChannel, {
      fromMessageId: messageId,
    });
    const channel = await s.t.run((ctx) => ctx.db.get("chatChannels", threadId));
    expect(channel?.kind).toBe("thread");
    expect(channel?.anchorType).toBe("message");

    const again = await s.asOwner.mutation(api.chat.createChannel, {
      fromMessageId: messageId,
    });
    expect(again).toBe(threadId);
  });

  test("soft delete: telo se ne vraća, tombstone ostaje", async () => {
    const s = await seedChatWorkspace();
    const messageId = await s.asOwner.mutation(api.chat.sendMessage, {
      channelId: s.general,
      body: "obriši me",
    });
    await s.asOwner.mutation(api.chat.deleteMessage, { messageId });

    const page = await s.asOwner.query(api.chat.messages, {
      channelId: s.general,
      paginationOpts: NO_CURSOR,
    });
    const item = page.page.find((m) => m._id === messageId);
    expect(item?.deleted).toBe(true);
    expect(item?.body).toBe("");

    const active = await s.t.run((ctx) =>
      ctx.db
        .query("chatMessages")
        .withIndex("by_channel_active", (q) =>
          q.eq("channelId", s.general).eq("deletedAt", null),
        )
        .collect(),
    );
    expect(active.some((m) => m._id === messageId)).toBe(false);
  });

  test("izmenu radi samo autor; reakcija se prebacuje", async () => {
    const s = await seedChatWorkspace();
    const messageId = await s.asOwner.mutation(api.chat.sendMessage, {
      channelId: s.general,
      body: "original",
    });
    await expect(
      s.asMember.mutation(api.chat.editMessage, {
        messageId,
        body: "podmetnuto",
      }),
    ).rejects.toThrow("Možete izmeniti samo svoju poruku.");

    await s.asOwner.mutation(api.chat.editMessage, {
      messageId,
      body: "izmenjeno",
    });
    const edited = await s.t.run((ctx) => ctx.db.get("chatMessages", messageId));
    expect(edited?.body).toBe("izmenjeno");
    expect(edited?.editedAt).not.toBeNull();

    const first = await s.asMember.mutation(api.chat.toggleReaction, {
      messageId,
      emoji: "👍",
    });
    expect(first.reacted).toBe(true);
    const second = await s.asMember.mutation(api.chat.toggleReaction, {
      messageId,
      emoji: "👍",
    });
    expect(second.reacted).toBe(false);
  });

  test("opšti kanal se ne arhivira; samo admin pravi custom kanal", async () => {
    const s = await seedChatWorkspace();
    await expect(
      s.asOwner.mutation(api.chat.archiveChannel, { channelId: s.general }),
    ).rejects.toThrow("Opšti kanal se ne može arhivirati.");
    await expect(
      s.asMember.mutation(api.chat.createChannel, {
        startupId: s.startupId,
        name: "Random",
        isPrivate: false,
      }),
    ).rejects.toThrow("Potreban je administratorski pristup.");

    const customId = await s.asOwner.mutation(api.chat.createChannel, {
      startupId: s.startupId,
      name: "Random",
      isPrivate: false,
      memberProfileIds: [s.member.profileId],
    });
    const custom = await s.t.run((ctx) => ctx.db.get("chatChannels", customId));
    expect(custom?.kind).toBe("custom");

    const memberChannels = await s.asMember.query(api.chat.listChannels, {
      startupId: s.startupId,
    });
    expect(memberChannels.some((c) => c._id === customId)).toBe(true);
  });

  test("thread nad mišlju je vidljiv samo vlasniku misli", async () => {
    const s = await seedChatWorkspace();
    const thoughtId = await s.t.run((ctx) =>
      ctx.db.insert("thoughtNodes", {
        startupId: s.startupId,
        ownerProfileId: s.member.profileId,
        title: null,
        text: "privatna misao",
        x: 0,
        y: 0,
        color: "neutral",
        conversionCount: 0,
        lastConvertedPageId: null,
        lastConvertedAt: null,
        archivedAt: null,
        createdAt: s.now,
        updatedAt: s.now,
      }),
    );

    // Vlasnik (member) sme da otvori diskusiju.
    await s.asMember.mutation(api.chat.sendToAnchor, {
      startupId: s.startupId,
      anchorType: "thought",
      anchorId: thoughtId,
      body: "beleška uz misao",
    });
    // Drugi član startupa (owner) ne nasleđuje pristup tuđoj misli.
    await expect(
      s.asOwner.mutation(api.chat.sendToAnchor, {
        startupId: s.startupId,
        anchorType: "thought",
        anchorId: thoughtId,
        body: "tuđe",
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
  });
});

// Sedam ciljanih scenarija iz docs/mobile/zadaci/1-3-testovi.md. Svaki stoji sam
// i eksplicitno tvrdi svoju granicu; poziva se na iste helpere (seedChatWorkspace,
// readFor) kao blok iznad.
describe("Z1.3 — sedam scenarija iz specifikacije", () => {
  const TASK_FIELDS = (s: ChatWorkspace, title: string) => ({
    startupId: s.startupId,
    areaId: s.areaId,
    parentPageId: null,
    kind: "task" as const,
    title,
    searchText: title.toLowerCase(),
    revision: 0,
    position: 0,
    taskStatus: "backlog" as const,
    taskPriority: null,
    assigneeProfileId: null,
    dueDate: null,
    taskSortAt: s.now,
    createdByProfileId: s.owner.profileId,
    updatedByProfileId: s.owner.profileId,
    archivedAt: null,
    createdAt: s.now,
    updatedAt: s.now,
  });

  test("1 — član startupa ne čita niti piše u tuđi DM", async () => {
    const s = await seedChatWorkspace();
    const dmId = await s.asOwner.mutation(api.chat.openDirectMessage, {
      startupId: s.startupId,
      otherProfileId: s.member.profileId,
    });
    await s.asOwner.mutation(api.chat.sendMessage, {
      channelId: dmId,
      body: "privatno",
    });

    // Bystander je punopravan član startupa, ali ne i DM-a → channel-nivo dozvole.
    await expect(
      s.asBystander.query(api.chat.messages, {
        channelId: dmId,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
    await expect(
      s.asBystander.mutation(api.chat.sendMessage, {
        channelId: dmId,
        body: "upad",
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");

    // Oba sagovornika i dalje čitaju svoj razgovor.
    const ownerView = await s.asOwner.query(api.chat.messages, {
      channelId: dmId,
      paginationOpts: NO_CURSOR,
    });
    const memberView = await s.asMember.query(api.chat.messages, {
      channelId: dmId,
      paginationOpts: NO_CURSOR,
    });
    expect(ownerView.page).toHaveLength(1);
    expect(memberView.page).toHaveLength(1);
  });

  test("2 — thread nasleđuje dozvole entiteta (outsider ne vidi task, član ne vidi tuđu misao)", async () => {
    const s = await seedChatWorkspace();

    // 2a — startup-granica: outsider ne vidi zadatak, pa ni diskusiju o njemu.
    const pageId = await s.t.run((ctx) =>
      ctx.db.insert("pages", TASK_FIELDS(s, "Zadatak")),
    );
    await s.asOwner.mutation(api.chat.sendToAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
      body: "prvo pitanje",
    });
    const pageThread = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", pageId),
        )
        .unique(),
    );
    if (pageThread === null) throw new Error("Task-thread nije napravljen.");
    await expect(
      s.asOutsider.query(api.chat.messages, {
        channelId: pageThread._id,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom startupu.");

    // 2b — vlasnička granica: misao je privatna svom vlasniku; owner (admin) je ne nasleđuje.
    const thoughtId = await s.t.run((ctx) =>
      ctx.db.insert("thoughtNodes", {
        startupId: s.startupId,
        ownerProfileId: s.member.profileId,
        title: null,
        text: "privatna misao",
        x: 0,
        y: 0,
        color: "neutral",
        conversionCount: 0,
        lastConvertedPageId: null,
        lastConvertedAt: null,
        archivedAt: null,
        createdAt: s.now,
        updatedAt: s.now,
      }),
    );
    await s.asMember.mutation(api.chat.sendToAnchor, {
      startupId: s.startupId,
      anchorType: "thought",
      anchorId: thoughtId,
      body: "beleška uz misao",
    });
    const thoughtThread = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "thought").eq("anchorId", thoughtId),
        )
        .unique(),
    );
    if (thoughtThread === null) {
      throw new Error("Thread nad mišlju nije napravljen.");
    }
    // Pisanje u diskusiju tuđe misli — odbijeno i za admina.
    await expect(
      s.asOwner.mutation(api.chat.sendToAnchor, {
        startupId: s.startupId,
        anchorType: "thought",
        anchorId: thoughtId,
        body: "tuđe",
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
    // Čitanje diskusije tuđe misli — takođe odbijeno.
    await expect(
      s.asOwner.query(api.chat.messages, {
        channelId: thoughtThread._id,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
    // Vlasnik misli sme da čita svoju diskusiju.
    const ownerReads = await s.asMember.query(api.chat.messages, {
      channelId: thoughtThread._id,
      paginationOpts: NO_CURSOR,
    });
    expect(ownerReads.page.length).toBeGreaterThan(0);
  });

  test("3 — unread ne raste autoru, primaocima raste inkrementalno", async () => {
    const s = await seedChatWorkspace();
    for (const body of ["prva", "druga", "treća"]) {
      await s.asOwner.mutation(api.chat.sendMessage, {
        channelId: s.general,
        body,
      });
    }
    expect((await readFor(s, s.general, s.member.profileId))?.unreadCount).toBe(3);
    expect(
      (await readFor(s, s.general, s.bystander.profileId))?.unreadCount,
    ).toBe(3);
    // Autoru se chatReads red uopšte ne pravi (tvrdnja jača od „0").
    expect(await readFor(s, s.general, s.owner.profileId)).toBeNull();
  });

  test("4 — markChannelRead nulira unreadCount i mentionCount i pomera lastRead", async () => {
    const s = await seedChatWorkspace();
    const messageId = await s.asOwner.mutation(api.chat.sendMessage, {
      channelId: s.general,
      body: "hej Member",
      mentions: [s.member.profileId],
    });
    const before = await readFor(s, s.general, s.member.profileId);
    expect(before?.unreadCount).toBe(1);
    expect(before?.mentionCount).toBe(1);

    await s.asMember.mutation(api.chat.markChannelRead, {
      channelId: s.general,
    });
    const after = await readFor(s, s.general, s.member.profileId);
    expect(after?.unreadCount).toBe(0);
    expect(after?.mentionCount).toBe(0);
    expect(after?.lastReadMessageId).toBe(messageId);
    expect(after?.lastReadAt ?? 0).toBeGreaterThan(0);
  });

  test("5 — openDirectMessage vraća isti kanal bez obzira ko prvi pozove", async () => {
    const s = await seedChatWorkspace();
    const dm1 = await s.asOwner.mutation(api.chat.openDirectMessage, {
      startupId: s.startupId,
      otherProfileId: s.member.profileId,
    });
    const dm2 = await s.asMember.mutation(api.chat.openDirectMessage, {
      startupId: s.startupId,
      otherProfileId: s.owner.profileId,
    });
    expect(dm1).toBe(dm2);

    const dmKey = [s.owner.profileId, s.member.profileId].sort().join(":");
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_startup_and_dmKey", (q) =>
          q.eq("startupId", s.startupId).eq("dmKey", dmKey),
        )
        .collect(),
    );
    expect(rows).toHaveLength(1);

    // Granični slučaji: DM sa samim sobom i nečlan startupa.
    await expect(
      s.asOwner.mutation(api.chat.openDirectMessage, {
        startupId: s.startupId,
        otherProfileId: s.owner.profileId,
      }),
    ).rejects.toThrow("Ne možete otvoriti razgovor sa samim sobom.");
    await expect(
      s.asOutsider.mutation(api.chat.openDirectMessage, {
        startupId: s.startupId,
        otherProfileId: s.member.profileId,
      }),
    ).rejects.toThrow("Nemate pristup ovom startupu.");
  });

  test("6 — lazy thread nastaje tek pri prvoj poruci, tačno jednom", async () => {
    const s = await seedChatWorkspace();
    const pageId = await s.t.run((ctx) =>
      ctx.db.insert("pages", TASK_FIELDS(s, "Zadatak")),
    );

    const before = await s.asOwner.query(api.chat.channelForAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(before).toBeNull();

    await s.asOwner.mutation(api.chat.sendToAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
      body: "prvo",
    });
    await s.asMember.mutation(api.chat.sendToAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
      body: "drugo",
    });

    const after = await s.asOwner.query(api.chat.channelForAnchor, {
      startupId: s.startupId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(after).not.toBeNull();

    const threads = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", pageId),
        )
        .collect(),
    );
    expect(threads).toHaveLength(1);
  });

  test("7 — opšti kanal: implicitno članstvo i zabrana arhiviranja", async () => {
    const s = await seedChatWorkspace();

    // Opšti kanal nema nijedan chatMembers red — članstvo je implicitno.
    const generalMembers = await s.t.run((ctx) =>
      ctx.db
        .query("chatMembers")
        .withIndex("by_channel", (q) =>
          q.eq("channelId", s.general).eq("leftAt", null),
        )
        .collect(),
    );
    expect(generalMembers).toHaveLength(0);

    // Član bez chatMembers reda vidi kanal u listi i sme da piše.
    const channels = await s.asMember.query(api.chat.listChannels, {
      startupId: s.startupId,
    });
    expect(channels.some((c) => c._id === s.general)).toBe(true);
    await expect(
      s.asMember.mutation(api.chat.sendMessage, {
        channelId: s.general,
        body: "svima",
      }),
    ).resolves.toBeDefined();

    // Implicitni primaoci: ostali članovi startupa dobijaju unread.
    expect((await readFor(s, s.general, s.owner.profileId))?.unreadCount).toBe(1);
    expect(
      (await readFor(s, s.general, s.bystander.profileId))?.unreadCount,
    ).toBe(1);

    // Ne arhivira se — ni admin.
    await expect(
      s.asOwner.mutation(api.chat.archiveChannel, { channelId: s.general }),
    ).rejects.toThrow("Opšti kanal se ne može arhivirati.");

    // Kontrola: admin sme da arhivira običan (custom) kanal.
    const customId = await s.asOwner.mutation(api.chat.createChannel, {
      startupId: s.startupId,
      name: "Random",
      isPrivate: false,
    });
    await expect(
      s.asOwner.mutation(api.chat.archiveChannel, { channelId: customId }),
    ).resolves.toBeNull();
  });
});
