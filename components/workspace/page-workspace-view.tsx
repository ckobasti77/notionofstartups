"use client";

import { useState } from "react";
import { CheckSquare2, FileText, LayoutGrid } from "lucide-react";
import { useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaCanvasView } from "@/components/workspace/area-canvas-view";
import {
  PageEditorView,
  type PageEditorSaveState,
} from "@/components/workspace/page-editor-view";
import type {
  CreatePageTarget,
  StartupWithAreas,
} from "@/components/workspace/types";
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
  onOpenDetails,
  onCreateChild,
  onArchived,
  onSaveStateChange,
}: {
  startup: StartupWithAreas;
  pageId: Id<"pages">;
  onOpenCanvas: (pageId: Id<"pages">) => void;
  onOpenDetails: (pageId: Id<"pages">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
  onArchived: () => void;
  onSaveStateChange?: (state: PageEditorSaveState) => void;
}) {
  const page = useQuery(api.pages.get, { pageId });
  const [filter, setFilter] = useState<CanvasFilter>("all");

  return (
    <div className="pb-24">
      <PageEditorView
        startup={startup}
        pageId={pageId}
        onOpenPage={onOpenCanvas}
        onCreateChild={onCreateChild}
        onArchived={onArchived}
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
          </div>

          <AreaCanvasView
            startupId={startup._id}
            areaId={page.areaId}
            rootPageId={page._id}
            canvasLabel={page.title || "Stranica bez naslova"}
            filter={filter}
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
        </section>
      ) : (
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-7 lg:px-10">
          <Skeleton className="h-[34rem] rounded-3xl" />
        </div>
      )}
    </div>
  );
}
