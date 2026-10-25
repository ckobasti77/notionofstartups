"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import {
  completionCall,
  dueCall,
  isOptimisticId,
  OPTIMISTIC_PREFIX,
  patchItem,
  patchStartupTasks,
  planCall,
  plannedKeysOf,
  priorityCall,
  withEntry,
  withoutEntry,
  type RowCall,
  type StartupTaskPatch,
  type StartupTaskStatus,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

import { UNDO_MS, useCompletionQueue, type RowLocation } from "@/components/me/my-day/use-completion-queue";
import { useQueryState } from "@/components/me/my-day/use-query-state";
import { panelRequestKey, TaskPanel, type TaskPanelProps, type TaskPanelRequest } from "@/components/me/task-panel/task-panel";
import type { TaskRowActions } from "@/components/me/task-row";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import { useTaskListShortcuts } from "@/lib/shortcuts/use-task-list-shortcuts";
import type { Today } from "@/lib/today";

import { useMoveFocus } from "./use-move-focus";

type Overview = FunctionReturnType<typeof api.myDay.overview>;
type OverviewEntry = Overview["entries"][number];

function updateOverviews(store: OptimisticLocalStore, dayKey: string | null, update: (value: Overview) => Overview) {
  for (const { args, value } of store.getAllQueries(api.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.myDay.overview, args, update(value));
  }
}

function optimisticEntry(dayKey: string, taskPageId: Id<"pages">): OverviewEntry {
  const refKey = `task:${taskPageId}`;
  return {
    _id: `${OPTIMISTIC_PREFIX}${refKey}` as Id<"myDayEntries">,
    dayKey,
    refKind: "task",
    refKey,
    taskPageId,
    personalTaskId: null,
    position: 0,
    createdAt: Date.now(),
  };
}

/**
 * Optimistička slika za liste u startupu: Komandni centar (`tasks.commandCenter`)
 * i Moji zadaci / tabla (`tasks.listForStartup`, svaka strana posebno), pa red
 * odmah doputuje Flip-om u novu zonu ili kolonu.
 */
function patchStartupLists(store: OptimisticLocalStore, pageId: Id<"pages">, patch: StartupTaskPatch) {
  for (const { args, value } of store.getAllQueries(api.tasks.commandCenter)) {
    if (value === undefined) continue;
    const tasks = patchStartupTasks(value.tasks, pageId, patch);
    if (tasks !== value.tasks) store.setQuery(api.tasks.commandCenter, args, { ...value, tasks: [...tasks] });
  }
  for (const { args, value } of store.getAllQueries(api.tasks.listForStartup)) {
    if (value === undefined) continue;
    const page = patchStartupTasks(value.page, pageId, patch);
    if (page !== value.page) store.setQuery(api.tasks.listForStartup, args, { ...value, page: [...page] });
  }
}

export type StartupTaskCommands = {
  actions: TaskRowActions;
  /** Plan za danas (refKey → id stavke) iz deljene pretplate `myDay.overview`. */
  plannedKeys: ReadonlyMap<string, string>;
  holds: ReturnType<typeof useCompletionQueue>["holds"];
  pending: ReturnType<typeof useCompletionQueue>["pending"];
  announcement: string;
  selectedKey: string | null;
  request: RowRequest | null;
  onListFocus: ReturnType<typeof useTaskListShortcuts>["onListFocus"];
  /** Ključ reda čiji je panel otvoren (red ostaje istaknut, trenutak 3). */
  activeKey: string | null;
  /** Panel zadatka (Drawer) — kontejner ga renderuje pored liste. */
  panel: ReactNode;
};

/**
 * Radnje u listama zadataka u startupu (K17, plan K07 §2): završi sa
 * zadržavanjem reda i „Poništi" (E7), rok kroz birač, prioritet, status,
 * „Dodaj u Moj dan", „Priključi se", panel zadatka umesto teškog dijaloga
 * (sa „Puni prikaz") i iste prečice kao u Mojim zadacima (E20). Mutacije su
 * iste kao na ličnom nivou (`tasks.updateMetadata`, `myDay.plan/unplan`,
 * `taskAssignees.join`) — pravila servera se ne menjaju.
 */
