"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  activityTarget,
  applyStartupHolds,
  findStartupRow,
  forYouTasks,
  formatActivity,
  formatEditTime,
  locateStartupRow,
  rescheduleCandidates,
  rescheduleChange,
  rescheduleOutcome,
  rowFromStartupTask,
  undoOutcome,
  weekPulseFacts,
  type StartupTaskSection,
  type RescheduleTarget,
} from "@devotion/shared";

import { useCompletionQueue } from "@/components/me/my-day/use-completion-queue";
import { ShortcutProvider } from "@/components/shortcuts/shortcut-provider";
import type { ActivityEntry } from "@/components/workspace/command-center/activity-row";
import { FOR_YOU_LIMIT, FOR_YOU_SECTION, ForYouView } from "@/components/workspace/command-center/for-you-block";
import { PulseView } from "@/components/workspace/command-center/pulse-block";
import { RecentView } from "@/components/workspace/command-center/recent-block";
import { RescheduleDialog } from "@/components/workspace/command-center/reschedule-dialog";
import { TeamView, type TeamEntry } from "@/components/workspace/command-center/team-block";
import { DEFAULT_OPEN_ZONES, filterOptionsOf, TriageView } from "@/components/workspace/command-center/triage-block";
import type { BlockStatus } from "@/components/workspace/command-center/block";
import { WaitingView, type WaitingItem } from "@/components/workspace/command-center/waiting-block";
import { ActivityScreen } from "@/components/workspace/activity-view";
import { CommandCenterFrame } from "@/components/workspace/command-center-view";
import {
  buildZones,
  COMMAND_CENTER_LIST,
  filterByMember,
  UNASSIGNED_KEY,
  workloadCounts,
  zoneRowCount,
  type CommandCenterAssignee,
  type CommandCenterTask,
  type CommandCenterZone,
  type CommandCenterZoneId,
  type WorkloadFilter,
} from "@/components/workspace/startup-tasks/command-center-model";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/workspace/startup-tasks/constants";
import { useMoveFocus } from "@/components/workspace/startup-tasks/use-move-focus";
import { useFlip } from "@/lib/motion";
import { useTaskListShortcuts } from "@/lib/shortcuts/use-task-list-shortcuts";

import type { IzlogEkranProps } from "../registry";
import {
  IZLOG_CC_ACTIVITY,
  IZLOG_CC_PULSE,
  IZLOG_CC_PULSE_EMPTY,
  IZLOG_CC_PUN,
  IZLOG_CC_PUN_ASSIGNEES,
  IZLOG_CC_WAITING,
  IZLOG_CC_ZATRPAN,
  IZLOG_CC_ZATRPAN_ASSIGNEES,
} from "../fixtures/command-center";
import { IZLOG_PROFILE } from "../fixtures/me";
import { IZLOG_NOW } from "../fixtures/now";
import { IZLOG_ST_MEMBERS, IZLOG_ST_PLANNED, IZLOG_ST_STARTUP } from "../fixtures/startup-tasks";
import { IzlogPanel } from "./panel-zadatka";
import { useLocalActions } from "./zadaci-startup";

const noop = () => {};
const NO_BUSY: ReadonlySet<string> = new Set();
const ME = IZLOG_PROFILE._id as string;
const STARTUP_MINI = { _id: IZLOG_ST_STARTUP._id, name: IZLOG_ST_STARTUP.name, logoUrl: null };
const AREA_LABELS = new Map(IZLOG_ST_STARTUP.areas.map((area) => [area._id as string, area.label] as const));

type PanelState = { title: string; key: string; creator: boolean; origin: HTMLElement | null; openedAt: number };

type Variant = "pun" | "zatrpan" | "sredi-rokove" | "prazan" | "greska-bloka" | "ucitavanje";

function statusOf(variant: Variant, block: "triage" | "recent" | "other"): BlockStatus {
  if (variant === "ucitavanje") return "loading";
  if (variant === "greska-bloka" && block !== "other") return "error";
  return "ready";
}

