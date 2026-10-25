import {
  dueCall,
  isOptimisticId,
  OPTIMISTIC_PREFIX,
  patchItem,
  patchPersonalItems,
  patchStartupTasks,
  patchTaskItems,
  planCall,
  priorityCall,
  withEntry,
  withoutEntry,
  type RowCall,
  type StartupTaskPatch,
  type TaskPriorityKey,
  type TaskRowModel,
} from '@devotion/shared';
import type { OptimisticLocalStore } from 'convex/browser';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Alert, AccessibilityInfo } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { announceWithUndoBar } from '@/lib/announce';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';

export type Overview = FunctionReturnType<typeof api.myDay.overview>;
type OverviewEntry = Overview['entries'][number];

/** Šta plan dana pokazuje: startup zadatak ili lični zadatak. */
export type PlanRef =
  | { kind: 'task'; taskPageId: Id<'pages'> }
  | { kind: 'personal'; personalTaskId: Id<'personalTasks'> };

/** Optimistička izmena svih `myDay.overview` pretplata (opciono samo za jedan dan). */
export function updateOverviews(
  store: OptimisticLocalStore,
  dayKey: string | null,
  update: (value: Overview) => Overview,
) {
  for (const { args, value } of store.getAllQueries(api.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.myDay.overview, args, update(value));
  }
}

/**
 * Optimistička slika za liste zadataka u startupu (K18, par web
 * `patchStartupLists`): Komandni centar (`tasks.commandCenter`) i svaka strana
 * `tasks.listForStartup`, pa red odmah ode u novu zonu ili grupu.
 */
