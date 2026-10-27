"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import {
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  CalendarX2,
  ChevronDown,
  CircleDashed,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { COMMAND_BLOCK_TEXT, rescheduleCandidates, type TaskRowModel } from "@devotion/shared";

import type { TaskRowActions } from "@/components/me/task-row";
import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildZones,
  filterByMember,
  UNASSIGNED_KEY,
  type CommandCenterAssignee,
  type CommandCenterZone,
  type CommandCenterZoneId,
  type WorkloadFilter,
} from "@/components/workspace/startup-tasks/command-center-model";
import { EmptyState } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import { cn } from "@/lib/utils";

import { Block, type BlockStatus, useBlockRetry } from "./block";
import { RescheduleDialog, useReschedule } from "./reschedule-dialog";
import { CommandTaskRow, useCommandRows, useRegisterSections } from "./rows-context";
import { useTriageData, type TriageMember } from "./use-triage-data";

/** Zona prikazuje do 100 redova, ostalo kroz „Prikaži još" (E12). */
const ZONE_PAGE = 100;

const ZONE_META: Record<CommandCenterZoneId, { label: string; icon: LucideIcon; iconClass: string; emptyLabel: string }> = {
  gori: { label: "Gori", icon: Flame, iconClass: "text-destructive", emptyLabel: "Ništa ovde." },
  zastarelo: { label: "Zastarelo", icon: CalendarX2, iconClass: "text-muted-foreground", emptyLabel: "Ništa ovde." },
  danas: { label: "Danas", icon: CalendarClock, iconClass: "text-muted-foreground", emptyLabel: "Ništa ovde." },
  nedelja: { label: "Ova nedelja", icon: CalendarDays, iconClass: "text-muted-foreground", emptyLabel: "Ništa ovde." },
  kasnije: { label: "Kasnije i bez roka", icon: CircleDashed, iconClass: "text-muted-foreground", emptyLabel: "Ništa ovde." },
};

/** Zone koje se skupljaju (i podrazumevano su skupljene). */
const COLLAPSIBLE: ReadonlySet<CommandCenterZoneId> = new Set(["zastarelo", "kasnije"]);
export const DEFAULT_OPEN_ZONES: ReadonlySet<CommandCenterZoneId> = new Set();

export type TriageViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  now: number;
  zones: CommandCenterZone[];
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>;
  totalOpen: number;
  filteredTotal: number;
  hasMore: boolean;
  /** Članovi (i „Nedodeljeno" kad postoji) za izbor u zaglavlju. */
  filterOptions: ReadonlyArray<{ key: string; name: string }>;
  memberFilter: WorkloadFilter;
  onMemberFilter: (key: WorkloadFilter) => void;
  /** Zadaci sa prošlim rokom (i zastareli među njima) — broj na dugmetu „Sredi rokove". */
  overdueCount: number;
  onReschedule: () => void;
  rescheduleRef?: RefObject<HTMLButtonElement | null>;
  openZones: ReadonlySet<CommandCenterZoneId>;
  onToggleZone: (id: CommandCenterZoneId) => void;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
};

/**
 * Trijaža tima — prezentacija (izlog `komandni-centar`): zone Gori · Zastarelo ·
 * Danas · Ova nedelja · Kasnije, filter člana i „Sredi rokove". Zona nije kartica
 * (DIZAJN-SMIRENJE §5.4): naslov zone + redovi.
 */