/** Komandni centar 2.0 u izlogu: svi blokovi nad lokalnim podacima (izlog ne zove upite ni mutacije). */
function IzlogKomandniCentar({ variant }: { variant: Variant }) {
  const crowded = variant === "zatrpan" || variant === "sredi-rokove";
  const [tasks, setTasks] = useState<CommandCenterTask[]>(variant === "prazan" ? [] : crowded ? IZLOG_CC_ZATRPAN : IZLOG_CC_PUN);
  const assignees: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>> = crowded
    ? IZLOG_CC_ZATRPAN_ASSIGNEES
    : IZLOG_CC_PUN_ASSIGNEES;
  const [planned, setPlanned] = useState(IZLOG_ST_PLANNED);
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);
  const [openZones, setOpenZones] = useState<ReadonlySet<CommandCenterZoneId>>(DEFAULT_OPEN_ZONES);
  const [waiting, setWaiting] = useState(variant === "prazan" ? [] : IZLOG_CC_WAITING);
  const [announcement, setAnnouncement] = useState("");
  const [dialogOpen, setDialogOpen] = useState(variant === "sredi-rokove");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<StartupTaskSection[]>([]);
  const { capture } = useFlip(listRef);
  const flip = () => {
    if (zoneRowCount(sectionsRef.current as CommandCenterZone[]) <= STARTUP_FLIP_MAX_ROWS) capture();
  };
  const completion = useCompletionQueue({
    listRef,
    locate: (key) => locateStartupRow(COMMAND_CENTER_LIST, sectionsRef.current, key),
    flipCapture: flip,
    commit: async (row, done, previous) =>
      setTasks((current) =>
        current.map((item) =>
          item._id === row.id
            ? { ...item, taskStatus: done ? "done" : previous && previous !== "open" && previous !== "done" ? previous : "next" }
            : item,
        ),
      ),
  });
  const move = useMoveFocus(listRef, completion.announcement);
  const actions = useLocalActions<CommandCenterTask>({
    setTasks,
    setPlanned,
    flip,
    completion,
    moved: move.moved,
    onOpen: (row) => {
      const origin = listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
      setPanel({ title: row.title, key: row.key, creator: row.permissions.priority.allowed, origin, openedAt: performance.now() });
      setPanelOpen(true);
    },
  });

  const open = useMemo(() => tasks.filter((item) => item.taskStatus !== "done"), [tasks]);

  // --- Za tebe ---
  const forYouSections = useMemo<StartupTaskSection[]>(() => {
    const mine = open.filter((item) => (assignees.get(item._id) ?? []).some((assignee) => assignee.profileId === ME));
    const picked = forYouTasks(mine, IZLOG_NOW, FOR_YOU_LIMIT);
    const rows = picked.items.map((item) => {
      const row = rowFromStartupTask(item, {
        profileId: ME,
        startup: STARTUP_MINI,
        areaLabels: AREA_LABELS,
        assigneeIds: (assignees.get(item._id) ?? []).map((assignee) => assignee.profileId),
        plannedKeys: planned,
      });
      return { ...row, key: `${FOR_YOU_SECTION}:${row.key}` };
    });
    return applyStartupHolds(COMMAND_CENTER_LIST, [{ id: FOR_YOU_SECTION, rows }], completion.holds, completion.pending);
  }, [open, assignees, planned, completion.holds, completion.pending]);
  const forYouTotal = useMemo(() => {
    const mine = open.filter((item) => (assignees.get(item._id) ?? []).some((assignee) => assignee.profileId === ME));
    return forYouTasks(mine, IZLOG_NOW, FOR_YOU_LIMIT).total;
  }, [open, assignees]);

  // --- Trijaža ---
  const visible = useMemo(() => filterByMember(open, memberFilter, assignees), [open, memberFilter, assignees]);
  const zones = useMemo(
    () =>
      buildZones(visible, {
        now: IZLOG_NOW,
        profileId: ME,
        startup: STARTUP_MINI,
        areaLabels: AREA_LABELS,
        assigneesByTaskId: assignees,
        plannedKeys: planned,
        holds: completion.holds,
        pending: completion.pending,
      }),
    [visible, assignees, planned, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    sectionsRef.current = [...forYouSections, ...zones];
  });
  const candidates = useMemo(() => rescheduleCandidates(open, IZLOG_NOW), [open]);

  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => findStartupRow(sectionsRef.current, key),
    actions,
    enabled: !panelOpen,
  });

  const applyReschedule = (target: RescheduleTarget, ids: string[]) => {
    const change = rescheduleChange(target, IZLOG_NOW);
    const previous = tasks.filter((item) => ids.includes(item._id)).map((item) => ({ ...item }));
    flip();
    setTasks((current) =>
      current.map((item) =>
        ids.includes(item._id) ? ("complete" in change ? { ...item, taskStatus: "done" } : { ...item, dueDate: change.dueDate }) : item,
      ),
    );
    const outcome = rescheduleOutcome(target, { updated: ids.length, unchanged: 0, skipped: [] });
    toast.success(outcome.message, {
      duration: 8_000,
      action: {
        label: "Poništi",
        onClick: () => {
          flip();
          setTasks((current) => current.map((item) => previous.find((old) => old._id === item._id) ?? item));
          toast.success(undoOutcome({ restored: previous.length, unchanged: 0, skipped: [] }));
        },
      },
    });
    if (candidates.length - ids.length <= 0) setDialogOpen(false);
  };

  // --- Opterećenje, Tim, Čeka tebe, Nedavne izmene, Puls ---
  const team = useMemo<TeamEntry[]>(
    () =>
      workloadCounts(open, IZLOG_ST_MEMBERS.map((member) => member._id), assignees, IZLOG_NOW).map((count) => {
        const member = IZLOG_ST_MEMBERS.find((item) => item._id === count.key);
        return {
          key: count.key,
          name: member?.displayName ?? "Nedodeljeno",
          avatar: member === undefined ? null : { displayName: member.displayName, avatarUrl: null },
          open: count.open,
          overdue: count.overdue,
        };
      }),
    [open, assignees],
  );
  const hasUnassigned = team.some((entry) => entry.key === UNASSIGNED_KEY);
  const members = IZLOG_ST_MEMBERS.map((member) => ({ profileId: member._id, displayName: member.displayName, avatarUrl: null }));
  const recent = useMemo<ActivityEntry[]>(
    () =>
      variant === "prazan"
        ? []
        : IZLOG_CC_ACTIVITY.map((item) => {
            const format = formatActivity(item, item.actor);
            return {
              id: item.id,
              sentence: format.sentence,
              icon: format.icon,
              tone: format.tone,
              time: formatEditTime(IZLOG_NOW - item.minutesAgo * 60_000, IZLOG_NOW),
              target: activityTarget({ targetType: item.targetType, targetId: "x" }),
            };
          }),
    [variant],
  );

  const vote = (item: WaitingItem, voteType: "up" | "down") => {
    setWaiting((current) => current.filter((entry) => entry.ideaId !== item.ideaId));
    setAnnouncement((previous) => (previous === "Glas je sačuvan." ? "Glas je sačuvan. " : "Glas je sačuvan."));
    toast.success(voteType === "up" ? "Glasao/la si za." : "Glasao/la si protiv.");
  };

  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <CommandCenterFrame
        onCreateTask={noop}
        listRef={listRef}
        onListFocus={shortcuts.onListFocus}
        announcement={move.announcement}
        main={
          <>
            <ForYouView
              status={statusOf(variant, "other")}
              onRetry={noop}
              rows={forYouSections[0]?.rows ?? []}
              total={forYouTotal}
              now={IZLOG_NOW}
              actions={actions}
              selectedKey={shortcuts.selectedKey}
              activeKey={panelOpen ? (panel?.key ?? null) : null}
              request={shortcuts.request}
              onOpenAll={noop}
            />
            <TriageView
              status={statusOf(variant, "triage")}
              onRetry={noop}
              now={IZLOG_NOW}
              zones={zones}
              assigneesByTaskId={assignees}
              totalOpen={open.length}
              filteredTotal={visible.length}
              hasMore={false}
              filterOptions={filterOptionsOf(members, hasUnassigned)}
              memberFilter={memberFilter}
              onMemberFilter={setMemberFilter}
              overdueCount={candidates.length}
              onReschedule={() => setDialogOpen(true)}
              openZones={openZones}
              onToggleZone={(id) =>
                setOpenZones((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              actions={actions}
              selectedKey={shortcuts.selectedKey}
              activeKey={panelOpen ? (panel?.key ?? null) : null}
              request={shortcuts.request}
            />
          </>
        }
        side={
          <>
            <WaitingView
              status={statusOf(variant, "other")}
              onRetry={noop}
              items={waiting}
              total={waiting.length}
              busyIds={NO_BUSY}
              announcement={announcement}
              onVote={vote}
              onOpenIdea={noop}
              onOpenAll={noop}
            />
            <RecentView status={statusOf(variant, "recent")} onRetry={noop} entries={recent} onOpen={noop} onOpenAll={noop} />
            <PulseView
              status={statusOf(variant, "other")}
              onRetry={noop}
              facts={weekPulseFacts(variant === "prazan" ? IZLOG_CC_PULSE_EMPTY : IZLOG_CC_PULSE)}
              onOpen={noop}
            />
            <TeamView
              status={statusOf(variant, "other")}
              onRetry={noop}
              entries={team}
              activeKey={memberFilter}
              onSelect={setMemberFilter}
            />
          </>
        }
      />
      <RescheduleDialog
        open={dialogOpen && candidates.length > 0}
        onOpenChange={setDialogOpen}
        candidates={candidates}
        busy={false}
        onApply={applyReschedule}
      />
      {panel ? (
        <IzlogPanel
          key={`${panel.key}:${panel.openedAt}`}
          kind={panel.creator ? "kreator" : "clan"}
          title={panel.title}
          origin={panel.origin}
          openedAt={panel.openedAt}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          openLabel="full"
        />
      ) : null}
    </div>
  );
}

/** Ekran Aktivnost: lista sa „Učitaj još" nad fixture unosima. */
function IzlogAktivnost() {
  const entries = IZLOG_CC_ACTIVITY.map((item) => {
    const format = formatActivity(item, item.actor);
    return {
      id: item.id,
      sentence: format.sentence,
      icon: format.icon,
      tone: format.tone,
      time: formatEditTime(IZLOG_NOW - item.minutesAgo * 60_000, IZLOG_NOW),
      target: activityTarget({ targetType: item.targetType, targetId: "x" }),
    };
  });
  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <ActivityScreen status="ready" entries={entries} canLoadMore loadingMore={false} onLoadMore={noop} onOpen={noop} />
    </div>
  );
}

/** Komandni centar 2.0 (K19): pun, zatrpan (30 prekoračenih), „Sredi rokove", prazan, greška bloka, učitavanje i Aktivnost. */
export default function KomandniCentarEkran({ varijanta }: IzlogEkranProps) {
  if (varijanta === "aktivnost") return <IzlogAktivnost />;
  return (
    <ShortcutProvider>
      <IzlogKomandniCentar key={varijanta} variant={varijanta as Variant} />
    </ShortcutProvider>
  );
}
