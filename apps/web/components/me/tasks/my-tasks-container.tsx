"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import {
  completionCall,
  dueCall,
  EMPTY_TASK_FILTERS,
  planCall,
  priorityCall,
  type RowCall,
  type TaskFilters,
  type TaskGroupBy,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import { useFlip } from "@/lib/motion";
import { useTaskListShortcuts } from "@/lib/shortcuts/use-task-list-shortcuts";
import type { Today } from "@/lib/today";

import { isOptimisticId, OPTIMISTIC_PREFIX, patchItem, withEntry, withoutEntry } from "../my-day/my-day-model";
import { UNDO_MS, useCompletionQueue } from "../my-day/use-completion-queue";
import { useQueryState } from "../my-day/use-query-state";
import { panelRequestKey, TaskPanel, type TaskPanelProps, type TaskPanelRequest } from "../task-panel/task-panel";
import type { TaskRowActions } from "../task-row";
import {
  buildMyTasks,
  buildTaskRows,
  findRow,
  locateTaskRow,
  type MyTasksModel,
  patchPersonalItems,
  patchTaskItems,
  PERSONAL_TASKS_LIMIT,
  TASKS_EVERYWHERE_LIMIT,
  TASKS_FLIP_MAX_ROWS,
} from "./my-tasks-model";
import { MyTasksView, type MyTasksViewState } from "./my-tasks-view";

export type MyTasksContainerProps = {
  today: Today;
  profileId: Id<"profiles">;
  startups: TaskPanelProps["startups"];
  onQuickAdd: () => void;
  onOpenInStartup: (startupId: Id<"startups">, pageId: Id<"pages">) => void;
};

type Overview = FunctionReturnType<typeof api.myDay.overview>;
type OverviewEntry = Overview["entries"][number];
type PlanRef = { kind: "task"; taskPageId: Id<"pages"> } | { kind: "personal"; personalTaskId: Id<"personalTasks"> };

function updateOverviews(store: OptimisticLocalStore, dayKey: string | null, update: (value: Overview) => Overview) {
  for (const { args, value } of store.getAllQueries(api.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.myDay.overview, args, update(value));
  }
}

function optimisticEntry(dayKey: string, ref: PlanRef): OverviewEntry {
  const refKey = ref.kind === "task" ? `task:${ref.taskPageId}` : `personal:${ref.personalTaskId}`;
  return {
    _id: `${OPTIMISTIC_PREFIX}${refKey}` as Id<"myDayEntries">,
    dayKey,
    refKind: ref.kind,
    refKey,
    taskPageId: ref.kind === "task" ? ref.taskPageId : null,
    personalTaskId: ref.kind === "personal" ? ref.personalTaskId : null,
    position: 0,
    createdAt: Date.now(),
  };
}

/** Poslednja učitana vrednost (izvedeno stanje, bez efekta). */
function useLastReady<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

/**
 * Moji zadaci — kontejner (K11): `tasks.listEverywhere` (do 200) +
 * `personalTasks.list` (do 300) + plan za danas iz deljene pretplate
 * `myDay.overview`. Filter po startupu je na klijentu. Radnje u redu kao u
 * Moj dan (shared `task-row.ts` bira poziv), sa optimističkom slikom da red
 * odmah doputuje Flip-om; red otvara panel zadatka. „Pokušaj ponovo"
 * ponovo montira kontejner.
 */
export function MyTasksContainer(props: MyTasksContainerProps) {
  const [attempt, setAttempt] = useState(0);
  return <MyTasksContent key={attempt} {...props} retry={() => setAttempt((value) => value + 1)} />;
}

