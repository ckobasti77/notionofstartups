import {
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { normalizeEmail, validatePasswordRequirements } from "./auth";
import { recordActivity } from "./lib/activity";
import { requireAdmin } from "./lib/auth";

/**
 * Jednokratni, server-only reset lozinke admin naloga.
 *
 * Aplikacija nema reset tok (`PasswordProvider` u `auth.ts` nema `reset` email
 * provider), pa se lozinka postavlja ovom internom akcijom. Pokreće se isključivo
 * preko `npx convex run` (CLI ima admin pristup) — kao `internalAction` nije u
 * javnom API-ju i ne može se pozvati sa klijenta.
 *
 * Zašto akcija, a ne mutacija: `modifyAccountCredentials` je zvanični helper iz
 * `@convex-dev/auth/server` i prima action ctx — interno radi
 * `ctx.runMutation("auth:store", { type: "modifyAccount" })`, koji nalog nalazi
 * po (provider="password", providerAccountId=email), hešuje Scrypt-om i patch-uje
 * SAMO `authAccounts.secret`. `profiles` i `users` se ne diraju.
 *
 * Nakon uspešnog reseta OBRISATI ovaj fajl i re-deploy-ovati — da server-only
 * put ne ostane u kodu.
 */
export const resetAdminPassword = internalAction({
  args: { email: v.string(), newPassword: v.string() },
  returns: v.null(),
  handler: async (ctx, { email, newPassword }) => {
    // Ista normalizacija kao pri signup-u (auth.ts) — `providerAccountId` je
    // snimljen kao normalizovan email, pa lookup mora da ga uskladi.
    const normalizedEmail = normalizeEmail(email);
    // Ista provera jačine iz auth.ts — helper je sam ne poziva.
    validatePasswordRequirements(newPassword);

    // Baca ako nalog za taj email ne postoji (bez tihog kreiranja).
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: normalizedEmail, secret: newPassword },
    });

    return null;
  },
});

/**
 * Autorizacija + učitavanje mete za `adminSetPassword`. Izdvojeno u internalQuery
 * jer `requireAdmin` traži query/mutation ctx (`ctx.db`), a `adminSetPassword` je
 * akcija (nema `ctx.db`). Vraća samo ono što akciji treba — nikad lozinku.
 */
export const authorizeSetPassword = internalQuery({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    email: v.string(),
    userId: v.id("users"),
    targetName: v.string(),
    adminProfileId: v.id("profiles"),
    adminName: v.string(),
  }),
  handler: async (ctx, { profileId }) => {
    const admin = await requireAdmin(ctx);
    // Blokada sebe: sopstvena lozinka se ne menja ovim (admin) putem — izbegava
    // i samo-odjavu (korak 4 u akciji mete SVE sesije mete).
    if (admin._id === profileId) {
      throw new ConvexError("Sopstvenu lozinku ne menjaš ovim putem.");
    }
    const target = await ctx.db.get("profiles", profileId);
    if (target === null || target.archivedAt !== null) {
      throw new ConvexError("Član nije pronađen.");
    }
    return {
      email: target.email,
      userId: target.userId,
      targetName: target.displayName,
      adminProfileId: admin._id,
      adminName: admin.displayName,
    };
  },
});

/**
 * Upis činjenice u activity — u SVAKI startup čiji je meta aktivan član. Bez
 * lozinke. Zasebna internalMutation jer `recordActivity` traži mutation ctx, a
 * `adminSetPassword` je akcija. Globalna akcija (kao `profiles.setRole`/`archive`)
 * nema jedan „svoj" startup, pa se zapisuje svuda gde meta ima aktivno članstvo.
 */
export const recordPasswordChange = internalMutation({
  args: {
    actorProfileId: v.id("profiles"),
    targetProfileId: v.id("profiles"),
    adminName: v.string(),
    targetName: v.string(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { actorProfileId, targetProfileId, adminName, targetName },
  ) => {
    const memberships = await ctx.db
      .query("startupMembers")
      .withIndex("by_profileId_and_startupId", (q) =>
        q.eq("profileId", targetProfileId),
      )
      .take(50);
    const title = `${adminName} je promenio lozinku članu ${targetName}`;
    for (const membership of memberships) {
      if (membership.archivedAt !== null) continue;
      await recordActivity(ctx, {
        startupId: membership.startupId,
        actorProfileId,
        action: "member_password_changed",
        targetType: "profile",
        targetId: targetProfileId,
        title,
      });
    }
    return null;
  },
});

/**
 * Admin postavlja NOVU lozinku POSTOJEĆEM članu (globalno, bez obzira na startup).
 * Menja isključivo `authAccounts.secret` preko zvaničnog helpera — ne pravi nov
 * nalog, ne briše profil, ne dira druge tabele.
 *
 * Public akcija iza `requireAdmin` (isti obrazac kao `startups.removeMember` /
 * `profiles.setRole`): klijent mora da je zove, a ne-admin je odbijen u runtime-u
 * i UI mu dugme ni ne prikazuje. Akcija (ne mutacija) jer
 * `modifyAccountCredentials`/`invalidateSessions` primaju action ctx.
 *
 * Lozinka se NIGDE ne loguje, ne vraća (`returns: v.null()`) i ne ide u activity.
 */
export const adminSetPassword = action({
  args: { profileId: v.id("profiles"), newPassword: v.string() },
  returns: v.null(),
  handler: async (ctx, { profileId, newPassword }) => {
    // 1) Autorizacija + meta PRE validacije lozinke — da ne-admin ne sazna
    //    pravila lozinke. Identitet pozivaoca se prenosi kroz `ctx.runQuery`.
    const info: {
      email: string;
      userId: Id<"users">;
      targetName: string;
      adminProfileId: Id<"profiles">;
      adminName: string;
    } = await ctx.runQuery(internal.adminAuth.authorizeSetPassword, {
      profileId,
    });

    // 2) Ista provera jačine kao pri signup-u (baca ConvexError na slabu lozinku).
    validatePasswordRequirements(newPassword);

    // 3) Menja SAMO authAccounts.secret (Scrypt heš). Baca ako nalog ne postoji —
    //    preoblačimo u jasnu srpsku poruku za toast/Alert.
    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: normalizeEmail(info.email), secret: newPassword },
      });
    } catch {
      throw new ConvexError(
        "Nalog za ovog člana nije pronađen ili se lozinka ne može promeniti.",
      );
    }

    // 4) Sve postojeće sesije + refresh tokeni mete van — meta mora da se prijavi
    //    NOVOM lozinkom (reset je bezbednosni događaj).
    await invalidateSessions(ctx, { userId: info.userId });

    // 5) Činjenica u activity (bez lozinke). Best-effort posle same promene.
    await ctx.runMutation(internal.adminAuth.recordPasswordChange, {
      actorProfileId: info.adminProfileId,
      targetProfileId: profileId,
      adminName: info.adminName,
      targetName: info.targetName,
    });

    return null;
  },
});
