import {
  buildPlanDay,
  completionCall,
  dueCall,
  formatDayHeading,
  moveInPlan,
  planCall,
  priorityCall,
  quickAddCall,
  quickAddSuccessMessage,
  isOptimisticId,
  OPTIMISTIC_PREFIX,
  patchItem,
  withEntry,
  withEntryOrder,
  withoutEntry,
  withoutHistory,
  type QuickAddDraft,
  type RowCall,
  type TaskPriorityKey,
  type TaskRowModel,
} from '@devotion/shared';
import type { OptimisticLocalStore } from 'convex/browser';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useRouter } from 'expo-router';
import { CalendarPlus, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, StyleSheet, View } from 'react-native';

import { FAB } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { UndoBar } from '@/components/undo-bar';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useRetained } from '@/hooks/use-retained';
import { useToday } from '@/hooks/use-today';
import { readMyDayGrouping, writeMyDayGrouping } from '@/lib/device-prefs';
import { announceWithUndoBar } from '@/lib/announce';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { openStartupEntity } from '@/lib/navigation/open-startup-entity';
import { readLastArea, readStoredDestination, rememberDestination } from '@/lib/quick-add-memory';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';

import { MeHeader } from '../me-header';
import { PlanDaySheet, type PlanDayState } from '../plan-day-sheet';
import { QuickAddSheet, type QuickAddStartupOption } from '../quick-add-sheet';
import { RokPlanSheet } from '../rok-plan-sheet';
import { RowActionsSheet, type RowActionsTarget } from '../row-actions-sheet';
import {
  applyHolds,
  buildMyDay,
  firstNameOf,
  INITIAL_COLLAPSED,
  listItems,
  locateRow,
  plannedOrder,
  sectionsFor,
  type MyDayGroupMode,
  type MyDayListItem,
} from './my-day-model';
import { MyDayView } from './my-day-view';
import { useCompletionQueue } from './use-completion-queue';

type Overview = FunctionReturnType<typeof api.myDay.overview>;
type OverviewEntry = Overview['entries'][number];
type PlanRef =
  | { kind: 'task'; taskPageId: Id<'pages'> }
  | { kind: 'personal'; personalTaskId: Id<'personalTasks'> };

/** Optimistička izmena svih `myDay.overview` pretplata (opciono samo za jedan dan). */
function updateOverviews(store: OptimisticLocalStore, dayKey: string | null, update: (value: Overview) => Overview) {
  for (const { args, value } of store.getAllQueries(api.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.myDay.overview, args, update(value));
  }
}

