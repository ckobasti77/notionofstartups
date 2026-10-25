"use client";

import { useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type RefObject } from "react";
import { usePaginatedQuery } from "convex/react";
import { CheckCircle2, LayoutGrid, Plus, Rows3 } from "lucide-react";
import {
  applyStartupHolds,
  boardColumns,
  findStartupRow,
  locateStartupRow,
  rowFromStartupTask,
  STATUS_LABELS,
  type StartupMini,
  type StartupTaskHold,
  type StartupTaskLike,
  type StartupTaskSection,
  type StartupTaskStatus,
  type TaskRowModel,
} from "@devotion/shared";

import { TaskRow, type TaskRowActions } from "@/components/me/task-row";
import type { TaskPanelProps } from "@/components/me/task-panel/task-panel";
import { NumberRoll } from "@/components/motion/number-roll";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/workspace/startup-tasks/constants";
import { useStartupTaskCommands } from "@/components/workspace/startup-tasks/use-startup-task-commands";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnter, useFlip } from "@/lib/motion";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import type { Today } from "@/lib/today";
import { cn } from "@/lib/utils";
import { tasksWord } from "@/lib/workspace";

type TasksViewProps = {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  today: Today;
  startups: TaskPanelProps["startups"];
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenFull: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
};

export type TasksMode = "list" | "board";

/** Liste zadržavanja: lista (`list:all`) i tabla (`board:<status>`). */
const LIST = "list";
const BOARD = "board";

/** Sekcije za prikaz (sa zadržanim redovima) — ČISTO, deli ga i izlog. */
export function buildTaskSections(
  rows: ReadonlyArray<TaskRowModel>,
  mode: TasksMode,
  holds: ReadonlyMap<string, StartupTaskHold>,
  pending: ReadonlyMap<string, boolean>,
): StartupTaskSection[] {
  return mode === "list"
    ? applyStartupHolds(LIST, [{ id: "all", rows: [...rows] }], holds, pending)
    : applyStartupHolds(BOARD, boardColumns(rows), holds, pending);
}

export function tasksListName(mode: TasksMode) {
  return mode === "list" ? LIST : BOARD;
}

/**
 * Moji zadaci u startupu — kontejner (K17). Lista i tabla dobijaju zajednički
 * red zadatka: završi sa „Poništi", rok kroz birač, prioritet, status (tabla
 * se tako i prevlači između kolona), „Dodaj u Moj dan"; klik otvara panel
 * zadatka (u njemu „Puni prikaz"); prečice kao u Mojim zadacima.
 */
