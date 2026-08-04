import { ConvexError } from "convex/values";

export type AccessErrorCode =
  | "NOT_AUTHENTICATED"
  | "ACCOUNT_EMAIL_MISSING"
  | "INVITE_REQUIRED"
  | "INVITE_NOT_FOUND"
  | "INVITE_EMAIL_MISMATCH"
  | "INVITE_REVOKED"
  | "INVITE_ALREADY_CLAIMED"
  | "INVITE_EXPIRED"
  | "STARTUP_UNAVAILABLE"
  | "PROFILE_INCOMPLETE"
  | "BOOTSTRAP_UNAVAILABLE"
  | "BOOTSTRAP_CODE_MISSING"
  | "BOOTSTRAP_CODE_INVALID";

export function accessError(code: AccessErrorCode, message: string) {
  return new ConvexError({ code, message });
}