function MyTasksContent({ today, profileId, startups, onQuickAdd, onOpenInStartup, retry }: MyTasksContainerProps & { retry: () => void }) {
  const { dayKey, doneSince, now } = today;
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("startup");
  const scope = filters.showDone ? "all" : "open";
  const tasksState = useQueryState(api.tasks.listEverywhere, { scope, limit: TASKS_EVERYWHERE_LIMIT });
  const personalState = useQueryState(api.personalTasks.list, { status: scope, limit: PERSONAL_TASKS_LIMIT });
  const overviewState = useQueryState(api.myDay.overview, { dayKey, doneSince });

  // --- Mutacije sa optimističkom slikom (lista + Moj dan) ---
  const updateTask = useMutation(api.tasks.updateMetadata).withOptimisticUpdate((store, args) => {
    const patch = {
      ...(args.status === undefined ? {} : { taskStatus: args.status }),
      ...(args.priority === undefined ? {} : { taskPriority: args.priority }),
      ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
    };
    for (const { args: queryArgs, value } of store.getAllQueries(api.tasks.listEverywhere)) {
      if (value !== undefined) store.setQuery(api.tasks.listEverywhere, queryArgs, patchTaskItems(value, args.pageId, patch));
    }
    if (args.dueDate !== undefined || args.priority !== undefined) {
      updateOverviews(store, null, (value) =>
        patchItem(value, { kind: "task", id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
      );
    }
  });
  const updatePersonal = useMutation(api.personalTasks.update).withOptimisticUpdate((store, args) => {
    const patch = {
      ...(args.priority === undefined ? {} : { priority: args.priority }),
      ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
    };
    for (const { args: queryArgs, value } of store.getAllQueries(api.personalTasks.list)) {
      if (value !== undefined) store.setQuery(api.personalTasks.list, queryArgs, patchPersonalItems(value, args.personalTaskId, patch));
    }
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: "personal", id: args.personalTaskId }, { dueDate: args.dueDate, priority: args.priority }),
    );
  });
  const setPersonalStatus = useMutation(api.personalTasks.setStatus).withOptimisticUpdate((store, args) => {
    for (const { args: queryArgs, value } of store.getAllQueries(api.personalTasks.list)) {
      if (value !== undefined) {
        store.setQuery(api.personalTasks.list, queryArgs, patchPersonalItems(value, args.personalTaskId, { status: args.status }));
      }
    }
  });
  const planMutation = useMutation(api.myDay.plan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, args.ref))),
  );
  const unplanMutation = useMutation(api.myDay.unplan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) => withoutEntry(value, args.entryId)),
  );

  const send = useCallback(
    (call: Exclude<RowCall, { fn: "denied" }>): Promise<unknown> => {
      // Id-jevi su prošli kroz shared model kao stringovi; potiču iz upita.
      switch (call.fn) {
        case "personalTasks.setStatus":
          return setPersonalStatus({ personalTaskId: call.personalTaskId as Id<"personalTasks">, status: call.status });
        case "personalTasks.update":
          return updatePersonal({
            personalTaskId: call.personalTaskId as Id<"personalTasks">,
            ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
            ...(call.priority === undefined ? {} : { priority: call.priority }),
          });
        case "tasks.updateMetadata":
          return updateTask({
            pageId: call.pageId as Id<"pages">,
            ...(call.status === undefined ? {} : { status: call.status }),
            ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
            ...(call.priority === undefined ? {} : { priority: call.priority }),
          });
        case "myDay.plan":
          return planMutation({
            dayKey,
            ref:
              call.ref.kind === "task"
                ? { kind: "task", taskPageId: call.ref.taskPageId as Id<"pages"> }
                : { kind: "personal", personalTaskId: call.ref.personalTaskId as Id<"personalTasks"> },
          });
        case "myDay.unplan":
          return unplanMutation({ entryId: call.entryId as Id<"myDayEntries"> });
      }
    },
    [dayKey, planMutation, setPersonalStatus, unplanMutation, updatePersonal, updateTask],
  );

  // --- Model ---
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { capture } = useFlip(listRef);
  const modelRef = useRef<MyTasksModel | null>(null);
  const flipCapture = () => {
    if ((modelRef.current?.visibleCount ?? 0) <= TASKS_FLIP_MAX_ROWS) capture();
  };

  const completion = useCompletionQueue({
    listRef,
    locate: (key) => (modelRef.current ? locateTaskRow(modelRef.current, groupBy, key) : null),
    flipCapture,
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === "denied" ? Promise.reject(new Error(call.reason)) : send(call);
    },
  });

  // Promena „Prikaži završene" menja argumente upita: dok stiže nov odgovor,
  // lista ostaje na poslednjim podacima (bez treptaja skeletona).
  const tasksData = useLastReady(tasksState.status === "ready" ? tasksState.data : undefined);
  const personalData = useLastReady(personalState.status === "ready" ? personalState.data : undefined);
  // Odgovor upita zadržava istu referencu dok se ne promeni, pa memo važi.
  const overviewEntries = overviewState.status === "ready" ? overviewState.data.entries : null;
  const entries = useMemo(() => overviewEntries ?? [], [overviewEntries]);
  const rows = useMemo(
    () =>
      tasksData && personalData
        ? buildTaskRows({ tasks: tasksData.items, personal: personalData.items, entries, capped: false })
        : null,
    [tasksData, personalData, entries],
  );
  const startupMinis = useMemo(
    () => startups.map((startup) => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl })),
    [startups],
  );
  const startupOrder = useMemo(() => startups.map((startup) => startup._id as string), [startups]);
  const model = useMemo(
    () =>
      rows
        ? buildMyTasks(rows, filters, groupBy, now, {
            startupOrder,
            capped: Boolean(tasksData?.capped || personalData?.capped),
            holds: completion.holds,
            pending: completion.pending,
          })
        : null,
    [rows, filters, groupBy, now, startupOrder, tasksData?.capped, personalData?.capped, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    modelRef.current = model;
  });

  // --- Panel zadatka ---
  const [panel, setPanel] = useState<TaskPanelRequest | null>(null);
  const openPanel = (row: TaskRowModel) => {
    const origin =
      listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
    setPanel({
      target:
        row.kind === "task"
          ? { kind: "task", pageId: row.id as Id<"pages"> }
          : { kind: "personal", personalTaskId: row.id as Id<"personalTasks"> },
      title: row.title,
      origin,
      openedAt: performance.now(),
    });
  };

  // --- Radnje u redu ---
  const togglePlan = (row: TaskRowModel) => {
    if (isOptimisticId(row.planEntryId)) return;
    const call = planCall(row);
    if (call.fn === "myDay.unplan") {
      void unplanMutation({ entryId: call.entryId as Id<"myDayEntries"> })
        .then((removed) =>
          toast("Uklonjeno iz Moj dan.", {
            duration: UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => {
                void planMutation({ dayKey: removed.dayKey, ref: removed.ref, position: removed.position }).catch(
                  (error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
                );
              },
            },
          }),
        )
        .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
      return;
    }
    if (call.fn !== "myDay.plan") return;
    void send(call)
      .then(() => toast.success("Dodato u Moj dan."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
  };

  const setDue = (row: TaskRowModel, due: number | null) => {
    const call = dueCall(row, due);
    if (call.fn === "denied") {
      toast.error(call.reason);
      return;
    }
    if (row.dueDate === due) return;
    flipCapture();
    void send(call)
      .then(() => toast.success("Rok je promenjen."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Rok nije sačuvan.")));
  };

  const setPriority = (row: TaskRowModel, priority: TaskPriorityKey | null) => {
    const call = priorityCall(row, priority);
    if (call.fn === "denied") {
      toast.error(call.reason);
      return;
    }
    if (row.priority === priority) return;
    flipCapture();
    void send(call).catch((error: unknown) => toast.error(accessErrorMessage(error, "Prioritet nije sačuvan.")));
  };

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: togglePlan,
    onSetDue: setDue,
    onSetPriority: setPriority,
    onOpen: openPanel,
  };

  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => findRow(modelRef.current, key),
    actions,
    searchRef,
    enabled: panel === null,
  });

  const changeFilters = (next: TaskFilters) => {
    // Kucanje u pretrazi menja listu bez animacije (plan K07 §4.2).
    if (next.query === filters.query) flipCapture();
    setFilters(next);
  };
  const changeGroupBy = (next: TaskGroupBy) => {
    flipCapture();
    setGroupBy(next);
  };

  const state: MyTasksViewState =
    tasksState.status === "error" || personalState.status === "error"
      ? { status: "error", retry }
      : model
        ? { status: "ready", model }
        : { status: "loading" };

  return (
    <>
      <MyTasksView
        now={now}
        state={state}
        startups={startupMinis}
        filters={filters}
        onFiltersChange={changeFilters}
        groupBy={groupBy}
        onGroupByChange={changeGroupBy}
        actions={actions}
        onQuickAdd={onQuickAdd}
        searchRef={searchRef}
        listRef={listRef}
        selectedKey={shortcuts.selectedKey}
        activeKey={panelRequestKey(panel)}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        announcement={completion.announcement}
      />
      <TaskPanel
        request={panel}
        onClose={() => setPanel(null)}
        today={today}
        profileId={profileId}
        startups={startups}
        onOpenInStartup={onOpenInStartup}
      />
    </>
  );
}
