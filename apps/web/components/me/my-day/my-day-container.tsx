"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import {
  completionCall,
  dueCall,
  moveInPlan,
  planCall,
  priorityCall,
  type RowCall,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import { useFlip } from "@/lib/motion";
import { useTaskListShortcuts } from "@/lib/shortcuts/use-task-list-shortcuts";
import type { Today } from "@/lib/today";

import { PlanDayDialog, type PlanDayState } from "../plan-day/plan-day-dialog";
import { panelRequestKey, TaskPanel, type TaskPanelProps, type TaskPanelRequest } from "../task-panel/task-panel";
import { buildPlanDay } from "../plan-day/plan-day-model";
import type { TaskRowActions } from "../task-row";
import {
  applyHolds,
  buildMyDay,
  FLIP_MAX_ROWS,
  GROUP_MODE_STORAGE_KEY,
  isOptimisticId,
  locateRow,
  type MyDayGroupMode,
  type MyDayModel,
  OPTIMISTIC_PREFIX,
  parseGroupMode,
  patchItem,
  plannedOrder,
  withEntry,
  withEntryOrder,
  withoutEntry,
  withoutHistory,
} from "./my-day-model";
import { MyDayView } from "./my-day-view";
import { chatSummary, pendingSummary, type SideBlock } from "./side-model";
import { useArrival } from "./use-arrival";
import { UNDO_MS, useCompletionQueue } from "./use-completion-queue";
import { useQueryState, type QueryState } from "./use-query-state";

export type MyDayContainerProps = {
  today: Today;
  firstName: string | null;
  profileId: Id<"profiles">;
  /** Startupi sa oblastima (ljuska) — panel zadatka: mini podaci i „Prebaci u startup". */
  startups: TaskPanelProps["startups"];
  /** „Otvori u startupu" iz panela: postojeći detalj stranice u njenom startupu. */
  onOpenTask: (startupId: Id<"startups">, pageId: Id<"pages">) => void;
  onOpenTasks: () => void;
  onQuickAdd: () => void;
  onOpenInbox: () => void;
  onOpenChat: () => void;
  onOpenApprovals: (startupId: Id<"startups">) => void;
};

type Overview = FunctionReturnType<typeof api.myDay.overview>;
type OverviewEntry = Overview["entries"][number];

/** Optimistička izmena svih `myDay.overview` pretplata (opciono samo za jedan dan). */
function updateOverviews(store: OptimisticLocalStore, dayKey: string | null, update: (value: Overview) => Overview) {
  for (const { args, value } of store.getAllQueries(api.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.myDay.overview, args, update(value));
  }
}

