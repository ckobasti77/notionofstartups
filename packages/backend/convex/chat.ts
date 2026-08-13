import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  requireProfile,
  requireProfileInStartup,
  requireStartupMember,
} from "./lib/auth";
import { createNotification } from "./lib/notifications";
import {
  chatAnchorTypeValidator,
  chatChannelKindValidator,
  chatMemberRoleValidator,
  chatMessageKindValidator,
  chatNotificationLevelValidator,
  CHAT_CHANNELS_CAP,
  CHAT_EDIT_WINDOW_MS,
  CHAT_PREVIEW_LENGTH,
  CHAT_RECIPIENTS_CAP,
  CHAT_SEARCH_CAP,
  CHAT_UNREAD_SUMMARY_CAP,
  cleanRequiredText,
  MAX_CHAT_CHANNEL_MEMBERS,
  MAX_CHAT_MENTIONS,
  MAX_CHAT_MESSAGE_LENGTH,
} from "./lib/validators";
import { CHAT_PRESENCE_TTL_MS } from "./lib/chatPresence";
import {
  maxPageFileBytesFor,
  pageFileCategoryFor,
  cleanPageFileName,
} from "./lib/page_files";

// Klijent-neutralni chat sloj (web + mobilni troše isti API). Dizajn:
// docs/mobile/04-CHAT.md. Šema, chat validatori i notifikacioni tipovi već
// postoje; ovaj fajl je samo funkcijski sloj nad njima.

type ReadCtx = QueryCtx | MutationCtx;
type MessageKind = Doc<"chatMessages">["kind"];
type AnchorType = NonNullable<Doc<"chatChannels">["anchorType"]>;
type NotificationLevel = NonNullable<Doc<"chatReads">["notificationLevel"]>;
const MAX_CHANNEL_NAME_LENGTH = 120;
const MAX_EMOJI_LENGTH = 32;

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

// --- Enrichment validatori ------------------------------------------------

