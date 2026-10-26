"use client";

import { useMemo, useState } from "react";

import { MotionDialog } from "@/components/motion";
import { useQueryTolerant } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { CommentsSection } from "./comments-section";
import type { MentionMember } from "./comment-composer";
import { useLiveNow } from "./use-live-now";

/**
 * Komentari jednog koraka zadatka (PROSTOR K07 §6.1, cilj `task_checkpoint`):
 * isti Komentari kao na stranici, u dijalogu otvorenom iz reda koraka.
 */
export function CheckpointCommentsDialog({
  checkpointId,
  startupId,
  title,
  open,
  onOpenChange,
}: {
  checkpointId: Id<"taskCheckpoints"> | null;
  startupId: Id<"startups">;
  /** Tekst koraka (opis dijaloga). */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <MotionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Komentari koraka"
      description={title}
      width="32rem"
    >
      {open && checkpointId ? <CheckpointComments checkpointId={checkpointId} startupId={startupId} /> : null}
    </MotionDialog>
  );
}

function CheckpointComments({ checkpointId, startupId }: { checkpointId: Id<"taskCheckpoints">; startupId: Id<"startups"> }) {
  const membersResult = useQueryTolerant(api.startups.listMembers, { startupId, limit: 50 });
  const profile = useQueryTolerant(api.profiles.getCurrent, {});
  const [initialNow] = useState(() => Date.now());
  const now = useLiveNow(initialNow);
  const members = useMemo<MentionMember[]>(
    () =>
      (membersResult ?? []).map(({ profile: member }) => ({
        profileId: member._id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
      })),
    [membersResult],
  );
  return (
    <CommentsSection
      target={{ kind: "task_checkpoint", id: checkpointId }}
      members={members}
      selfProfileId={profile?._id ?? null}
      now={now}
    />
  );
}
