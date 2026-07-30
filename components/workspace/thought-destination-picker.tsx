"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import {
  ChevronRight,
  FolderInput,
  LoaderCircle,
  Plus,
  Blocks,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ThoughtDestination } from "@/components/workspace/thought-sharing";
import type { StartupWithAreas } from "@/components/workspace/types";
import { AREA_ICONS, getAreaTint } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { pageKindMeta } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";
import type { AreaKey } from "@/lib/workspace";

type ThoughtDestinationPickerProps = {
  open: boolean;
  startup: StartupWithAreas;
  selectedCount: number;
  onOpenChange: (open: boolean) => void;
  onSelect: (destination: ThoughtDestination) => void;
};

export function ThoughtDestinationPicker({
  open,
  startup,
  selectedCount,
  onOpenChange,
  onSelect,
}: ThoughtDestinationPickerProps) {
  const [expandedAreaIds, setExpandedAreaIds] = useState<Set<Id<"startupAreas">>>(new Set());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-5 py-5 pr-12 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <FolderInput className="size-4" />
            </span>
            Pošalji u radni prostor
          </DialogTitle>
          <DialogDescription>
            Izaberi oblast ili stranicu za {selectedCount === 1 ? "ovu misao" : `${selectedCount} izabranih misli`}.
            Kopija će biti vidljiva timu, a original ostaje privatan.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin min-h-0 overflow-y-auto px-3 py-3 sm:px-4" aria-label="Odredišta u radnom prostoru">
          <div className="space-y-1">
            {startup.areas.map((area) => {
              const AreaIcon = AREA_ICONS[area.key as AreaKey] || Blocks;
              const tintClass = getAreaTint(area.key);
              const expanded = expandedAreaIds.has(area._id);
              return (
                <section key={area._id} aria-labelledby={`destination-area-${area._id}`}>
                  <div className="group flex min-h-11 items-center rounded-xl border border-transparent hover:border-border/65 hover:bg-muted/45 focus-within:border-ring/50">
                    <button
                      type="button"
                      className="ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={expanded ? `Sakrij stranice za ${area.label}` : `Prikaži stranice za ${area.label}`}
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedAreaIds((current) => {
                          const next = new Set(current);
                          if (expanded) next.delete(area._id);
                          else next.add(area._id);
                          return next;
                        });
                      }}
                    >
                      <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                    </button>
                    <button
                      id={`destination-area-${area._id}`}
                      type="button"
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => onSelect({ areaId: area._id, parentPageId: null, label: area.label })}
                    >
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", tintClass)}>
                        <AreaIcon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{area.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">Dodaj na vrh oblasti</span>
                      </span>
                      <FolderInput className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
                    </button>
                  </div>
                  {expanded ? (
                    <DestinationPageList
                      startupId={startup._id}
                      areaId={area._id}
                      parentPageId={null}
                      areaLabel={area.label}
                      onSelect={onSelect}
                    />
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type DestinationPageListProps = {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  parentPageId: Id<"pages"> | null;
  areaLabel: string;
  onSelect: (destination: ThoughtDestination) => void;
};

function DestinationPageList({
  startupId,
  areaId,
  parentPageId,
  areaLabel,
  onSelect,
}: DestinationPageListProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId, areaId, parentPageId },
    { initialNumItems: 50 },
  );

  return (
    <div className="ml-5 border-l border-border/65 pl-2" aria-label={parentPageId === null ? `Stranice u ${areaLabel}` : "Podstranice"}>
      {status === "LoadingFirstPage" ? (
        <div className="flex min-h-9 items-center gap-2 px-3 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" /> Učitavam stranice
        </div>
      ) : results.length === 0 ? (
        <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">
          Nema stranica na ovom nivou.
        </p>
      ) : (
        <div className="space-y-0.5 py-1">
          {results.map((page) => (
            <DestinationPageNode
              key={page._id}
              page={page}
              startupId={startupId}
              areaId={areaId}
              areaLabel={areaLabel}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <button
          type="button"
          className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(50)}
        >
          {status === "LoadingMore" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {status === "LoadingMore" ? "Učitavam" : "Učitaj još stranica"}
        </button>
      ) : null}
    </div>
  );
}

type DestinationPageNodeProps = {
  page: Doc<"pages">;
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  areaLabel: string;
  onSelect: (destination: ThoughtDestination) => void;
};

function DestinationPageNode({
  page,
  startupId,
  areaId,
  areaLabel,
  onSelect,
}: DestinationPageNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = pageKindMeta(page.kind).icon;

  return (
    <div>
      <div className="group flex min-h-10 items-center rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-within:bg-muted/70 focus-within:text-foreground">
        <button
          type="button"
          className="ml-0.5 grid size-8 shrink-0 place-items-center rounded-md hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={expanded ? `Sakrij podstranice za ${page.title}` : `Prikaži podstranice za ${page.title}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <button
          type="button"
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md pr-3 text-left text-[0.8125rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => onSelect({ areaId, parentPageId: page._id, label: page.title })}
        >
          <Icon className="size-3.5 shrink-0 opacity-80" />
          <span className="min-w-0 flex-1 truncate">{page.title}</span>
          <span className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            Izaberi
          </span>
        </button>
      </div>
      {expanded ? (
        <DestinationPageList
          startupId={startupId}
          areaId={areaId}
          parentPageId={page._id}
          areaLabel={areaLabel}
          onSelect={onSelect}
        />
      ) : null}
    </div>
  );
}
