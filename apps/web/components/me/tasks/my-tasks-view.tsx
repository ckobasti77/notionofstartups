"use client";

import { useLayoutEffect, useRef, useState, type FocusEvent, type RefObject } from "react";
import { CheckSquare2, Plus, RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import {
  clearTaskFilters,
  openTasksPhrase,
  pageOfGroup,
  PERSONAL_FILTER_KEY,
  type StartupMini,
  type TaskFilters,
  type TaskGroupBy,
} from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { useEnter } from "@/lib/motion";
import type { RowRequest } from "@/lib/shortcuts/task-list";

import { TaskSection } from "../section-header";
import { StartupChip } from "../startup-chip";
import { TaskRow, type TaskRowActions } from "../task-row";
import { enterKey, TASKS_GROUP_PAGE, type MyTasksModel } from "./my-tasks-model";
import { MyTasksSkeleton } from "./my-tasks-skeleton";
import { TaskFilterBar } from "./task-filter-bar";

export type MyTasksViewState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; model: MyTasksModel };

export type MyTasksViewProps = {
  now: number;
  state: MyTasksViewState;
  startups: ReadonlyArray<StartupMini>;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (groupBy: TaskGroupBy) => void;
  actions?: TaskRowActions;
  onQuickAdd: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Opseg za Flip i prečice liste. */
  listRef?: RefObject<HTMLDivElement | null>;
  selectedKey?: string | null;
  /** Red čiji je panel otvoren. */
  activeKey?: string | null;
  request?: RowRequest | null;
  onListFocus?: (event: FocusEvent<HTMLElement>) => void;
  announcement?: string;
};

/**
 * Moji zadaci (K11, plan K07 §1.3): svi startupi + lično, filteri,
 * grupisanje, pretraga i „Prikaži završene". Radnje u redu su iste kao u
 * Moj dan; red otvara panel zadatka. Prezentacija: podaci i radnje kroz props
 * (izlog ga prikazuje bez prijave). Filteri žive u memoriji prikaza — URL
 * `me-tasks` ostaje čist (D10).
 */