export function TriageView({
  status,
  onRetry,
  now,
  zones,
  assigneesByTaskId,
  totalOpen,
  filteredTotal,
  hasMore,
  filterOptions,
  memberFilter,
  onMemberFilter,
  overdueCount,
  onReschedule,
  rescheduleRef,
  openZones,
  onToggleZone,
  actions,
  selectedKey,
  activeKey,
  request,
}: TriageViewProps) {
  const filterName = memberFilter === null ? null : (filterOptions.find((option) => option.key === memberFilter)?.name ?? null);
  return (
    <Block
      id="cc-trijaza"
      title="Trijaža"
      count={filteredTotal}
      status={status}
      errorText={COMMAND_BLOCK_TEXT.triageError}
      onRetry={onRetry}
      skeletonRows={5}
      action={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Filter člana: ${filterName ?? "Svi"}`}>
                {filterName ?? "Svi"}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuRadioGroup
                value={memberFilter ?? "svi"}
                onValueChange={(value) => onMemberFilter(value === "svi" ? null : value)}
              >
                <DropdownMenuRadioItem value="svi">Svi</DropdownMenuRadioItem>
                {filterOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.key} value={option.key}>
                    {option.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {overdueCount > 0 ? (
            <Button ref={rescheduleRef} variant="outline" size="sm" onClick={onReschedule}>
              <CalendarCheck aria-hidden="true" />
              Sredi rokove
              <span className="tabular-nums text-muted-foreground">· {overdueCount}</span>
            </Button>
          ) : null}
        </>
      }
    >
      {totalOpen === 0 ? (
        <EmptyState size="section" title="Tim nema otvorenih zadataka." />
      ) : filteredTotal === 0 && memberFilter !== null ? (
        <EmptyState
          size="section"
          title={`${filterName ?? "Izabrani član"} nema otvorenih zadataka.`}
          action={
            <Button variant="ghost" size="sm" onClick={() => onMemberFilter(null)}>
              Prikaži sve
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => {
            // „Zastarelo" je izuzetak: bez zastarelih zadataka grupe nema.
            if (zone.id === "zastarelo" && zone.rows.length === 0) return null;
            return (
              <TriageZoneSection
                key={zone.id}
                zone={zone}
                now={now}
                assigneesByTaskId={assigneesByTaskId}
                collapsed={COLLAPSIBLE.has(zone.id) && !openZones.has(zone.id)}
                collapsible={COLLAPSIBLE.has(zone.id)}
                onToggle={() => onToggleZone(zone.id)}
                actions={actions}
                selectedKey={selectedKey}
                activeKey={activeKey}
                request={request}
              />
            );
          })}
          {hasMore ? <p className="px-2 text-xs text-muted-foreground">Prikazano je prvih 150 zadataka po statusu.</p> : null}
        </div>
      )}
    </Block>
  );
}

function TriageZoneSection({
  zone,
  now,
  assigneesByTaskId,
  collapsed,
  collapsible,
  onToggle,
  actions,
  selectedKey,
  activeKey,
  request,
}: {
  zone: CommandCenterZone;
  now: number;
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>;
  collapsed: boolean;
  collapsible: boolean;
  onToggle: () => void;
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
  const label = (
    <>
      <Icon className={cn("size-4 shrink-0", meta.iconClass)} aria-hidden="true" />
      <span>{meta.label}</span>
      <span className="tabular-nums font-normal">{count}</span>
    </>
  );

  return (
    <div
      id={`zona-${zone.id}`}
      // Zona je i sama deo Flip-a: kad red pređe u drugu zonu, zona menja visinu zajedno sa redovima.
      data-flip-id={`zona:${zone.id}`}
      className="scroll-mt-4"
    >
      <h3 className="text-xs font-medium text-muted-foreground">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={onToggle}
            className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            {label}
            <ChevronDown
              className={cn("ml-auto size-4 transition-transform motion-reduce:transition-none", !collapsed && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="flex min-h-8 items-center gap-2 px-2">{label}</span>
        )}
      </h3>
      <Collapse open={!collapsed} id={listId} unmountWhenClosed>
        {count === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">{meta.emptyLabel}</p>
        ) : (
          <ul data-section={zone.id} className="space-y-0.5">
            {visible.map((row: TaskRowModel) => (
              <li key={row.key} data-flip-id={row.key}>
                <CommandTaskRow
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
    </div>
  );
}

/**
 * Opcije filtera člana: članovi tima, pa „Nedodeljeno" kad ga ima. Isti skup
 * koristi blok Tim.
 */
export function filterOptionsOf(
  members: ReadonlyArray<TriageMember>,
  hasUnassigned: boolean,
): Array<{ key: string; name: string }> {
  const options = members.map((member) => ({ key: member.profileId, name: member.displayName }));
  return hasUnassigned ? [...options, { key: UNASSIGNED_KEY, name: "Nedodeljeno" }] : options;
}

/** Kontejner Trijaže: tri pretplate, zone sa redovima, „Sredi rokove". */
export function TriageBlock({
  startupId,
  memberFilter,
  onMemberFilter,
  flipCapture,
}: {
  startupId: Id<"startups">;
  memberFilter: WorkloadFilter;
  onMemberFilter: (key: WorkloadFilter) => void;
  flipCapture: () => void;
}) {
  const retry = useBlockRetry();
  const data = useTriageData(startupId);
  const rowsContext = useCommandRows();
  const { now, profileId, isManager, startup, commands } = rowsContext;
  const [openZones, setOpenZones] = useState<ReadonlySet<CommandCenterZoneId>>(DEFAULT_OPEN_ZONES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const rescheduleRef = useRef<HTMLButtonElement>(null);
  const { busy, apply } = useReschedule({ startupId, now, beforeApply: flipCapture });

  const ready = data.status === "ready" ? data : null;
  const tasks = ready?.tasks;
  const assigneeMap = ready?.assigneesByTaskId;
  const visibleTasks = useMemo(
    () => (tasks === undefined ? [] : filterByMember(tasks, memberFilter, assigneeMap ?? new Map())),
    [tasks, memberFilter, assigneeMap],
  );
  const zones = useMemo<CommandCenterZone[]>(
    () =>
      ready === null
        ? []
        : buildZones(visibleTasks, {
            now,
            profileId,
            startup,
            areaLabels: rowsContext.areaLabels,
            assigneesByTaskId: ready.assigneesByTaskId,
            plannedKeys: commands.plannedKeys,
            holds: commands.holds,
            pending: commands.pending,
            isManager,
          }),
    [ready, visibleTasks, now, profileId, isManager, startup, rowsContext.areaLabels, commands.plannedKeys, commands.holds, commands.pending],
  );
  useRegisterSections("trijaza", zones);

  // „Sredi rokove" radi nad onim što je na ekranu: uz filter člana samo njegovi zadaci (isto kao na telefonu).
  const candidates = useMemo(() => rescheduleCandidates(visibleTasks, now), [visibleTasks, now]);
  // Kad se lista isprazni dijalog se zatvara i ne sme sam da iskoči kad prekoračenih opet bude.
  if (dialogOpen && ready !== null && candidates.length === 0) setDialogOpen(false);
  const hasUnassigned = useMemo(
    () => (tasks ?? []).some((task) => (assigneeMap?.get(task._id) ?? []).length === 0),
    [tasks, assigneeMap],
  );
  const emptyMap = useMemo(() => new Map<string, CommandCenterAssignee[]>(), []);

  return (
    <>
      <TriageView
        status={data.status}
        onRetry={retry}
        now={now}
        zones={zones}
        assigneesByTaskId={assigneeMap ?? emptyMap}
        totalOpen={tasks?.length ?? 0}
        filteredTotal={visibleTasks.length}
        hasMore={ready?.hasMore ?? false}
        filterOptions={filterOptionsOf(ready?.members ?? [], hasUnassigned)}
        memberFilter={memberFilter}
        onMemberFilter={onMemberFilter}
        overdueCount={candidates.length}
        onReschedule={() => setDialogOpen(true)}
        rescheduleRef={rescheduleRef}
        openZones={openZones}
        onToggleZone={(id) =>
          setOpenZones((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        actions={commands.actions}
        selectedKey={commands.selectedKey}
        activeKey={commands.activeKey}
        request={commands.request}
      />
      <RescheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        candidates={candidates}
        busy={busy}
        returnFocusRef={rescheduleRef}
        fallbackFocusId="cc-trijaza"
        onApply={(target, ids) => {
          void apply(target, ids);
        }}
      />
    </>
  );
}
