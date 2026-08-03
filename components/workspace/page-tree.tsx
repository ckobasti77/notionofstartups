"use client";

import { useEffect, useRef } from "react";
import { usePaginatedQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  LoaderCircle,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeadlineBadge } from "@/components/workspace/deadline-badge";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { pageKindMeta, supportsTaskData } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";
import type { CreatePageTarget } from "@/components/workspace/types";

type PageTreeProps = {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  currentProfileId: Id<"profiles">;
  selectedPageId?: Id<"pages">;
  expandedPageIds: ReadonlySet<Id<"pages">>;
  transientExpandedPageIds: ReadonlySet<Id<"pages">>;
  activeDropPageId?: Id<"pages">;
  onPageExpandedChange: (pageId: Id<"pages">, expanded: boolean) => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreate: (target: CreatePageTarget) => void;
  // Drag and drop:
  path?: Array<Id<"pages">>;
  draggedPageId: Id<"pages"> | null;
  onDragPageStart: (pageId: Id<"pages">) => void;
  onDragPageEnd: () => void;
  onDragPageOver: (pageId: Id<"pages"> | null, areaId: Id<"startupAreas">) => void;
  onDropPage: (draggedPageId: Id<"pages">, targetParentPageId: Id<"pages"> | null, targetAreaId: Id<"startupAreas">) => void;
};

export function PageTree({
  startupId,
  areaId,
  currentProfileId,
  selectedPageId,
  expandedPageIds,
  transientExpandedPageIds,
  activeDropPageId,
  onPageExpandedChange,
  onOpenPage,
  onCreate,
  path = [],
  draggedPageId,
  onDragPageStart,
  onDragPageEnd,
  onDragPageOver,
  onDropPage,
}: PageTreeProps) {
  const { results: pages, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId, areaId, parentPageId: null },
    { initialNumItems: 50 },
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex h-8 items-center gap-2 px-3 text-xs text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" /> Učitavanje stranica
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <button
        type="button"
        className="group flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        onClick={() => onCreate({ areaId, parentPageId: null })}
      >
        <Plus className="size-3.5" /> Prva stranica
      </button>
    );
  }

  return (
    <div
      className="threadline ml-1 space-y-0.5 py-1"
      onDragOver={(e) => {
        if (draggedPageId) {
          e.preventDefault();
          onDragPageOver(null, areaId);
        }
      }}
      onDrop={(e) => {
        if (draggedPageId) {
          e.preventDefault();
          onDropPage(draggedPageId, null, areaId);
        }
      }}
    >
      {pages.map((page) => (
        <PageTreeNode
          key={page._id}
          page={page}
          startupId={startupId}
          areaId={areaId}
          currentProfileId={currentProfileId}
          selectedPageId={selectedPageId}
          expandedPageIds={expandedPageIds}
          transientExpandedPageIds={transientExpandedPageIds}
          activeDropPageId={activeDropPageId}
          onPageExpandedChange={onPageExpandedChange}
          onOpenPage={onOpenPage}
          onCreate={onCreate}
          path={path}
          draggedPageId={draggedPageId}
          onDragPageStart={onDragPageStart}
          onDragPageEnd={onDragPageEnd}
          onDragPageOver={onDragPageOver}
          onDropPage={onDropPage}
        />
      ))}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(50)}
        >
          {status === "LoadingMore" ? <LoaderCircle className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {status === "LoadingMore" ? "Učitavam" : "Još stranica"}
        </Button>
      ) : null}
    </div>
  );
}

type PageTreeNodeProps = Omit<PageTreeProps, "areaId"> & {
  areaId: Id<"startupAreas">;
  page: Doc<"pages">;
  path: Array<Id<"pages">>;
};

