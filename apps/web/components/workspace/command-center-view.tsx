"use client";

import { useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type RefObject } from "react";
import { useQuery } from "convex/react";
import {
  CalendarClock,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  CircleDashed,
  Flame,
  Plus,
  UserSearch,
} from "lucide-react";
import {
  canJoinTask,
  DURATION,
  findStartupRow,
  locateStartupRow,
  type StartupMini,
  type TaskRowModel,
} from "@devotion/shared";

import { TaskRow, type TaskRowActions } from "@/components/me/task-row";
import type { TaskPanelProps } from "@/components/me/task-panel/task-panel";
import { Collapse } from "@/components/motion/collapse";
import { NumberRoll } from "@/components/motion/number-roll";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AssigneeStack } from "@/components/workspace/assignee-stack";
import { PulseBar, type PulseSegment } from "@/components/workspace/pulse-bar";
import {
  buildZones,
  COMMAND_CENTER_LIST,
  filterByMember,
  workloadCounts,
  zoneRowCount,
  type CommandCenterAssignee,
  type CommandCenterZone,
} from "@/components/workspace/startup-tasks/command-center-model";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/workspace/startup-tasks/constants";
import { useStartupTaskCommands } from "@/components/workspace/startup-tasks/use-startup-task-commands";
import {
  WorkloadStrip,
  type WorkloadEntry,
  type WorkloadFilter,
} from "@/components/workspace/workload-strip";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TriageZone } from "@/lib/deadline";
import { useEnter, useFlip, useReducedMotion } from "@/lib/motion";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import type { Today } from "@/lib/today";
import { cn } from "@/lib/utils";
import { tasksWord } from "@/lib/workspace";

const ZONE_META: Record<
  TriageZone,
  {
    label: string;
    hint: string;
    icon: typeof Flame;
    frameClass: string;
    accentClass: string;
    countClass: string;
    emptyLabel: string;
  }
> = {
  gori: {
    label: "Gori",
    hint: "Rok je prošao, hitno je ili je blokirano",
    icon: Flame,
    frameClass: "border-l-4 border-l-destructive bg-destructive/[0.04]",
    accentClass: "text-destructive",
    countClass: "bg-destructive/12 text-destructive",
    emptyLabel: "Ništa ne gori. Tim diše.",
  },
  danas: {
    label: "Danas",
    hint: "Rok je danas",
    icon: CalendarClock,
    frameClass: "border-l-4 border-l-warning bg-warning/[0.06]",
    accentClass: "text-warning-foreground dark:text-warning",
    countClass: "bg-warning/18 text-warning-foreground dark:text-warning",
    emptyLabel: "Danas nema rokova.",
  },
  nedelja: {
    label: "Ova nedelja",
    hint: "Rok u narednih sedam dana",
    icon: CalendarDays,
    frameClass: "border-l-4 border-l-info bg-info/[0.05]",
    accentClass: "text-info",
    countClass: "bg-info/12 text-info",
    emptyLabel: "Slobodna nedelja ispred.",
  },
  kasnije: {
    label: "Kasnije i bez roka",
    hint: "Nema roka ili je dalji od nedelje",
    icon: CircleDashed,
    frameClass: "border-l-4 border-l-border bg-muted/20",
    accentClass: "text-muted-foreground",
    countClass: "bg-muted text-muted-foreground",
    emptyLabel: "Sve ima rok.",
  },
};

/** Poslednja učitana vrednost (izvedeno stanje, bez efekta). */
function useLastReady<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

/** Zona prikazuje do 100 redova, ostalo kroz „Prikaži još" (E12). */
const ZONE_PAGE = 100;

const ZONE_TONE = {
  gori: "danger",
  danas: "warn",
  nedelja: "info",
  kasnije: "muted",
} as const;

/**
 * Komandni centar startupa — kontejner (K17). Trijaža po zonama ostaje;
 * redovi su zajednički red zadatka sa radnjama (završi sa „Poništi", rok kroz
 * birač, prioritet, status, „Dodaj u Moj dan", „Priključi se"), klik otvara
 * panel zadatka (u panelu „Puni prikaz"), prečice kao u Mojim zadacima.
 */
