"use client";

import { useEffect, useMemo, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { Activity } from "lucide-react";
import { activityTarget, formatActivity, formatEditTime, type ActivityTarget } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityRow, type ActivityEntry } from "@/components/workspace/command-center/activity-row";
import type { StartupWithAreas } from "@/components/workspace/types";
import { WorkspaceErrorBoundary } from "@/components/workspace/workspace-error-boundary";
import { EmptyState, ScreenHeader } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Unosa po strani (server prima najviše 100 po `paginationOpts`). */
const PAGE = 30;

type ActivityViewProps = {
  status: "loading" | "ready";
  entries: ReadonlyArray<ActivityEntry>;
  /** Ima li još starijih unosa (dugme „Učitaj još"). */
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (target: ActivityTarget) => void;
};

/** Aktivnost — prezentacija (izlog `komandni-centar`): rečenice iz shared `formatActivity`. */
export function ActivityScreen({ status, entries, canLoadMore, loadingMore, onLoadMore, onOpen }: ActivityViewProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <ScreenHeader title="Aktivnost" />
      {status === "loading" ? (
        <div role="status" aria-label="Učitavanje aktivnosti" className="space-y-1">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={Activity} title="Još nema aktivnosti." headingAs="h2" />
      ) : (
        <>
          <ul className="space-y-0.5">
            {entries.map((entry) => (
              <li key={entry.id}>
                <ActivityRow entry={entry} onOpen={onOpen} />
              </li>
            ))}
          </ul>
          {canLoadMore || loadingMore ? (
            <Button variant="ghost" size="sm" className="mt-2" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "Učitavanje…" : "Učitaj još"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ActivityLoader({
  startupId,
  onOpenPage,
  onOpenIdea,
  onOpenArea,
}: {
  startupId: Id<"startups">;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenIdea: (ideaId: Id<"ideaNodes">) => void;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(api.activity.listPaginated, { startupId }, { initialNumItems: PAGE });
  // „pre N min" se osvežava jednom u minuti.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const entries = useMemo<ActivityEntry[]>(
    () =>
      results.map((item) => {
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
    [results, now],
  );
  return (
    <ActivityScreen
      status={status === "LoadingFirstPage" ? "loading" : "ready"}
      entries={entries}
      canLoadMore={status === "CanLoadMore"}
      loadingMore={status === "LoadingMore"}
      onLoadMore={() => loadMore(PAGE)}
      onOpen={(target) => {
        if (target.kind === "page") onOpenPage(target.pageId as Id<"pages">);
        else if (target.kind === "idea") onOpenIdea(target.ideaId as Id<"ideaNodes">);
        else if (target.kind === "area") onOpenArea(target.areaId as Id<"startupAreas">);
      }}
    />
  );
}

/** Kontejner ekrana Aktivnost: `activity.listPaginated` (najnovije prvo) sa „Učitaj još". */
export function ActivityView({
  startup,
  onOpenPage,
  onOpenIdea,
  onOpenArea,
}: {
  startup: StartupWithAreas;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenIdea: (ideaId: Id<"ideaNodes">) => void;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
}) {
  return (
    <WorkspaceErrorBoundary key={`activity-${startup._id}`} title="Aktivnost se ne može učitati" className="m-4 min-h-[20rem]">
      <ActivityLoader startupId={startup._id} onOpenPage={onOpenPage} onOpenIdea={onOpenIdea} onOpenArea={onOpenArea} />
    </WorkspaceErrorBoundary>
  );
}