export function TasksView({ startup, profile, today, startups, onOpenPage, onOpenFull, onCreateTask }: TasksViewProps) {
  const { results, status: tasksStatus, loadMore } = usePaginatedQuery(
    api.tasks.listForStartup,
    { startupId: startup._id, assigneeProfileId: profile._id },
    { initialNumItems: 50 },
  );
  const [mode, setMode] = useState<TasksMode>("list");

  const areaLabels = useMemo(
    () => new Map(startup.areas.map((area) => [area._id as string, area.label] as const)),
    [startup.areas],
  );
  const startupMini = useMemo<StartupMini>(
    () => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl }),
    [startup._id, startup.name, startup.logoUrl],
  );

  const scopeRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<StartupTaskSection[]>([]);
  const modeRef = useRef(mode);
  const { capture } = useFlip(scopeRef);
  const rowCount = () => sectionsRef.current.reduce((sum, section) => sum + section.rows.length, 0);
  const flipCapture = () => {
    if (rowCount() <= STARTUP_FLIP_MAX_ROWS) capture();
  };
  const commands = useStartupTaskCommands({
    today,
    profileId: profile._id,
    startups,
    listRef: scopeRef,
    locate: (key) => locateStartupRow(tasksListName(modeRef.current), sectionsRef.current, key),
    getRow: (key) => findStartupRow(sectionsRef.current, key),
    flipCapture,
    onOpenInStartup: (_startupId, pageId) => onOpenPage(pageId),
    onOpenFull,
  });

  const rows = useMemo(
    () =>
      (results as ReadonlyArray<StartupTaskLike>).map((task) =>
        rowFromStartupTask(task, {
          profileId: profile._id,
          startup: startupMini,
          areaLabels,
          assigneeIds: null,
          // Lista je već „moji zadaci" (učešće kroz `taskAssignees`).
          assumeAssignee: true,
          plannedKeys: commands.plannedKeys,
        }),
      ),
    [results, profile._id, startupMini, areaLabels, commands.plannedKeys],
  );
  const sections = useMemo(
    () => buildTaskSections(rows, mode, commands.holds, commands.pending),
    [rows, mode, commands.holds, commands.pending],
  );
  useLayoutEffect(() => {
    sectionsRef.current = sections;
    modeRef.current = mode;
  });

  const loading = tasksStatus === "LoadingFirstPage";

  return (
    <>
      <TasksBody
        startupName={startup.name}
        now={today.now}
        loading={loading}
        count={rows.length}
        mode={mode}
        onModeChange={setMode}
        sections={sections}
        actions={commands.actions}
        scopeRef={scopeRef}
        selectedKey={commands.selectedKey}
        activeKey={commands.activeKey}
        request={commands.request}
        onListFocus={commands.onListFocus}
        announcement={commands.announcement}
        onCreateTask={onCreateTask}
        loadMore={
          tasksStatus === "CanLoadMore" || tasksStatus === "LoadingMore"
            ? { busy: tasksStatus === "LoadingMore", onLoad: () => loadMore(50) }
            : null
        }
      />
      {commands.panel}
    </>
  );
}

export type TasksBodyProps = {
  startupName: string;
  now: number;
  loading: boolean;
  count: number;
  mode: TasksMode;
  onModeChange: (mode: TasksMode) => void;
  sections: StartupTaskSection[];
  actions: TaskRowActions;
  scopeRef: RefObject<HTMLDivElement | null>;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
  onListFocus: (event: FocusEvent<HTMLElement>) => void;
  announcement: string;
  onCreateTask: () => void;
  loadMore: { busy: boolean; onLoad: () => void } | null;
};

