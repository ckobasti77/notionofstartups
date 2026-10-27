"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { CheckCircle2, LayoutGrid, Plus, Rows3, UserSearch } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/workspace/startup-tasks/constants";
import { useStartupTaskCommands } from "@/components/workspace/startup-tasks/use-startup-task-commands";
import type { ProfileWithAvatar, StartupWithAreas, TasksFilter } from "@/components/workspace/types";
import { EmptyState, ScreenHeader } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEnter, useFlip } from "@/lib/motion";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import type { Today } from "@/lib/today";
import { cn } from "@/lib/utils";
import { tasksWord } from "@/lib/workspace";

/** Izbor filtera: „svi", „moji" ili id člana (PROSTOR P11). */
export type TasksFilterValue = TasksFilter | Id<"profiles">;

type TasksViewProps = {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  today: Today;
  startups: TaskPanelProps["startups"];
  filter: TasksFilterValue;
  onFilterChange: (filter: TasksFilterValue) => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenFull: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
};

/** Najviše zadataka za koje se odjednom traže izvršioci (`taskAssignees.listForTasks`). */
const ASSIGNEE_LOOKUP_MAX = 300;

/**
 * Poslednja učitana vrednost za isti `scope` (izvedeno stanje, bez efekta).
 * Promena filtera briše zapamćeno, da redovi ne dobiju izvršioce drugog skupa.
 */
export function useLastReady<T>(value: T | undefined, scope: string): T | undefined {
  const [last, setLast] = useState<{ scope: string; value: T | undefined }>({ scope, value });
  if (last.scope !== scope) {
    setLast({ scope, value });
  } else if (value !== undefined && value !== last.value) {
    setLast({ scope, value });
  }
  return value ?? (last.scope === scope ? last.value : undefined);
}

/** Tabla ima smisla tek od `md` (K07 §5.3); ispod toga Zadaci su lista. */
const BOARD_QUERY = "(min-width: 48rem)";

