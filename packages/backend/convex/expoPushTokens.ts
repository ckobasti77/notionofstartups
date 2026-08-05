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

/** Posle ovoliko odbijenih dostava token se briše kao mrtav (kao kod weba). */
const MAX_EXPO_FAILURES = 5;

/** Koliko uređaja jednog korisnika dobija dostavu / se ažurira odjednom. */
const MAX_EXPO_TOKENS = 20;

const MAX_TOKEN_LENGTH = 512;
const MAX_DEVICE_NAME_LENGTH = 128;
const MAX_APP_VERSION_LENGTH = 32;
const MINUTES_IN_DAY = 1_440;

/** Broj tipova = gornja granica dužine `mutedTypes`. */
const MAX_MUTED_TYPES = 32;

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

function validateQuietMinute(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_IN_DAY) {
    throw new Error(`${label} mora biti minut u danu (0–1439).`);
  }
  return value;
}

/**
 * Upisuje Expo token ovog uređaja. Token je jedinstven po uređaju, pa ponovna
 * prijava osvežava postojeći red. Korisnikova podešavanja (mutedTypes, tihi
 * sati) se pri osvežavanju NE diraju — vezana su za korisnika, ne za sesiju.
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
      mutedTypes: [],
      quietHoursStart: null,
      quietHoursEnd: null,
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

/**
 * Podešavanja obaveštenja su po korisniku (jedan ekran, sekcija 7), pa se
 * primenjuju na SVE uređaje tog korisnika odjednom.
 */
export const setNotificationSettings = mutation({
  args: {
    mutedTypes: v.array(notificationTypeValidator),
    quietHoursStart: v.union(v.number(), v.null()),
    quietHoursEnd: v.union(v.number(), v.null()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);

    if (args.mutedTypes.length > MAX_MUTED_TYPES) {
      throw new Error("Previše utišanih tipova.");
    }
    const mutedTypes = [...new Set(args.mutedTypes)];

    // Tihi sati su prozor: ili oba postavljena, ili oba prazna.
    if ((args.quietHoursStart === null) !== (args.quietHoursEnd === null)) {
      throw new Error("Tihi sati moraju imati i početak i kraj.");
    }
    const quietHoursStart =
      args.quietHoursStart === null
        ? null
        : validateQuietMinute(args.quietHoursStart, "Početak tihih sati");
    const quietHoursEnd =
      args.quietHoursEnd === null
        ? null
        : validateQuietMinute(args.quietHoursEnd, "Kraj tihih sati");

    const tokens = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(MAX_EXPO_TOKENS);

    for (const token of tokens) {
      await ctx.db.patch("expoPushTokens", token._id, {
        mutedTypes,
        quietHoursStart,
        quietHoursEnd,
      });
    }
    return tokens.length;
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
 * Podaci koje `expoPush.deliver` treba za slanje. Vraća sam notifikaciju plus
 * sve tokene primaoca (sa njihovim podešavanjima) — vremenski filter (tihi
 * sati) radi akcija, jer upit ne sme da čita sat.
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
      tokens: v.array(
        v.object({
          _id: v.id("expoPushTokens"),
          token: v.string(),
          platform: platformValidator,
          channelVersion: v.number(),
          mutedTypes: v.array(notificationTypeValidator),
          quietHoursStart: v.union(v.number(), v.null()),
          quietHoursEnd: v.union(v.number(), v.null()),
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
      tokens: tokens.map((token) => ({
        _id: token._id,
        token: token.token,
        platform: token.platform,
        channelVersion: token.channelVersion,
        mutedTypes: token.mutedTypes,
        quietHoursStart: token.quietHoursStart,
        quietHoursEnd: token.quietHoursEnd,
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
