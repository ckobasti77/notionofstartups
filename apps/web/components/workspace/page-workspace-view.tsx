"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AreaCanvasView } from "@/components/workspace/area-canvas-view";
import { isEditableTarget } from "@/components/workspace/workspace-history";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import type { Id } from "@/convex/_generated/dataModel";
import type { PageKind } from "@/lib/page-kinds";

type CanvasFilter = "all" | PageKind;

/**
 * Mapa stranice (`?view=page&pageId=…&tab=mapa`, PROSTOR P13, plan K07 §3):
 * postojeći kanvas podstranica kao opcioni prikaz. Dokument (editor, lista
 * podstranica) je sada `page/page-document-view.tsx`; ovde ostaje samo Mapa,
 * zaglavlje „Mapa · <naslov>" i „Nazad na stranicu". Izgled kartica menja K15.
 */
export function PageMapView({
  startup,
  page,
  onBackToPage,
  onOpenPage,
  onCreateChild,
}: {
  startup: StartupWithAreas;
  page: { _id: Id<"pages">; title: string; areaId: Id<"startupAreas"> };
  onBackToPage: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
}) {
  const [filter, setFilter] = useState<CanvasFilter>("all");
  const area = useMemo(
    () => startup.areas.find((item) => item._id === page.areaId),
    [page.areaId, startup.areas],
  );
  const title = page.title.trim() || "Bez naslova";

  // Esc = nazad na stranicu. Ugovor kao ranije: ko potroši Escape (Radix
  // slojevi, kanvas sa selekcijom) pozove preventDefault pre window bubble faze;
  // React Flow ne zove preventDefault za svoje čvorove i ivice.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest(".react-flow__node, .react-flow__edge") !== null
      ) {
        return;
      }
      onBackToPage();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackToPage]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <header data-workspace-enter className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={onBackToPage}
          aria-keyshortcuts="Escape"
        >
          <ArrowLeft aria-hidden="true" />
          Nazad na stranicu
        </Button>
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-[-0.02em] lg:text-2xl">
          Mapa · {title}
        </h1>
      </header>
      <AreaCanvasView
        startupId={startup._id}
        areaId={page.areaId}
        rootPageId={page._id}
        canvasLabel={title}
        areaKey={area?.key ?? "other"}
        areas={startup.areas}
        filter={filter}
        onFilterChange={setFilter}
        onOpenCanvas={onOpenPage}
        onOpenDetails={onOpenPage}
        onCreatePage={(kind) =>
          onCreateChild({ areaId: page.areaId, parentPageId: page._id, initialKind: kind })
        }
        layout="standard"
      />
    </div>
  );
}
