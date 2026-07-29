"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

type DeliveryOutcome = "sent" | "gone" | "failed";

type DeliveryResult = {
  subscriptionId: Id<"pushSubscriptions">;
  outcome: DeliveryOutcome;
};

/**
 * Tipovi su ispisani rukom, a ne izvedeni iz `ctx.runQuery`: dostava se zakazuje
 * iz `lib/notifications.ts`, pa bi izvođenje kroz `internal` napravilo kružnu
 * referencu koju TypeScript ne ume da razreši.
 */
type PushPayload = {
  title: string;
  body: string | null;
  startupId: Id<"startups">;
  targetType: string;
  targetId: string | null;
  notificationId: Id<"notifications">;
  subscriptions: Array<{
    _id: Id<"pushSubscriptions">;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
} | null;

type DeliverResult = {
  sent: number;
  removed: number;
  skipped: string | null;
};

/**
 * Push dostava. Živi u Node runtime-u jer VAPID potpis i `aes128gcm` šifrovanje
 * payload-a traže Node kriptografiju; zato ovaj fajl ne sme da izvozi upite ni
 * mutacije (one su u `pushSubscriptions.ts`).
 *
 * Ključevi se postavljaju sa `npx convex env set`:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: adresa)
 * Bez njih dostava se tiho preskače — obaveštenja u aplikaciji rade i dalje.
 */
export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.object({
    sent: v.number(),
    removed: v.number(),
    skipped: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<DeliverResult> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

    if (!publicKey || !privateKey) {
      return { sent: 0, removed: 0, skipped: "VAPID ključevi nisu postavljeni" };
    }

    const payload: PushPayload = await ctx.runQuery(
      internal.pushSubscriptions.pushPayloadForNotification,
      { notificationId: args.notificationId },
    );
    if (payload === null) {
      return { sent: 0, removed: 0, skipped: "nema pretplaćenih uređaja" };
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body,
      startupId: payload.startupId,
      targetType: payload.targetType,
      targetId: payload.targetId,
      notificationId: payload.notificationId,
    });

    const results: Array<DeliveryResult> = await Promise.all(
      payload.subscriptions.map(async (subscription): Promise<DeliveryResult> => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            message,
            { TTL: 24 * 60 * 60, urgency: "high" },
          );
          return { subscriptionId: subscription._id, outcome: "sent" as const };
        } catch (error) {
          // 404/410 znači da je browser poništio pretplatu — više nije živa.
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof (error as { statusCode: unknown }).statusCode === "number"
              ? (error as { statusCode: number }).statusCode
              : null;
          const gone = statusCode === 404 || statusCode === 410;
          if (!gone) {
            console.error("Push dostava neuspešna", statusCode, error);
          }
          return {
            subscriptionId: subscription._id,
            outcome: gone ? ("gone" as const) : ("failed" as const),
          };
        }
      }),
    );

    await ctx.runMutation(internal.pushSubscriptions.recordDeliveryResults, {
      results,
    });

    return {
      sent: results.filter((result) => result.outcome === "sent").length,
      removed: results.filter((result) => result.outcome === "gone").length,
      skipped: null,
    };
  },
});
