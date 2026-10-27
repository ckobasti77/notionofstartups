"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { CheckCircle2, LayoutGrid, Plus, Rows3 } from "lucide-react";
import {
  findStartupRow,
  locateStartupRow,
  rowFromStartupTask,
  STARTUP_TASK_STATUSES,
  STATUS_LABELS,
  type StartupMini,
  type StartupTaskLike,
  type StartupTaskSection,
  type StartupTaskStatus,
} from "@devotion/shared";

import type { TaskRowActions } from "@/components/me/task-row";
import type { TaskPanelProps } from "@/components/me/task-panel/task-panel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/workspace/startup-tasks/constants";
import { useStartupTaskCommands } from "@/components/workspace/startup-tasks/use-startup-task-commands";
import {
  buildTaskSections,
  TaskSectionsSkeleton,
  TaskSectionsView,
  tasksListName,
  useBoardAllowed,
  useLastReady,
  type TasksMode,
} from "@/components/workspace/tasks-view";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnter, useFlip } from "@/lib/motion";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import type { Today } from "@/lib/today";
import { cn } from "@/lib/utils";

import { AREA_TASKS_PAGE, shouldLoadMoreAreaTasks } from "./area-model";

/** Najviše zadataka za koje se odjednom traže izvršioci (`taskAssignees.listForTasks`). */
const ASSIGNEE_LOOKUP_MAX = 300;

/** Filter statusa: `null` = svi statusi. */
export type AreaTaskStatusFilter = StartupTaskStatus | null;

/**
 * Zadaci oblasti — kontejner (PROSTOR P12, K07 §5.5) nad `tasks.listForArea`:
 * isti red zadatka kao u Zadacima startupa (završi sa „Poništi", rok,
 * prioritet, status, „Dodaj u Moj dan", panel), lista i tabla. Filter statusa
 * je na serveru, pa se kraća strana učitava dalje (K07 R6).
 */
export function AreaTasksContainer({
  startup,
  profile,
  areaId,
  today,
  startups,
  onOpenPage,
  onOpenFull,
  onCreateTask,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  areaId: Id<"startupAreas">;
  today: Today;
  startups: TaskPanelProps["startups"];
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenFull: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<AreaTaskStatusFilter>(null);
  const [chosenMode, setMode] = useState<TasksMode>("list");
  const boardAllowed = useBoardAllowed();
  const mode: TasksMode = boardAllowed ? chosenMode : "list";
  // Tabla je već podeljena po statusu: filter statusa važi samo za listu.
  const status = mode === "board" ? null : statusFilter;
  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.tasks.listForArea,
    status === null ? { startupId: startup._id, areaId } : { startupId: startup._id, areaId, status },
    { initialNumItems: AREA_TASKS_PAGE },
  );
  // Koliko redova lista želi (raste sa „Učitaj još"); kraća strana učitava dalje sama.
  const [wanted, setWanted] = useState(AREA_TASKS_PAGE);
  const filterKey = `${status ?? "svi"}`;
  const [wantedKey, setWantedKey] = useState(filterKey);
  if (wantedKey !== filterKey) {
    setWantedKey(filterKey);
    setWanted(AREA_TASKS_PAGE);
  }
  useEffect(() => {
    if (shouldLoadMoreAreaTasks({ status: pageStatus, loaded: results.length, wanted })) loadMore(AREA_TASKS_PAGE);
  }, [pageStatus, results.length, wanted, loadMore]);

  const isManager = startup.createdByProfileId === profile._id || profile.role === "admin";
  // Skup id-jeva se menja („Učitaj još", nov ili završen zadatak): do novog odgovora
  // važe poslednji izvršioci, da lista ne padne u skeleton (kao Zadaci startupa).
  const assigneeRows = useLastReady(
    useQuery(
      api.taskAssignees.listForTasks,
      results.length > 0
        ? { startupId: startup._id, taskPageIds: results.slice(0, ASSIGNEE_LOOKUP_MAX).map((task) => task._id) }
        : "skip",
    ),
    filterKey,
  );
  const assigneesByTaskId = useMemo(
    () =>
      assigneeRows === undefined
        ? null
        : new Map(assigneeRows.map((row) => [row.taskPageId as string, row.assignees.map((a) => a.profileId as string)])),
    [assigneeRows],
  );
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
  const commands = useStartupTaskCommands({
    today,
    profileId: profile._id,
    startups,
    listRef: scopeRef,
    locate: (key) => locateStartupRow(tasksListName(modeRef.current), sectionsRef.current, key),
    getRow: (key) => findStartupRow(sectionsRef.current, key),
    flipCapture: () => {
      if (sectionsRef.current.reduce((sum, section) => sum + section.rows.length, 0) <= STARTUP_FLIP_MAX_ROWS) capture();
    },
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
          assigneeIds: assigneesByTaskId?.get(task._id) ?? null,
          assumeAssignee: false,
          plannedKeys: commands.plannedKeys,
          isManager,
        }),
      ),
    [results, profile._id, startupMini, areaLabels, assigneesByTaskId, commands.plannedKeys, isManager],
  );
  const sections = useMemo(
    () => buildTaskSections(rows, mode, commands.holds, commands.pending),
    [rows, mode, commands.holds, commands.pending],
  );
  useLayoutEffect(() => {
    sectionsRef.current = sections;
    modeRef.current = mode;
  });

  const canLoadMore = pageStatus === "CanLoadMore" || pageStatus === "LoadingMore";
  // Dozvole reda zavise od izvršilaca: dok prvi put ne stignu, prikaz je u učitavanju.
  // Prazna strana uz „ima još" nije prazna lista — filter statusa još traži (R6).
  const loading =
    pageStatus === "LoadingFirstPage" ||
    (results.length > 0 && assigneeRows === undefined) ||
    (results.length === 0 && canLoadMore);

  return (
    <>
      <AreaTasksBody
        now={today.now}
        statusFilter={status}
        onStatusFilterChange={setStatusFilter}
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
          canLoadMore && results.length >= wanted
            ? { busy: pageStatus === "LoadingMore", onLoad: () => setWanted((value) => value + AREA_TASKS_PAGE) }
            : canLoadMore
              ? { busy: true, onLoad: () => {} }
              : null
        }
      />
      {commands.panel}
    </>
  );
}

