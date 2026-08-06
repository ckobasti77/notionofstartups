import { modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { normalizeEmail, validatePasswordRequirements } from "./auth";

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
