"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  EMPTY_TASK_FILTERS,
  type TaskFilters,
  type TaskGroupBy,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

import { useCompletionQueue } from "@/components/me/my-day/use-completion-queue";
import {
  buildMyTasks,
  buildTaskRows,
  findRow,
  locateTaskRow,
  type MyTasksModel,
  type MyTasksSource,
  patchPersonalItems,
  patchTaskItems,
  TASKS_FLIP_MAX_ROWS,
} from "@/components/me/tasks/my-tasks-model";
import { MyTasksView } from "@/components/me/tasks/my-tasks-view";
import type { TaskRowActions } from "@/components/me/task-row";
import { ShortcutProvider } from "@/components/shortcuts/shortcut-provider";
import { useFlip } from "@/lib/motion";
import { useTaskListShortcuts } from "@/lib/shortcuts/use-task-list-shortcuts";

import type { IzlogEkranProps } from "../registry";
import { fakeId } from "../fixtures/ids";
import { IZLOG_NOW } from "../fixtures/now";
import {
  IZLOG_FILTERS_NONE,
  IZLOG_FILTERS_TWO,
  IZLOG_TASK_STARTUPS,
  IZLOG_TASKS_EMPTY,
  IZLOG_TASKS_SOURCE,
} from "../fixtures/tasks";
import { IzlogPanel, type IzlogPanelKind } from "./panel-zadatka";

const noop = () => {};
const STARTUP_ORDER = IZLOG_TASK_STARTUPS.map((startup) => startup._id as string);

/**
 * Moji zadaci u izlogu (K11): isti prikaz kao u aplikaciji, sa lokalnim
 * podacima umesto mutacija — kvačica (trenutak 1), rok/prioritet/plan,
 * filteri i grupisanje kroz Flip, prečice liste (`j`/`k`, `x`, `Enter`, `d`,
 * `p`, `t`, `/`) i panel zadatka sa „letećim" naslovom (trenutak 3).
 */
function IzlogMojiZadaci({
  initial,
  initialFilters,
  initialGroupBy,
}: {
  initial: MyTasksSource;
  initialFilters: TaskFilters;
  initialGroupBy: TaskGroupBy;
}) {
  const [source, setSource] = useState(initial);
  const [filters, setFilters] = useState(initialFilters);
  const [groupBy, setGroupBy] = useState(initialGroupBy);
  const [panel, setPanel] = useState<{ kind: IzlogPanelKind; title: string; key: string; origin: HTMLElement | null; openedAt: number } | null>(null);
  // Podaci panela ostaju posle zatvaranja, da Drawer izađe istim putem.
  const [panelOpen, setPanelOpen] = useState(false);
  const counter = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { capture } = useFlip(listRef);
  const modelRef = useRef<MyTasksModel | null>(null);
  const flip = () => {
    if ((modelRef.current?.visibleCount ?? 0) <= TASKS_FLIP_MAX_ROWS) capture();
  };

  const setStatus = (row: TaskRowModel, done: boolean) =>
    setSource((current) =>
      row.kind === "task"
        ? { ...current, tasks: patchTaskItems({ items: current.tasks }, row.id, { taskStatus: done ? "done" : "next" }).items }
        : { ...current, personal: patchPersonalItems({ items: current.personal }, row.id, { status: done ? "done" : "open" }).items },
    );

  const completion = useCompletionQueue({
    listRef,
    locate: (key) => (modelRef.current ? locateTaskRow(modelRef.current, groupBy, key) : null),
    flipCapture: flip,
    commit: async (row, done) => setStatus(row, done),
  });

  const rows = useMemo(() => buildTaskRows(source), [source]);
  const model = useMemo(
    () =>
      buildMyTasks(rows, filters, groupBy, IZLOG_NOW, {
        startupOrder: STARTUP_ORDER,
        holds: completion.holds,
        pending: completion.pending,
      }),
    [rows, filters, groupBy, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    modelRef.current = model;
  });

  const patch = (row: TaskRowModel, change: { dueDate?: number | null; priority?: TaskPriorityKey | null }) =>
    setSource((current) =>
      row.kind === "task"
        ? {
            ...current,
            tasks: patchTaskItems({ items: current.tasks }, row.id, {
              ...(change.dueDate === undefined ? {} : { dueDate: change.dueDate }),
              ...(change.priority === undefined || change.priority === null ? {} : { taskPriority: change.priority }),
            }).items,
          }
        : { ...current, personal: patchPersonalItems({ items: current.personal }, row.id, change).items },
    );

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: (row) => {
      setSource((current) => ({
        ...current,
        entries: row.planned
          ? current.entries.filter((entry) => entry.refKey !== row.key)
          : [...current.entries, { _id: fakeId("myDayEntries", 900 + (counter.current += 1)), refKey: row.key }],
      }));
      toast.success(row.planned ? "Uklonjeno iz Moj dan." : "Dodato u Moj dan.");
    },
    onSetDue: (row, due) => {
      if (!row.permissions.due.allowed) return toast.error(row.permissions.due.reason ?? "");
      flip();
      patch(row, { dueDate: due });
      toast.success("Rok je promenjen.");
    },
    onSetPriority: (row, priority) => {
      if (!row.permissions.priority.allowed) return toast.error(row.permissions.priority.reason ?? "");
      flip();
      patch(row, { priority });
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
  };

  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => findRow(modelRef.current, key),
    actions,
    searchRef,
    enabled: !panelOpen,
  });

  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <MyTasksView
        now={IZLOG_NOW}
        state={{ status: "ready", model }}
        startups={IZLOG_TASK_STARTUPS}
        filters={filters}
        onFiltersChange={(next) => {
          if (next.query === filters.query) flip();
          setFilters(next);
        }}
        groupBy={groupBy}
        onGroupByChange={(next) => {
          flip();
          setGroupBy(next);
        }}
        actions={actions}
        onQuickAdd={noop}
        searchRef={searchRef}
        listRef={listRef}
        selectedKey={shortcuts.selectedKey}
        activeKey={panelOpen ? (panel?.key ?? null) : null}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        announcement={completion.announcement}
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

export default function MojiZadaciEkran({ varijanta }: IzlogEkranProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  if (varijanta === "ucitavanje") {
    return (
      <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
        <MyTasksView
          now={IZLOG_NOW}
          state={{ status: "loading" }}
          startups={IZLOG_TASK_STARTUPS}
          filters={EMPTY_TASK_FILTERS}
          onFiltersChange={noop}
          groupBy="startup"
          onGroupByChange={noop}
          onQuickAdd={noop}
          searchRef={searchRef}
        />
      </div>
    );
  }
  const initial = varijanta === "prazan" ? IZLOG_TASKS_EMPTY : IZLOG_TASKS_SOURCE;
  const initialFilters =
    varijanta === "filteri" ? IZLOG_FILTERS_TWO : varijanta === "bez-rezultata" ? IZLOG_FILTERS_NONE : EMPTY_TASK_FILTERS;
  return (
    <ShortcutProvider>
      <IzlogMojiZadaci
        key={varijanta}
        initial={initial}
        initialFilters={initialFilters}
        initialGroupBy={varijanta === "filteri" ? "due" : "startup"}
      />
    </ShortcutProvider>
  );
}
