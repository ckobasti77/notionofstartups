"use client";

import { useId, useRef, type ReactNode } from "react";
import { Lightbulb, Network, Plus, RefreshCw, Rows3, Search, SearchX, SquareKanban, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ScreenHeader } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { IdeaBoard } from "./idea-board";
import { IdeaList } from "./idea-list";
import type { IdeaActions } from "./idea-parts";
import {
  filterIdeas,
  IDEAS_VIEW_MODES,
  ideasCountLabel,
  isIdeasViewMode,
  type IdeaModel,
  type IdeaSort,
  type IdeaSortKey,
  type IdeasViewMode,
} from "./ideas-model";

export type IdeasScreenState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; ideas: ReadonlyArray<IdeaModel> };

const MODE_ICONS = { tabla: SquareKanban, lista: Rows3, mapa: Network } as const;

/**
 * Ideje startupa (PROSTOR P16, K07 §5.9) — prezentacija: zaglavlje sa brojem,
 * prekidač Tabla · Lista · Mapa, pretraga i „Nova ideja", pa izabrani prikaz.
 * Mapu (kanvas čita Convex) daje kontejner kroz `map`.
 */
export function IdeasScreen({
  state,
  mode,
  onModeChange,
  query,
  onQueryChange,
  now,
  actions,
  activeIdeaId,
  sort,
  onSortChange,
  onCreate,
  map,
  announcement,
}: {
  state: IdeasScreenState;
  mode: IdeasViewMode;
  onModeChange: (mode: IdeasViewMode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  now: number;
  actions: IdeaActions;
  activeIdeaId: Id<"ideaNodes"> | null;
  sort: IdeaSort;
  onSortChange: (key: IdeaSortKey) => void;
  onCreate: () => void;
  /** Mapa ideja (`IdeasCanvasView`); izlog je ne prikazuje. */
  map?: ReactNode;
  /** Najava za čitač ekrana (glas, faza). */
  announcement: string;
}) {
  const searchId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const ready = state.status === "ready";
  const all = ready ? state.ideas : [];
  const shown = filterIdeas(all, query);
  // Ulaz kartica samo na prvo punjenje i na promenu prikaza (ne na glas ili pretragu).
  useEnter(bodyRef, { key: `${mode}:${state.status}` });

  const body = (current: IdeasViewMode): ReactNode => {
    if (state.status === "loading") {
      // Ispod `md` tabla je lista grupisana po fazi — i učitavanje je lista.
      return current === "lista" ? (
        <ListSkeleton />
      ) : (
        <>
          <BoardSkeleton />
          <ListSkeleton className="md:hidden" />
        </>
      );
    }
    if (state.status === "error") return <IdeasError retry={state.retry} />;
    if (all.length === 0) {
      return (
        <EmptyState
          icon={Lightbulb}
          headingAs="h2"
          title="Još nema ideja."
          action={
            // Zaglavlje već ima primarnu „Nova ideja" (jedna indigo radnja po ekranu).
            <Button variant="outline" onClick={onCreate}>
              <Plus aria-hidden="true" /> Nova ideja
            </Button>
          }
        />
      );
    }
    if (shown.length === 0) {
      return (
        <EmptyState
          icon={SearchX}
          headingAs="h2"
          title="Nijedna ideja ne odgovara pretrazi."
          action={
            <Button variant="outline" onClick={() => onQueryChange("")}>
              Poništi pretragu
            </Button>
          }
        />
      );
    }
    return current === "tabla" ? (
      <IdeaBoard ideas={shown} now={now} actions={actions} activeIdeaId={activeIdeaId} resetKey={query} />
    ) : (
      <IdeaList
        ideas={shown}
        now={now}
        actions={actions}
        sort={sort}
        onSortChange={onSortChange}
        activeIdeaId={activeIdeaId}
        resetKey={query}
      />
    );
  };

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        if (isIdeasViewMode(value)) onModeChange(value);
      }}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
    >
      <div className="shrink-0 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <ScreenHeader
          className="mb-4"
          title="Ideje"
          meta={ready ? ideasCountLabel(all.length) : null}
          actions={
            <Button onClick={onCreate}>
              <Plus aria-hidden="true" /> Nova ideja
            </Button>
          }
          below={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <label htmlFor={searchId} className="sr-only">
                  Pretraži ideje
                </label>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && query) {
                      event.preventDefault();
                      onQueryChange("");
                    }
                  }}
                  placeholder="Pretraži ideje…"
                  className="h-9 pl-8 pr-9 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Obriši pretragu"
                    onClick={() => onQueryChange("")}
                    className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <TabsList aria-label="Prikaz ideja">
                {IDEAS_VIEW_MODES.map(({ value, label }) => {
                  const Icon = MODE_ICONS[value];
                  return (
                    <TabsTrigger key={value} value={value}>
                      <Icon aria-hidden="true" /> {label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          }
        />
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        <TabsContent value="tabla" className="mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:px-6 lg:px-8">
          {body("tabla")}
        </TabsContent>
        <TabsContent value="lista" className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{body("lista")}</div>
        </TabsContent>
        <TabsContent value="mapa" className="relative mt-0 min-h-0 flex-1 overflow-hidden">
          {state.status === "error" ? (
            <div className="px-4 sm:px-6 lg:px-8">
              <IdeasError retry={state.retry} />
            </div>
          ) : state.status === "loading" ? (
            <div role="status" aria-label="Učitavam mapu" className="px-4 sm:px-6 lg:px-8">
              <Skeleton className="h-[60vh] w-full rounded-xl" />
            </div>
          ) : (
            map
          )}
        </TabsContent>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Tabs>
  );
}

function IdeasError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-8 text-center">
      <h2 className="text-sm font-semibold">Ideje nisu učitane.</h2>
      <p className="mt-1 text-sm text-muted-foreground">Proveri vezu i pokušaj ponovo.</p>
      <Button variant="outline" className="mt-4" onClick={retry}>
        <RefreshCw aria-hidden="true" /> Pokušaj ponovo
      </Button>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje ideja" className="flex gap-3 overflow-hidden pb-4 max-md:hidden">
      {[0, 1, 2, 3].map((column) => (
        <div key={column} className="min-w-56 max-w-80 flex-1 basis-0 space-y-2 rounded-lg bg-muted/30 p-2">
          <Skeleton className="h-6 w-28" />
          {[0, 1].map((card) => (
            <Skeleton key={card} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Učitavanje ideja" className={cn("space-y-1", className)}>
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