function PageTreeNode({
  page,
  startupId,
  areaId,
  currentProfileId,
  selectedPageId,
  expandedPageIds,
  transientExpandedPageIds,
  activeDropPageId,
  onPageExpandedChange,
  onOpenPage,
  onCreate,
  path,
  draggedPageId,
  onDragPageStart,
  onDragPageEnd,
  onDragPageOver,
  onDropPage,
}: PageTreeNodeProps) {
  const expanded = expandedPageIds.has(page._id) || transientExpandedPageIds.has(page._id);
  const { results: children, status: childrenStatus, loadMore: loadMoreChildren } = usePaginatedQuery(
    api.pages.listChildren,
    expanded
      ? { startupId, areaId, parentPageId: page._id }
      : "skip",
    { initialNumItems: 50 },
  );

  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
      }
    };
  }, []);

  const Icon = pageKindMeta(page.kind).icon;
  const selected = selectedPageId === page._id;
  const activeDropTarget = activeDropPageId === page._id;
  const canMove = page.createdByProfileId === currentProfileId;
  const currentPath = [...path, page._id];

  return (
    <div className="threadline-item group/node pr-1">
      <div
        draggable={canMove}
        onDragStart={(e) => {
          if (!canMove) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          onDragPageStart(page._id);
          e.dataTransfer.setData("application/x-page-id", page._id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          onDragPageEnd();
        }}
        onDragOver={(e) => {
          if (draggedPageId && draggedPageId !== page._id && !path.includes(draggedPageId)) {
            e.preventDefault();
            e.stopPropagation();
            onDragPageOver(page._id, areaId);

            if (!expanded && !dragTimerRef.current) {
              dragTimerRef.current = setTimeout(() => {
                onPageExpandedChange(page._id, true);
              }, 600);
            }
          }
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (dragTimerRef.current) {
            clearTimeout(dragTimerRef.current);
            dragTimerRef.current = null;
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragTimerRef.current) {
            clearTimeout(dragTimerRef.current);
            dragTimerRef.current = null;
          }
          if (draggedPageId && draggedPageId !== page._id && !path.includes(draggedPageId)) {
            onDropPage(draggedPageId, page._id, areaId);
          }
        }}
        data-thought-drop-target="page"
        data-thought-area-id={areaId}
        data-thought-page-id={page._id}
        data-thought-drop-label={page.title}
        className={cn(
          "relative flex min-h-8 items-start rounded-lg text-muted-foreground transition-[background-color,color,box-shadow]",
          activeDropTarget && "bg-primary/12 text-sidebar-foreground ring-2 ring-inset ring-primary/55",
          selected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
          draggedPageId === page._id && "opacity-40",
        )}
      >
        <button
          type="button"
          data-compact="true"
          aria-label={expanded ? `Sakrij podstranice za ${page.title}` : `Prikaži podstranice za ${page.title}`}
          aria-expanded={expanded}
          className="ml-1 mt-0.5 grid size-7 shrink-0 place-items-center rounded-md hover:bg-background/65 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onPageExpandedChange(page._id, !expanded)}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-90")}
          />
        </button>
        <button
          type="button"
          className="flex min-h-8 min-w-0 flex-1 items-start gap-2 py-1.5 pr-1 text-left text-[0.8125rem]"
          onClick={() => onOpenPage(page._id)}
        >
          <Icon className="mt-0.5 size-3.5 shrink-0 opacity-75" />
          <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">
            {page.title}
          </span>
          {supportsTaskData(page.kind) ? (
            <DeadlineBadge
              dueDate={page.dueDate}
              taskStatus={page.taskStatus}
              size="sm"
              showIcon={false}
              calmHidden
              className="mt-0.5 shrink-0"
            />
          ) : null}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-compact="true"
          className="mr-0.5 mt-0.5 size-7 shrink-0 opacity-0 transition-opacity group-hover/node:opacity-100 focus:opacity-100"
          aria-label={`Dodaj podstranicu u ${page.title}`}
          onClick={() => onCreate({ areaId, parentPageId: page._id })}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="ml-2 overflow-hidden border-l border-thread/35 pl-1"
          >
            {childrenStatus === "LoadingFirstPage" ? (
              <div className="flex h-8 items-center gap-2 px-3 text-xs text-muted-foreground">
                <LoaderCircle className="size-3 animate-spin" />
              </div>
            ) : children.length ? (
              <>
              {children.map((child) => (
                <PageTreeNode
                  key={child._id}
                  page={child}
                  startupId={startupId}
                  areaId={areaId}
                  currentProfileId={currentProfileId}
                  selectedPageId={selectedPageId}
                  expandedPageIds={expandedPageIds}
                  transientExpandedPageIds={transientExpandedPageIds}
                  activeDropPageId={activeDropPageId}
                  onPageExpandedChange={onPageExpandedChange}
                  onOpenPage={onOpenPage}
                  onCreate={onCreate}
                  path={currentPath}
                  draggedPageId={draggedPageId}
                  onDragPageStart={onDragPageStart}
                  onDragPageEnd={onDragPageEnd}
                  onDragPageOver={onDragPageOver}
                  onDropPage={onDropPage}
                />
              ))}
              {childrenStatus === "CanLoadMore" || childrenStatus === "LoadingMore" ? (
                <button
                  type="button"
                  className="flex min-h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
                  disabled={childrenStatus === "LoadingMore"}
                  onClick={() => loadMoreChildren(50)}
                >
                  {childrenStatus === "LoadingMore" ? <LoaderCircle className="size-3 animate-spin" /> : <Plus className="size-3.5" />}
                  {childrenStatus === "LoadingMore" ? "Učitavam" : "Još stranica"}
                </button>
              ) : null}
              </>
            ) : (
              <button
                type="button"
                className="flex min-h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
                onClick={() => onCreate({ areaId, parentPageId: page._id })}
              >
                <Plus className="size-3.5" /> Dodaj unutra
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