export type AreaTasksBodyProps = {
  now: number;
  statusFilter: AreaTaskStatusFilter;
  onStatusFilterChange: (status: AreaTaskStatusFilter) => void;
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

const STATUS_OPTIONS: ReadonlyArray<{ value: AreaTaskStatusFilter; label: string }> = [
  { value: null, label: "Svi" },
  ...STARTUP_TASK_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
];

/** Zadaci oblasti — prezentacija: čipovi statusa (lista), Lista · Tabla, isti red zadatka. */
export function AreaTasksBody({
  now,
  statusFilter,
  onStatusFilterChange,
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
}: AreaTasksBodyProps) {
  useEnter(scopeRef, { key: loading ? "loading" : "ready" });
  const empty =
    statusFilter === null ? (
      <EmptyState
        icon={CheckCircle2}
        headingAs="h2"
        title="Oblast nema zadataka."
        action={
          <Button onClick={onCreateTask}>
            <Plus aria-hidden="true" /> Novi zadatak
          </Button>
        }
      />
    ) : (
      <EmptyState
        size="section"
        title="Nema rezultata za ovaj filter."
        action={
          <Button variant="outline" size="sm" onClick={() => onStatusFilterChange(null)}>
            Poništi filter
          </Button>
        }
      />
    );

  return (
    <Tabs value={mode} onValueChange={(value) => onModeChange(value as TasksMode)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {mode === "list" ? (
          <StatusChips value={statusFilter} onChange={onStatusFilterChange} />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCreateTask}>
            <Plus aria-hidden="true" /> Novi zadatak
          </Button>
          {/* Ispod `md` postoji samo Lista (K07 §5.3), pa nema ni prekidača. */}
          <TabsList aria-label="Prikaz zadataka" className="max-md:hidden">
            <TabsTrigger value="list">
              <Rows3 aria-hidden="true" /> Lista
            </TabsTrigger>
            <TabsTrigger value="board">
              <LayoutGrid aria-hidden="true" /> Tabla
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
      {loading ? (
        <TaskSectionsSkeleton />
      ) : (
        <TaskSectionsView
          now={now}
          sections={sections}
          count={count}
          actions={actions}
          scopeRef={scopeRef}
          selectedKey={selectedKey}
          activeKey={activeKey}
          request={request}
          onListFocus={onListFocus}
          empty={empty}
        />
      )}
      {loadMore && !loading ? (
        <div className="mt-5 flex justify-center">
          <Button variant="outline" disabled={loadMore.busy} onClick={loadMore.onLoad}>
            {loadMore.busy ? "Učitavam…" : "Učitaj još zadataka"}
          </Button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Tabs>
  );
}

/** Čipovi statusa — radio grupa (jedan Tab stop, strelice biraju). */
function StatusChips({
  value,
  onChange,
}: {
  value: AreaTaskStatusFilter;
  onChange: (value: AreaTaskStatusFilter) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = Math.max(
    0,
    STATUS_OPTIONS.findIndex((option) => option.value === value),
  );
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = STATUS_OPTIONS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % STATUS_OPTIONS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + STATUS_OPTIONS.length) % STATUS_OPTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(STATUS_OPTIONS[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Status zadataka" className="flex flex-wrap items-center gap-1">
      {STATUS_OPTIONS.map((option, index) => {
        const checked = index === checkedIndex;
        return (
          <button
            key={option.value ?? "svi"}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-8 items-center rounded-md border px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              checked ? "border-border bg-accent font-medium text-foreground" : "border-transparent",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
