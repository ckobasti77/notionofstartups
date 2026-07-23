"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { CheckSquare2, FilePlus2, FileText, Plus, Blocks, Layers, FolderPlus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreatePageTarget, ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import { TaskTableView } from "@/components/workspace/task-table-view";
import { AREA_ICONS, getAreaTint, getAreaDescription, EmptyState } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatShortDate, type AreaKey } from "@/lib/workspace";

import { AreaCanvasView } from "@/components/workspace/area-canvas-view";
import { LayoutGrid, List } from "lucide-react";

export function AreaView({
  startup,
  profile,
  areaId,
  onOpenPage,
  onCreate,
  onCreateArea,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  areaId: Id<"startupAreas">;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreate: (target: CreatePageTarget) => void;
  onCreateArea?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"notes" | "tasks">("notes");
  const [viewMode, setViewMode] = useState<"list" | "canvas">("list");
  const [selectedTaskAreaId, setSelectedTaskAreaId] = useState<Id<"startupAreas">>(areaId);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState("");

  const updateArea = useMutation(api.startups.updateArea);

  const currentArea = useMemo(
    () => startup.areas.find((item) => item._id === areaId) ?? startup.areas[0],
    [areaId, startup.areas],
  );

  const activeTaskArea = useMemo(
    () => startup.areas.find((item) => item._id === selectedTaskAreaId) ?? currentArea ?? startup.areas[0],
    [selectedTaskAreaId, currentArea, startup.areas],
  );

  const { results: pages, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    currentArea ? { startupId: startup._id, areaId: currentArea._id, parentPageId: null } : "skip",
    { initialNumItems: 50 },
  );

  const notesPages = useMemo(() => pages.filter((page) => page.kind === "note"), [pages]);

  async function handleSaveLabel() {
    if (!currentArea) return;
    const trimmed = labelInput.trim();
    if (!trimmed) {
      setIsEditingLabel(false);
      return;
    }
    if (trimmed !== currentArea.label) {
      try {
        await updateArea({ areaId: currentArea._id, label: trimmed });
        toast.success("Naziv oblasti je sačuvan.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Greška pri čuvanju naziva.");
      }
    }
    setIsEditingLabel(false);
  }

  if (!currentArea) return <EmptyState title="Oblast nije pronađena" description="Izaberi drugu oblast iz navigacije." />;
  const Icon = AREA_ICONS[currentArea.key as AreaKey] || Blocks;
  const tintClass = getAreaTint(currentArea.key);
  const description = getAreaDescription(currentArea.key);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      {/* Area Header */}
      <header data-workspace-enter className="flex flex-wrap items-end justify-between gap-5 border-b border-border/70 pb-6">
        <div className="flex items-start gap-4">
          <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tintClass)}>
            <Icon className="size-5" />
          </span>
          <div>
            <p className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{startup.name}</p>
            {isEditingLabel ? (
              <div className="flex items-center gap-2">
                <Input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveLabel();
                    } else if (e.key === "Escape") {
                      setIsEditingLabel(false);
                      setLabelInput(currentArea.label);
                    }
                  }}
                  onBlur={handleSaveLabel}
                  autoFocus
                  className="h-10 text-2xl font-bold tracking-[-0.035em] sm:text-3xl"
                />
              </div>
            ) : (
              <div className="group flex items-center gap-2">
                <h1
                  className="cursor-pointer text-2xl font-bold tracking-[-0.035em] transition-colors hover:text-primary sm:text-3xl"
                  onDoubleClick={() => {
                    setLabelInput(currentArea.label);
                    setIsEditingLabel(true);
                  }}
                  title="Dupli klik za promenu naziva"
                >
                  {currentArea.label}
                </h1>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  title="Izmeni naziv oblasti"
                  onClick={() => {
                    setLabelInput(currentArea.label);
                    setIsEditingLabel(true);
                  }}
                >
                  <Pencil className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
            )}
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* View Switch: Notes vs Tasks & Layout Mode */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-2 rounded-xl bg-muted/70 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("notes")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 transition-colors",
                activeTab === "notes" ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileText className="size-4" /> Beleške
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 transition-colors",
                activeTab === "tasks" ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CheckSquare2 className="size-4" /> Taskovi
            </button>
          </div>

          {/* Mode Switch: Lista vs Canvas */}
          <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors",
                viewMode === "list" ? "bg-background text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="size-3.5" />
              <span>Lista / Tabela</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("canvas")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors",
                viewMode === "canvas" ? "bg-background text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="size-3.5" />
              <span>Canvas (Oblačići)</span>
            </button>
          </div>

          {activeTab === "notes" ? (
            <Button variant="outline" onClick={() => onCreate({ areaId: currentArea._id, parentPageId: null, initialKind: "note" })}>
              <FilePlus2 className="size-4" /> Nova Beleška
            </Button>
          ) : (
            <Button onClick={() => onCreate({ areaId: activeTaskArea._id, parentPageId: null, initialKind: "task" })}>
              <Plus className="size-4" /> Novi Task
            </Button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div data-workspace-enter className="mt-6">
        {viewMode === "canvas" ? (
          <AreaCanvasView
            startupId={startup._id}
            areaId={currentArea._id}
            kind={activeTab === "notes" ? "note" : "task"}
            onOpenPage={onOpenPage}
            onCreatePage={(kind) =>
              onCreate({ areaId: currentArea._id, parentPageId: null, initialKind: kind })
            }
          />
        ) : activeTab === "notes" ? (
          /* Notes View */
          status === "LoadingFirstPage" ? (
            <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-xl" />)}</div>
          ) : notesPages.length === 0 ? (
            <EmptyState
              icon={FilePlus2}
              title={`Nema beleški u ${currentArea.label}`}
              description="Napravi prvu belešku. Mozete koristiti Rich Text Editor sa stilovima i formatiranjem."
              action={
                <Button onClick={() => onCreate({ areaId: currentArea._id, parentPageId: null, initialKind: "note" })}>
                  <Plus /> Prva beleška
                </Button>
              }
            />
          ) : (
            <Card className="threadline overflow-hidden border-border/75 bg-card/80 p-2">
              {notesPages.map((page) => (
                <button
                  key={page._id}
                  type="button"
                  className="threadline-item flex min-h-16 w-full items-center gap-3 rounded-xl pr-3 text-left hover:bg-accent/35 transition-colors"
                  onClick={() => onOpenPage(page._id)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{page.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Izmenjeno {formatShortDate(page.updatedAt)}</span>
                  </span>
                </button>
              ))}
              {status === "CanLoadMore" || status === "LoadingMore" ? (
                <Button type="button" variant="ghost" className="mt-1 w-full" disabled={status === "LoadingMore"} onClick={() => loadMore(50)}>
                  {status === "LoadingMore" ? "Učitavam…" : "Učitaj još"}
                </Button>
              ) : null}
            </Card>
          )
        ) : (
          /* Tasks View with Task Areas Sub-navigation & TaskTableView */
          <div className="space-y-6">
            {/* Task Areas Sub-navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Oblasti u Taskovima:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {startup.areas.map((area) => {
                    const isSelected = area._id === selectedTaskAreaId;
                    return (
                      <button
                        key={area._id}
                        type="button"
                        onClick={() => setSelectedTaskAreaId(area._id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all border",
                          isSelected
                            ? "bg-primary/10 text-primary border-primary/30 shadow-sm"
                            : "bg-muted/40 text-muted-foreground border-transparent hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Layers className="size-3.5" />
                        {area.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {onCreateArea ? (
                <Button variant="ghost" size="sm" onClick={onCreateArea} className="text-xs text-muted-foreground hover:text-foreground">
                  <FolderPlus className="size-4" /> Dodaj novu Oblast
                </Button>
              ) : null}
            </div>

            {/* Render Task Management Table for Selected Task Area */}
            <TaskTableView
              key={selectedTaskAreaId}
              startup={startup}
              profile={profile}
              areaId={selectedTaskAreaId}
              onOpenPage={onOpenPage}
              onCreateTask={() => onCreate({ areaId: selectedTaskAreaId, initialKind: "task" })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