function patchStartupLists(store: OptimisticLocalStore, pageId: Id<'pages'>, patch: StartupTaskPatch) {
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

export function optimisticEntry(dayKey: string, ref: PlanRef, createdAt: number): OverviewEntry {
  const refKey = ref.kind === 'task' ? `task:${ref.taskPageId}` : `personal:${ref.personalTaskId}`;
  return {
    // Privremeni id: zamenjuje ga pravi čim server odgovori (nikad ne ide na server).
    _id: `${OPTIMISTIC_PREFIX}${refKey}` as Id<'myDayEntries'>,
    dayKey,
    refKind: ref.kind,
    refKey,
    taskPageId: ref.kind === 'task' ? ref.taskPageId : null,
    personalTaskId: ref.kind === 'personal' ? ref.personalTaskId : null,
    position: 0,
    createdAt,
  };
}

export function refOfKey(refKey: string): PlanRef {
  const separator = refKey.indexOf(':');
  const kind = refKey.slice(0, separator);
  const id = refKey.slice(separator + 1);
  return kind === 'task'
    ? { kind: 'task', taskPageId: id as Id<'pages'> }
    : { kind: 'personal', personalTaskId: id as Id<'personalTasks'> };
}

/** Neuspela radnja: haptika `error` + poruka servera (par web toasta `toast.error`). */
export function failed(title: string, error: unknown, fallback: string) {
  haptics.error();
  Alert.alert(title, accessErrorMessage(error, fallback));
}

/**
 * Mutacije zajedničke za Moj dan, Moje zadatke i panel zadatka — par web
 * `MyDayContainer` / `MyTasksContainer`. Isti pozivi (`completionCall`,
 * `dueCall`, `priorityCall`, `planCall` iz shared `task-row.ts`) i ista
 * optimistička slika: izmena roka, prioriteta i statusa odmah menja i plan
 * dana (`myDay.overview`) i liste Mojih zadataka (`tasks.listEverywhere`,
 * `personalTasks.list`), pa red doputuje na novo mesto bez čekanja servera.
 * Poruke grešaka su `Alert` + haptika (telefon nema toast, par web
 * `toast.error`); potvrde bez „Poništi" su najava čitaču ekrana.
 */
export function useRowMutations({ dayKey, now }: { dayKey: string; now: number }) {
  const setPersonalStatus = useMutation(api.personalTasks.setStatus).withOptimisticUpdate((store, args) => {
    for (const { args: queryArgs, value } of store.getAllQueries(api.personalTasks.list)) {
      if (value !== undefined) {
        store.setQuery(
          api.personalTasks.list,
          queryArgs,
          patchPersonalItems(value, args.personalTaskId, { status: args.status }),
        );
      }
    }
  });
  const updatePersonal = useMutation(api.personalTasks.update).withOptimisticUpdate((store, args) => {
    const patch = {
      ...(args.priority === undefined ? {} : { priority: args.priority }),
      ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
    };
    for (const { args: queryArgs, value } of store.getAllQueries(api.personalTasks.list)) {
      if (value !== undefined) {
        store.setQuery(api.personalTasks.list, queryArgs, patchPersonalItems(value, args.personalTaskId, patch));
      }
    }
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: 'personal', id: args.personalTaskId }, { dueDate: args.dueDate, priority: args.priority }),
    );
  });
  const updateTask = useMutation(api.tasks.updateMetadata).withOptimisticUpdate((store, args) => {
    const patch = {
      ...(args.status === undefined ? {} : { taskStatus: args.status }),
      ...(args.priority === undefined ? {} : { taskPriority: args.priority }),
      ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
    };
    for (const { args: queryArgs, value } of store.getAllQueries(api.tasks.listEverywhere)) {
      if (value !== undefined) {
        store.setQuery(api.tasks.listEverywhere, queryArgs, patchTaskItems(value, args.pageId, patch));
      }
    }
    patchStartupLists(store, args.pageId, patch);
    if (args.dueDate !== undefined || args.priority !== undefined) {
      updateOverviews(store, null, (value) =>
        patchItem(value, { kind: 'task', id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
      );
    }
  });
  const planMutation = useMutation(api.myDay.plan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, args.ref, now))),
  );
  const unplanMutation = useMutation(api.myDay.unplan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) => withoutEntry(value, args.entryId)),
  );

  const send = (call: Exclude<RowCall, { fn: 'denied' }>): Promise<unknown> => {
    // Id-jevi su prošli kroz shared model kao stringovi; potiču iz upita.
    switch (call.fn) {
      case 'personalTasks.setStatus':
        return setPersonalStatus({ personalTaskId: call.personalTaskId as Id<'personalTasks'>, status: call.status });
      case 'personalTasks.update':
        return updatePersonal({
          personalTaskId: call.personalTaskId as Id<'personalTasks'>,
          ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
          ...(call.priority === undefined ? {} : { priority: call.priority }),
        });
      case 'tasks.updateMetadata':
        return updateTask({
          pageId: call.pageId as Id<'pages'>,
          ...(call.status === undefined ? {} : { status: call.status }),
          ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
          ...(call.priority === undefined ? {} : { priority: call.priority }),
        });
      case 'myDay.plan':
        return planMutation({
          dayKey,
          ref:
            call.ref.kind === 'task'
              ? { kind: 'task', taskPageId: call.ref.taskPageId as Id<'pages'> }
              : { kind: 'personal', personalTaskId: call.ref.personalTaskId as Id<'personalTasks'> },
        });
      case 'myDay.unplan':
        return unplanMutation({ entryId: call.entryId as Id<'myDayEntries'> });
    }
  };

  /** Dodaj u / ukloni iz Moj dan po referenci (panel nema `TaskRowModel`). */
  const togglePlanOf = (ref: PlanRef, entryId: string | null) => {
    if (isOptimisticId(entryId)) return;
    if (entryId !== null) {
      void unplanMutation({ entryId: entryId as Id<'myDayEntries'> })
        .then((removed) => {
          announceWithUndoBar('Uklonjeno iz Moj dan.');
          pushUndo({
            label: 'Uklonjeno iz Moj dan.',
            action: { kind: 'myDayUnplan', dayKey: removed.dayKey, ref: removed.ref, position: removed.position },
          });
        })
        .catch((error: unknown) => failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'));
      return;
    }
    void planMutation({ dayKey, ref })
      .then(() => AccessibilityInfo.announceForAccessibility('Dodato u Moj dan.'))
      .catch((error: unknown) => failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'));
  };

  const togglePlan = (row: TaskRowModel) => {
    const call = planCall(row);
    if (call.fn === 'myDay.unplan') {
      togglePlanOf(
        row.kind === 'task'
          ? { kind: 'task', taskPageId: row.id as Id<'pages'> }
          : { kind: 'personal', personalTaskId: row.id as Id<'personalTasks'> },
        call.entryId,
      );
      return;
    }
    if (call.fn !== 'myDay.plan') return;
    void send(call)
      .then(() => AccessibilityInfo.announceForAccessibility('Dodato u Moj dan.'))
      .catch((error: unknown) => failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'));
  };

  const setDue = (row: TaskRowModel, due: number | null) => {
    const call = dueCall(row, due);
    if (call.fn === 'denied') {
      haptics.warning();
      Alert.alert('Rok nije promenjen', call.reason);
      return;
    }
    if (row.dueDate === due) return;
    void send(call)
      .then(() => AccessibilityInfo.announceForAccessibility('Rok je promenjen.'))
      .catch((error: unknown) => failed('Rok nije sačuvan', error, 'Pokušaj ponovo.'));
  };

  const setPriority = (row: TaskRowModel, priority: TaskPriorityKey | null) => {
    const call = priorityCall(row, priority);
    if (call.fn === 'denied') {
      haptics.warning();
      Alert.alert('Prioritet nije promenjen', call.reason);
      return;
    }
    if (row.priority === priority) return;
    void send(call)
      .then(() => AccessibilityInfo.announceForAccessibility('Prioritet je promenjen.'))
      .catch((error: unknown) => failed('Prioritet nije sačuvan', error, 'Pokušaj ponovo.'));
  };

  return { send, planMutation, unplanMutation, togglePlanOf, togglePlan, setDue, setPriority };
}
