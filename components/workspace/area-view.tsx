"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Blocks,
  CheckSquare2,
  Eye,
  FilePlus2,
  FileText,
  FolderPlus,
  LayoutGrid,
  Link2,
  List,
  Maximize2,
  Pencil,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaBriefingDock } from "@/components/workspace/area-briefing-dock";
import { AreaCanvasView } from "@/components/workspace/area-canvas-view";
import { AreaSignedContributions } from "@/components/workspace/area-signed-contributions";
import { NestingTargetMenu } from "@/components/workspace/nesting-target-menu";
import { DetachPageButton } from "@/components/workspace/detach-page-button";
import type {
  CreatePageTarget,
  ProfileWithAvatar,
  StartupWithAreas,
} from "@/components/workspace/types";
import {
  AREA_ICONS,
  EmptyState,
  getAreaDescription,
  getAreaTint,
} from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  formatShortDate,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type AreaKey,
} from "@/lib/workspace";

type ContentFilter = "all" | "note" | "task";
type ViewMode = "canvas" | "list";

const FILTER_OPTIONS: Array<{
  value: ContentFilter;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { value: "all", label: "Sve", icon: LayoutGrid },
  { value: "note", label: "Beleške", icon: FileText },
  { value: "task", label: "Zadaci", icon: CheckSquare2 },
];