export function CommandCenterView({
  startup,
  profile,
  today,
  startups,
  onOpenPage,
  onOpenFull,
  onCreateTask,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  today: Today;
  /** Startupi sa oblastima (ljuska) — panel zadatka. */
  startups: TaskPanelProps["startups"];
  /** Teški detalj stranice (ostaje za „Otvori" iz toasta i stare puteve). */
  onOpenPage: (pageId: Id<"pages">) => void;
  /** „Puni prikaz" iz panela. */
  onOpenFull: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
}) {
  const overview = useQuery(api.tasks.commandCenter, { startupId: startup._id });
  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  // Sat iz `useToday` (E3): zone se preklasifikuju u ponoć i kad se kartica vrati u fokus.
  const now = today.now;
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);
  const [laterOpen, setLaterOpen] = useState(false);

  const tasks = useMemo(() => overview?.tasks ?? [], [overview]);

  // Jedna subskripcija za spiskove izvršilaca svih otvorenih zadataka.
  // Argumenti se menjaju sa svakom promenom liste (završen zadatak ispada):
  // do novog odgovora važi poslednji, da kvačice ne trepnu u „zaključano".
  const assigneeRows = useLastReady(
    useQuery(api.taskAssignees.listForTasks, {
      startupId: startup._id,
      taskPageIds: tasks.map((task) => task._id),
    }),
  );
  const assigneesByTaskId = useMemo(
    () =>
      assigneeRows === undefined
        ? null
        : new Map<string, CommandCenterAssignee[]>(assigneeRows.map((row) => [row.taskPageId, row.assignees])),
    [assigneeRows],
  );
  const assigneeMap = useMemo(() => assigneesByTaskId ?? new Map<string, CommandCenterAssignee[]>(), [assigneesByTaskId]);

  const areaLabels = useMemo(
    () => new Map(startup.areas.map((area) => [area._id as string, area.label] as const)),
    [startup.areas],
  );
  const startupMini = useMemo<StartupMini>(
    () => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl }),
    [startup._id, startup.name, startup.logoUrl],
  );

  const workload = useMemo<Array<WorkloadEntry>>(() => {
    const byId = new Map((members ?? []).map((member) => [member.profile._id as string, member.profile] as const));
    return workloadCounts(tasks, [...byId.keys()], assigneeMap, now).map((count) => {
      const memberProfile = byId.get(count.key);
      return {
        ...count,
        name: memberProfile?.displayName ?? "Nedodeljeno",
        avatar: memberProfile ?? null,
      };
    });
  }, [assigneeMap, members, now, tasks]);

  const visibleTasks = useMemo(() => filterByMember(tasks, memberFilter, assigneeMap), [assigneeMap, memberFilter, tasks]);

  // --- Radnje u redu (deljeno sa Mojim zadacima i tablom) ---
  const listRef = useRef<HTMLDivElement>(null);
  const zonesRef = useRef<CommandCenterZone[]>([]);
  const { capture } = useFlip(listRef);
  const flipCapture = () => {
    if (zoneRowCount(zonesRef.current) <= STARTUP_FLIP_MAX_ROWS) capture();
  };
  const commands = useStartupTaskCommands({
    today,
    profileId: profile._id,
    startups,
    listRef,
    locate: (key) => locateStartupRow(COMMAND_CENTER_LIST, zonesRef.current, key),
    getRow: (key) => findStartupRow(zonesRef.current, key),
    flipCapture,
    onOpenInStartup: (_startupId, pageId) => onOpenPage(pageId),
    onOpenFull,
  });

  const zones = useMemo(
    () =>
      buildZones(visibleTasks, {
        now,
        profileId: profile._id,
        startup: startupMini,
        areaLabels,
        assigneesByTaskId,
        plannedKeys: commands.plannedKeys,
        holds: commands.holds,
        pending: commands.pending,
      }),
    [visibleTasks, now, profile._id, startupMini, areaLabels, assigneesByTaskId, commands.plannedKeys, commands.holds, commands.pending],
  );
  useLayoutEffect(() => {
    zonesRef.current = zones;
  });

  // Dozvole zavise od izvršilaca: dok prvi put ne stignu, prikaz je u učitavanju.
  const loading =
    overview === undefined || members === undefined || (tasks.length > 0 && assigneeRows === undefined);

  return (
    <>
      <CommandCenterBody
        startupName={startup.name}
        now={now}
        loading={loading}
        totalOpen={tasks.length}
        filteredTotal={visibleTasks.length}
        hasMore={overview?.hasMore ?? false}
        workload={workload}
        memberFilter={memberFilter}
        onMemberFilter={setMemberFilter}
        zones={zones}
        assigneesByTaskId={assigneeMap}
        laterOpen={laterOpen}
        onLaterOpenChange={setLaterOpen}
        actions={commands.actions}
        listRef={listRef}
        selectedKey={commands.selectedKey}
        activeKey={commands.activeKey}
        request={commands.request}
        onListFocus={commands.onListFocus}
        announcement={commands.announcement}
        onCreateTask={onCreateTask}
      />
      {commands.panel}
    </>
  );
}

