"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { CheckSquare2, FileText, LoaderCircle, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function SearchDialog({
  open,
  onOpenChange,
  startupId,
  onOpenPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startupId: Id<"startups">;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const normalizedQuery = query.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 300);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery]);

  const queryIsReady =
    open
    && normalizedQuery.length >= 2
    && debouncedQuery === normalizedQuery;
  const results = useQuery(
    api.search.pages,
    queryIsReady
      ? { query: debouncedQuery, startupId, limit: 30 }
      : "skip",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Pretraga</DialogTitle>
          <DialogDescription>Pretraži stranice i zadatke u startupu.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pretraži beleške i zadatke…"
            className="h-14 border-0 px-0 text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="scrollbar-thin max-h-[60vh] min-h-64 overflow-y-auto p-2">
          {normalizedQuery.length < 2 ? (
            <EmptyState
              icon={Search}
              title="Pronađi ono što ti treba"
              description="Unesi bar dva slova. Pretražujemo naslove i sadržaj ovog startupa."
              className="min-h-60 border-0 bg-transparent"
            />
          ) : !queryIsReady || results === undefined ? (
            <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Pretražujem
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nema rezultata"
              description={`Ništa ne odgovara upitu „${normalizedQuery}“. Probaj kraći izraz.`}
              className="min-h-60 border-0 bg-transparent"
            />
          ) : (
            results.map((result) => (
              <button
                key={result._id}
                type="button"
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent/55"
                onClick={() => {
                  onOpenPage(result._id);
                  onOpenChange(false);
                }}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/9 text-primary">
                  {result.kind === "task"
                    ? <CheckSquare2 className="size-4" />
                    : <FileText className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{result.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {result.area?.label ?? "Oblast"} · {result.startup?.name ?? "Startup"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <p className="border-t bg-muted/25 px-4 py-2 text-[0.6875rem] text-muted-foreground">
          Savet: pritisni <kbd className="rounded border bg-card px-1 py-0.5 font-mono">Ctrl K</kbd> da otvoriš pretragu.
        </p>
      </DialogContent>
    </Dialog>
  );
}