function optimisticEntry(dayKey: string, ref: PlanRef, createdAt: number): OverviewEntry {
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

function refOfKey(refKey: string): PlanRef {
  const separator = refKey.indexOf(':');
  const kind = refKey.slice(0, separator);
  const id = refKey.slice(separator + 1);
  return kind === 'task'
    ? { kind: 'task', taskPageId: id as Id<'pages'> }
    : { kind: 'personal', personalTaskId: id as Id<'personalTasks'> };
}

function failed(title: string, error: unknown, fallback: string) {
  haptics.error();
  Alert.alert(title, accessErrorMessage(error, fallback));
}

/**
 * Tab „Danas" = Moj dan (K12; O1, P5) — telefonski par web `MyDayContainer`
 * (K10): jedna pretplata `myDay.overview`, grupisanje iz shared paketa
 * (po vremenu ili po startupu, pamti se na uređaju), redovi sa swipe radnjama,
 * dugim pritiskom i kvačicom, „Isplaniraj dan" i brzi unos (FAB). Sve radnje
 * zovu ISTE mutacije kao web, kroz ista shared pravila (`completionCall`,
 * `dueCall`, `priorityCall`, `planCall`, `moveInPlan`, `quickAddCall`), sa
 * istom optimističkom slikom (`patchItem`, `withEntry`…). „Poništi" ide kroz
 * postojeću traku (`UndoBar`, 8 s).
 *
 * Greška `myDay.overview` (profil ne postoji, pad veze) ide u `ErrorBoundary`
 * rute (`(tabs)/danas.tsx`) sa „Pokušaj ponovo".
 */
export function MyDayScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const today = useToday();
  const { dayKey, doneSince, now } = today;
  const profile = useQuery(api.profiles.getCurrent, {});
  const liveOverview = useQuery(api.myDay.overview, { dayKey, doneSince });
  // Novi dan (ponoć, povratak u aplikaciju) menja argumente: dok stiže nov
  // odgovor, ostaje prethodni — lista ne trepne u skeleton.
  const overview = useRetained(liveOverview ?? null);

  // --- Mutacije (sa optimističkom slikom tamo gde se red pomera) ---
  const setPersonalStatus = useMutation(api.personalTasks.setStatus);
  const updatePersonal = useMutation(api.personalTasks.update).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: 'personal', id: args.personalTaskId }, { dueDate: args.dueDate, priority: args.priority }),
    ),
  );
  const updateTask = useMutation(api.tasks.updateMetadata).withOptimisticUpdate((store, args) => {
    if (args.dueDate === undefined && args.priority === undefined) return;
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: 'task', id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
    );
  });
  const planMutation = useMutation(api.myDay.plan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, args.ref, now))),
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
        (next, refKey) => withEntry(next, optimisticEntry(args.dayKey, refOfKey(refKey), now)),
        withoutHistory(value, new Set(args.refKeys)),
      ),
    ),
  );
  const clearOldMutation = useMutation(api.myDay.clearOld).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) =>
      withoutHistory(value, args.refKeys === undefined ? null : new Set(args.refKeys)),
    ),
  );
  const createPersonal = useMutation(api.personalTasks.create);
  const createPage = useMutation(api.pages.create);

  const send = (call: Exclude<RowCall, { fn: 'denied' }>): Promise<unknown> => {
    // Id-jevi su prošli kroz shared model kao stringovi; potiču iz `overview`.
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

  // --- Prikaz ---
  const [groupMode, setGroupMode] = useState<MyDayGroupMode>(readMyDayGrouping);
  const changeGroupMode = (mode: MyDayGroupMode) => {
    setGroupMode(mode);
    writeMyDayGrouping(mode);
  };
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(INITIAL_COLLAPSED);
  const toggleSection = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const baseModel = useMemo(() => (overview ? buildMyDay(overview, now) : null), [overview, now]);
  // Sekcije na ekranu (sa zadržanim redovima) — rukovaoci posle dodira čitaju najnovije.
  const sectionsRef = useRef<ReturnType<typeof sectionsFor>>([]);

  const completion = useCompletionQueue({
    locate: (key) => locateRow(sectionsRef.current, key),
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === 'denied' ? Promise.reject(new Error(call.reason)) : send(call);
    },
  });

  const sections = useMemo(
    () => (baseModel ? applyHolds(sectionsFor(baseModel, groupMode), completion.holds, completion.pending) : []),
    [baseModel, groupMode, completion.holds, completion.pending],
  );
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  const items = useMemo(() => listItems(sections, collapsed), [sections, collapsed]);

  // Najnoviji red po ključu (sheet-ovi uvek prikazuju sveže podatke).
  const rowByKey = useCallback(
    (key: string | null): { row: TaskRowModel; item: Extract<MyDayListItem, { type: 'row' }> | null } | null => {
      if (key === null || !baseModel) return null;
      for (const section of sections) {
        const row = section.rows.find((entry) => entry.key === key);
        if (row) {
          const item = items.find(
            (entry): entry is Extract<MyDayListItem, { type: 'row' }> => entry.type === 'row' && entry.row.key === key,
          );
          return { row, item: item ?? null };
        }
      }
      return null;
    },
    [baseModel, sections, items],
  );

  // --- Plan, rok, prioritet, redosled ---
  const togglePlan = (row: TaskRowModel) => {
    if (isOptimisticId(row.planEntryId)) return;
    const call = planCall(row);
    if (call.fn === 'myDay.unplan') {
      void unplanMutation({ entryId: call.entryId as Id<'myDayEntries'> })
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
    void send(call).catch((error: unknown) => failed('Prioritet nije sačuvan', error, 'Pokušaj ponovo.'));
  };

  const move = (row: TaskRowModel, direction: -1 | 1) => {
    if (!baseModel || row.planEntryId === null || isOptimisticId(row.planEntryId)) return;
    const order = plannedOrder(baseModel).filter((id) => !isOptimisticId(id));
    const next = moveInPlan(order, row.planEntryId, direction);
    if (!next) return;
    void reorderMutation({ dayKey, entryIds: next as Id<'myDayEntries'>[] }).catch((error: unknown) =>
      failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'),
    );
  };

  const openRow = (row: TaskRowModel) => {
    if (row.kind !== 'task' || row.startup === null) return;
    openStartupEntity(router, setActiveStartupId, {
      startupId: row.startup._id as Id<'startups'>,
      href: { pathname: '/zadatak/[id]', params: { id: row.id } },
      currentStartupId: activeStartupId,
    });
  };

  // --- Sheet-ovi: ključ reda, a red se čita svež iz modela ---
  const [rokKey, setRokKey] = useState<string | null>(null);
  const [actionsKey, setActionsKey] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const rokRow = rowByKey(rokKey)?.row ?? null;
  const actionsFound = rowByKey(actionsKey);
  const actionsTarget: RowActionsTarget | null = actionsFound
    ? { row: actionsFound.row, movable: actionsFound.item?.movable ?? null }
    : null;

  // --- Sažeti čipovi (plan K07 E11): deljene pretplate sa tab barom ---
  const inboxCounts = useQueryTolerant(api.inbox.unreadCounts, {});
  const chatUnread = useQueryTolerant(api.chat.unreadSummary, {});
  const pendingState = useQueryTolerant(api.inbox.pending, {});
  const openPending = () => {
    const first = pendingState?.items[0];
    if (!first) return;
    openStartupEntity(router, setActiveStartupId, {
      startupId: first.startup._id,
      href: '/odobrenja',
      currentStartupId: activeStartupId,
    });
  };

  // --- Isplaniraj dan ---
  const planModel = useMemo(() => (overview ? buildPlanDay(overview, now) : null), [overview, now]);
  const planState: PlanDayState = planModel ? { status: 'ready', model: planModel } : { status: 'loading' };

  // --- Brzi unos (E16): isti putevi kao web `QuickAddContainer` ---
  const { results: startupResults } = usePaginatedQuery(api.startups.listForCurrent, {}, { initialNumItems: 50 });
  const quickAddStartups = useMemo<QuickAddStartupOption[]>(
    () =>
      startupResults.map((startup) => ({
        _id: startup._id,
        name: startup.name,
        logoUrl: startup.logoUrl,
        areas: startup.areas.map((area) => ({ _id: area._id, label: area.label })),
      })),
    [startupResults],
  );
  const submitQuickAdd = async (draft: QuickAddDraft) => {
    if (!profile) throw new Error('Profil se još učitava. Pokušaj ponovo.');
    const call = quickAddCall(draft, { profileId: profile._id, dayKey });
    if (call.fn === 'invalid') throw new Error(call.reason ?? 'Unesi naslov zadatka.');
    const message = quickAddSuccessMessage(draft.destination, quickAddStartups);
    try {
      if (call.fn === 'personalTasks.create') {
        const personalTaskId = await createPersonal(call.args);
        rememberDestination(draft.destination);
        haptics.success();
        // Traka se pojavi dok je sheet brzog unosa još aktivan prozor — njen live
        // region tada možda ne progovori, pa se najavljuje izričito.
        AccessibilityInfo.announceForAccessibility(message);
        pushUndo({ label: message, action: { kind: 'personalTaskCreate', personalTaskId } });
        return;
      }
      // Id-jevi su prošli kroz shared nacrt kao stringovi; potiču iz `startups.listForCurrent`.
      const startupId = call.args.startupId as Id<'startups'>;
      const pageId = await createPage({
        ...call.args,
        startupId,
        areaId: call.args.areaId as Id<'startupAreas'>,
        assigneeProfileIds: [profile._id],
      });
      rememberDestination(draft.destination);
      if (call.planDayKey !== null) {
        try {
          await planMutation({ dayKey: call.planDayKey, ref: { kind: 'task', taskPageId: pageId } });
        } catch (error) {
          failed('Plan nije sačuvan', error, 'Zadatak je dodat, ali nije u Moj dan.');
        }
      }
      haptics.success();
      // Traka se pojavi dok je sheet brzog unosa još aktivan prozor — njen live
      // region tada možda ne progovori, pa se najavljuje izričito.
      AccessibilityInfo.announceForAccessibility(message);
      pushUndo({
        label: message,
        action: { kind: 'pageCreate', startupId, pageId },
        // „Otvori" kao na webu (toast). Promena aktivnog startupa ionako prazni
        // traku, pa `activeStartupId` ovde ne može biti zastareo dok se traka vidi.
        secondary: {
          label: 'Otvori',
          onPress: () =>
            openStartupEntity(router, setActiveStartupId, {
              startupId,
              href: { pathname: '/zadatak/[id]', params: { id: pageId } },
              currentStartupId: activeStartupId,
            }),
        },
      });
    } catch (error) {
      throw new Error(accessErrorMessage(error, 'Zadatak nije dodat. Pokušaj ponovo.'));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MeHeader
        title="Danas"
        subtitle={formatDayHeading(now)}
        actions={
          <IconButton
            accessibilityLabel="Isplaniraj dan"
            onPress={() => {
              haptics.tap();
              setPlanOpen(true);
            }}>
            <CalendarPlus size={22} color={colors.foreground} />
          </IconButton>
        }
      />
      <MyDayView
        state={baseModel ? { status: 'ready', model: baseModel, items, groupMode } : { status: 'loading' }}
        now={now}
        firstName={firstNameOf(profile?.displayName)}
        onGroupModeChange={changeGroupMode}
        onToggleSection={toggleSection}
        summary={{
          inbox: inboxCounts ? inboxCounts.total.count : null,
          chat: chatUnread ? chatUnread.total.unreadCount : null,
          pending: pendingState ? pendingState.items.length : null,
          onOpenInbox: () => router.navigate('/obavestenja'),
          onOpenChat: () => router.navigate('/chat'),
          onOpenPending: openPending,
        }}
        rowActions={{
          onToggleDone: completion.toggleDone,
          onOpen: openRow,
          onLongPress: (row) => setActionsKey(row.key),
          onSchedule: (row) => setRokKey(row.key),
          // Zaključana kvačica: razlog vidljivo, kao toast na webu (E15).
          onDenied: (row, reason) => Alert.alert(row.done ? 'Zadatak nije vraćen' : 'Zadatak nije završen', reason),
        }}
        onPlanDay={() => setPlanOpen(true)}
      />

      <FAB
        icon={Plus}
        accessibilityLabel="Brzi unos"
        onPress={() => {
          haptics.tap();
          setQuickAddOpen(true);
        }}
      />
      <UndoBar bottomOffset={72} />

      <RokPlanSheet
        row={rokRow}
        now={now}
        onClose={() => setRokKey(null)}
        onSetDue={(row, due) => {
          setRokKey(null);
          setDue(row, due);
        }}
        onTogglePlan={(row) => {
          haptics.select();
          setRokKey(null);
          togglePlan(row);
        }}
      />
      <RowActionsSheet
        target={actionsTarget}
        now={now}
        onClose={() => setActionsKey(null)}
        onOpen={(row) => {
          setActionsKey(null);
          openRow(row);
        }}
        onToggleDone={(row, done) => {
          setActionsKey(null);
          if (done) haptics.success();
          else haptics.select();
          completion.toggleDone(row, done);
        }}
        onTogglePlan={(row) => {
          haptics.select();
          setActionsKey(null);
          togglePlan(row);
        }}
        onSetDue={(row, due) => {
          setActionsKey(null);
          setDue(row, due);
        }}
        onSetPriority={(row, priority) => {
          setActionsKey(null);
          setPriority(row, priority);
        }}
        onMove={(row, direction) => {
          haptics.select();
          setActionsKey(null);
          move(row, direction);
        }}
      />
      <PlanDaySheet
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        now={now}
        state={planState}
        onAdd={(row) => {
          const call = planCall(row);
          if (call.fn !== 'myDay.plan') return;
          void send(call).catch((error: unknown) => failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'));
        }}
        onCarryOver={(refKeys) => {
          void carryOverMutation({ dayKey, refKeys }).catch((error: unknown) =>
            failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'),
          );
        }}
        onDismiss={(refKeys) => {
          void clearOldMutation({ dayKey, refKeys }).catch((error: unknown) =>
            failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'),
          );
        }}
      />
      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        now={now}
        startups={quickAddStartups}
        readStored={readStoredDestination}
        rememberedArea={readLastArea}
        onSubmit={submitQuickAdd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