function optimisticEntry(
  dayKey: string,
  ref: { kind: "task"; taskPageId: Id<"pages"> } | { kind: "personal"; personalTaskId: Id<"personalTasks"> },
): OverviewEntry {
  const refKey = ref.kind === "task" ? `task:${ref.taskPageId}` : `personal:${ref.personalTaskId}`;
  return {
    // Privremeni id: zamenjuje ga pravi čim server odgovori (nikad ne ide na server).
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

function refOfKey(refKey: string) {
  const [kind, id] = [refKey.slice(0, refKey.indexOf(":")), refKey.slice(refKey.indexOf(":") + 1)];
  return kind === "task"
    ? { kind: "task" as const, taskPageId: id as Id<"pages"> }
    : { kind: "personal" as const, personalTaskId: id as Id<"personalTasks"> };
}

function sideBlock<T, R>(state: QueryState<T>, map: (data: T) => R): SideBlock<R> {
  if (state.status === "loading") return { status: "loading" };
  if (state.status === "error") return { status: "hidden" };
  return { status: "ready", data: map(state.data) };
}

function readGroupMode(): MyDayGroupMode {
  try {
    return parseGroupMode(typeof window === "undefined" ? null : window.localStorage.getItem(GROUP_MODE_STORAGE_KEY));
  } catch {
    return "time";
  }
}

/**
 * Moj dan — kontejner (K10): jedna pretplata `myDay.overview` (deljena sa
 * ljuskom), grupisanje iz `@devotion/shared`, radnje u redu (završi sa
 * „Poništi", Moj dan, rok, prioritet, redosled), „Isplaniraj dan" i desna
 * kolona. Greška glavnog upita je stanje prikaza (`MyDayError`); „Pokušaj
 * ponovo" ponovo montira kontejner (nova pretplata). Greške rendera i dalje
 * hvata `WorkspaceErrorBoundary` u ljusci.
 */
export function MyDayContainer(props: MyDayContainerProps) {
  const [attempt, setAttempt] = useState(0);
  return <MyDayContent key={attempt} {...props} retry={() => setAttempt((value) => value + 1)} />;
}

function MyDayContent({
  today,
  firstName,
  profileId,
  startups: shellStartups,
  onOpenTask,
  onOpenTasks,
  onQuickAdd,
  onOpenInbox,
  onOpenChat,
  onOpenApprovals,
  retry,
}: MyDayContainerProps & { retry: () => void }) {
  const { dayKey, doneSince, now } = today;
  const overviewState = useQueryState(api.myDay.overview, { dayKey, doneSince });
  const overview = overviewState.status === "ready" ? overviewState.data : undefined;

  // --- Mutacije (sa optimističkom slikom tamo gde se red pomera) ---
  const setPersonalStatus = useMutation(api.personalTasks.setStatus);
  const updatePersonal = useMutation(api.personalTasks.update).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: "personal", id: args.personalTaskId }, { dueDate: args.dueDate, priority: args.priority }),
    ),
  );
  const updateTask = useMutation(api.tasks.updateMetadata).withOptimisticUpdate((store, args) => {
    if (args.dueDate === undefined && args.priority === undefined) return;
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: "task", id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
    );
  });
  const planMutation = useMutation(api.myDay.plan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, args.ref))),
  );
  const unplanMutation = useMutation(api.myDay.unplan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) => withoutEntry(value, args.entryId)),
  );
  const reorderMutation = useMutation(api.myDay.reorder).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntryOrder(value, args.entryIds)),
  );
  const carryOverMutation = useMutation(api.myDay.carryOver).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) =>
      args.refKeys.reduce(
        (next, refKey) => withEntry(next, optimisticEntry(args.dayKey, refOfKey(refKey))),
        withoutHistory(value, new Set(args.refKeys)),
      ),
    ),
  );
  const clearOldMutation = useMutation(api.myDay.clearOld).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) =>
      withoutHistory(value, args.refKeys === undefined ? null : new Set(args.refKeys)),
    ),
  );

  const send = useCallback(
    (call: Exclude<RowCall, { fn: "denied" }>): Promise<unknown> => {
      // Id-jevi su prošli kroz shared model kao stringovi; potiču iz `overview`.
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

  // --- Prikaz ---
  const [groupMode, setGroupMode] = useState<MyDayGroupMode>(readGroupMode);
  const changeGroupMode = (mode: MyDayGroupMode) => {
    setGroupMode(mode);
    try {
      window.localStorage.setItem(GROUP_MODE_STORAGE_KEY, mode);
    } catch {
      // Pamćenje je pogodnost.
    }
  };

  const [planOpen, setPlanOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { capture } = useFlip(listRef);
  // Model na ekranu (sa zadržanim redovima), za rukovaoce posle commit-a.
  const modelRef = useRef<MyDayModel | null>(null);
  const flipCapture = () => {
    if ((modelRef.current?.rowCount ?? 0) <= FLIP_MAX_ROWS) capture();
  };

  // --- Završi / vrati (E7) ---
  const completion = useCompletionQueue({
    listRef,
    locate: (key) => (modelRef.current ? locateRow(modelRef.current, groupMode, key) : null),
    flipCapture,
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === "denied" ? Promise.reject(new Error(call.reason)) : send(call);
    },
  });

  const baseModel = useMemo(() => (overview ? buildMyDay(overview, now) : null), [overview, now]);
  const model = useMemo(
    () => (baseModel ? applyHolds(baseModel, completion.holds, completion.pending) : null),
    [baseModel, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    modelRef.current = model;
  });

  const visibleKeys = useMemo(() => {
    if (!model) return null;
    return groupMode === "time"
      ? model.sections.flatMap((section) => section.rows.map((row) => row.key))
      : [...model.byStartup.groups.flatMap((group) => group.rows.map((row) => row.key)), ...model.byStartup.doneToday.map((row) => row.key)];
  }, [model, groupMode]);
  useArrival(listRef, visibleKeys, { maxRows: FLIP_MAX_ROWS });

  // --- Plan, rok, prioritet, redosled ---
  const togglePlan = (row: TaskRowModel) => {
    if (isOptimisticId(row.planEntryId)) return;
    const call = planCall(row);
    flipCapture();
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

  const move = (row: TaskRowModel, direction: -1 | 1) => {
    const current = modelRef.current;
    if (!current || row.planEntryId === null || isOptimisticId(row.planEntryId)) return;
    const order = plannedOrder(current).filter((id) => !isOptimisticId(id));
    const next = moveInPlan(order, row.planEntryId, direction);
    if (!next) return;
    flipCapture();
    void reorderMutation({ dayKey, entryIds: next as Id<"myDayEntries">[] }).catch((error: unknown) =>
      toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
    );
  };

  // --- Panel zadatka (K11): isti panel kao u Mojim zadacima ---
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

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: togglePlan,
    onSetDue: setDue,
    onSetPriority: setPriority,
    onOpen: openPanel,
    onMove: move,
  };

  // --- Prečice liste (E20): isti red, iste radnje kao u Mojim zadacima ---
  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => {
      const current = modelRef.current;
      if (!current) return undefined;
      const all = [
        ...current.sections.flatMap((section) => section.rows),
        ...current.byStartup.groups.flatMap((group) => group.rows),
        ...current.byStartup.doneToday,
      ];
      return all.find((row) => row.key === key);
    },
    actions,
    reorder: true,
    enabled: panel === null && !planOpen,
  });

  // --- Desna kolona ---
  const inboxCounts = useQueryState(api.inbox.unreadCounts, {});
  const inboxFeed = useQueryState(api.inbox.feed, { unreadOnly: true, paginationOpts: { numItems: 3, cursor: null } });
  const chatUnread = useQueryState(api.chat.unreadSummary, {});
  const pendingState = useQueryState(api.inbox.pending, {});
  const startups = overview?.startups ?? [];
  const inboxBlock: SideBlock<{
    unread: number;
    capped: boolean;
    items: Array<{ id: string; title: string; startup: { _id: string; name: string; logoUrl: string | null } | null; createdAt: number }>;
  }> =
    inboxCounts.status === "error" || inboxFeed.status === "error"
      ? { status: "hidden" }
      : inboxCounts.status === "loading" || inboxFeed.status === "loading"
        ? { status: "loading" }
        : {
            status: "ready",
            data: {
              unread: inboxCounts.data.total.count,
              capped: inboxCounts.data.total.capped,
              items: inboxFeed.data.page.map((item) => ({
                id: item._id,
                title: item.title,
                startup: item.startup,
                createdAt: item.createdAt,
              })),
            },
          };

  // --- Isplaniraj dan ---
  // Model plana postoji čim postoji `overview`: dijalog tokom izlaza ne trepne skeletonom.
  const planModel = useMemo(() => (overview ? buildPlanDay(overview, now) : null), [overview, now]);
  const planState: PlanDayState =
    overviewState.status === "error"
      ? { status: "error", retry }
      : planModel
        ? { status: "ready", model: planModel }
        : { status: "loading" };

  return (
    <>
      <MyDayView
        now={now}
        firstName={firstName}
        state={
          overviewState.status === "error"
            ? { status: "error", retry }
            : model
              ? { status: "ready", model }
              : { status: "loading" }
        }
        groupMode={groupMode}
        onGroupModeChange={changeGroupMode}
        side={{
          inbox: inboxBlock,
          chat: sideBlock(chatUnread, (data) => chatSummary(data, startups)),
          pending: sideBlock(pendingState, pendingSummary),
          onOpenInbox,
          onOpenChat,
          onOpenPending: (startupId) => onOpenApprovals(startupId as Id<"startups">),
        }}
        actions={actions}
        canOpen={() => true}
        selectedKey={shortcuts.selectedKey}
        activeKey={panelRequestKey(panel)}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        onQuickAdd={onQuickAdd}
        onPlanDay={() => setPlanOpen(true)}
        onOpenTasks={onOpenTasks}
        onOpenApprovals={() => {
          const first = pendingState.status === "ready" ? pendingState.data.items[0] : undefined;
          if (first) onOpenApprovals(first.startup._id);
        }}
        listRef={listRef}
        announcement={completion.announcement}
      />
      <PlanDayDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        now={now}
        state={planState}
        onAdd={(row) => {
          const call = planCall(row);
          if (call.fn !== "myDay.plan") return;
          void send(call).catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
        }}
        onCarryOver={(refKeys) => {
          void carryOverMutation({ dayKey, refKeys }).catch((error: unknown) =>
            toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
          );
        }}
        onDismiss={(refKeys) => {
          void clearOldMutation({ dayKey, refKeys }).catch((error: unknown) =>
            toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
          );
        }}
      />
      <TaskPanel
        request={panel}
        onClose={() => setPanel(null)}
        today={today}
        profileId={profileId}
        startups={shellStartups}
        onOpenInStartup={onOpenTask}
      />
    </>
  );
}