function subscribeBoardQuery(onChange: () => void) {
  const media = window.matchMedia(BOARD_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useBoardAllowed(): boolean {
  return useSyncExternalStore(
    subscribeBoardQuery,
    () => window.matchMedia(BOARD_QUERY).matches,
    () => true,
  );
}

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
 * Zadaci startupa — kontejner (PROSTOR P11, K08; red zadatka iz LICNO K17).
 * Svi zadaci tima, filter Svi · Moji · osoba (podrazumevano Svi). Lista i
 * tabla dele red zadatka: završi sa „Poništi", rok, prioritet, status (tabla
 * se tako i prevlači), „Dodaj u Moj dan"; klik otvara panel zadatka.
 */
export function TasksView({
  startup,
  profile,
  today,
  startups,
  filter,
  onFilterChange,
  onOpenPage,
  onOpenFull,
  onCreateTask,
}: TasksViewProps) {
  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const personFilter = filter !== "svi" && filter !== "moji";
  // Osoba iz URL-a mora biti član ovog startupa: nevažeći id (ručno uređen
  // link, uklonjen član) bi oborio upit, pa se čeka spisak i pada na „Svi".
  const personKnown = !personFilter || (members?.some((member) => member.profile._id === filter) ?? false);
  useEffect(() => {
    if (personFilter && members !== undefined && !personKnown) onFilterChange("svi");
  }, [personFilter, members, personKnown, onFilterChange]);
  const assigneeProfileId = filter === "svi" ? undefined : filter === "moji" ? profile._id : filter;
  const { results, status: tasksStatus, loadMore } = usePaginatedQuery(
    api.tasks.listForStartup,
    !personKnown
      ? "skip"
      : assigneeProfileId === undefined
        ? { startupId: startup._id }
        : { startupId: startup._id, assigneeProfileId },
    { initialNumItems: 50 },
  );
  const [chosenMode, setMode] = useState<TasksMode>("list");
  const boardAllowed = useBoardAllowed();
  const mode: TasksMode = boardAllowed ? chosenMode : "list";
  const isManager = startup.createdByProfileId === profile._id || profile.role === "admin";
  // „Moji" već znaju da sam izvršilac; za ostale filtere dozvole reda traže spisak izvršilaca.
  const needsAssignees = filter !== "moji";
  const assigneeRows = useLastReady(
    useQuery(
      api.taskAssignees.listForTasks,
      needsAssignees && results.length > 0
        ? {
            startupId: startup._id,
            taskPageIds: results.slice(0, ASSIGNEE_LOOKUP_MAX).map((task) => task._id),
          }
        : "skip",
    ),
    filter,
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
          assigneeIds: needsAssignees ? (assigneesByTaskId?.get(task._id) ?? null) : null,
          // Filter „Moji" je već lista mojih zadataka (učešće kroz `taskAssignees`).
          assumeAssignee: !needsAssignees,
          plannedKeys: commands.plannedKeys,
          isManager,
        }),
      ),
    [results, profile._id, startupMini, areaLabels, commands.plannedKeys, needsAssignees, assigneesByTaskId, isManager],
  );
  const sections = useMemo(
    () => buildTaskSections(rows, mode, commands.holds, commands.pending),
    [rows, mode, commands.holds, commands.pending],
  );
  useLayoutEffect(() => {
    sectionsRef.current = sections;
    modeRef.current = mode;
  });

  // Dozvole zavise od izvršilaca: dok prvi put ne stignu, prikaz je u učitavanju.
  const loading =
    !personKnown ||
    tasksStatus === "LoadingFirstPage" ||
    members === undefined ||
    (needsAssignees && results.length > 0 && assigneeRows === undefined);
  const memberOptions = useMemo(
    () => (members ?? []).map((member) => ({ id: member.profile._id, name: member.profile.displayName })),
    [members],
  );

  return (
    <>
      <TasksBody
        now={today.now}
        filter={{ value: filter, members: memberOptions, onChange: onFilterChange }}
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

export type TasksFilterProps = {
  value: TasksFilterValue;
  /** Članovi startupa za izbor osobe. */
  members: ReadonlyArray<{ id: Id<"profiles">; name: string }>;
  onChange: (value: TasksFilterValue) => void;
};

export type TasksBodyProps = {
  now: number;
  filter: TasksFilterProps;
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

/** Vrednost Select-a „Osoba" kad nije izabran član. */
const NO_PERSON = "__svi__";

const SCOPE_OPTIONS = [
  { value: "svi", label: "Svi" },
  { value: "moji", label: "Moji" },
] as const;

function TasksFilterBar({ filter }: { filter: TasksFilterProps }) {
  const person = filter.value === "svi" || filter.value === "moji" ? NO_PERSON : filter.value;
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = SCOPE_OPTIONS.findIndex((option) => option.value === filter.value);
  // Radio grupa (WAI-ARIA): jedan Tab stop, strelice i Home/End biraju.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = SCOPE_OPTIONS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % SCOPE_OPTIONS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    filter.onChange(SCOPE_OPTIONS[next].value);
    optionRefs.current[next]?.focus();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Čiji zadaci"
        aria-describedby={checkedIndex === -1 ? "zadaci-osoba-izabrana" : undefined}
        className="inline-flex min-h-9 items-center rounded-lg bg-muted p-1"
      >
        {SCOPE_OPTIONS.map((option, index) => {
          const checked = option.value === filter.value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (checkedIndex === -1 && index === 0) ? 0 : -1}
              onClick={() => filter.onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "inline-flex min-h-7 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                checked && "bg-background text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {checkedIndex === -1 ? (
        <span id="zadaci-osoba-izabrana" className="sr-only">
          Izabrana je osoba u polju Osoba.
        </span>
      ) : null}
      <Select
        value={person}
        onValueChange={(value) => filter.onChange(value === NO_PERSON ? "svi" : (value as Id<"profiles">))}
      >
        <SelectTrigger aria-label="Osoba" className="h-9 w-48">
          <SelectValue placeholder="Osoba" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PERSON}>Osoba: svi</SelectItem>
          {filter.members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TasksEmpty({ filter, onCreateTask }: { filter: TasksFilterProps; onCreateTask: () => void }) {
  if (filter.value === "svi") {
    return (
      <EmptyState
        icon={CheckCircle2}
        headingAs="h2"
        title="Još nema zadataka u ovom startupu."
        action={
          <Button onClick={onCreateTask}>
            <Plus /> Novi zadatak
          </Button>
        }
      />
    );
  }
  const name =
    filter.value === "moji"
      ? null
      : (filter.members.find((member) => member.id === filter.value)?.name ?? "Ovaj član");
  return (
    <EmptyState
      icon={UserSearch}
      headingAs="h2"
      title={name === null ? "Nemaš zadataka u ovom startupu." : `${name} nema zadataka ovde.`}
      action={
        <Button variant="outline" onClick={() => filter.onChange("svi")}>
          Prikaži sve
        </Button>
      }
    />
  );
}

/** Zadaci startupa — prezentacija (lista i tabla, filter), podaci kroz props. */
export function TasksBody({
  now,
  filter,
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
  // Ulaz redova samo na prvo punjenje; promena prikaza ili filtera je odmah (K07 §8).
  useEnter(scopeRef, { key: loading ? "loading" : "ready" });
  const rowProps = { now, actions, selectedKey, activeKey, request };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <ScreenHeader
        title="Zadaci"
        meta={loading ? null : `${count}${loadMore ? "+" : ""} ${tasksWord(count)}`}
        actions={
          <Button onClick={onCreateTask}>
            <Plus /> Novi zadatak
          </Button>
        }
      />

      <Tabs value={mode} onValueChange={(value) => onModeChange(value as TasksMode)} data-workspace-enter>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TasksFilterBar filter={filter} />
          {/* Ispod `md` postoji samo Lista (K07 §5.3), pa nema ni prekidača. */}
          <TabsList aria-label="Prikaz zadataka" className="max-md:hidden">
            <TabsTrigger value="list">
              <Rows3 /> Lista
            </TabsTrigger>
            <TabsTrigger value="board">
              <LayoutGrid /> Tabla
            </TabsTrigger>
          </TabsList>
        </div>
        {loading ? (
          <TaskSectionsSkeleton />
        ) : (
          <TaskSectionsView
            {...rowProps}
            sections={sections}
            count={count}
            scopeRef={scopeRef}
            onListFocus={onListFocus}
            empty={<TasksEmpty filter={filter} onCreateTask={onCreateTask} />}
          />
        )}
      </Tabs>
      {loadMore && !loading ? (
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

/** Učitavanje liste zadataka: pet redova iste visine kao red. */
export function TaskSectionsSkeleton() {
  return (
    <div role="status" className="space-y-1" aria-label="Učitavanje zadataka">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-14 w-full rounded-lg md:h-11" />
      ))}
    </div>
  );
}

/**
 * Lista i tabla zadataka (sadržaj `Tabs` sa vrednostima `list` / `board`) —
 * isti red zadatka u Zadacima startupa i u Zadacima oblasti (PROSTOR P12).
 * Roditelj drži `Tabs` i prekidač prikaza.
 */
export function TaskSectionsView({
  now,
  sections,
  count,
  actions,
  scopeRef,
  selectedKey,
  activeKey,
  request,
  onListFocus,
  empty,
}: {
  now: number;
  sections: StartupTaskSection[];
  count: number;
  actions: TaskRowActions;
  scopeRef: RefObject<HTMLDivElement | null>;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
  onListFocus: (event: FocusEvent<HTMLElement>) => void;
  /** Prazna lista (isti tekst za listu i tablu). */
  empty: ReactNode;
}) {
  const rowProps = { now, actions, selectedKey, activeKey, request };
  return (
    <div ref={scopeRef} onFocus={onListFocus}>
      <TabsContent value="list">
        {count === 0 ? (
          empty
        ) : (
          <div>
            <div
              aria-hidden="true"
              className="hidden items-center gap-2 border-b border-border px-2 pb-1.5 text-xs font-medium text-muted-foreground lg:flex"
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
            <ul data-section="all" className="mt-1 space-y-0.5">
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
          empty
        ) : (
          // `relative`: apsolutni elementi u kolonama (sr-only brojač) ostaju u skroleru, ne šire stranu.
          <div className="scrollbar-thin relative -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="grid min-w-[74rem] grid-cols-5 gap-3">
              {sections.map((column) => (
                <BoardColumn key={column.id} status={column.id as StartupTaskStatus} rows={column.rows} {...rowProps} />
              ))}
            </div>
          </div>
        )}
      </TabsContent>
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
    <section aria-labelledby={headingId} className="rounded-lg bg-muted/30 p-2.5">
      <header className="mb-2 flex items-baseline gap-2 px-1 py-1">
        <h2 id={headingId} className="text-sm font-semibold">
          {STATUS_LABELS[status]}
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">
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
