"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { activityTarget, COMMAND_BLOCK_TEXT, formatActivity, formatEditTime, type ActivityTarget } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { useQueryResult } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { ActivityRow, type ActivityEntry } from "./activity-row";
import { Block, type BlockStatus, useBlockRetry } from "./block";

/** Koliko unosa „Nedavne izmene" prikazuju (K07 §5.2: 8–10). */
export const RECENT_LIMIT = 8;

export type RecentViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  entries: ReadonlyArray<ActivityEntry>;
  onOpen: (target: ActivityTarget) => void;
  onOpenAll: () => void;
};

/** „Nedavne izmene" — prezentacija (izlog `komandni-centar`): rečenice iz shared `formatActivity`. */
export function RecentView({ status, onRetry, entries, onOpen, onOpenAll }: RecentViewProps) {
  return (
    <Block
      id="cc-nedavne-izmene"
      title="Nedavne izmene"
      status={status}
      errorText={COMMAND_BLOCK_TEXT.recentError}
      onRetry={onRetry}
      skeletonRows={4}
    >
      {entries.length === 0 ? (
        <EmptyState size="section" title="Još nema izmena." />
      ) : (
        <>
          <ul className="space-y-0.5">
            {entries.map((entry) => (
              <li key={entry.id}>
                <ActivityRow entry={entry} onOpen={onOpen} />
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-1" onClick={onOpenAll}>
            Sva aktivnost
            <ChevronRight aria-hidden="true" />
          </Button>
        </>
      )}
    </Block>
  );
}

/** Kontejner „Nedavne izmene": `activity.listPaginated` (prva strana) + shared formatiranje. */
export function RecentBlock({
  startupId,
  now,
  onOpen,
  onOpenAll,
}: {
  startupId: Id<"startups">;
  now: number;
  onOpen: (target: ActivityTarget) => void;
  onOpenAll: () => void;
}) {
  const retry = useBlockRetry();
  const result = useQueryResult(api.activity.listPaginated, {
    startupId,
    paginationOpts: { numItems: RECENT_LIMIT, cursor: null },
  });
  const entries = useMemo<ActivityEntry[]>(
    () =>
      (result.data?.page ?? []).map((item) => {
        const format = formatActivity(item, item.actor?.displayName ?? null);
        return {
          id: item._id,
          sentence: format.sentence,
          icon: format.icon,
          tone: format.tone,
          time: formatEditTime(item.createdAt, now),
          target: activityTarget(item),
        };
      }),
    [result.data, now],
  );
  return (
    <RecentView
      status={result.failed ? "error" : result.data === undefined ? "loading" : "ready"}
      onRetry={retry}
      entries={entries}
      onOpen={onOpen}
      onOpenAll={onOpenAll}
    />
  );
}
