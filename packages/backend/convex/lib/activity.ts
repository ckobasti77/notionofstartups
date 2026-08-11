import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type ActivityAction =
  | "startup_created"
  | "startup_updated"
  | "startup_archived"
  | "member_added"
  | "member_removed"
  | "invite_created"
  | "invite_claimed"
  | "invite_revoked"
  | "page_created"
  | "page_updated"
  | "page_moved"
  | "page_archived"
  | "task_updated"
  | "contribution_created"
  | "contribution_updated"
  | "deletion_requested"
  | "deletion_voted"
  | "deletion_resolved"
  | "nesting_requested"
  | "nesting_resolved"
  | "content_recovered"
  | "content_soft_deleted"
  | "member_password_changed";

type ActivityTargetType =
  | "startup"
  | "profile"
  | "invite"
  | "page"
  | "idea"
  | "contribution"
  | "request"
  | "recovered";

export async function recordActivity(
  ctx: MutationCtx,
  value: {
    startupId: Id<"startups">;
    actorProfileId: Id<"profiles">;
    action: ActivityAction;
    targetType: ActivityTargetType;
    targetId: string;
    title: string;
    detail?: string;
  },
) {
  return await ctx.db.insert("activities", {
    ...value,
    createdAt: Date.now(),
  });
}
