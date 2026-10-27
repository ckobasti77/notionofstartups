import {
  buildPlanDay,
  completionCall,
  formatDayHeading,
  moveInPlan,
  pendingIdeaVotes,
  planCall,
  isOptimisticId,
  withEntry,
  withEntryOrder,
  withoutHistory,
  type TaskRowModel,
} from '@devotion/shared';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { CalendarPlus, CheckSquare2, NotebookPen, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

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
import { haptics } from '@/lib/haptics';
import { openStartupEntity } from '@/lib/navigation/open-startup-entity';
import { readLastArea, readStoredDestination } from '@/lib/quick-add-memory';
import { duration } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';

import { MeHeader } from '../me-header';
import { PlanDaySheet, type PlanDayState } from '../plan-day-sheet';
import { QuickAddSheet } from '../quick-add-sheet';
import { RokPlanSheet } from '../rok-plan-sheet';
import { RowActionsSheet, type RowActionsTarget } from '../row-actions-sheet';
import { TaskPanelSheet, type TaskPanelRequest } from '../task-panel-sheet';
import { useQuickAdd } from '../use-quick-add';
import { failed, optimisticEntry, refOfKey, updateOverviews, useRowMutations } from '../use-row-mutations';
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

/** „Čeka tebe" donosi ideje na glasanje samo uz `include` (plan K07 R4). */
const PENDING_ARGS = { include: ['idea_vote' as const] };

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
  const { send, planMutation, unplanMutation, togglePlan, setDue, setPriority } = useRowMutations({ dayKey, now });
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
  const move = (row: TaskRowModel, direction: -1 | 1) => {
    if (!baseModel || row.planEntryId === null || isOptimisticId(row.planEntryId)) return;
    const order = plannedOrder(baseModel).filter((id) => !isOptimisticId(id));
    const next = moveInPlan(order, row.planEntryId, direction);
    if (!next) return;
    void reorderMutation({ dayKey, entryIds: next as Id<'myDayEntries'>[] }).catch((error: unknown) =>
      failed('Plan nije sačuvan', error, 'Pokušaj ponovo.'),
    );
  };

  // Panel zadatka (K13): isti za startup i lični zadatak, kao na webu.
  const [panel, setPanel] = useState<TaskPanelRequest | null>(null);
  const openRow = (row: TaskRowModel) => {
    setPanel({
      target:
        row.kind === 'task'
          ? { kind: 'task', pageId: row.id as Id<'pages'> }
          : { kind: 'personal', personalTaskId: row.id as Id<'personalTasks'> },
      title: row.title,
    });
  };
  const openInStartup = (startupId: Id<'startups'>, pageId: Id<'pages'>) =>
    openStartupEntity(router, setActiveStartupId, {
      startupId,
      href: { pathname: '/zadatak/[id]', params: { id: pageId } },
      currentStartupId: activeStartupId,
    });

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
  // „Čeka tebe" su ideje na glasanje, samo uz `include` (K01 D16); stare vrste ne postoje (P22).
  const pendingState = useQueryTolerant(api.inbox.pending, PENDING_ARGS);
  const pendingIdeas = useMemo(
    () => (pendingState ? pendingIdeaVotes(pendingState.items) : null),
    [pendingState],
  );
  // Čip vodi kao Inbox: prva ideja otvara svoj ekran (prebacuje aktivni startup ako treba),
  // a bez ijedne ideje otvara Inbox (K07 R18).
  const openPending = () => {
    const first = pendingIdeas?.[0];
    if (!first) {
      router.navigate('/obavestenja');
      return;
    }
    openStartupEntity(router, setActiveStartupId, {
      startupId: first.startup._id,
      href: { pathname: '/ideja/[id]', params: { id: first.ideaId } },
      currentStartupId: activeStartupId,
    });
  };

  // --- Isplaniraj dan ---
  const planModel = useMemo(() => (overview ? buildPlanDay(overview, now) : null), [overview, now]);
  const planState: PlanDayState = planModel ? { status: 'ready', model: planModel } : { status: 'loading' };

  // --- Brzi unos (E16): isti putevi kao web `QuickAddContainer` ---
  const quickAdd = useQuickAdd({ dayKey, profileId: profile?._id ?? null, planMutation });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MeHeader
        title="Danas"
        subtitle={formatDayHeading(now)}
        actions={
          <>
            <IconButton
              accessibilityLabel="Moji zadaci"
              onPress={() => {
                haptics.tap();
                router.push('/moji-zadaci');
              }}>
              <CheckSquare2 size={22} color={colors.foreground} />
            </IconButton>
            {/* Beleške (PROSTOR P18): stalni ulaz umesto stavke „Misli" u Više;
                ruta zadržava ime zbog deep linkova (ekran Beleški, K18). */}
            <IconButton
              accessibilityLabel="Beleške"
              onPress={() => {
                haptics.tap();
                router.push('/misli');
              }}>
              <NotebookPen size={22} color={colors.foreground} />
            </IconButton>
            <IconButton
              accessibilityLabel="Isplaniraj dan"
              onPress={() => {
                haptics.tap();
                setPlanOpen(true);
              }}>
              <CalendarPlus size={22} color={colors.foreground} />
            </IconButton>
          </>
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
          pending: pendingIdeas ? pendingIdeas.length : null,
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
        onOpenMyTasks={() => router.push('/moji-zadaci')}
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
          // Dva sestrinska `Modal`-a istovremeno iOS ne prikazuje: panel čeka kraj izlaza sheet-a radnji.
          setTimeout(() => openRow(row), duration.exit + 60);
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
      <TaskPanelSheet request={panel} onClose={() => setPanel(null)} onOpenInStartup={openInStartup} />
      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        now={now}
        startups={quickAdd.startups}
        readStored={readStoredDestination}
        rememberedArea={readLastArea}
        onSubmit={quickAdd.submit}
        onSubmitNote={quickAdd.submitNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