const chatProfileValidator = v.object({
  _id: v.id("profiles"),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

const chatChannelSummaryValidator = v.object({
  _id: v.id("chatChannels"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  kind: chatChannelKindValidator,
  areaId: v.union(v.id("startupAreas"), v.null()),
  anchorType: v.union(chatAnchorTypeValidator, v.null()),
  anchorId: v.union(v.string(), v.null()),
  dmKey: v.union(v.string(), v.null()),
  name: v.string(),
  isPrivate: v.boolean(),
  lastMessageAt: v.number(),
  lastMessagePreview: v.string(),
  lastMessageAuthorId: v.union(v.id("profiles"), v.null()),
  messageCount: v.number(),
  createdByProfileId: v.id("profiles"),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  // Izvedeno po korisniku koji čita:
  unreadCount: v.number(),
  mentionCount: v.number(),
  notificationLevel: chatNotificationLevelValidator,
  lastMessageAuthor: v.union(chatProfileValidator, v.null()),
  otherParticipant: v.union(chatProfileValidator, v.null()),
});

const chatReactionSummaryValidator = v.object({
  emoji: v.string(),
  count: v.number(),
  mine: v.boolean(),
});

const chatMessageItemValidator = v.object({
  _id: v.id("chatMessages"),
  _creationTime: v.number(),
  channelId: v.id("chatChannels"),
  startupId: v.id("startups"),
  authorProfileId: v.union(v.id("profiles"), v.null()),
  body: v.string(),
  mentions: v.array(v.id("profiles")),
  kind: chatMessageKindValidator,
  attachmentName: v.union(v.string(), v.null()),
  attachmentType: v.union(v.string(), v.null()),
  attachmentSize: v.union(v.number(), v.null()),
  voiceDurationMs: v.union(v.number(), v.null()),
  replyToMessageId: v.union(v.id("chatMessages"), v.null()),
  editedAt: v.union(v.number(), v.null()),
  deletedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  deleted: v.boolean(),
  author: v.union(chatProfileValidator, v.null()),
  reactions: v.array(chatReactionSummaryValidator),
  attachmentUrl: v.union(v.string(), v.null()),
});

const chatSearchResultValidator = v.object({
  _id: v.id("chatMessages"),
  channelId: v.id("chatChannels"),
  channelName: v.string(),
  body: v.string(),
  createdAt: v.number(),
  author: v.union(chatProfileValidator, v.null()),
});

type ChatProfileSummary = {
  _id: Id<"profiles">;
  displayName: string;
  avatarUrl: string | null;
};

// --- Osnovni helperi ------------------------------------------------------

function buildPreview(body: string, kind: MessageKind): string {
  if (kind === "file") return "📎 Prilog";
  if (kind === "voice") return "🎤 Glasovna poruka";
  const trimmed = body.trim();
  return trimmed.length <= CHAT_PREVIEW_LENGTH
    ? trimmed
    : trimmed.slice(0, CHAT_PREVIEW_LENGTH);
}

function normalizeMessageBody(body: string, kind: MessageKind): string {
  // Tekst mora imati sadržaj; prilog/glasovna smeju prazno telo (caption opciono).
  if (kind === "text") {
    return cleanRequiredText(body, "Poruka", MAX_CHAT_MESSAGE_LENGTH);
  }
  const cleaned = body.trim();
  if (cleaned.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(
      `Poruka može imati najviše ${MAX_CHAT_MESSAGE_LENGTH} znakova.`,
    );
  }
  return cleaned;
}

/** `[a, b].sort().join(":")` — DM kanal je isti bez obzira ko ga prvi otvori. */
function dmKeyFor(a: Id<"profiles">, b: Id<"profiles">): string {
  return [a, b].sort().join(":");
}

function otherIdFromDmKey(
  ctx: ReadCtx,
  dmKey: string | null,
  me: Id<"profiles">,
): Id<"profiles"> | null {
  if (dmKey === null) return null;
  const other = dmKey.split(":").find((part) => part !== me);
  if (other === undefined) return null;
  return ctx.db.normalizeId("profiles", other);
}

async function startupChannel(ctx: ReadCtx, startupId: Id<"startups">) {
  return await ctx.db
    .query("chatChannels")
    .withIndex("by_startup_and_kind", (q) =>
      q.eq("startupId", startupId).eq("kind", "startup").eq("archivedAt", null),
    )
    .unique();
}

async function getChatRead(
  ctx: ReadCtx,
  channelId: Id<"chatChannels">,
  profileId: Id<"profiles">,
) {
  return await ctx.db
    .query("chatReads")
    .withIndex("by_channel_and_profile", (q) =>
      q.eq("channelId", channelId).eq("profileId", profileId),
    )
    .unique();
}

type ChatReadPatch = {
  unreadCount?: number;
  mentionCount?: number;
  lastReadAt?: number;
  lastReadMessageId?: Id<"chatMessages"> | null;
  notificationLevel?: NotificationLevel;
};

async function upsertChatRead(
  ctx: MutationCtx,
  args: {
    channelId: Id<"chatChannels">;
    profileId: Id<"profiles">;
    startupId: Id<"startups">;
    existing: Doc<"chatReads"> | null;
    patch: ChatReadPatch;
  },
): Promise<void> {
  const now = Date.now();
  if (args.existing === null) {
    await ctx.db.insert("chatReads", {
      channelId: args.channelId,
      profileId: args.profileId,
      startupId: args.startupId,
      lastReadAt: args.patch.lastReadAt ?? 0,
      lastReadMessageId: args.patch.lastReadMessageId ?? null,
      unreadCount: args.patch.unreadCount ?? 0,
      mentionCount: args.patch.mentionCount ?? 0,
      ...(args.patch.notificationLevel === undefined
        ? {}
        : { notificationLevel: args.patch.notificationLevel }),
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch("chatReads", args.existing._id, {
    ...args.patch,
    updatedAt: now,
  });
}

async function getChatPresence(
  ctx: ReadCtx,
  channelId: Id<"chatChannels">,
  profileId: Id<"profiles">,
) {
  return await ctx.db
    .query("chatPresence")
    .withIndex("by_channel_and_profile", (q) =>
      q.eq("channelId", channelId).eq("profileId", profileId),
    )
    .unique();
}

/**
 * Da li primalac U OVOM TRENUTKU gleda baš ovaj kanal i stoji na dnu. To je
 * jedini slučaj u kome poruka ne pravi obaveštenje — video ju je uživo, kao na
 * WhatsApp-u. Sve ostalo zvoni: drugi kanal, skrolovan gore, pozadina, ugašena
 * app, drugi ekran, drugi uređaj.
 */
async function isPresentInChannel(
  ctx: ReadCtx,
  channelId: Id<"chatChannels">,
  profileId: Id<"profiles">,
  now: number,
): Promise<boolean> {
  const presence = await getChatPresence(ctx, channelId, profileId);
  return presence !== null && presence.expiresAt > now;
}

/** Thread/custom: slanje ili @-pominjanje čini korisnika članom (participacija). */
async function ensureThreadMember(
  ctx: MutationCtx,
  channel: Doc<"chatChannels">,
  profileId: Id<"profiles">,
): Promise<void> {
  const existing = await ctx.db
    .query("chatMembers")
    .withIndex("by_channel_and_profile", (q) =>
      q.eq("channelId", channel._id).eq("profileId", profileId),
    )
    .unique();
  if (existing === null) {
    await ctx.db.insert("chatMembers", {
      channelId: channel._id,
      profileId,
      startupId: channel.startupId,
      role: "member",
      joinedAt: Date.now(),
      leftAt: null,
    });
    return;
  }
  if (existing.leftAt !== null) {
    await ctx.db.patch("chatMembers", existing._id, { leftAt: null });
  }
}

// --- Dozvole (§3 dizajna) -------------------------------------------------

async function requireChannelAccess(
  ctx: ReadCtx,
  channelId: Id<"chatChannels">,
): Promise<{
  channel: Doc<"chatChannels">;
  profile: Doc<"profiles">;
  membership?: Doc<"chatMembers">;
}> {
  const channel = await ctx.db.get("chatChannels", channelId);
  if (channel === null || channel.archivedAt !== null) {
    throw new Error("Razgovor nije pronađen.");
  }

  // Član startupa je osnovni uslov za sve kanale.
  const { profile } = await requireStartupMember(ctx, channel.startupId);

  // Implicitno članstvo: ceo startup je unutra.
  if (channel.kind === "startup") return { channel, profile };
  if (channel.kind === "area" && !channel.isPrivate) return { channel, profile };

  // Thread nasleđuje pristup od svog entiteta.
  if (channel.kind === "thread") {
    await requireAnchorAccess(ctx, channel, profile);
    return { channel, profile };
  }

  // DM, custom, agent, privatna oblast: mora eksplicitno članstvo.
  const membership = await ctx.db
    .query("chatMembers")
    .withIndex("by_channel_and_profile", (q) =>
      q.eq("channelId", channelId).eq("profileId", profile._id),
    )
    .unique();
  if (membership === null || membership.leftAt !== null) {
    throw new Error("Nemate pristup ovom razgovoru.");
  }
  return { channel, profile, membership };
}

async function requireAnchorAccess(
  ctx: ReadCtx,
  channel: Doc<"chatChannels">,
  profile: Doc<"profiles">,
): Promise<void> {
  if (channel.anchorType === null || channel.anchorId === null) {
    throw new Error("Diskusija nije pronađena.");
  }
  await requireAnchorAccessById(
    ctx,
    channel.startupId,
    channel.anchorType,
    channel.anchorId,
    profile,
  );
}

/**
 * Thread nasleđuje pristup od entiteta za koji je zakačen. `thought` je jedini
 * owner-privatan entitet; ostali su startup-scoped (članstvo već provereno).
 * `message` nasleđuje pristup od kanala izvorne poruke (rekurzija ≤ 1 nivo).
 */
async function requireAnchorAccessById(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  anchorType: AnchorType,
  anchorId: string,
  profile: Doc<"profiles">,
): Promise<void> {
  const notFound = () => new Error("Diskusija nije pronađena.");
  const denied = () => new Error("Nemate pristup ovom razgovoru.");

  switch (anchorType) {
    case "page": {
      const id = ctx.db.normalizeId("pages", anchorId);
      const doc = id === null ? null : await ctx.db.get("pages", id);
      if (doc === null || doc.archivedAt !== null || doc.startupId !== startupId) {
        throw notFound();
      }
      return;
    }
    case "idea": {
      const id = ctx.db.normalizeId("ideaNodes", anchorId);
      const doc = id === null ? null : await ctx.db.get("ideaNodes", id);
      if (doc === null || doc.archivedAt !== null || doc.startupId !== startupId) {
        throw notFound();
      }
      return;
    }
    case "thought": {
      const id = ctx.db.normalizeId("thoughtNodes", anchorId);
      const doc = id === null ? null : await ctx.db.get("thoughtNodes", id);
      if (doc === null || doc.archivedAt !== null || doc.startupId !== startupId) {
        throw notFound();
      }
      // Owner-privatno: thread nad tuđom mišlju ne postoji za druge.
      if (doc.ownerProfileId !== profile._id) throw denied();
      return;
    }
    case "deletionRequest": {
      const id = ctx.db.normalizeId("deletionRequests", anchorId);
      const doc = id === null ? null : await ctx.db.get("deletionRequests", id);
      if (doc === null || doc.startupId !== startupId) throw notFound();
      return;
    }
    case "message": {
      const id = ctx.db.normalizeId("chatMessages", anchorId);
      const doc = id === null ? null : await ctx.db.get("chatMessages", id);
      if (doc === null || doc.deletedAt !== null || doc.startupId !== startupId) {
        throw notFound();
      }
      // Nasleđuje pristup od kanala izvorne poruke.
      await requireChannelAccess(ctx, doc.channelId);
      return;
    }
    default: {
      throw notFound();
    }
  }
}

async function anchorTitle(
  ctx: ReadCtx,
  anchorType: AnchorType,
  anchorId: string,
): Promise<string> {
  switch (anchorType) {
    case "page": {
      const id = ctx.db.normalizeId("pages", anchorId);
      const doc = id === null ? null : await ctx.db.get("pages", id);
      return (doc?.title ?? "").trim() || "Diskusija";
    }
    case "idea": {
      const id = ctx.db.normalizeId("ideaNodes", anchorId);
      const doc = id === null ? null : await ctx.db.get("ideaNodes", id);
      return (doc?.title ?? "").trim() || "Ideja";
    }
    case "thought": {
      const id = ctx.db.normalizeId("thoughtNodes", anchorId);
      const doc = id === null ? null : await ctx.db.get("thoughtNodes", id);
      return (doc?.title ?? "").trim() || "Misao";
    }
    case "deletionRequest": {
      const id = ctx.db.normalizeId("deletionRequests", anchorId);
      const doc = id === null ? null : await ctx.db.get("deletionRequests", id);
      return (doc?.targetTitle ?? "").trim() || "Zahtev za brisanje";
    }
    case "message": {
      const id = ctx.db.normalizeId("chatMessages", anchorId);
      const doc = id === null ? null : await ctx.db.get("chatMessages", id);
      return buildPreview(doc?.body ?? "", "text") || "Diskusija";
    }
    default:
      return "Diskusija";
  }
}

// --- Primaoci, slanje, sistemske poruke -----------------------------------

async function channelRecipients(
  ctx: ReadCtx,
  channel: Doc<"chatChannels">,
): Promise<Array<Id<"profiles">>> {
  const implicit =
    channel.kind === "startup" ||
    (channel.kind === "area" && !channel.isPrivate);

  if (implicit) {
    const members = await ctx.db
      .query("startupMembers")
      .withIndex("by_startupId_and_archivedAt_and_profileId", (q) =>
        q.eq("startupId", channel.startupId).eq("archivedAt", null),
      )
      .take(CHAT_RECIPIENTS_CAP);
    return members.map((m) => m.profileId);
  }

  const members = await ctx.db
    .query("chatMembers")
    .withIndex("by_channel", (q) =>
      q.eq("channelId", channel._id).eq("leftAt", null),
    )
    .take(CHAT_RECIPIENTS_CAP);
  return members.map((m) => m.profileId);
}

type InsertMessageFields = {
  body: string;
  kind: MessageKind;
  mentions: Array<Id<"profiles">>;
  replyToMessageId: Id<"chatMessages"> | null;
  attachmentStorageId?: Id<"_storage">;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  voiceDurationMs: number | null;
};

/** Jezgro slanja: upis + denormalizacija kanala + inkrementalni unread + notifikacije. */
async function insertMessage(
  ctx: MutationCtx,
  channel: Doc<"chatChannels">,
  authorProfileId: Id<"profiles"> | null,
  authorName: string | null,
  fields: InsertMessageFields,
): Promise<Id<"chatMessages">> {
  const now = Date.now();

  const messageId = await ctx.db.insert("chatMessages", {
    channelId: channel._id,
    startupId: channel.startupId,
    authorProfileId,
    body: fields.body,
    mentions: fields.mentions,
    kind: fields.kind,
    ...(fields.attachmentStorageId === undefined
      ? {}
      : { attachmentStorageId: fields.attachmentStorageId }),
    attachmentName: fields.attachmentName,
    attachmentType: fields.attachmentType,
    attachmentSize: fields.attachmentSize,
    voiceDurationMs: fields.voiceDurationMs,
    replyToMessageId: fields.replyToMessageId,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
  });

  // Denormalizovani pregled kanala — bez ovoga je lista razgovora N+1.
  await ctx.db.patch("chatChannels", channel._id, {
    lastMessageAt: now,
    lastMessagePreview: buildPreview(fields.body, fields.kind),
    lastMessageAuthorId: authorProfileId,
    messageCount: channel.messageCount + 1,
  });

  // Sistemske poruke ne prave unread ni obaveštenja (04-CHAT.md 5).
  if (fields.kind === "system") return messageId;

  const mentionSet = new Set(fields.mentions);
  const recipients = await channelRecipients(ctx, channel);

  for (const recipientId of recipients) {
    if (authorProfileId !== null && recipientId === authorProfileId) continue;

    const read = await getChatRead(ctx, channel._id, recipientId);
    const isMentioned = mentionSet.has(recipientId);

    // Unread se održava inkrementalno, ne prebrojava se pri čitanju.
    await upsertChatRead(ctx, {
      channelId: channel._id,
      profileId: recipientId,
      startupId: channel.startupId,
      existing: read,
      patch: {
        unreadCount: (read?.unreadCount ?? 0) + 1,
        mentionCount: (read?.mentionCount ?? 0) + (isMentioned ? 1 : 0),
      },
    });

    const level: NotificationLevel = read?.notificationLevel ?? "all";
    if (level === "none") continue;
    if (level === "mentions" && !isMentioned) continue;

    // Jedini izuzetak od „svaka poruka zvoni": primalac gleda BAŠ ovaj kanal i
    // stoji na dnu. Guard stoji POSLE `upsertChatRead` namerno — nepročitano se i
    // dalje broji, pa badge ostaje tačan i kad `markChannelRead` sa klijenta padne.
    // Pominjanje nema izuzetak od izuzetka: ako gledaš poruku u kojoj te neko
    // pomenuo, video si je.
    if (await isPresentInChannel(ctx, channel._id, recipientId, now)) continue;

    const type = isMentioned
      ? "chat_mention"
      : channel.kind === "dm"
        ? "chat_dm"
        : "chat_message";

    // createNotification radi self-notify/membership guard, dedupe i push.
    await createNotification(ctx, {
      recipientProfileId: recipientId,
      startupId: channel.startupId,
      type,
      title:
        channel.kind === "dm"
          ? authorName ?? "Nova poruka"
          : `#${channel.name}`,
      body: buildPreview(fields.body, fields.kind),
      targetType: "chat",
      targetId: channel._id,
      actorProfileId: authorProfileId,
      /**
       * Ključ po PORUCI, ne po minutu. Raniji ključ
       * (`chat:<channel>:<recipient>:<minut>`) je bio kanta od jednog kalendarskog
       * minuta: prva poruka prođe, a sve ostale `createNotification` tiho odbaci
       * na `by_dedupeKey` proveri — korisnik je dobio jedno obaveštenje pa tišinu.
       * Ovako zaštita od dvostrukog upisa (OCC retry ponovo izvrši celu mutaciju)
       * ostaje, a prigušenje nestaje: svaka poruka zvoni.
       */
      dedupeKey: `chat:${messageId}:${recipientId}`,
    });
  }

  return messageId;
}

async function postSystemMessage(
  ctx: MutationCtx,
  channel: Doc<"chatChannels">,
  body: string,
): Promise<Id<"chatMessages">> {
  return await insertMessage(ctx, channel, null, null, {
    body,
    kind: "system",
    mentions: [],
    replyToMessageId: null,
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    voiceDurationMs: null,
  });
}

/** Most ka kanalu oblasti (ili opštem) — tim vidi da je diskusija otvorena. */
async function postAnchorBridge(
  ctx: MutationCtx,
  thread: Doc<"chatChannels">,
  actor: Doc<"profiles">,
): Promise<void> {
  let target: Doc<"chatChannels"> | null = null;
  if (thread.anchorType === "page" && thread.anchorId !== null) {
    const pageId = ctx.db.normalizeId("pages", thread.anchorId);
    const page = pageId === null ? null : await ctx.db.get("pages", pageId);
    if (page !== null) {
      target = await ctx.db
        .query("chatChannels")
        .withIndex("by_area", (q) =>
          q.eq("areaId", page.areaId).eq("archivedAt", null),
        )
        .first();
    }
  }
  if (target === null) target = await startupChannel(ctx, thread.startupId);
  // Migracija kanala oblasti je van ovog zadatka — tiho preskoči ako ne postoji.
  if (target === null) return;
  await postSystemMessage(
    ctx,
    target,
    `${actor.displayName} je otvorio/la diskusiju: „${thread.name}”`,
  );
}

async function createThreadForAnchor(
  ctx: MutationCtx,
  startupId: Id<"startups">,
  anchorType: AnchorType,
  anchorId: string,
  creator: Doc<"profiles">,
): Promise<Doc<"chatChannels">> {
  const now = Date.now();
  const channelId = await ctx.db.insert("chatChannels", {
    startupId,
    kind: "thread",
    areaId: null,
    anchorType,
    anchorId,
    dmKey: null,
    name: await anchorTitle(ctx, anchorType, anchorId),
    isPrivate: false,
    lastMessageAt: now,
    lastMessagePreview: "",
    lastMessageAuthorId: null,
    messageCount: 0,
    createdByProfileId: creator._id,
    archivedAt: null,
    createdAt: now,
  });
  const channel = await ctx.db.get("chatChannels", channelId);
  if (channel === null) throw new Error("Kreiranje razgovora nije uspelo.");
  await postAnchorBridge(ctx, channel, creator);
  return channel;
}

// --- Profil sažeci za enrichment ------------------------------------------

async function profileSummaries(
  ctx: ReadCtx,
  ids: Array<Id<"profiles">>,
): Promise<Map<Id<"profiles">, ChatProfileSummary | null>> {
  const unique = [...new Set(ids)];
  const entries = await Promise.all(
    unique.map(async (id) => {
      const profile = await ctx.db.get("profiles", id);
      return [
        id,
        profile === null
          ? null
          : {
              _id: profile._id,
              displayName: profile.displayName,
              avatarUrl:
                profile.avatarStorageId === undefined
                  ? null
                  : await ctx.storage.getUrl(profile.avatarStorageId),
            },
      ] as const;
    }),
  );
  return new Map(entries);
}

function summarizeChannel(
  channel: Doc<"chatChannels">,
  read: Doc<"chatReads"> | null,
  lastMessageAuthor: ChatProfileSummary | null,
  otherParticipant: ChatProfileSummary | null,
) {
  return {
    ...channel,
    unreadCount: read?.unreadCount ?? 0,
    mentionCount: read?.mentionCount ?? 0,
    notificationLevel: read?.notificationLevel ?? "all",
    lastMessageAuthor,
    otherParticipant,
  };
}

async function decorateChannels(
  ctx: ReadCtx,
  channels: Array<Doc<"chatChannels">>,
  me: Id<"profiles">,
) {
  const reads = await Promise.all(
    channels.map((channel) => getChatRead(ctx, channel._id, me)),
  );
  const authorIds = channels
    .map((channel) => channel.lastMessageAuthorId)
    .filter(isNonNull);
  const otherIds = channels
    .map((channel) => otherIdFromDmKey(ctx, channel.dmKey, me))
    .filter(isNonNull);
  const summaries = await profileSummaries(ctx, [...authorIds, ...otherIds]);

  return channels.map((channel, index) => {
    const otherId =
      channel.kind === "dm"
        ? otherIdFromDmKey(ctx, channel.dmKey, me)
        : null;
    return summarizeChannel(
      channel,
      reads[index],
      channel.lastMessageAuthorId === null
        ? null
        : summaries.get(channel.lastMessageAuthorId) ?? null,
      otherId === null ? null : summaries.get(otherId) ?? null,
    );
  });
}

async function messageReactions(
  ctx: QueryCtx,
  messageId: Id<"chatMessages">,
  me: Id<"profiles">,
) {
  const rows = await ctx.db
    .query("chatReactions")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .take(200);
  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const row of rows) {
    const current =
      byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false };
    current.count += 1;
    if (row.profileId === me) current.mine = true;
    byEmoji.set(row.emoji, current);
  }
  return [...byEmoji.values()];
}

async function enrichMessages(
  ctx: QueryCtx,
  rows: Array<Doc<"chatMessages">>,
  me: Id<"profiles">,
) {
  const authorIds = rows.map((row) => row.authorProfileId).filter(isNonNull);
  const summaries = await profileSummaries(ctx, authorIds);

  return await Promise.all(
    rows.map(async (message) => {
      const deleted = message.deletedAt !== null;
      const reactions = deleted
        ? []
        : await messageReactions(ctx, message._id, me);
      const attachmentUrl =
        !deleted && message.attachmentStorageId !== undefined
          ? await ctx.storage.getUrl(message.attachmentStorageId)
          : null;
      return {
        _id: message._id,
        _creationTime: message._creationTime,
        channelId: message.channelId,
        startupId: message.startupId,
        authorProfileId: message.authorProfileId,
        // Obrisana poruka ne nosi telo/prilog u payload-u.
        body: deleted ? "" : message.body,
        mentions: deleted ? [] : message.mentions,
        kind: message.kind,
        attachmentName: deleted ? null : message.attachmentName,
        attachmentType: deleted ? null : message.attachmentType,
        attachmentSize: deleted ? null : message.attachmentSize,
        voiceDurationMs: deleted ? null : message.voiceDurationMs,
        replyToMessageId: message.replyToMessageId,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        createdAt: message.createdAt,
        deleted,
        author:
          message.authorProfileId === null
            ? null
            : summaries.get(message.authorProfileId) ?? null,
        reactions,
        attachmentUrl,
      };
    }),
  );
}

// --- Validacija ulaza -----------------------------------------------------

const attachmentRejectionReasonValidator = v.union(
  v.literal("unsupported"),
  v.literal("too_large"),
);

type AttachmentRejection = {
  reason: "unsupported" | "too_large";
  message: string;
};

/**
 * Granice priloga na JEDNOM mestu: predprovera pre izdavanja upload URL-a
 * (`generateUploadUrl`) i konačna provera nad serverskim metapodacima
 * (`resolveAttachment`) dele isti tekst — korisnik ne sme da dobije dve različite
 * poruke za istu granicu.
 *
 * Granice su namerno ISTE kao za priloge stranica (`lib/page_files.ts`): jedan
 * spisak dozvoljenih tipova i jedan skup granica za ceo proizvod. Drugi, paralelni
 * spisak samo za chat bi se vremenom razišao.
 */
function attachmentRejection(
  contentType: string | undefined,
  name: string,
  size: number,
): AttachmentRejection | null {
  const category = pageFileCategoryFor(contentType, name);
  if (category === null) {
    return {
      reason: "unsupported",
      message: `Ovaj tip fajla nije podržan${
        contentType ? `: ${contentType}` : ""
      }.`,
    };
  }
  const maxBytes = maxPageFileBytesFor(category);
  if (size > maxBytes) {
    return {
      reason: "too_large",
      message: `Prilog može imati najviše ${Math.round(
        maxBytes / (1024 * 1024),
      )} MB.`,
    };
  }
  return null;
}

/**
 * Da tuđi ili već zakačen blob nikada ne bude obrisan, provera ide PRE svake
 * grane koja briše (obrazac `pageFiles.attach`). Bez nje bi neko sa poznatim
 * `storageId`-jem mogao da namerno pošalje prilog sa lažnim imenom, dobije
 * odbijanje — i usput obriše tuđ fajl.
 */
async function requireUnattachedBlob(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const onPage = await ctx.db
    .query("pageFiles")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  const onMessage = await ctx.db
    .query("chatMessages")
    .withIndex("by_attachmentStorageId", (q) =>
      q.eq("attachmentStorageId", storageId),
    )
    .first();
  if (onPage !== null || onMessage !== null) {
    throw new Error("Ovaj fajl je već zakačen.");
  }
}

type ResolvedAttachment =
  | {
      ok: true;
      name: string | null;
      type: string | null;
      size: number | null;
    }
  | ({ ok: false } & AttachmentRejection);

/**
 * Prilog poruke: tip i veličina se čitaju SA SERVERA, ne iz argumenata. Klijent
 * šalje `attachmentType`/`attachmentSize` samo kao nagoveštaj — o njima zavise i
 * prikaz i potrošnja, pa mu se ne veruje (isti obrazac kao `pageFiles.ts:222–242`).
 *
 * Odbijanje se VRAĆA, ne baca: `ctx.storage.delete` je deo iste transakcije, pa bi
 * ga `throw` poništio i blob bi trajno ostao bez reference (zato `pageFiles.attach`
 * radi isto). Ovako brisanje i odbijanje prolaze zajedno.
 */
async function resolveAttachment(
  ctx: MutationCtx,
  input: {
    storageId: Id<"_storage"> | undefined;
    name: string | undefined;
    type: string | undefined;
    size: number | undefined;
  },
): Promise<ResolvedAttachment> {
  if (input.storageId === undefined) {
    return {
      ok: true,
      name: input.name ?? null,
      type: input.type ?? null,
      size: input.size ?? null,
    };
  }
  const metadata = await ctx.db.system.get("_storage", input.storageId);
  if (metadata === null) throw new Error("Prilog nije pronađen.");
  // Ime iz clipboard-a ume da bude prazno — rezerva umesto pada na praznom stringu.
  const name = cleanPageFileName(input.name?.trim() || "prilog");
  const rejection = attachmentRejection(
    metadata.contentType,
    name,
    metadata.size,
  );
  if (rejection !== null) {
    await requireUnattachedBlob(ctx, input.storageId);
    await ctx.storage.delete(input.storageId);
    return { ok: false, ...rejection };
  }
  return {
    ok: true,
    name,
    type: metadata.contentType ?? "application/octet-stream",
    size: metadata.size,
  };
}

async function validateMentions(
  ctx: ReadCtx,
  startupId: Id<"startups">,
  mentions: Array<Id<"profiles">> | undefined,
): Promise<Array<Id<"profiles">>> {
  if (mentions === undefined || mentions.length === 0) return [];
  if (mentions.length > MAX_CHAT_MENTIONS) {
    throw new Error(`Najviše ${MAX_CHAT_MENTIONS} pominjanja po poruci.`);
  }
  const unique = [...new Set(mentions)];
  for (const profileId of unique) {
    await requireProfileInStartup(ctx, startupId, profileId);
  }
  return unique;
}

async function validateReplyTo(
  ctx: ReadCtx,
  channelId: Id<"chatChannels">,
  replyToMessageId: Id<"chatMessages"> | undefined,
): Promise<Id<"chatMessages"> | null> {
  if (replyToMessageId === undefined) return null;
  const target = await ctx.db.get("chatMessages", replyToMessageId);
  if (target === null || target.channelId !== channelId) {
    throw new Error("Poruka na koju odgovarate ne postoji u ovom razgovoru.");
  }
  return replyToMessageId;
}

// --- Upiti ----------------------------------------------------------------

export const listChannels = query({
  args: { startupId: v.id("startups") },
  returns: v.array(chatChannelSummaryValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);

    const seen = new Map<Id<"chatChannels">, Doc<"chatChannels">>();

    // Javni: opšti kanal + javne oblasti.
    const general = await startupChannel(ctx, args.startupId);
    if (general !== null) seen.set(general._id, general);

    const areaChannels = await ctx.db
      .query("chatChannels")
      .withIndex("by_startup_and_kind", (q) =>
        q.eq("startupId", args.startupId).eq("kind", "area").eq("archivedAt", null),
      )
      .take(CHAT_CHANNELS_CAP);
    for (const channel of areaChannels) {
      if (!channel.isPrivate) seen.set(channel._id, channel);
    }

    // Eksplicitni: DM, custom, thread, privatne oblasti.
    const memberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_profile_and_startup", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("startupId", args.startupId)
          .eq("leftAt", null),
      )
      .take(CHAT_CHANNELS_CAP);
    for (const membership of memberships) {
      if (seen.has(membership.channelId)) continue;
      const channel = await ctx.db.get("chatChannels", membership.channelId);
      if (channel !== null && channel.archivedAt === null) {
        seen.set(channel._id, channel);
      }
    }

    const channels = [...seen.values()]
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, CHAT_CHANNELS_CAP);

    return await decorateChannels(ctx, channels, profile._id);
  },
});

export const messages = query({
  args: {
    channelId: v.id("chatChannels"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(chatMessageItemValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireChannelAccess(ctx, args.channelId);
    // Uključuje soft-obrisane (prikazuju se kao „Poruka je obrisana").
    const page = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel_and_createdAt", (q) =>
        q.eq("channelId", args.channelId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: await enrichMessages(ctx, page.page, profile._id) };
  },
});

export const channelForAnchor = query({
  args: {
    startupId: v.id("startups"),
    anchorType: chatAnchorTypeValidator,
    anchorId: v.string(),
  },
  returns: v.union(chatChannelSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const channel = await ctx.db
      .query("chatChannels")
      .withIndex("by_anchor", (q) =>
        q.eq("anchorType", args.anchorType).eq("anchorId", args.anchorId),
      )
      .unique();
    if (
      channel === null ||
      channel.archivedAt !== null ||
      channel.startupId !== args.startupId
    ) {
      return null;
    }
    // Pristup (thought/message nasleđuju).
    await requireAnchorAccessById(
      ctx,
      args.startupId,
      args.anchorType,
      args.anchorId,
      profile,
    );
    const read = await getChatRead(ctx, channel._id, profile._id);
    const summaries = await profileSummaries(
      ctx,
      channel.lastMessageAuthorId === null ? [] : [channel.lastMessageAuthorId],
    );
    return summarizeChannel(
      channel,
      read,
      channel.lastMessageAuthorId === null
        ? null
        : summaries.get(channel.lastMessageAuthorId) ?? null,
      null,
    );
  },
});

/**
 * Aktivni članovi kanala — jedan `withIndex` nad `by_channel` (`leftAt: null`),
 * bez skeniranja. Vidi ih svako ko i sam ima pristup kanalu; menja ih samo admin
 * kroz `setChannelMembers`.
 */
export const channelMembers = query({
  args: { channelId: v.id("chatChannels") },
  returns: v.array(
    v.object({
      profile: chatProfileValidator,
      role: chatMemberRoleValidator,
    }),
  ),
  handler: async (ctx, args) => {
    await requireChannelAccess(ctx, args.channelId);
    const rows = await ctx.db
      .query("chatMembers")
      .withIndex("by_channel", (q) =>
        q.eq("channelId", args.channelId).eq("leftAt", null),
      )
      .take(MAX_CHAT_CHANNEL_MEMBERS + 1);
    const summaries = await profileSummaries(
      ctx,
      rows.map((row) => row.profileId),
    );
    return rows.flatMap((row) => {
      const profile = summaries.get(row.profileId) ?? null;
      // Obrisan profil ostavlja članstvo bez imena — red se izostavlja umesto da
      // se prikaže prazan (isti izbor kao `decorateChannels`).
      return profile === null ? [] : [{ profile, role: row.role }];
    });
  },
});

export const unreadSummary = query({
  args: {},
  returns: v.object({
    total: v.object({
      unreadCount: v.number(),
      mentionCount: v.number(),
    }),
    byStartup: v.array(
      v.object({
        startupId: v.id("startups"),
        unreadCount: v.number(),
        mentionCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const reads = await ctx.db
      .query("chatReads")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(CHAT_UNREAD_SUMMARY_CAP);

    let totalUnread = 0;
    let totalMention = 0;
    const byStartup = new Map<
      Id<"startups">,
      { unreadCount: number; mentionCount: number }
    >();
    for (const read of reads) {
      totalUnread += read.unreadCount;
      totalMention += read.mentionCount;
      const current =
        byStartup.get(read.startupId) ?? { unreadCount: 0, mentionCount: 0 };
      current.unreadCount += read.unreadCount;
      current.mentionCount += read.mentionCount;
      byStartup.set(read.startupId, current);
    }

    return {
      total: { unreadCount: totalUnread, mentionCount: totalMention },
      byStartup: [...byStartup.entries()].map(([startupId, counts]) => ({
        startupId,
        unreadCount: counts.unreadCount,
        mentionCount: counts.mentionCount,
      })),
    };
  },
});

export const listDirectMessages = query({
  args: { startupId: v.id("startups") },
  returns: v.array(chatChannelSummaryValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const memberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_profile_and_startup", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("startupId", args.startupId)
          .eq("leftAt", null),
      )
      .take(CHAT_CHANNELS_CAP);

    const channels: Array<Doc<"chatChannels">> = [];
    for (const membership of memberships) {
      const channel = await ctx.db.get("chatChannels", membership.channelId);
      if (channel !== null && channel.archivedAt === null && channel.kind === "dm") {
        channels.push(channel);
      }
    }
    channels.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    return await decorateChannels(ctx, channels, profile._id);
  },
});

export const listFollowedThreads = query({
  args: { startupId: v.id("startups") },
  returns: v.array(chatChannelSummaryValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const memberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_profile_and_startup", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("startupId", args.startupId)
          .eq("leftAt", null),
      )
      .take(CHAT_CHANNELS_CAP);

    const channels: Array<Doc<"chatChannels">> = [];
    for (const membership of memberships) {
      const channel = await ctx.db.get("chatChannels", membership.channelId);
      if (
        channel !== null &&
        channel.archivedAt === null &&
        channel.kind === "thread"
      ) {
        channels.push(channel);
      }
    }
    channels.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    return await decorateChannels(ctx, channels, profile._id);
  },
});

export const searchMessages = query({
  args: {
    startupId: v.id("startups"),
    term: v.string(),
    channelId: v.optional(v.id("chatChannels")),
  },
  returns: v.array(chatSearchResultValidator),
  handler: async (ctx, args) => {
    // Poziv je PROVERA PRISTUPA, ne mrtav kod — bez njega pretraga chata postaje
    // javna. Briše se samo destrukturisanje (`profile` se u handleru ne koristi).
    await requireStartupMember(ctx, args.startupId);
    const term = args.term.trim();
    if (term.length === 0) return [];

    const rows = await ctx.db
      .query("chatMessages")
      .withSearchIndex("search_body", (q) => {
        const base = q
          .search("body", term)
          .eq("startupId", args.startupId)
          .eq("deletedAt", null);
        return args.channelId === undefined
          ? base
          : base.eq("channelId", args.channelId);
      })
      .take(CHAT_SEARCH_CAP);

    // Post-filter po pristupu — indeks ne poznaje DM/privatne dozvole.
    const access = new Map<Id<"chatChannels">, string | null>();
    const visible: Array<Doc<"chatMessages">> = [];
    for (const message of rows) {
      if (!access.has(message.channelId)) {
        try {
          const { channel } = await requireChannelAccess(ctx, message.channelId);
          access.set(message.channelId, channel.name);
        } catch {
          access.set(message.channelId, null);
        }
      }
      if (access.get(message.channelId) !== null) visible.push(message);
    }

    const summaries = await profileSummaries(
      ctx,
      visible.map((message) => message.authorProfileId).filter(isNonNull),
    );

    return visible.map((message) => ({
      _id: message._id,
      channelId: message.channelId,
      channelName: access.get(message.channelId) ?? "",
      body: message.body,
      createdAt: message.createdAt,
      author:
        message.authorProfileId === null
          ? null
          : summaries.get(message.authorProfileId) ?? null,
    }));
  },
});

// --- Mutacije -------------------------------------------------------------

export const sendMessage = mutation({
  args: {
    channelId: v.id("chatChannels"),
    body: v.string(),
    kind: v.optional(chatMessageKindValidator),
    replyToMessageId: v.optional(v.id("chatMessages")),
    mentions: v.optional(v.array(v.id("profiles"))),
    attachmentStorageId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
    attachmentSize: v.optional(v.number()),
    voiceDurationMs: v.optional(v.number()),
  },
  // Odbijen prilog se VRAĆA umesto da se baci — vidi `resolveAttachment`: samo
  // tako brisanje siročeta preživi transakciju. Poruka bez priloga uvek vraća
  // `{ ok: true }`, pa se tekstualni put ponaša isto kao pre.
  returns: v.union(
    v.object({ ok: v.literal(true), messageId: v.id("chatMessages") }),
    v.object({
      ok: v.literal(false),
      reason: attachmentRejectionReasonValidator,
      message: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const { channel, profile } = await requireChannelAccess(ctx, args.channelId);
    const kind: MessageKind = args.kind ?? "text";
    if (kind === "system") {
      throw new Error("Sistemske poruke se ne šalju ručno.");
    }
    const body = normalizeMessageBody(args.body, kind);
    const mentions = await validateMentions(ctx, channel.startupId, args.mentions);
    const replyToMessageId = await validateReplyTo(
      ctx,
      channel._id,
      args.replyToMessageId,
    );

    // PRE `ensureThreadMember`: odbijen prilog završava `return`-om (transakcija
    // commituje), pa ne sme da za sobom ostavi članstvo u threadu bez poruke.
    const attachment = await resolveAttachment(ctx, {
      storageId: args.attachmentStorageId,
      name: args.attachmentName,
      type: args.attachmentType,
      size: args.attachmentSize,
    });
    if (!attachment.ok) {
      return {
        ok: false as const,
        reason: attachment.reason,
        message: attachment.message,
      };
    }

    // Thread: slanje/pominjanje čini korisnika članom (participacija).
    if (channel.kind === "thread") {
      await ensureThreadMember(ctx, channel, profile._id);
      for (const mentionId of mentions) {
        await ensureThreadMember(ctx, channel, mentionId);
      }
    }

    const messageId = await insertMessage(
      ctx,
      channel,
      profile._id,
      profile.displayName,
      {
        body,
        kind,
        mentions,
        replyToMessageId,
        attachmentStorageId: args.attachmentStorageId,
        attachmentName: attachment.name,
        attachmentType: attachment.type,
        attachmentSize: attachment.size,
        voiceDurationMs: args.voiceDurationMs ?? null,
      },
    );
    return { ok: true as const, messageId };
  },
});

export const sendToAnchor = mutation({
  args: {
    startupId: v.id("startups"),
    anchorType: chatAnchorTypeValidator,
    anchorId: v.string(),
    body: v.string(),
    mentions: v.optional(v.array(v.id("profiles"))),
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requireAnchorAccessById(
      ctx,
      args.startupId,
      args.anchorType,
      args.anchorId,
      profile,
    );
    if (args.anchorType === "message") {
      await requireAnchorIsNotMessageThread(ctx, args.anchorId);
    }

    const body = cleanRequiredText(args.body, "Poruka", MAX_CHAT_MESSAGE_LENGTH);
    const mentions = await validateMentions(ctx, args.startupId, args.mentions);

    // Lazy kreiranje: kanal nastaje tek pri prvoj poruci (04-CHAT.md 4).
    let channel = await ctx.db
      .query("chatChannels")
      .withIndex("by_anchor", (q) =>
        q.eq("anchorType", args.anchorType).eq("anchorId", args.anchorId),
      )
      .unique();
    if (channel === null) {
      channel = await createThreadForAnchor(
        ctx,
        args.startupId,
        args.anchorType,
        args.anchorId,
        profile,
      );
    }

    await ensureThreadMember(ctx, channel, profile._id);
    for (const mentionId of mentions) {
      await ensureThreadMember(ctx, channel, mentionId);
    }

    return await insertMessage(ctx, channel, profile._id, profile.displayName, {
      body,
      kind: "text",
      mentions,
      replyToMessageId: null,
      attachmentName: null,
      attachmentType: null,
      attachmentSize: null,
      voiceDurationMs: null,
    });
  },
});

/** Guard: nema diskusije nad porukom koja je i sama u message-threadu (1 nivo). */
async function requireAnchorIsNotMessageThread(
  ctx: ReadCtx,
  anchorId: string,
): Promise<void> {
  const id = ctx.db.normalizeId("chatMessages", anchorId);
  const message = id === null ? null : await ctx.db.get("chatMessages", id);
  if (message === null) throw new Error("Diskusija nije pronađena.");
  const channel = await ctx.db.get("chatChannels", message.channelId);
  if (
    channel !== null &&
    channel.kind === "thread" &&
    channel.anchorType === "message"
  ) {
    throw new Error("Diskusija se ne otvara nad porukom iz druge diskusije.");
  }
}

async function createCustomChannel(
  ctx: MutationCtx,
  args: {
    startupId: Id<"startups">;
    name: string;
    isPrivate: boolean;
    memberProfileIds: Array<Id<"profiles">> | undefined;
  },
): Promise<Id<"chatChannels">> {
  const { profile } = await requireStartupMember(ctx, args.startupId);
  if (profile.role !== "admin") {
    throw new Error("Potreban je administratorski pristup.");
  }
  const name = cleanRequiredText(args.name, "Naziv kanala", MAX_CHANNEL_NAME_LENGTH);
  const now = Date.now();

  const channelId = await ctx.db.insert("chatChannels", {
    startupId: args.startupId,
    kind: "custom",
    areaId: null,
    anchorType: null,
    anchorId: null,
    dmKey: null,
    name,
    isPrivate: args.isPrivate,
    lastMessageAt: now,
    lastMessagePreview: "",
    lastMessageAuthorId: null,
    messageCount: 0,
    createdByProfileId: profile._id,
    archivedAt: null,
    createdAt: now,
  });

  await ctx.db.insert("chatMembers", {
    channelId,
    profileId: profile._id,
    startupId: args.startupId,
    role: "owner",
    joinedAt: now,
    leftAt: null,
  });

  const memberIds = [...new Set(args.memberProfileIds ?? [])].filter(
    (id) => id !== profile._id,
  );
  for (const memberId of memberIds) {
    await requireProfileInStartup(ctx, args.startupId, memberId);
    await ctx.db.insert("chatMembers", {
      channelId,
      profileId: memberId,
      startupId: args.startupId,
      role: "member",
      joinedAt: now,
      leftAt: null,
    });
  }

  return channelId;
}

async function createThreadFromMessage(
  ctx: MutationCtx,
  messageId: Id<"chatMessages">,
): Promise<Id<"chatChannels">> {
  const message = await ctx.db.get("chatMessages", messageId);
  if (message === null || message.deletedAt !== null) {
    throw new Error("Poruka nije pronađena.");
  }
  const { profile } = await requireChannelAccess(ctx, message.channelId);

  // 1-nivo guard: nema threada nad porukom iz message-threada.
  const sourceChannel = await ctx.db.get("chatChannels", message.channelId);
  if (
    sourceChannel !== null &&
    sourceChannel.kind === "thread" &&
    sourceChannel.anchorType === "message"
  ) {
    throw new Error("Diskusija se ne otvara nad porukom iz druge diskusije.");
  }

  // Idempotentno: jedna poruka ima najviše jedan spin-off thread.
  const existing = await ctx.db
    .query("chatChannels")
    .withIndex("by_anchor", (q) =>
      q.eq("anchorType", "message").eq("anchorId", message._id),
    )
    .unique();
  if (existing !== null) return existing._id;

  const channel = await createThreadForAnchor(
    ctx,
    message.startupId,
    "message",
    message._id,
    profile,
  );
  await ensureThreadMember(ctx, channel, profile._id);
  if (message.authorProfileId !== null) {
    await ensureThreadMember(ctx, channel, message.authorProfileId);
  }
  await postSystemMessage(ctx, channel, "Diskusija otvorena iz poruke.");
  return channel._id;
}

export const createChannel = mutation({
  args: {
    // Režim „custom" (admin): startupId + name + isPrivate [+ članovi].
    startupId: v.optional(v.id("startups")),
    name: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
    memberProfileIds: v.optional(v.array(v.id("profiles"))),
    // Režim „od poruke": thread zakačen za poruku.
    fromMessageId: v.optional(v.id("chatMessages")),
  },
  returns: v.id("chatChannels"),
  handler: async (ctx, args) => {
    if (args.fromMessageId !== undefined) {
      return await createThreadFromMessage(ctx, args.fromMessageId);
    }
    if (
      args.startupId === undefined ||
      args.name === undefined ||
      args.isPrivate === undefined
    ) {
      throw new Error(
        "Za custom kanal su obavezni startupId, name i isPrivate.",
      );
    }
    return await createCustomChannel(ctx, {
      startupId: args.startupId,
      name: args.name,
      isPrivate: args.isPrivate,
      memberProfileIds: args.memberProfileIds,
    });
  },
});

/**
 * Izmena članstva custom kanala posle kreiranja. Bez ove mutacije je privatan
 * kanal ćorsokak: članovi su se birali SAMO pri kreiranju (web
 * `new-conversation.tsx`), a kanal napravljen sa telefona nije imao ni to.
 *
 * Vraća `previousProfileIds` — spisak AKTIVNIH članova PRE poziva. To je jedini
 * razlog zašto „Poništi" (`apps/mobile/src/lib/undo.ts`) uopšte može da postoji:
 * inverz je isti poziv sa starim spiskom.
 *
 * NE postavlja sistemsku poruku u kanal: poništavanje bi odmah ostavilo dve
 * sistemske poruke o suprotnim radnjama.
 */
export const setChannelMembers = mutation({
  args: {
    channelId: v.id("chatChannels"),
    memberProfileIds: v.array(v.id("profiles")),
  },
  returns: v.object({
    previousProfileIds: v.array(v.id("profiles")),
    added: v.number(),
    removed: v.number(),
  }),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get("chatChannels", args.channelId);
    if (channel === null || channel.archivedAt !== null) {
      throw new Error("Razgovor nije pronađen.");
    }
    // Isti gejt kao `createCustomChannel` i `archiveChannel` — kanale tima drži admin.
    const { profile } = await requireStartupMember(ctx, channel.startupId);
    if (profile.role !== "admin") {
      throw new Error("Potreban je administratorski pristup.");
    }
    // Članstvo `startup`/`area`/`thread`/`dm` kanala je IZVEDENO
    // (`requireChannelAccess`, `ensureThreadMember`) — ručno menjanje bi ga tiho
    // razišlo sa pravilima pristupa, pa se odbija umesto da se „nekako" primeni.
    if (channel.kind !== "custom") {
      throw new Error("Članovi se biraju samo za kanale tima.");
    }

    const requested = [...new Set(args.memberProfileIds)];
    if (requested.length > MAX_CHAT_CHANNEL_MEMBERS) {
      throw new Error(
        `Kanal može imati najviše ${MAX_CHAT_CHANNEL_MEMBERS} članova.`,
      );
    }
    for (const profileId of requested) {
      await requireProfileInStartup(ctx, channel.startupId, profileId);
    }

    const rows = await ctx.db
      .query("chatMembers")
      .withIndex("by_channel", (q) =>
        q.eq("channelId", channel._id).eq("leftAt", null),
      )
      .take(MAX_CHAT_CHANNEL_MEMBERS + 1);
    const previousProfileIds = rows.map((row) => row.profileId);

    const wanted = new Set(requested);
    for (const row of rows) {
      // Vlasnik kanala ostaje uvek — inače admin može da zaključa tvorca van
      // njegovog kanala i napravi nov ćorsokak.
      // Pozivalac ostaje ako je VEĆ član — piker ne nudi samog sebe, pa bi
      // doslovna primena spiska izbacila admina iz sopstvenog kanala. Admin koji
      // nije unutra se NE ubacuje tiho (uslov je postojeći aktivan red).
      if (row.role === "owner" || row.profileId === profile._id) {
        wanted.add(row.profileId);
      }
    }

    const now = Date.now();
    let added = 0;
    let removed = 0;

    for (const profileId of wanted) {
      const existing = await ctx.db
        .query("chatMembers")
        .withIndex("by_channel_and_profile", (q) =>
          q.eq("channelId", channel._id).eq("profileId", profileId),
        )
        .unique();
      if (existing === null) {
        await ctx.db.insert("chatMembers", {
          channelId: channel._id,
          profileId,
          startupId: channel.startupId,
          role: "member",
          joinedAt: now,
          leftAt: null,
        });
        added += 1;
        continue;
      }
      // Ponovno dodavanje OŽIVLJAVA postojeći red (obrazac `ensureThreadMember`),
      // ne pravi drugi za isti par — inače bi `by_channel_and_profile.unique()`
      // vremenom počeo da baca.
      if (existing.leftAt !== null) {
        await ctx.db.patch("chatMembers", existing._id, { leftAt: null });
        added += 1;
      }
    }

    for (const row of rows) {
      if (wanted.has(row.profileId)) continue;
      // Meko: istorija članstva ostaje, kao i pri napuštanju kanala.
      await ctx.db.patch("chatMembers", row._id, { leftAt: now });
      removed += 1;
    }

    return { previousProfileIds, added, removed };
  },
});

export const markChannelRead = mutation({
  args: { channelId: v.id("chatChannels") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { channel, profile } = await requireChannelAccess(ctx, args.channelId);
    const last = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel_and_createdAt", (q) =>
        q.eq("channelId", channel._id),
      )
      .order("desc")
      .first();
    const existing = await getChatRead(ctx, channel._id, profile._id);
    await upsertChatRead(ctx, {
      channelId: channel._id,
      profileId: profile._id,
      startupId: channel.startupId,
      existing,
      patch: {
        unreadCount: 0,
        mentionCount: 0,
        lastReadAt: Date.now(),
        lastReadMessageId: last?._id ?? null,
      },
    });
    return null;
  },
});

/**
 * Otkucaj prisustva: „gledam ovaj kanal i stojim na dnu". Klijent ga šalje dok je
 * ekran u prvom planu i lista na dnu, i obnavlja ga na `CHAT_PRESENCE_REFRESH_MS`;
 * `present: false` gasi prisustvo odmah (blur, odlazak sa ekrana, skrol gore).
 *
 * Red se NE briše na gašenje — jedan je po paru (kanal, profil), pa je upsert
 * jeftiniji od insert/delete ciklusa, a tabela ne raste sa brojem poruka.
 */
export const setPresence = mutation({
  args: { channelId: v.id("chatChannels"), present: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { channel, profile } = await requireChannelAccess(ctx, args.channelId);
    const now = Date.now();
    const expiresAt = args.present ? now + CHAT_PRESENCE_TTL_MS : 0;
    const existing = await getChatPresence(ctx, channel._id, profile._id);
    if (existing === null) {
      // Gašenje bez postojećeg reda nema šta da upiše — prazan red bi bio šum.
      if (!args.present) return null;
      await ctx.db.insert("chatPresence", {
        channelId: channel._id,
        profileId: profile._id,
        startupId: channel.startupId,
        expiresAt,
        updatedAt: now,
      });
      return null;
    }
    await ctx.db.patch("chatPresence", existing._id, {
      expiresAt,
      updatedAt: now,
    });
    return null;
  },
});

export const openDirectMessage = mutation({
  args: {
    startupId: v.id("startups"),
    otherProfileId: v.id("profiles"),
  },
  returns: v.id("chatChannels"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    if (args.otherProfileId === profile._id) {
      throw new Error("Ne možete otvoriti razgovor sa samim sobom.");
    }
    await requireProfileInStartup(ctx, args.startupId, args.otherProfileId);

    const dmKey = dmKeyFor(profile._id, args.otherProfileId);
    const existing = await ctx.db
      .query("chatChannels")
      .withIndex("by_startup_and_dmKey", (q) =>
        q.eq("startupId", args.startupId).eq("dmKey", dmKey),
      )
      .unique();
    if (existing !== null) return existing._id;

    const now = Date.now();
    const channelId = await ctx.db.insert("chatChannels", {
      startupId: args.startupId,
      kind: "dm",
      areaId: null,
      anchorType: null,
      anchorId: null,
      dmKey,
      name: "",
      isPrivate: true,
      lastMessageAt: now,
      lastMessagePreview: "",
      lastMessageAuthorId: null,
      messageCount: 0,
      createdByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
    });
    for (const participantId of [profile._id, args.otherProfileId]) {
      await ctx.db.insert("chatMembers", {
        channelId,
        profileId: participantId,
        startupId: args.startupId,
        role: "member",
        joinedAt: now,
        leftAt: null,
      });
    }
    return channelId;
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("chatMessages"), emoji: v.string() },
  returns: v.object({ reacted: v.boolean() }),
  handler: async (ctx, args) => {
    const emoji = args.emoji.trim();
    if (emoji.length === 0 || emoji.length > MAX_EMOJI_LENGTH) {
      throw new Error("Nevažeći emoji.");
    }
    const message = await ctx.db.get("chatMessages", args.messageId);
    if (message === null || message.deletedAt !== null) {
      throw new Error("Poruka nije pronađena.");
    }
    const { profile } = await requireChannelAccess(ctx, message.channelId);

    const existing = await ctx.db
      .query("chatReactions")
      .withIndex("by_message_and_profile_and_emoji", (q) =>
        q
          .eq("messageId", args.messageId)
          .eq("profileId", profile._id)
          .eq("emoji", emoji),
      )
      .unique();
    if (existing !== null) {
      await ctx.db.delete("chatReactions", existing._id);
      return { reacted: false };
    }
    await ctx.db.insert("chatReactions", {
      messageId: args.messageId,
      profileId: profile._id,
      emoji,
      createdAt: Date.now(),
    });
    return { reacted: true };
  },
});

export const editMessage = mutation({
  args: { messageId: v.id("chatMessages"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("chatMessages", args.messageId);
    if (message === null || message.deletedAt !== null) {
      throw new Error("Poruka nije pronađena.");
    }
    const { channel, profile } = await requireChannelAccess(
      ctx,
      message.channelId,
    );
    if (
      message.authorProfileId === null ||
      message.authorProfileId !== profile._id
    ) {
      throw new Error("Možete izmeniti samo svoju poruku.");
    }
    const now = Date.now();
    if (now - message.createdAt > CHAT_EDIT_WINDOW_MS) {
      throw new Error("Vreme za izmenu poruke je isteklo.");
    }
    const body = normalizeMessageBody(args.body, message.kind);
    await ctx.db.patch("chatMessages", message._id, { body, editedAt: now });

    // Osveži pregled ako je ovo poslednja poruka kanala.
    const last = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel_and_createdAt", (q) =>
        q.eq("channelId", channel._id),
      )
      .order("desc")
      .first();
    if (last !== null && last._id === message._id) {
      await ctx.db.patch("chatChannels", channel._id, {
        lastMessagePreview: buildPreview(body, message.kind),
      });
    }
    return null;
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("chatMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("chatMessages", args.messageId);
    if (message === null || message.deletedAt !== null) {
      throw new Error("Poruka nije pronađena.");
    }
    const { channel, profile } = await requireChannelAccess(
      ctx,
      message.channelId,
    );
    const isAuthor =
      message.authorProfileId !== null &&
      message.authorProfileId === profile._id;
    if (!isAuthor && profile.role !== "admin") {
      throw new Error("Poruku može obrisati samo autor ili administrator.");
    }

    // Soft delete: red ostaje, telo se prestaje slati (04-CHAT.md 5).
    await ctx.db.patch("chatMessages", message._id, { deletedAt: Date.now() });

    const last = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel_and_createdAt", (q) =>
        q.eq("channelId", channel._id),
      )
      .order("desc")
      .first();
    if (last !== null && last._id === message._id) {
      await ctx.db.patch("chatChannels", channel._id, {
        lastMessagePreview: "Poruka je obrisana",
      });
    }
    return null;
  },
});

export const setNotificationLevel = mutation({
  args: {
    channelId: v.id("chatChannels"),
    level: chatNotificationLevelValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { channel, profile } = await requireChannelAccess(ctx, args.channelId);
    const existing = await getChatRead(ctx, channel._id, profile._id);
    await upsertChatRead(ctx, {
      channelId: channel._id,
      profileId: profile._id,
      startupId: channel.startupId,
      existing,
      patch: { notificationLevel: args.level },
    });
    return null;
  },
});

export const archiveChannel = mutation({
  args: { channelId: v.id("chatChannels") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get("chatChannels", args.channelId);
    if (channel === null || channel.archivedAt !== null) {
      throw new Error("Razgovor nije pronađen.");
    }
    const { profile } = await requireStartupMember(ctx, channel.startupId);
    if (profile.role !== "admin") {
      throw new Error("Potreban je administratorski pristup.");
    }
    // Opšti kanal se ne arhivira ni ne briše (04-CHAT.md 5b).
    if (channel.kind === "startup") {
      throw new Error("Opšti kanal se ne može arhivirati.");
    }
    await ctx.db.patch("chatChannels", channel._id, { archivedAt: Date.now() });
    return null;
  },
});

/**
 * URL za upload priloga (slika/fajl/glasovna poruka) u kanal. Vraća sirov
 * Convex upload URL; klijent zatim POST-uje fajl, dobija `storageId` i prosledi
 * ga u `sendMessage`. Autorizacija je ista kao za slanje poruke — član kanala.
 *
 * `name`/`contentType`/`size` su OBAVEZNI: nepodržan ili prevelik fajl se odbija
 * PRE nego što blob uopšte nastane. Opciona predprovera koju klijent sme da
 * preskoči je tačno ono što je pravilo siročiće u storage-u. Poruke su iste kao
 * posle uploada (`attachmentRejection`).
 */
export const generateUploadUrl = mutation({
  args: {
    channelId: v.id("chatChannels"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireChannelAccess(ctx, args.channelId);
    const name = cleanPageFileName(args.name.trim() || "prilog");
    const rejection = attachmentRejection(
      args.contentType || undefined,
      name,
      args.size,
    );
    // Ovde se BACA (za razliku od `sendMessage`): blob još ne postoji, pa nema
    // šta da se briše ni šta da preživi transakciju.
    if (rejection !== null) throw new Error(rejection.message);
    return await ctx.storage.generateUploadUrl();
  },
});
