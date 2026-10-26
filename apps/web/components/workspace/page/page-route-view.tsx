"use client";

import { Component, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";

import { PageMapView } from "@/components/workspace/page-workspace-view";
import { TaskPageView } from "@/components/workspace/task-page/task-page-view";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { useQueryResult } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Today } from "@/lib/today";

import type { PageEditorSaveState } from "./page-autosave-model";
import { PageDocumentSkeleton, PageRouteProblem } from "./page-document";
import { PageDocumentView } from "./page-document-view";

export type PageRouteViewProps = {
  startup: StartupWithAreas;
  profileId: Id<"profiles">;
  pageId: Id<"pages">;
  tab?: "mapa";
  now: number;
  /** Današnji dan (plan „Moj dan" na zadatku). */
  today: Today;
  autoFocusTitle?: boolean;
  onAutoFocusDone?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenMap: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
  onOpenChannel?: (channelId: Id<"chatChannels">) => void;
  onOpenTrash: () => void;
  onCreateChild: (target: CreatePageTarget) => void;
  onArchived: (page: { areaId: Id<"startupAreas">; parentPageId: Id<"pages"> | null }) => void;
  onSaveStateChange?: (state: PageEditorSaveState) => void;
};

/**
 * Ruta `?view=page` (PROSTOR K10, plan K07 §3): beleška, tabela i fajl su
 * dokument tima, zadatak je zadatak na celu stranu (K11, `TaskPageView`); `tab=mapa`
 * je Mapa stranice (zadatak nema mapu). Sopstvena granica greške razlikuje
 * obrisanu stranicu (Korpa) od greške učitavanja („Pokušaj ponovo").
 */
export function PageRouteView(props: PageRouteViewProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <PageRouteBoundary
      key={`${props.pageId}:${attempt}`}
      fallback={
        <PageRouteFailure
          startupId={props.startup._id}
          pageId={props.pageId}
          onRetry={() => setAttempt((value) => value + 1)}
          onOpenTrash={props.onOpenTrash}
        />
      }
    >
      <PageRouteLoader {...props} />
    </PageRouteBoundary>
  );
}

function PageRouteLoader({
  startup,
  profileId,
  pageId,
  tab,
  now,
  today,
  autoFocusTitle,
  onAutoFocusDone,
  onOpenPage,
  onOpenMap,
  onOpenArea,
  onOpenChannel,
  onCreateChild,
  onArchived,
  onSaveStateChange,
}: PageRouteViewProps) {
  const page = useQuery(api.pages.get, { pageId });
  if (page === undefined) return <PageDocumentSkeleton />;
  const fallback = { areaId: page.areaId, parentPageId: page.parentPageId };

  if (page.kind === "task") {
    return (
      <TaskPageView
        startup={startup}
        profileId={profileId}
        page={page}
        today={today}
        autoFocusTitle={autoFocusTitle}
        onAutoFocusDone={onAutoFocusDone}
        onOpenPage={onOpenPage}
        onOpenArea={onOpenArea}
        onOpenChannel={onOpenChannel}
        onCreateChild={onCreateChild}
        onArchived={() => onArchived(fallback)}
        onSaveStateChange={onSaveStateChange}
      />
    );
  }
  if (tab === "mapa") {
    return (
      <PageMapView
        startup={startup}
        page={page}
        onBackToPage={() => onOpenPage(pageId)}
        onOpenPage={onOpenPage}
        onCreateChild={onCreateChild}
      />
    );
  }
  return (
    <PageDocumentView
      startup={startup}
      profileId={profileId}
      page={page}
      now={now}
      autoFocusTitle={autoFocusTitle}
      onAutoFocusDone={onAutoFocusDone}
      onOpenPage={onOpenPage}
      onOpenArea={onOpenArea}
      onOpenMap={onOpenMap}
      onOpenChannel={onOpenChannel}
      onCreateChild={onCreateChild}
      onArchived={() => onArchived(fallback)}
      onSaveStateChange={onSaveStateChange}
    />
  );
}

/**
 * Pad `pages.get`: proizvodnja skriva poruku greške, pa se pita
 * `areasV2.resolveRoute` (ne baca) — stranica koje više nema (Korpa, obrisana
 * grana) dobija „Otvori Korpu", a ostalo „Pokušaj ponovo".
 */
function PageRouteFailure({
  startupId,
  pageId,
  onRetry,
  onOpenTrash,
}: {
  startupId: Id<"startups">;
  pageId: Id<"pages">;
  onRetry: () => void;
  onOpenTrash: () => void;
}) {
  const { data: resolved, failed } = useQueryResult(api.areasV2.resolveRoute, { startupId, pageId });
  if (resolved === undefined && !failed) return <PageDocumentSkeleton />;
  const missing = resolved === null || resolved?.kind === "area";
  return <PageRouteProblem missing={missing} onRetry={onRetry} onOpenTrash={onOpenTrash} />;
}

class PageRouteBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