/** Moji zadaci u startupu — prezentacija (lista i tabla), podaci kroz props. */
export function TasksBody({
  startupName,
  now,
  loading,
  count,
  mode,
  onModeChange,
  sections,
  actions,
  scopeRef,
  selectedKey,
  activeKey,
  request,
  onListFocus,
  announcement,
  onCreateTask,
  loadMore,
}: TasksBodyProps) {
  // Ulaz redova na prvo punjenje i na promenu prikaza (lista ↔ tabla).
  useEnter(scopeRef, { key: loading ? "loading" : `ready:${mode}` });
  const rowProps = { now, actions, selectedKey, activeKey, request };

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header data-workspace-enter className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">{startupName}</p>
          <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Moji zadaci</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Tvoji zadaci u startupu {startupName}, od ideje do završenog.
          </p>
        </div>
        <Button onClick={onCreateTask}>
          <Plus /> Novi zadatak
        </Button>
      </header>

      {loading ? (
        <div role="status" className="space-y-2" aria-label="Učitavanje zadataka">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-14 w-full rounded-xl md:h-11" />
          ))}
        </div>
      ) : (
        <Tabs value={mode} onValueChange={(value) => onModeChange(value as TasksMode)} data-workspace-enter>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{count}</span> {tasksWord(count)}
            </p>
            <TabsList aria-label="Prikaz zadataka">
              <TabsTrigger value="list">
                <Rows3 /> Lista
              </TabsTrigger>
              <TabsTrigger value="board">
                <LayoutGrid /> Tabla
              </TabsTrigger>
            </TabsList>
          </div>
          <div ref={scopeRef} onFocus={onListFocus}>
            <TabsContent value="list">
              {count === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nema dodeljenih zadataka"
                  description="Kada ti neko dodeli zadatak, pojaviće se ovde. Možeš i odmah da kreiraš svoj."
                  action={
                    <Button onClick={onCreateTask}>
                      <Plus /> Novi zadatak
                    </Button>
                  }
                />
              ) : (
                <div className="rounded-2xl border border-border/75 bg-card/80 p-1.5 sm:p-2">
                  <div
                    aria-hidden="true"
                    className="hidden items-center gap-2 px-2 pb-1 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground lg:flex"
                  >
                    {/* Iste širine kao red: kvačica 32 · naslov · oblast 120 · status 96 · rok 104 · prioritet 88 · radnje 100. */}
                    <span className="w-8 shrink-0" />
                    <span className="flex flex-1 items-center gap-3">
                      <span className="flex-1">Zadatak</span>
                      <span className="flex shrink-0">
                        <span className="w-[120px]">Oblast</span>
                        <span className="w-24">Status</span>
                        <span className="w-[104px]">Rok</span>
                        <span className="w-[88px]">Prioritet</span>
                      </span>
                    </span>
                    <span className="w-[100px] shrink-0" />
                  </div>
                  <ul data-section="all" className="space-y-0.5">
                    {(sections[0]?.rows ?? []).map((row) => (
                      <li key={row.key} data-flip-id={row.key}>
                        <TaskRow
                          row={row}
                          now={now}
                          actions={actions}
                          canOpen
                          columns
                          showStartup={false}
                          selected={selectedKey === row.key}
                          active={activeKey === row.key}
                          request={request?.key === row.key ? request : null}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
            <TabsContent value="board">
              {count === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nema dodeljenih zadataka"
                  description="Kada ti neko dodeli zadatak, pojaviće se ovde. Možeš i odmah da kreiraš svoj."
                  action={
                    <Button onClick={onCreateTask}>
                      <Plus /> Novi zadatak
                    </Button>
                  }
                />
              ) : (
                // `relative`: apsolutni elementi u kolonama (sr-only brojač) ostaju u skroleru, ne šire stranu.
                <div className="scrollbar-thin relative -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
                  <div className="grid min-w-[74rem] grid-cols-5 gap-3">
                    {sections.map((column) => (
                      <BoardColumn key={column.id} status={column.id as StartupTaskStatus} rows={column.rows} {...rowProps} />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      )}
      {loadMore ? (
        <div className="mt-5 flex justify-center" data-workspace-enter>
          <Button variant="outline" disabled={loadMore.busy} onClick={loadMore.onLoad}>
            {loadMore.busy ? "Učitavam…" : "Učitaj još zadataka"}
          </Button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function BoardColumn({
  status,
  rows,
  now,
  actions,
  selectedKey,
  activeKey,
  request,
}: {
  status: StartupTaskStatus;
  rows: TaskRowModel[];
  now: number;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
}) {
  const headingId = `tabla-${status}`;
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border/70 bg-muted/30 p-2.5">
      <header className="mb-2 flex items-center justify-between px-1 py-1">
        <h2 id={headingId} className="text-xs font-bold uppercase tracking-[0.08em]">
          {STATUS_LABELS[status]}
        </h2>
        <span
          className={cn(
            "grid h-5 min-w-5 place-items-center rounded-full bg-card px-1.5 font-mono text-[0.6875rem] font-semibold tabular-nums text-muted-foreground",
          )}
        >
          <NumberRoll value={rows.length} aria-label={`${rows.length} ${tasksWord(rows.length)}`} />
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="min-h-40 px-1 text-xs text-muted-foreground">Nema zadataka.</p>
      ) : (
        <ul data-section={status} className="min-h-40 space-y-2">
          {rows.map((row) => (
            <li key={row.key} data-flip-id={row.key}>
              <TaskRow
                row={row}
                now={now}
                actions={actions}
                canOpen
                variant="card"
                showStartup={false}
                selected={selectedKey === row.key}
                active={activeKey === row.key}
                request={request?.key === row.key ? request : null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
