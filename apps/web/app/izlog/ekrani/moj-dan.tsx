"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  moveInPlan,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

import {
  applyHolds,
  buildMyDay,
  FLIP_MAX_ROWS,
  locateRow,
  type MyDayGroupMode,
  type MyDayModel,
  type MyDayOverviewData,
  patchItem,
  plannedOrder,
  withEntry,
  withEntryOrder,
  withoutEntry,
  withoutHistory,
} from "@/components/me/my-day/my-day-model";
import { MyDayView } from "@/components/me/my-day/my-day-view";
import type { SideBlock, SideChat, SideInbox, SidePending } from "@/components/me/my-day/side-model";
import { useArrival } from "@/components/me/my-day/use-arrival";
import { useCompletionQueue } from "@/components/me/my-day/use-completion-queue";
import { PlanDayDialog } from "@/components/me/plan-day/plan-day-dialog";
import { buildPlanDay } from "@/components/me/plan-day/plan-day-model";
import { QuickAddDialog } from "@/components/me/quick-add/quick-add-dialog";
import type { TaskRowActions } from "@/components/me/task-row";
import { ShortcutProvider } from "@/components/shortcuts/shortcut-provider";
import { useFlip } from "@/lib/motion";
import { useTaskListShortcuts } from "@/lib/shortcuts/use-task-list-shortcuts";

import type { IzlogEkranProps } from "../registry";
import { fakeId } from "../fixtures/ids";
import {
  IZLOG_DAY_OBICAN,
  IZLOG_DAY_PRAZAN,
  IZLOG_DAY_PRETRPAN,
  IZLOG_NOW,
  IZLOG_SIDE_CHAT,
  IZLOG_SIDE_INBOX,
  IZLOG_SIDE_PENDING,
  QUICK_ADD_STARTUPS,
} from "../fixtures/moj-dan";
import { IzlogPanel, type IzlogPanelKind } from "./panel-zadatka";

const noop = () => {};

type Side = { inbox: SideBlock<SideInbox>; chat: SideBlock<SideChat>; pending: SideBlock<SidePending> };

const SIDE_READY: Side = {
  inbox: { status: "ready", data: IZLOG_SIDE_INBOX },
  chat: { status: "ready", data: IZLOG_SIDE_CHAT },
  pending: { status: "ready", data: IZLOG_SIDE_PENDING },
};

const SIDE_EMPTY: Side = {
  inbox: { status: "ready", data: { unread: 0, capped: false, items: [] } },
  chat: { status: "ready", data: { total: 0, personal: 0, byStartup: [] } },
  pending: { status: "ready", data: { items: [], truncated: false } },
};

const SIDE_LOADING: Side = { inbox: { status: "loading" }, chat: { status: "loading" }, pending: { status: "loading" } };

function withStatus(overview: MyDayOverviewData, row: TaskRowModel, done: boolean): MyDayOverviewData {
  if (row.kind === "task") {
    return {
      ...overview,
      tasks: overview.tasks.map((task) =>
        task._id === row.id ? { ...task, taskStatus: done ? "done" : "next", completedAt: done ? IZLOG_NOW : null } : task,
      ),
    };
  }
  return {
    ...overview,
    personal: overview.personal.map((task) =>
      task._id === row.id ? { ...task, status: done ? "done" : "open", completedAt: done ? IZLOG_NOW : null } : task,
    ),
  };
}

function planEntryFor(refKey: string, n: number) {
  return { _id: fakeId("myDayEntries", 500 + n), dayKey: "2026-10-24", refKey, position: 0 };
}

/**
 * Moj dan u izlogu (K10): isti prezentacioni prikaz kao u aplikaciji, sa
 * lokalnim podacima umesto mutacija — kvačica, plan, rok, redosled, brzi unos
 * i „Isplaniraj dan" rade, pa se pokret (trenuci 1, 4, 5) vidi bez prijave.
 */
