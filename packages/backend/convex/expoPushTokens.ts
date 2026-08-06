import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireProfile } from "./lib/auth";
import { notificationTypeValidator } from "./lib/validators";
import { readSettings } from "./notificationSettings";

/** Posle ovoliko odbijenih dostava token se briše kao mrtav (kao kod weba). */
const MAX_EXPO_FAILURES = 5;

/** Koliko uređaja jednog korisnika dobija dostavu / se ažurira odjednom. */
const MAX_EXPO_TOKENS = 20;

const MAX_TOKEN_LENGTH = 512;
const MAX_DEVICE_NAME_LENGTH = 128;
const MAX_APP_VERSION_LENGTH = 32;

const platformValidator = v.union(v.literal("ios"), v.literal("android"));

function cleanRequired(value: string, label: string, maxLength: number) {
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new Error(`${label} je obavezno polje.`);
  if (cleaned.length > maxLength) throw new Error(`${label} je predugačko.`);
  return cleaned;
}

function validateChannelVersion(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Verzija kanala nije ispravna.");
  }
  return value;
}

/**
 * Upisuje Expo token ovog uređaja. Token je jedinstven po uređaju, pa ponovna
 * prijava osvežava postojeći red. Podešavanja obaveštenja NISU ovde — žive po
 * profilu u `notificationSettings`, pa nova prijava uređaja odmah nasleđuje
 * korisnikova pravila bez kopiranja.
 */
export const save = mutation({
  args: {
    token: v.string(),
    platform: platformValidator,
    deviceName: v.union(v.string(), v.null()),
    appVersion: v.string(),
    channelVersion: v.number(),
  },
  returns: v.id("expoPushTokens"),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const token = cleanRequired(args.token, "Token", MAX_TOKEN_LENGTH);
    const appVersion = cleanRequired(
      args.appVersion,
      "Verzija aplikacije",
      MAX_APP_VERSION_LENGTH,
    );
    const channelVersion = validateChannelVersion(args.channelVersion);
    const deviceName =
      args.deviceName === null
        ? null
        : args.deviceName.trim().slice(0, MAX_DEVICE_NAME_LENGTH) || null;
    const now = Date.now();

    const existing = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (existing !== null) {
      await ctx.db.patch("expoPushTokens", existing._id, {
        profileId: profile._id,
        platform: args.platform,
        deviceName,
        appVersion,
        channelVersion,
        lastSeenAt: now,
        failureCount: 0,
      });
      return existing._id;
    }

    return await ctx.db.insert("expoPushTokens", {
      profileId: profile._id,
      token,
      platform: args.platform,
      deviceName,
      appVersion,
      channelVersion,
      lastSeenAt: now,
      failureCount: 0,
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const existing = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (existing !== null && existing.profileId === profile._id) {
      await ctx.db.delete("expoPushTokens", existing._id);
    }
    return null;
  },
});

/** Broj uređaja na kojima korisnik prima native push (za ekran podešavanja). */
export const myDeviceCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const rows = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(MAX_EXPO_TOKENS);
    return rows.length;
  },
});

/**
 * Badge broj za ikonu: nepročitane notifikacije + nepročitane chat poruke,
 * sabrano kroz aktivne startupe korisnika (sekcija 8). Ograničeno čitanje —
 * precizan denormalizovani brojač je naknadno finije rešenje.
 */
const BADGE_STARTUP_CAP = 50;
const BADGE_PER_STARTUP_CAP = 100;
const BADGE_MAX = 999;

async function computeBadge(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"profiles">,
): Promise<number> {
  const memberships = await ctx.db
    .query("startupMembers")
    .withIndex("by_profileId_and_startupId", (q) =>
      q.eq("profileId", profileId),
    )
    .take(BADGE_STARTUP_CAP);

  let notifUnread = 0;
  for (const membership of memberships) {
    if (membership.archivedAt !== null) continue;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_startup_and_readAt", (q) =>
        q
          .eq("recipientProfileId", profileId)
          .eq("startupId", membership.startupId)
          .eq("readAt", null),
      )
      .take(BADGE_PER_STARTUP_CAP);
    notifUnread += unread.length;
  }

  const reads = await ctx.db
    .query("chatReads")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .take(BADGE_STARTUP_CAP * 4);
  const chatUnread = reads.reduce((sum, read) => sum + read.unreadCount, 0);

  return Math.min(notifUnread + chatUnread, BADGE_MAX);
}

/**
 * Podaci koje `expoPush.deliver` treba za slanje. Vraća notifikaciju, tokene
 * primaoca i njegova podešavanja PO PROFILU (`notificationSettings`) — utišani
 * tipovi i tihi sati važe za sve uređaje jednako. Vremenski filter (tihi sati)
 * radi akcija, jer upit ne sme da čita sat.
 */
export const expoPayloadForNotification = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.union(
    v.object({
      title: v.string(),
      body: v.union(v.string(), v.null()),
      type: notificationTypeValidator,
      startupId: v.id("startups"),
      targetType: v.string(),
      targetId: v.union(v.string(), v.null()),
      notificationId: v.id("notifications"),
      badge: v.number(),
      mutedTypes: v.array(notificationTypeValidator),
      quietHoursStart: v.union(v.number(), v.null()),
      quietHoursEnd: v.union(v.number(), v.null()),
      tokens: v.array(
        v.object({
          _id: v.id("expoPushTokens"),
          token: v.string(),
          platform: platformValidator,
          channelVersion: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (notification === null) return null;

    const tokens = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_profileId", (q) =>
        q.eq("profileId", notification.recipientProfileId),
      )
      .take(MAX_EXPO_TOKENS);
    if (tokens.length === 0) return null;

    const settings = await readSettings(ctx, notification.recipientProfileId);
    const badge = await computeBadge(ctx, notification.recipientProfileId);

    return {
      title: notification.title,
      body: notification.body ?? null,
      type: notification.type,
      startupId: notification.startupId,
      targetType: notification.targetType,
      targetId: notification.targetId,
      notificationId: notification._id,
      badge,
      mutedTypes: settings.mutedTypes,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      tokens: tokens.map((token) => ({
        _id: token._id,
        token: token.token,
        platform: token.platform,
        channelVersion: token.channelVersion,
      })),
    };
  },
});

/**
 * Rezultat dostave. Mrtav token (`DeviceNotRegistered`) briše se odmah;
 * prolazni neuspesi se gomilaju do praga. Rate-limit se NE prijavljuje ovde —
 * to je prolazno stanje, ne kvar tokena (obrada u `expoPush.ts`).
 */
export const recordDeliveryResults = internalMutation({
  args: {
    results: v.array(
      v.object({
        tokenId: v.id("expoPushTokens"),
        outcome: v.union(
          v.literal("sent"),
          v.literal("gone"),
          v.literal("failed"),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const result of args.results) {
      const token: Doc<"expoPushTokens"> | null = await ctx.db.get(
        "expoPushTokens",
        result.tokenId,
      );
      if (token === null) continue;

      if (result.outcome === "gone") {
        await ctx.db.delete("expoPushTokens", token._id);
        continue;
      }
      if (result.outcome === "sent") {
        await ctx.db.patch("expoPushTokens", token._id, {
          failureCount: 0,
          lastSeenAt: now,
        });
        continue;
      }

      const failureCount = token.failureCount + 1;
      if (failureCount >= MAX_EXPO_FAILURES) {
        await ctx.db.delete("expoPushTokens", token._id);
      } else {
        await ctx.db.patch("expoPushTokens", token._id, { failureCount });
      }
    }
    return null;
  },
});

export type ExpoPushTokenId = Id<"expoPushTokens">;