export function useStartupTaskCommands({
  today,
  profileId,
  startups,
  listRef,
  locate,
  getRow,
  flipCapture,
  onOpenInStartup,
  onOpenFull,
}: {
  today: Today;
  profileId: Id<"profiles">;
  startups: TaskPanelProps["startups"];
  listRef: RefObject<HTMLElement | null>;
  /** Gde je red na ekranu (sa zadržanim redovima) — čita najnoviji model. */
  locate: (key: string) => RowLocation | null;
  getRow: (key: string) => TaskRowModel | undefined;
  /** Snimak za Flip pre promene (kontejner zna granicu E12). */
  flipCapture: () => void;
  onOpenInStartup: (startupId: Id<"startups">, pageId: Id<"pages">) => void;
  /** „Puni prikaz" iz panela: puna stranica zadatka. */
  onOpenFull: (pageId: Id<"pages">) => void;
}): StartupTaskCommands {
  const { dayKey, doneSince } = today;
  const overview = useQueryState(api.myDay.overview, { dayKey, doneSince });
  const entries = overview.status === "ready" ? overview.data.entries : null;
  const plannedKeys = useMemo(() => plannedKeysOf(entries ?? []), [entries]);

  const updateTask = useMutation(api.tasks.updateMetadata).withOptimisticUpdate((store, args) => {
    patchStartupLists(store, args.pageId, {
      ...(args.status === undefined ? {} : { taskStatus: args.status }),
      ...(args.priority === undefined ? {} : { taskPriority: args.priority }),
      ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
    });
    if (args.dueDate !== undefined || args.priority !== undefined) {
      updateOverviews(store, null, (value) =>
        patchItem(value, { kind: "task", id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
      );
    }
  });
  const join = useMutation(api.taskAssignees.join);
  const planMutation = useMutation(api.myDay.plan).withOptimisticUpdate((store, args) => {
    if (args.ref.kind !== "task") return;
    const taskPageId = args.ref.taskPageId;
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, taskPageId)));
  });
  const unplanMutation = useMutation(api.myDay.unplan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) => withoutEntry(value, args.entryId)),
  );

  const send = useCallback(
    (call: Exclude<RowCall, { fn: "denied" }>): Promise<unknown> => {
      // Id-jevi su prošli kroz shared model kao stringovi; potiču iz upita.
      switch (call.fn) {
        case "tasks.updateMetadata":
          return updateTask({
            pageId: call.pageId as Id<"pages">,
            ...(call.status === undefined ? {} : { status: call.status }),
            ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
            ...(call.priority === undefined ? {} : { priority: call.priority }),
          });
        case "myDay.plan":
          return call.ref.kind === "task"
            ? planMutation({ dayKey, ref: { kind: "task", taskPageId: call.ref.taskPageId as Id<"pages"> } })
            : Promise.reject(new Error("Lični zadatak nije u startupu."));
        case "myDay.unplan":
          return unplanMutation({ entryId: call.entryId as Id<"myDayEntries"> });
        default:
          // Lični zadaci ne postoje u listama startupa.
          return Promise.reject(new Error("Radnja nije dostupna u startupu."));
      }
    },
    [dayKey, planMutation, unplanMutation, updateTask],
  );

  const completion = useCompletionQueue({
    listRef,
    locate,
    flipCapture,
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === "denied" ? Promise.reject(new Error(call.reason)) : send(call);
    },
  });

  // Fokus i najava posle pomeranja reda (rok, prioritet, status).
  const { announcement, moved } = useMoveFocus(listRef, completion.announcement);

  // --- Panel zadatka ---
  const [panel, setPanel] = useState<TaskPanelRequest | null>(null);
  const openPanel = (row: TaskRowModel) => {
    const origin =
      listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
    setPanel({
      target: { kind: "task", pageId: row.id as Id<"pages"> },
      title: row.title,
      origin,
      openedAt: performance.now(),
    });
  };
  // „Puni prikaz" i „Otvori" iz toasta mogu stići kasnije: uvek najnoviji rukovalac.
  const openFullRef = useRef(onOpenFull);
  useLayoutEffect(() => {
    openFullRef.current = onOpenFull;
  });

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
    moved(row, "Rok je promenjen");
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
    moved(row, "Prioritet je promenjen");
    void send(call).catch((error: unknown) => toast.error(accessErrorMessage(error, "Prioritet nije sačuvan.")));
  };

  const setStatus = (row: TaskRowModel, status: StartupTaskStatus) => {
    if (row.status === status) return;
    // Završavanje ide kroz isti tok kao kvačica (zadržavanje + „Poništi");
    // vraćanje završenog ide na IZABRANI status (ne na zapamćeni prethodni).
    if (status === "done") {
      completion.toggleDone(row, true);
      return;
    }
    if (!row.permissions.status.allowed) {
      toast.error(row.permissions.status.reason ?? "Status menja kreator zadatka ili osoba kojoj je dodeljen.");
      return;
    }
    flipCapture();
    moved(row, "Status je promenjen");
    void updateTask({ pageId: row.id as Id<"pages">, status }).catch((error: unknown) =>
      toast.error(accessErrorMessage(error, "Status nije sačuvan.")),
    );
  };

  const joinTask = (row: TaskRowModel) => {
    void join({ taskPageId: row.id as Id<"pages"> })
      .then(() => toast.success("Priključio/la si se zadatku."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Priključivanje nije uspelo.")));
  };

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: togglePlan,
    onSetDue: setDue,
    onSetPriority: setPriority,
    onOpen: openPanel,
    onSetStatus: setStatus,
    onJoin: joinTask,
  };

  const shortcuts = useTaskListShortcuts({ listRef, getRow, actions, enabled: panel === null });

  return {
    actions,
    plannedKeys,
    holds: completion.holds,
    pending: completion.pending,
    announcement,
    selectedKey: shortcuts.selectedKey,
    request: shortcuts.request,
    onListFocus: shortcuts.onListFocus,
    activeKey: panelRequestKey(panel),
    panel: (
      <TaskPanel
        request={panel}
        onClose={() => setPanel(null)}
        today={today}
        profileId={profileId}
        startups={startups}
        onOpenInStartup={onOpenInStartup}
        onOpenFull={(pageId) => openFullRef.current(pageId)}
      />
    ),
  };
}
