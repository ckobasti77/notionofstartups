"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckSquare2,
  FilePlus2,
  FileText,
  LayoutGrid,
  List,
  Plus,
} from "lucide-react";
import { useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaCanvasView } from "@/components/workspace/area-canvas-view";
import {
  PageEditorView,
  type PageEditorSaveState,
} from "@/components/workspace/page-editor-view";
import { pageArchiveFallbackRoute } from "@/components/workspace/workspace-route";
import type {
  CreatePageTarget,
  StartupWithAreas,
  WorkspaceRoute,
} from "@/components/workspace/types";
import {
  ProfileAvatar,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "@/components/workspace/workspace-ui";
import { NestingTargetMenu } from "@/components/workspace/nesting-target-menu";
import { DetachPageButton } from "@/components/workspace/detach-page-button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type CanvasFilter = "all" | "note" | "task";

const FILTERS: Array<{
  value: CanvasFilter;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { value: "all", label: "Sve", icon: LayoutGrid },
  { value: "note", label: "Beleške", icon: FileText },
  { value: "task", label: "Zadaci", icon: CheckSquare2 },
];

export function PageWorkspaceView({
  startup,
  pageId,
  onOpenCanvas,
  onOpenArea,
  onOpenDetails,
  onCreateChild,
  onArchived,
  onSaveStateChange,
}: {
  startup: StartupWithAreas;
  pageId: Id<"pages">;
  onOpenCanvas: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
  onOpenDetails: (pageId: Id<"pages">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
  onArchived: (fallbackRoute: WorkspaceRoute) => void;
  onSaveStateChange?: (state: PageEditorSaveState) => void;
}) {
  const page = useQuery(api.pages.get, { pageId });
  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [viewMode, setViewMode] = useState<"canvas" | "list">("canvas");
  const archiveFallbackRef = useRef<WorkspaceRoute | null>(null);
  const canvasData = useQuery(
    api.areasV2.getCanvas,
    page
      ? {
          startupId: startup._id,
          areaId: page.areaId,
          rootPageId: page._id,
        }
      : "skip",
  );
  const visiblePages = useMemo(
    () =>
      (canvasData?.pages ?? []).filter(
        (child) => filter === "all" || child.kind === filter,
      ),
    [canvasData?.pages, filter],
  );
  const visibleGhosts = useMemo(
    () =>
      (canvasData?.ghosts ?? []).filter(
        (ghost) => filter === "all" || ghost.kind === filter,
      ),
    [canvasData?.ghosts, filter],
  );
  const canvasArea = useMemo(
    () =>
      page
        ? startup.areas.find((area) => area._id === page.areaId)
        : undefined,
    [page, startup.areas],
  );

  useEffect(() => {
    if (page) {
      archiveFallbackRef.current = pageArchiveFallbackRoute(page);
    }
  }, [page]);

  return (
    <div className="pb-24">
      <PageEditorView
        startup={startup}
        pageId={pageId}
        onOpenPage={onOpenCanvas}
        onOpenArea={onOpenArea}
        onCreateChild={onCreateChild}
        onArchived={() => {
          if (archiveFallbackRef.current) {
            onArchived(archiveFallbackRef.current);
          }
        }}
        onSaveStateChange={onSaveStateChange}
      />

      {page ? (
        <section
          className="mx-auto w-full max-w-7xl px-4 sm:px-7 lg:px-10"
          aria-labelledby="page-canvas-heading"
        >
          <div className="mb-4 flex flex-col gap-4 border-t border-border/70 pt-7 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-primary">
                Zaseban kanvas
              </p>
              <h2
                id="page-canvas-heading"
                className="mt-1 truncate text-xl font-bold tracking-[-0.03em] text-foreground sm:text-2xl"
              >
                Podstavke za {page.title || "stranicu bez naslova"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Beleške i zadaci ispod ove stavke dele isti kontekst. Otvori
                karticu za njen kanvas ili detalje za brzo uređivanje.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {viewMode === "list" ? (
                <>
                  <div
                    className="grid grid-cols-3 rounded-xl border border-border/65 bg-muted/35 p-1"
                    aria-label="Filtriraj sadržaj kanvasa"
                  >
                    {FILTERS.map(({ value, label, icon: Icon }) => (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-9 rounded-lg px-3 text-xs",
                          filter === value
                            ? "bg-background font-bold text-foreground shadow-sm hover:bg-background"
                            : "text-muted-foreground",
                        )}
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl"
                    onClick={() =>
                      onCreateChild({
                        areaId: page.areaId,
                        parentPageId: page._id,
                        initialKind: "note",
                      })
                    }
                  >
                    <FilePlus2 aria-hidden="true" />
                    Nova beleška
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-xl"
                    onClick={() =>
                      onCreateChild({
                        areaId: page.areaId,
                        parentPageId: page._id,
                        initialKind: "task",
                      })
                    }
                  >
                    <Plus aria-hidden="true" />
                    Novi zadatak
                  </Button>
                </>
              ) : null}
              <div
                className="grid grid-cols-2 rounded-xl border border-border/65 bg-muted/35 p-1"
                aria-label="Izaberi prikaz podstavki"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 rounded-lg px-3 text-xs",
                    viewMode === "canvas"
                      ? "bg-background font-bold text-foreground shadow-sm hover:bg-background"
                      : "text-muted-foreground",
                  )}
                  aria-pressed={viewMode === "canvas"}
                  onClick={() => setViewMode("canvas")}
                >
                  <LayoutGrid className="size-3.5" aria-hidden="true" />
                  Kanvas
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 rounded-lg px-3 text-xs",
                    viewMode === "list"
                      ? "bg-background font-bold text-foreground shadow-sm hover:bg-background"
                      : "text-muted-foreground",
                  )}
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  <List className="size-3.5" aria-hidden="true" />
                  Lista
                </Button>
              </div>
            </div>
          </div>

          {viewMode === "canvas" ? (
            <AreaCanvasView
              startupId={startup._id}
              areaId={page.areaId}
              rootPageId={page._id}
              canvasLabel={page.title || "Stranica bez naslova"}
              areaKey={canvasArea?.key ?? "other"}
              filter={filter}
              onFilterChange={setFilter}
              onOpenCanvas={onOpenCanvas}
              onOpenDetails={onOpenDetails}
              onCreatePage={(kind) =>
                onCreateChild({
                  areaId: page.areaId,
                  parentPageId: page._id,
                  initialKind: kind,
                })
              }
            />
          ) : canvasData === undefined ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : visiblePages.length + visibleGhosts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/80 px-6 py-12 text-center text-sm text-muted-foreground">
              Nema podstavki koje odgovaraju izabranom filteru.
            </div>
          ) : (
            <div className="space-y-3">
              {visiblePages.map((child) => (
                <article
                  key={child._id}
                  className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center"
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center",
                      child.kind === "task"
                        ? "rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "rounded-[42%_58%_52%_48%/46%_44%_56%_54%] bg-sky-500/10 text-sky-700 dark:text-sky-300",
                    )}
                  >
                    {child.kind === "task" ? (
                      <CheckSquare2 className="size-4" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold">
                      {child.title || "Bez naslova"}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {child.text || "Nema kratkog opisa."}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {child.kind === "task" && child.taskStatus ? (
                        <TaskStatusBadge status={child.taskStatus} />
                      ) : null}
                      {child.kind === "task" && child.taskPriority ? (
                        <TaskPriorityBadge priority={child.taskPriority} />
                      ) : null}
                      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                        <ProfileAvatar
                          profile={{
                            displayName:
                              child.creator?.displayName ?? "Član tima",
                            avatarUrl: child.creator?.avatarUrl ?? null,
                          }}
                          className="size-5"
                        />
                        {child.creator?.displayName ?? "Član tima"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {child.canDetach ? (
                      <DetachPageButton
                        startupId={startup._id}
                        pageId={child._id}
                        title={child.title}
                      />
                    ) : null}
                    {child.canMove ? (
                      <NestingTargetMenu
                        startupId={startup._id}
                        childPageId={child._id}
                        childTitle={child.title}
                        candidates={canvasData.pages
                          .filter((candidate) => candidate._id !== child._id)
                          .map((candidate) => ({
                            pageId: candidate._id,
                            title: candidate.title,
                            kind: candidate.kind,
                          }))}
                      />
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenDetails(child._id)}
                    >
                      Detalji
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onOpenCanvas(child._id)}
                    >
                      Otvori kanvas
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </article>
              ))}
              {visibleGhosts.map((ghost) => (
                <article
                  key={`pending-${ghost.requestId}`}
                  className="flex flex-col gap-4 rounded-2xl border border-dashed border-amber-500/45 bg-amber-500/6 px-4 py-4 sm:flex-row sm:items-center"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-800 dark:text-amber-200">
                    {ghost.kind === "task" ? (
                      <CheckSquare2 className="size-4" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold">
                      {ghost.title || "Bez naslova"}
                    </h3>
                    <p
                      className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200"
                      role="status"
                    >
                      Čeka odobrenje autora ovog kanvasa
                      {ghost.requester?.displayName
                        ? ` · predložio/la ${ghost.requester.displayName}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenDetails(ghost.pageId)}
                  >
                    Detalji
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-7 lg:px-10">
          <Skeleton className="h-[34rem] rounded-3xl" />
        </div>
      )}
    </div>
  );
}