export function AreaView({
  startup,
  profile,
  areaId,
  onOpenCanvas,
  onOpenDetails,
  onCreate,
  onCreateArea,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  areaId: Id<"startupAreas">;
  onOpenCanvas: (pageId: Id<"pages">) => void;
  onOpenDetails: (pageId: Id<"pages">) => void;
  onCreate: (target: CreatePageTarget) => void;
  onCreateArea?: () => void;
}) {
  const [filter, setFilter] = useState<ContentFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState("");

  const updateArea = useMutation(api.startups.updateArea);
  const updateAreaBody = useMutation(api.areasV2.updateAreaBody);
  const currentArea = useMemo(
    () => startup.areas.find((area) => area._id === areaId),
    [areaId, startup.areas],
  );
  const canvasData = useQuery(
    api.areasV2.getCanvas,
    currentArea
      ? {
          startupId: startup._id,
          areaId: currentArea._id,
          rootPageId: null,
        }
      : "skip",
  );

  const visiblePages = useMemo(
    () =>
      (canvasData?.pages ?? []).filter(
        (page) => filter === "all" || page.kind === filter,
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
  const relationCounts = useMemo(() => {
    const counts = new Map<Id<"pages">, number>();
    for (const relation of canvasData?.relations ?? []) {
      counts.set(relation.source, (counts.get(relation.source) ?? 0) + 1);
      counts.set(relation.target, (counts.get(relation.target) ?? 0) + 1);
    }
    return counts;
  }, [canvasData?.relations]);

  if (!currentArea) {
    return (
      <EmptyState
        title="Oblast nije pronađena"
        description="Izaberi drugu oblast iz navigacije."
      />
    );
  }

  const area = currentArea;
  const Icon = AREA_ICONS[area.key as AreaKey] || Blocks;
  const canEditArea = startup.createdByProfileId === profile._id;
  const tintClass = getAreaTint(area.key);
  const description = getAreaDescription(area.key);

  async function saveLabel() {
    const trimmed = labelInput.trim();
    if (!canEditArea || !trimmed || trimmed === area.label) {
      setLabelInput(area.label);
      setIsEditingLabel(false);
      return;
    }
    try {
      await updateArea({ areaId: area._id, label: trimmed });
      toast.success("Naziv oblasti je sačuvan.");
      setIsEditingLabel(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Naziv oblasti nije sačuvan.",
      );
    }
  }

  function createPage(kind: "note" | "task") {
    onCreate({
      areaId: area._id,
      parentPageId: null,
      initialKind: kind,
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header
        data-workspace-enter
        className="flex flex-col gap-5 border-b border-border/70 pb-6 xl:flex-row xl:items-end xl:justify-between"
      >
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-2xl",
              tintClass,
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {startup.name}
            </p>
            {isEditingLabel ? (
              <Input
                value={labelInput}
                onChange={(event) => setLabelInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setLabelInput(currentArea.label);
                    setIsEditingLabel(false);
                  }
                }}
                onBlur={() => void saveLabel()}
                autoFocus
                aria-label="Naziv oblasti"
                maxLength={80}
                className="h-11 max-w-xl text-2xl font-bold tracking-[-0.035em] sm:text-3xl"
              />
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
                  {currentArea.label}
                </h1>
                {canEditArea ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 rounded-xl text-muted-foreground"
                    aria-label={`Izmeni naziv oblasti ${currentArea.label}`}
                    onClick={() => {
                      setLabelInput(currentArea.label);
                      setIsEditingLabel(true);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            )}
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onCreateArea ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-xl text-muted-foreground"
              onClick={onCreateArea}
            >
              <FolderPlus aria-hidden="true" />
              Nova oblast
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => createPage("note")}
          >
            <FilePlus2 aria-hidden="true" />
            Nova beleška
          </Button>
          <Button
            type="button"
            className="h-10 rounded-xl"
            onClick={() => createPage("task")}
          >
            <Plus aria-hidden="true" />
            Novi zadatak
          </Button>
        </div>
      </header>

      <div data-workspace-enter className="mt-6">
        {canvasData ? (
          <>
            <AreaBriefingDock
              key={`${currentArea._id}:${canvasData.scope.briefing.revision}`}
              areaLabel={currentArea.label}
              content={canvasData.scope.briefing.content}
              revision={canvasData.scope.briefing.revision}
              canEdit={canvasData.scope.briefing.canEdit}
              onSave={async (content, expectedRevision) => {
                try {
                  const result = await updateAreaBody({
                    startupId: startup._id,
                    areaId: currentArea._id,
                    content,
                    expectedRevision,
                  });
                  toast.success("Briefing oblasti je sačuvan.");
                  return result.revision;
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                        : "Briefing nije sačuvan.",
                  );
                  throw error;
                }
              }}
            />
            <AreaSignedContributions
              areaId={currentArea._id}
              areaLabel={currentArea.label}
            />
          </>
        ) : (
          <Skeleton className="h-56 rounded-[1.35rem]" />
        )}
      </div>

      <section data-workspace-enter className="mt-7" aria-label="Sadržaj oblasti">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.13em] text-primary">
              Radni prostor oblasti
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.025em]">
              Beleške, zadaci i njihove veze
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="grid grid-cols-3 rounded-xl border border-border/65 bg-muted/35 p-1"
              aria-label="Filtriraj sadržaj oblasti"
            >
              {FILTER_OPTIONS.map(({ value, label, icon: FilterIcon }) => (
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
                  <FilterIcon className="size-3.5" aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>

            <div
              className="grid grid-cols-2 rounded-xl border border-border/65 bg-muted/35 p-1"
              aria-label="Izaberi prikaz oblasti"
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

        {canvasData?.truncated ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Prikazan je bezbedan ograničen skup najskorijih stavki. Filter se
            primenjuje samo na taj učitani skup.
          </div>
        ) : null}

        {viewMode === "canvas" ? (
          <AreaCanvasView
            startupId={startup._id}
            areaId={currentArea._id}
            rootPageId={null}
            canvasLabel={currentArea.label}
            filter={filter}
            onOpenCanvas={onOpenCanvas}
            onOpenDetails={onOpenDetails}
            onCreatePage={createPage}
          />
        ) : canvasData === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : visiblePages.length + visibleGhosts.length === 0 ? (
          <EmptyState
            icon={filter === "task" ? CheckSquare2 : FileText}
            title={
              filter === "all"
                ? `Još nema sadržaja u oblasti ${currentArea.label}`
                : filter === "note"
                  ? `Nema beleški u oblasti ${currentArea.label}`
                  : `Nema zadataka u oblasti ${currentArea.label}`
            }
            description={
              canvasData.truncated
                ? "U učitanom skupu nema stavki koje odgovaraju ovom prikazu. Promeni filter ili arhiviraj starije stavke."
                : "Dodaj belešku za kontekst ili zadatak za izvršenje. Kasnije ih možeš povezati."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => createPage("note")}>
                  <FilePlus2 aria-hidden="true" />
                  Nova beleška
                </Button>
                <Button onClick={() => createPage("task")}>
                  <Plus aria-hidden="true" />
                  Novi zadatak
                </Button>
              </div>
            }
          />
        ) : (
          <Card className="overflow-hidden border-border/75 bg-card/80 p-2">
            <ul className="space-y-1" aria-label="Stavke oblasti">
              {visiblePages.map((page) => {
                const status =
                  page.kind === "task" && page.taskStatus
                    ? TASK_STATUS_META[page.taskStatus]
                    : null;
                const priority =
                  page.kind === "task" && page.taskPriority
                    ? TASK_PRIORITY_META[page.taskPriority]
                    : null;
                const relationCount = relationCounts.get(page._id) ?? 0;
                return (
                  <li
                    key={page._id}
                    className="flex flex-col gap-2 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-border/65 hover:bg-accent/25 sm:flex-row sm:items-center"
                  >
                    <button
                      type="button"
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onOpenCanvas(page._id)}
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-xl",
                          page.kind === "note"
                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {page.kind === "note" ? (
                          <FileText className="size-4" aria-hidden="true" />
                        ) : (
                          <CheckSquare2
                            className="size-4"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {page.title || "Bez naslova"}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {page.kind === "note" ? "Beleška" : "Zadatak"}
                          </span>
                          {status ? <span>{status.label}</span> : null}
                          {priority ? <span>{priority.label}</span> : null}
                          {relationCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Link2 className="size-3" aria-hidden="true" />
                              {relationCount}
                            </span>
                          ) : null}
                          <span>
                            {page.creator?._id === profile._id
                              ? "Tvoje"
                              : page.creator?.displayName ?? "Autor nije dostupan"}
                          </span>
                          <span>Izmenjeno {formatShortDate(page.updatedAt)}</span>
                        </span>
                      </span>
                    </button>

                    <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                      {page.canDetach ? (
                        <DetachPageButton
                          startupId={startup._id}
                          pageId={page._id}
                          title={page.title}
                          compact
                        />
                      ) : null}
                      {page.canMove ? (
                        <NestingTargetMenu
                          startupId={startup._id}
                          childPageId={page._id}
                          childTitle={page.title}
                          candidates={canvasData.pages
                            .filter((candidate) => candidate._id !== page._id)
                            .map((candidate) => ({
                              pageId: candidate._id,
                              title: candidate.title,
                              kind: candidate.kind,
                            }))}
                          compact
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 rounded-xl"
                        onClick={() => onOpenDetails(page._id)}
                      >
                        <Eye aria-hidden="true" />
                        Detalji
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-xl"
                        aria-label={`Otvori kanvas: ${page.title || "Bez naslova"}`}
                        onClick={() => onOpenCanvas(page._id)}
                      >
                        <Maximize2 aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
              {visibleGhosts.map((ghost) => (
                <li
                  key={`pending-${ghost.requestId}`}
                  className="flex flex-col gap-2 rounded-xl border border-dashed border-amber-500/45 bg-amber-500/6 px-3 py-3 sm:flex-row sm:items-center"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-800 dark:text-amber-200">
                    {ghost.kind === "task" ? (
                      <CheckSquare2 className="size-4" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {ghost.title || "Bez naslova"}
                    </span>
                    <span className="mt-1 block text-xs text-amber-800 dark:text-amber-200">
                      Čeka odobrenje autora roditeljskog kanvasa
                      {ghost.requester?.displayName
                        ? ` · predložio/la ${ghost.requester.displayName}`
                        : ""}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-end sm:self-auto"
                    onClick={() => onOpenDetails(ghost.pageId)}
                  >
                    <Eye aria-hidden="true" />
                    Detalji
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
