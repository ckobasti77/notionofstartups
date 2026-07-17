"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckSquare2,
  ChevronRight,
  FileText,
  LoaderCircle,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type { CreatePageTarget } from "@/components/workspace/types";

type PageTreeProps = {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  selectedPageId?: Id<"pages">;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreate: (target: CreatePageTarget) => void;
};

export function PageTree({
  startupId,
  areaId,
  selectedPageId,
  onOpenPage,
  onCreate,
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
    <div className="threadline ml-1 space-y-0.5 py-1">
      {pages.map((page) => (
        <PageTreeNode
          key={page._id}
          page={page}
          startupId={startupId}
          areaId={areaId}
          selectedPageId={selectedPageId}
          onOpenPage={onOpenPage}
          onCreate={onCreate}
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
};

function PageTreeNode({
  page,
  startupId,
  areaId,
  selectedPageId,
  onOpenPage,
  onCreate,
}: PageTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const { results: children, status: childrenStatus, loadMore: loadMoreChildren } = usePaginatedQuery(
    api.pages.listChildren,
    expanded
      ? { startupId, areaId, parentPageId: page._id }
      : "skip",
    { initialNumItems: 50 },
  );
  const Icon = page.kind === "task" ? CheckSquare2 : FileText;
  const selected = selectedPageId === page._id;

  return (
    <div className="threadline-item group/node pr-1">
      <div
        className={cn(
          "relative flex min-h-8 items-center rounded-lg text-muted-foreground transition-colors",
          selected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
        )}
      >
        <button
          type="button"
          data-compact="true"
          aria-label={expanded ? `Sakrij podstranice za ${page.title}` : `Prikaži podstranice za ${page.title}`}
          aria-expanded={expanded}
          className="ml-1 grid size-7 shrink-0 place-items-center rounded-md hover:bg-background/65 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-90")}
          />
        </button>
        <button
          type="button"
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 pr-1 text-left text-[0.8125rem]"
          onClick={() => onOpenPage(page._id)}
        >
          <Icon className="size-3.5 shrink-0 opacity-75" />
          <span className="truncate">{page.title}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-compact="true"
          className="mr-0.5 size-7 shrink-0 opacity-0 transition-opacity group-hover/node:opacity-100 focus:opacity-100"
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
                  selectedPageId={selectedPageId}
                  onOpenPage={onOpenPage}
                  onCreate={onCreate}
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