export function MyTasksView({
  now,
  state,
  startups,
  filters,
  onFiltersChange,
  groupBy,
  onGroupByChange,
  actions,
  onQuickAdd,
  searchRef,
  listRef,
  selectedKey = null,
  activeKey = null,
  request = null,
  onListFocus,
  announcement = "",
}: MyTasksViewProps) {
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;
  // Ulaz liste samo na prvo punjenje; promene filtera i grupisanja idu kroz
  // Flip u kontejneru (redovi doputuju na novo mesto, novi se pretope).
  useEnter(scopeRef, { key: state.status });
  // „Prikaži još N" po grupi; nov izbor filtera/grupisanja kreće od 100.
  const pagingKey = enterKey("", filters, groupBy) + filters.query;
  const [paging, setPaging] = useState<{ key: string; shown: Record<string, number> }>({ key: pagingKey, shown: {} });
  const shown = paging.key === pagingKey ? paging.shown : {};
  const startupById = new Map(startups.map((startup) => [startup._id, startup] as const));

  const model = state.status === "ready" ? state.model : null;
  // „Prikaži još" može da nestane sa fokusom: fokus ide na prvi novi red.
  const focusKey = useRef<string | null>(null);
  // Bez niza zavisnosti: posle commit-a koji je prikazao nove redove.
  useLayoutEffect(() => {
    const key = focusKey.current;
    if (key === null) return;
    focusKey.current = null;
    scopeRef.current
      ?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"] [data-row-focus]`)
      ?.focus({ preventScroll: true });
  });
  const cappedNote = model?.capped ? (
    <p className="px-2 text-xs text-muted-foreground">
      Prikazano je prvih {model.loadedCount}. Suzi filter za ostatak.
    </p>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <header data-workspace-enter className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Moji zadaci</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Svi startupi i lično
            {model ? ` · ${openTasksPhrase(model.openCount)}` : null}
          </p>
        </div>
        <Button type="button" onClick={onQuickAdd} className="shrink-0">
          <Plus aria-hidden="true" />
          Brzi unos
          <span aria-hidden="true" className="ml-1 hidden md:pointer-fine:inline-flex">
            <Kbd>Q</Kbd>
          </span>
        </Button>
      </header>

      <div data-workspace-enter className="mt-6">
        <TaskFilterBar
          filters={filters}
          startups={startups}
          onChange={onFiltersChange}
          groupBy={groupBy}
          onGroupByChange={onGroupByChange}
          searchRef={searchRef}
        />
      </div>

      <div ref={scopeRef} data-workspace-enter onFocus={onListFocus} className="mt-5 space-y-5">
        {state.status === "loading" ? (
          <MyTasksSkeleton />
        ) : state.status === "error" ? (
          <MyTasksError retry={state.retry} />
        ) : !state.model.hasAny ? (
          <EmptyState
            headingAs="h2"
            icon={CheckSquare2}
            title="Nemaš otvorenih zadataka"
            description="Kad ti neko dodeli zadatak ili dodaš lični, biće ovde."
            action={
              <Button type="button" variant="outline" onClick={onQuickAdd}>
                <Plus aria-hidden="true" />
                Brzi unos
              </Button>
            }
          />
        ) : state.model.visibleCount === 0 ? (
          <>
            <EmptyState
              headingAs="h2"
              icon={SearchX}
              title="Nijedan zadatak ne odgovara filterima"
              description="Promeni ili očisti filtere."
              action={
                <Button type="button" variant="outline" onClick={() => onFiltersChange(clearTaskFilters(filters))}>
                  Očisti filtere
                </Button>
              }
            />
            {cappedNote}
          </>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="hidden items-center gap-2 px-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground xl:flex"
            >
              {/* Iste širine kao red: kvačica 32 · naslov · (startup 144) · oblast 120 · status 96 · rok 104 · prioritet 88 · radnje 100. */}
              <span className="w-8 shrink-0" />
              <span className="flex flex-1 items-center gap-3">
                <span className="flex-1">Naslov</span>
                <span className="flex shrink-0">
                  {groupBy === "startup" ? null : <span className="w-[9rem]">Startup</span>}
                  <span className="w-[120px]">Oblast</span>
                  {groupBy === "status" ? null : <span className="w-24">Status</span>}
                  <span className="w-[104px]">Rok</span>
                  <span className="w-[88px]">Prioritet</span>
                </span>
              </span>
              <span className="w-[100px] shrink-0" />
            </div>
            {state.model.groups.map((group) => {
              const limit = shown[group.key] ?? TASKS_GROUP_PAGE;
              const { visible, remaining } = pageOfGroup(group.rows, limit);
              const startup = groupBy === "startup" ? (group.key === PERSONAL_FILTER_KEY ? null : startupById.get(group.key)) : undefined;
              return (
                <TaskSection
                  key={group.key}
                  title={group.title}
                  count={group.rows.length}
                  tone={group.key === "overdue" ? "danger" : "default"}
                  leading={startup !== undefined ? <StartupChip startup={startup} size="sm" /> : undefined}
                >
                  <ul data-section={group.key} className="space-y-0.5">
                    {visible.map((row) => (
                      <li key={row.key} data-flip-id={row.key}>
                        <TaskRow
                          row={row}
                          now={now}
                          actions={actions}
                          canOpen
                          columns
                          showStartup={groupBy !== "startup"}
                          showStatus={groupBy !== "status"}
                          selected={selectedKey === row.key}
                          active={activeKey === row.key}
                          request={request?.key === row.key ? request : null}
                        />
                      </li>
                    ))}
                  </ul>
                  {remaining > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        setPaging({ key: pagingKey, shown: { ...shown, [group.key]: limit + TASKS_GROUP_PAGE } });
                        focusKey.current = group.rows[limit]?.key ?? null;
                      }}
                    >
                      Prikaži još {Math.min(remaining, TASKS_GROUP_PAGE)}
                    </Button>
                  ) : null}
                </TaskSection>
              );
            })}
            {cappedNote}
          </>
        )}
      </div>
    </div>
  );
}

function MyTasksError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/45 px-6 py-10 text-center">
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold">Zadaci se ne mogu učitati</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Proveri vezu i pokušaj ponovo.</p>
      <Button type="button" variant="outline" className="mt-5" onClick={retry}>
        <RefreshCw aria-hidden="true" />
        Pokušaj ponovo
      </Button>
    </div>
  );
}