export type CommandCenterBodyProps = {
  startupName: string;
  now: number;
  loading: boolean;
  totalOpen: number;
  filteredTotal: number;
  hasMore: boolean;
  workload: WorkloadEntry[];
  memberFilter: WorkloadFilter;
  onMemberFilter: (key: WorkloadFilter) => void;
  zones: CommandCenterZone[];
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>;
  laterOpen: boolean;
  onLaterOpenChange: (open: boolean) => void;
  actions: TaskRowActions;
  listRef: RefObject<HTMLDivElement | null>;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
  onListFocus: (event: FocusEvent<HTMLElement>) => void;
  announcement: string;
  onCreateTask: () => void;
};

/**
 * Komandni centar — prezentacija (izlog `zadaci-startup`): zaglavlje sa
 * pulsom dana, traka opterećenja, zone sa redovima. Podaci kroz props, bez
 * `useQuery`.
 */
export function CommandCenterBody({
  startupName,
  now,
  loading,
  totalOpen,
  filteredTotal,
  hasMore,
  workload,
  memberFilter,
  onMemberFilter,
  zones,
  assigneesByTaskId,
  laterOpen,
  onLaterOpenChange,
  actions,
  listRef,
  selectedKey,
  activeKey,
  request,
  onListFocus,
  announcement,
  onCreateTask,
}: CommandCenterBodyProps) {
  const prefersReducedMotion = useReducedMotion();
  // Ulaz redova samo na prvo punjenje i promenu filtera člana (plan K07 §4.1 #8).
  useEnter(listRef, { key: loading ? "loading" : `ready:${memberFilter ?? "svi"}` });

  const pulseSegments = useMemo<Array<PulseSegment>>(
    () =>
      zones.map((zone) => ({
        key: zone.id,
        label: ZONE_META[zone.id].label,
        count: zone.rows.length,
        tone: ZONE_TONE[zone.id],
        onSelect: () => {
          document.getElementById(`zona-${zone.id}`)?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "start",
          });
          if (zone.id === "kasnije") onLaterOpenChange(true);
        },
      })),
    [zones, prefersReducedMotion, onLaterOpenChange],
  );

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header data-workspace-enter className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">{startupName}</p>
            <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Komandni centar</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Trijaža za danas: šta gori, šta je na redu i ko je preopterećen.
            </p>
          </div>
          <Button onClick={onCreateTask}>
            <Plus /> Novi zadatak
          </Button>
        </div>

        <div className="mt-5">
          {loading ? (
            <Skeleton className="h-2.5 w-full rounded-sm" />
          ) : (
            <PulseBar segments={pulseSegments} label={`Sastav dana: ${filteredTotal} ${tasksWord(filteredTotal)}`} />
          )}
        </div>
      </header>

      {loading ? (
        <CommandCenterSkeleton />
      ) : (
        <>
          <section data-workspace-enter className="mb-6">
            <WorkloadStrip entries={workload} totalOpen={totalOpen} activeKey={memberFilter} onSelect={onMemberFilter} />
          </section>

          {totalOpen === 0 ? (
            <EmptyState
              icon={CheckSquare2}
              title="Nema otvorenih zadataka"
              description={`U startupu ${startupName} trenutno nema posla u toku. Kreiraj zadatak kada se pojavi.`}
              action={
                <Button onClick={onCreateTask}>
                  <Plus /> Novi zadatak
                </Button>
              }
            />
          ) : filteredTotal === 0 && memberFilter !== null ? (
            <EmptyState
              icon={UserSearch}
              title="Nema zadataka za ovaj izbor"
              description="Izabrani član trenutno nema otvorenih zadataka u ovom startupu."
              action={
                <Button variant="outline" onClick={() => onMemberFilter(null)}>
                  Prikaži sve
                </Button>
              }
            />
          ) : (
            <div ref={listRef} data-workspace-enter className="space-y-4" onFocus={onListFocus}>
              {zones.map((zone) => (
                <TriageZoneSection
                  key={zone.id}
                  zone={zone}
                  now={now}
                  assigneesByTaskId={assigneesByTaskId}
                  collapsed={zone.id === "kasnije" && !laterOpen}
                  onToggleCollapsed={zone.id === "kasnije" ? () => onLaterOpenChange(!laterOpen) : undefined}
                  actions={actions}
                  selectedKey={selectedKey}
                  activeKey={activeKey}
                  request={request}
                />
              ))}
            </div>
          )}

          {hasMore ? <p className="mt-5 text-xs text-muted-foreground">Prikazano je prvih 150 zadataka po statusu.</p> : null}
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function CommandCenterSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje trijaže" className="space-y-4">
      <div className="flex gap-2">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-14 w-40 rounded-xl" />
        ))}
      </div>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="rounded-2xl border border-border/70 p-3">
          <Skeleton className="mb-3 h-5 w-40" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function TriageZoneSection({
  zone,
  now,
  assigneesByTaskId,
  collapsed,
  onToggleCollapsed,
  actions,
  selectedKey,
  activeKey,
  request,
}: {
  zone: CommandCenterZone;
  now: number;
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
}) {
  const meta = ZONE_META[zone.id];
  const Icon = meta.icon;
  const count = zone.rows.length;
  const listId = `zona-${zone.id}-lista`;
  const [limit, setLimit] = useState(ZONE_PAGE);
  const visible = zone.rows.slice(0, limit);
  const remaining = count - visible.length;

  return (
    <section
      id={`zona-${zone.id}`}
      aria-labelledby={`zona-${zone.id}-naslov`}
      // Zona je i sama deo Flip-a (K19): kad red pređe u drugu zonu, okviri
      // zona menjaju visinu zajedno sa redovima umesto da skoče.
      data-flip-id={`zona:${zone.id}`}
      className={cn("scroll-mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card/60", meta.frameClass)}
    >
      {/* Zaglavlje zone ulazi u istom stagger-u kao redovi (`useEnter`). */}
      <header data-motion-enter className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
        <Icon className={cn("size-4 shrink-0", meta.accentClass)} aria-hidden="true" />
        <h2 id={`zona-${zone.id}-naslov`} className="text-sm font-bold uppercase tracking-[0.08em]">
          {meta.label}
        </h2>
        <span
          className={cn(
            "grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono text-[0.6875rem] font-semibold tabular-nums",
            meta.countClass,
          )}
        >
          <NumberRoll value={count} aria-label={`${count} ${tasksWord(count)}`} />
        </span>
        <p className="hidden text-xs text-muted-foreground sm:block">{meta.hint}</p>
        {onToggleCollapsed === undefined ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={onToggleCollapsed}
          >
            {collapsed ? "Prikaži" : "Sakrij"}
            <ChevronDown
              className={cn("transition-transform", !collapsed && "rotate-180")}
              style={{ transitionDuration: `${DURATION.quick}ms` }}
              aria-hidden="true"
            />
          </Button>
        )}
      </header>

      {/* Skupljena zona se otvara/zatvara kroz `Collapse` i ne montira redove dok je zatvorena. */}
      <Collapse open={!collapsed} id={listId} unmountWhenClosed>
        {count === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground sm:px-4">{meta.emptyLabel}</p>
        ) : (
          <ul data-section={zone.id} className="space-y-0.5 border-t border-border/50 px-1.5 py-1.5 sm:px-2">
            {visible.map((row) => (
              <li key={row.key} data-flip-id={row.key}>
                <CommandCenterRow
                  row={row}
                  now={now}
                  assignees={assigneesByTaskId.get(row.id) ?? []}
                  actions={actions}
                  selected={selectedKey === row.key}
                  active={activeKey === row.key}
                  request={request?.key === row.key ? request : null}
                />
              </li>
            ))}
            {remaining > 0 ? (
              <li>
                <Button variant="ghost" size="sm" className="ml-1" onClick={() => setLimit((value) => value + ZONE_PAGE)}>
                  Prikaži još {Math.min(remaining, ZONE_PAGE)}
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </Collapse>
    </section>
  );
}

function CommandCenterRow({
  row,
  now,
  assignees,
  actions,
  selected,
  active,
  request,
}: {
  row: TaskRowModel;
  now: number;
  assignees: ReadonlyArray<CommandCenterAssignee>;
  actions: TaskRowActions;
  selected: boolean;
  active: boolean;
  request: RowRequest | null;
}) {
  return (
    <TaskRow
      row={row}
      now={now}
      actions={actions}
      canOpen
      columns
      showStartup={false}
      canJoin={canJoinTask(row)}
      extraMeta={<AssigneeStack assignees={[...assignees]} max={3} />}
      selected={selected}
      active={active}
      request={request}
    />
  );
}