function IzlogMojDan({ initial, initialMode, side }: { initial: MyDayOverviewData; initialMode: MyDayGroupMode; side: Side }) {
  const [overview, setOverview] = useState(initial);
  const [groupMode, setGroupMode] = useState(initialMode);
  const [planOpen, setPlanOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  // K11: red otvara ISTI panel zadatka kao u Mojim zadacima.
  const [panel, setPanel] = useState<{ kind: IzlogPanelKind; title: string; key: string; origin: HTMLElement | null; openedAt: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const counter = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { capture } = useFlip(listRef);
  const modelRef = useRef<MyDayModel | null>(null);
  const flip = () => {
    if ((modelRef.current?.rowCount ?? 0) <= FLIP_MAX_ROWS) capture();
  };
  const completion = useCompletionQueue({
    listRef,
    locate: (key) => (modelRef.current ? locateRow(modelRef.current, groupMode, key) : null),
    flipCapture: flip,
    commit: async (row, done) => setOverview((current) => withStatus(current, row, done)),
  });
  const model = useMemo(
    () => applyHolds(buildMyDay(overview, IZLOG_NOW), completion.holds, completion.pending),
    [overview, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    modelRef.current = model;
  });
  const keys = useMemo(
    () =>
      groupMode === "time"
        ? model.sections.flatMap((section) => section.rows.map((row) => row.key))
        : [...model.byStartup.groups.flatMap((group) => group.rows.map((row) => row.key)), ...model.byStartup.doneToday.map((row) => row.key)],
    [model, groupMode],
  );
  useArrival(listRef, keys, { maxRows: FLIP_MAX_ROWS });
  const rowByKey = useMemo(
    () => new Map([...model.sections.flatMap((section) => section.rows), ...model.byStartup.doneToday].map((row) => [row.key, row] as const)),
    [model],
  );

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: (row) => {
      flip();
      setOverview((current) =>
        row.planEntryId !== null
          ? withoutEntry(current, row.planEntryId)
          : withEntry(current, planEntryFor(row.key, (counter.current += 1))),
      );
    },
    onSetDue: (row, due) => {
      flip();
      setOverview((current) => patchItem(current, row, { dueDate: due }));
    },
    onSetPriority: (row, priority: TaskPriorityKey | null) => {
      setOverview((current) => patchItem(current, row, { priority }));
    },
    onOpen: (row) => {
      const origin =
        listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
      setPanel({
        kind: row.kind === "personal" ? "licni" : row.permissions.priority.allowed ? "kreator" : "clan",
        title: row.title,
        key: row.key,
        origin,
        openedAt: performance.now(),
      });
      setPanelOpen(true);
    },
    onMove: (row, direction) => {
      if (row.planEntryId === null) return;
      if (!modelRef.current) return;
      const next = moveInPlan(plannedOrder(modelRef.current), row.planEntryId, direction);
      if (!next) return;
      flip();
      setOverview((current) => withEntryOrder(current, next));
    },
  };

  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => rowByKey.get(key),
    actions,
    reorder: true,
    enabled: !panelOpen && !planOpen && !quickOpen,
  });

  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <MyDayView
        now={IZLOG_NOW}
        firstName="Jovan"
        state={{ status: "ready", model }}
        groupMode={groupMode}
        onGroupModeChange={setGroupMode}
        side={{ ...side, onOpenInbox: noop, onOpenChat: noop, onOpenPending: noop }}
        actions={actions}
        canOpen={() => true}
        activeKey={panelOpen ? (panel?.key ?? null) : null}
        selectedKey={shortcuts.selectedKey}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        onQuickAdd={() => setQuickOpen(true)}
        onPlanDay={() => setPlanOpen(true)}
        onOpenTasks={noop}
        listRef={listRef}
        announcement={completion.announcement}
      />
      <PlanDayDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        now={IZLOG_NOW}
        state={{ status: "ready", model: buildPlanDay(overview, IZLOG_NOW) }}
        onAdd={(row) => setOverview((current) => withEntry(current, planEntryFor(row.key, (counter.current += 1))))}
        onCarryOver={(refKeys) =>
          setOverview((current) =>
            refKeys.reduce(
              (next, refKey) => withEntry(next, planEntryFor(refKey, (counter.current += 1))),
              withoutHistory(current, new Set(refKeys)),
            ),
          )
        }
        onDismiss={(refKeys) => setOverview((current) => withoutHistory(current, new Set(refKeys)))}
      />
      <QuickAddDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        now={IZLOG_NOW}
        startups={QUICK_ADD_STARTUPS}
        onSubmit={async (draft) => {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          const n = (counter.current += 1);
          const id = fakeId("personalTasks", 900 + n);
          setOverview((current) => ({
            ...current,
            personal: [
              ...current.personal,
              {
                _id: id,
                title: draft.title.trim(),
                status: "open",
                priority: null,
                dueDate: draft.dueDate,
                completedAt: null,
                createdAt: IZLOG_NOW + n,
              },
            ],
            entries: draft.addToMyDay ? withEntry(current, planEntryFor(`personal:${id}`, n)).entries : current.entries,
          }));
          toast.success("Dodato u Lično.", { duration: 8_000, action: { label: "Poništi", onClick: noop } });
        }}
      />
      {panel ? (
        <IzlogPanel
          key={`${panel.key}:${panel.openedAt}`}
          kind={panel.kind}
          title={panel.title}
          origin={panel.origin}
          openedAt={panel.openedAt}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default function MojDanEkran({ varijanta }: IzlogEkranProps) {
  const shared = {
    now: IZLOG_NOW,
    firstName: "Jovan",
    groupMode: "time" as const,
    onGroupModeChange: noop,
    canOpen: () => true,
    onQuickAdd: noop,
    onPlanDay: noop,
    onOpenTasks: noop,
  };
  if (varijanta === "ucitavanje") {
    return (
      <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
        <MyDayView {...shared} state={{ status: "loading" }} side={{ ...SIDE_LOADING, onOpenInbox: noop, onOpenChat: noop, onOpenPending: noop }} />
      </div>
    );
  }
  if (varijanta === "greska") {
    return (
      <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
        <MyDayView {...shared} state={{ status: "error", retry: noop }} side={null} />
      </div>
    );
  }
  const initial =
    varijanta === "prazan" ? IZLOG_DAY_PRAZAN : varijanta === "pretrpan" ? IZLOG_DAY_PRETRPAN : IZLOG_DAY_OBICAN;
  return (
    <ShortcutProvider>
      <IzlogMojDan
        key={varijanta}
        initial={initial}
        initialMode={varijanta === "po-startupu" ? "startup" : "time"}
        side={varijanta === "prazan" ? SIDE_EMPTY : SIDE_READY}
      />
    </ShortcutProvider>
  );
}
