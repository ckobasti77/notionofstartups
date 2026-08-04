import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import { authorizeSignup, completeSignup } from "./lib/onboarding";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new ConvexError("Unesite ispravnu email adresu.");
  }

  const email = value.trim().toLowerCase();
  const [localPart = ""] = email.split("@", 1);
  const hasValidShape =
    email.length <= 254 &&
    localPart.length <= 64 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!hasValidShape) {
    throw new ConvexError("Unesite ispravnu email adresu.");
  }

  return email;
}

function validatePasswordRequirements(password: string) {
  const isStrong =
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  if (!isStrong) {
    throw new ConvexError(
      "Lozinka mora imati 12-128 znakova, veliko i malo slovo, broj i specijalni znak.",
    );
  }
}

function normalizeDisplayName(value: unknown) {
  if (typeof value !== "string") {
    throw new ConvexError("Unesite ime koje \u0107e tim videti.");
  }

  const displayName = value.trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 80) {
    throw new ConvexError("Ime mora imati izme\u0111u 2 i 80 znakova.");
  }

  return displayName;
}

function normalizeInviteCode(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ConvexError("Pozivni kod nije ispravan.");
  }

  const inviteCode = value.trim();
  if (inviteCode.length === 0 || inviteCode.length > 128) {
    throw new ConvexError("Pozivni kod nije ispravan.");
  }

  return inviteCode;
}

const PasswordProvider = Password({
  profile(params) {
    const email = normalizeEmail(params.email);
    if (params.flow !== "signUp") return { email };

    const inviteCode = normalizeInviteCode(params.inviteCode);
    return {
      email,
      displayName: normalizeDisplayName(params.displayName),
      ...(inviteCode === undefined ? {} : { inviteCode }),
    };
  },
  validatePasswordRequirements,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordProvider],
  signIn: {
    maxFailedAttempsPerHour: 8,
  },
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      // Existing password accounts do not pass through account creation, but
      // retaining this branch keeps future account-linking flows non-breaking.
      if (existingUserId !== null) return existingUserId;

      const email = normalizeEmail(profile.email);
      const displayName = normalizeDisplayName(profile.displayName);
      const inviteCode = normalizeInviteCode(profile.inviteCode);
      const authorization = await authorizeSignup(ctx, {
        email,
        ...(inviteCode === undefined ? {} : { inviteCode }),
      });

      // The invite code is intentionally transient. Only auth-safe user data
      // is persisted; onboarding claims the invite in this same transaction.
      const userId = await ctx.db.insert("users", { email });
      await completeSignup(ctx, {
        userId,
        email,
        displayName,
        authorization,
      });
      return userId;
    },
  },
});
