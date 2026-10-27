import {
  activeFilterCount,
  buildMyTasks,
  buildTaskRows,
  clearTaskFilters,
  completionCall,
  EMPTY_TASK_FILTERS,
  enterKey,
  hasActiveFilters,
  locateTaskRow,
  openTasksPhrase,
  PERSONAL_TASKS_LIMIT,
  TASK_GROUP_BY_OPTIONS,
  TASKS_EVERYWHERE_LIMIT,
  type MyTasksModel,
  type StartupMini,
  type TaskFilters,
  type TaskGroupBy,
  type TaskRowModel,
} from '@devotion/shared';
import { useQuery, usePaginatedQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { CheckSquare2, ListFilter, Plus, SearchX, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/chat/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { exitFade, listLayout, useListEntering } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { FAB } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonList, SkeletonTaskRow } from '@/components/ui/skeletons';
import { UndoBar } from '@/components/undo-bar';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useQueryState } from '@/hooks/use-query-state';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRetained } from '@/hooks/use-retained';
import { useToday } from '@/hooks/use-today';
import { haptics } from '@/lib/haptics';
import { openStartupEntity } from '@/lib/navigation/open-startup-entity';
import { readLastArea, readStoredDestination } from '@/lib/quick-add-memory';
import { DURATIONS } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';
import { space, text } from '@/theme/tokens';

import { useCompletionQueue } from '../my-day/use-completion-queue';
import { QuickAddSheet } from '../quick-add-sheet';
import { RokPlanSheet } from '../rok-plan-sheet';
import { RowActionsSheet } from '../row-actions-sheet';
import { MeSectionHeader } from '../section-header';
import { TaskPanelSheet, type TaskPanelRequest } from '../task-panel-sheet';
import { TaskRow } from '../task-row';
import { useQuickAdd } from '../use-quick-add';
import { useRowMutations } from '../use-row-mutations';
import { cappedNote, listItemsOf, moreStep, showMore, type MyTasksListItem } from './my-tasks-list';
import { filtersLabel, TaskFiltersSheet } from './task-filters-sheet';

/** Iznad ovoliko redova nema layout animacije, samo neprozirnost (plan K07 E12, telefon). */
const LAYOUT_ANIMATION_MAX_ROWS = 60;
/** Prostor ispod poslednjeg reda: FAB (56 + 16) i traka „Poništi" iznad njega. */
const LIST_BOTTOM_SPACE = 160;

/**
 * Moji zadaci (K13, plan K07 §1.3) — telefonski par web `MyTasksContainer`:
 * `tasks.listEverywhere` (do 200) + `personalTasks.list` (do 300) + plan za
 * danas iz deljene pretplate `myDay.overview`. Filteri (startup uključujući
 * „Lično", status, prioritet, rok), pretraga, grupisanje i „Prikaži završene"
 * su iz shared `task-filters.ts` / `my-tasks.ts`, pa su pravila ista kao na
 * webu. Radnje u redu su iste kao u Moj dan (swipe, dugi pritisak, kvačica) i
 * zovu iste mutacije kroz `useRowMutations`; dodir na red otvara panel zadatka.
 *
 * Greška upita je stanje ekrana („Pokušaj ponovo" ponovo montira ekran), ne
 * izuzetak: `ErrorBoundary` rute bi odbacio filtere i pretragu.
 */
export function MyTasksScreen() {
  const [attempt, setAttempt] = useState(0);
  return <MyTasksContent key={attempt} retry={() => setAttempt((value) => value + 1)} />;
}

function MyTasksContent({ retry }: { retry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const today = useToday();
  const { dayKey, doneSince, now } = today;
  const profile = useQuery(api.profiles.getCurrent, {});

  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [groupBy, setGroupBy] = useState<TaskGroupBy>('startup');
  const scope = filters.showDone ? 'all' : 'open';
  const tasksState = useQueryState(api.tasks.listEverywhere, { scope, limit: TASKS_EVERYWHERE_LIMIT });
  const personalState = useQueryState(api.personalTasks.list, { status: scope, limit: PERSONAL_TASKS_LIMIT });
  const overview = useQueryTolerant(api.myDay.overview, { dayKey, doneSince });
  const rowMutations = useRowMutations({ dayKey, now });
  const { togglePlan, setDue, setPriority, planMutation } = rowMutations;

  // Promena „Prikaži završene" menja argumente upita: dok stiže nov odgovor,
  // lista ostaje na poslednjim podacima (bez treptaja skeletona).
  const tasksData = useRetained(tasksState.status === 'ready' ? tasksState.data : null);
  const personalData = useRetained(personalState.status === 'ready' ? personalState.data : null);
  const entries = overview?.entries;
  const rows = useMemo(
    () =>
      tasksData && personalData
        ? buildTaskRows({ tasks: tasksData.items, personal: personalData.items, entries: entries ?? [], capped: false })
        : null,
    [tasksData, personalData, entries],
  );

  const { results: startupResults } = usePaginatedQuery(api.startups.listForCurrent, {}, { initialNumItems: 50 });
  const startupMinis = useMemo<StartupMini[]>(
    () => startupResults.map((startup) => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl })),
    [startupResults],
  );
  const startupOrder = useMemo(() => startupMinis.map((startup) => startup._id as string), [startupMinis]);

  // Model sa zadržanim redovima (E7): rukovaoci posle dodira čitaju najnoviji.
  const modelRef = useRef<MyTasksModel | null>(null);
  const completion = useCompletionQueue({
    locate: (key) => (modelRef.current ? locateTaskRow(modelRef.current, groupBy, key) : null),
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === 'denied' ? Promise.reject(new Error(call.reason)) : rowMutations.send(call);
    },
  });
  const capped = Boolean(tasksData?.capped || personalData?.capped);
  const model = useMemo(
    () =>
      rows
        ? buildMyTasks(rows, filters, groupBy, now, {
            startupOrder,
            capped,
            holds: completion.holds,
            pending: completion.pending,
          })
        : null,
    [rows, filters, groupBy, now, startupOrder, capped, completion.holds, completion.pending],
  );
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  // „Prikaži još N" po grupi; nov izbor filtera, pretrage ili grupisanja kreće od prve strane.
  const pagingKey = `${enterKey('', filters, groupBy)}|${filters.query}`;
  const [paging, setPaging] = useState<{ key: string; shown: Record<string, number> }>({ key: pagingKey, shown: {} });
  const shown = paging.key === pagingKey ? paging.shown : {};
  const items = useMemo(
    () => (model ? listItemsOf(model, groupBy, shown, startupMinis) : []),
    [model, groupBy, shown, startupMinis],
  );
  const rowByKey = useCallback(
    (key: string | null): TaskRowModel | null => {
      if (key === null || !model) return null;
      for (const group of model.groups) {
        const row = group.rows.find((entry) => entry.key === key);
        if (row) return row;
      }
      return null;
    },
    [model],
  );

  // --- Sheet-ovi ---
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rokKey, setRokKey] = useState<string | null>(null);
  const [actionsKey, setActionsKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<TaskPanelRequest | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAdd = useQuickAdd({ dayKey, profileId: profile?._id ?? null, planMutation });

  const openPanel = (row: TaskRowModel) => {
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

  const rokRow = rowByKey(rokKey);
  const actionsRow = rowByKey(actionsKey);

  const filterCount = activeFilterCount(filters);
  const loadError = tasksState.status === 'error' || personalState.status === 'error';
  const refreshControl = useListRefresh();
  const entering = useListEntering(reduced, enterKey('', filters, groupBy));
  const layoutPreset = useMemo(() => listLayout(reduced), [reduced]);
  const layout = (model?.visibleCount ?? 0) <= LAYOUT_ANIMATION_MAX_ROWS ? layoutPreset : undefined;

  const header = (
    <View style={styles.header}>
      {model ? (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Svi startupi i lično · {openTasksPhrase(model.openCount)}
        </Text>
      ) : null}
      <SearchField
        value={filters.query}
        onChange={(query) => setFilters((current) => ({ ...current, query }))}
        placeholder="Pretraži zadatke…"
      />
      <SegmentedControl options={GROUP_OPTIONS} value={groupBy} onChange={setGroupBy} />
    </View>
  );

  let body;
  if (loadError) {
    body = (
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Zadaci se ne mogu učitati"
        description="Proveri vezu i pokušaj ponovo."
        actionLabel="Pokušaj ponovo"
        onAction={retry}
      />
    );
  } else if (!model) {
    body = (
      <View
        style={styles.skeleton}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel="Učitavanje zadataka">
        <SkeletonList count={6} item={(index) => <SkeletonTaskRow index={index} />} />
      </View>
    );
  } else if (!model.hasAny) {
    body = (
      <EmptyState
        icon={<CheckSquare2 size={20} color={colors.mutedForeground} />}
        title="Nemaš otvorenih zadataka"
        description="Kad ti neko dodeli zadatak ili dodaš lični, biće ovde."
        actionLabel="Brzi unos"
        onAction={() => setQuickAddOpen(true)}
      />
    );
  } else if (model.visibleCount === 0) {
    body = (
      <>
        <EmptyState
          icon={<SearchX size={20} color={colors.mutedForeground} />}
          title="Nijedan zadatak ne odgovara filterima"
          description="Promeni ili očisti filtere."
          actionLabel={hasActiveFilters(filters) ? 'Očisti filtere' : undefined}
          onAction={hasActiveFilters(filters) ? () => setFilters(clearTaskFilters(filters)) : undefined}
        />
        {model.capped ? (
          <Text style={[styles.capped, { color: colors.mutedForeground }]}>{cappedNote(model.loadedCount)}</Text>
        ) : null}
      </>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Moji zadaci"
        onBack={() => router.back()}
        actions={
          <View>
            <IconButton
              accessibilityLabel={filtersLabel(filterCount)}
              onPress={() => {
                haptics.tap();
                setFiltersOpen(true);
              }}>
              <ListFilter size={22} color={filterCount > 0 ? colors.primaryText : colors.foreground} />
            </IconButton>
            {filterCount > 0 ? (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{filterCount}</Text>
              </View>
            ) : null}
          </View>
        }
      />

      <Animated.FlatList
        data={body ? [] : items}
        keyExtractor={(item: MyTasksListItem) => item.key}
        itemLayoutAnimation={layout}
        contentContainerStyle={[styles.listContent, { paddingBottom: LIST_BOTTOM_SPACE + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // iOS: lista se sama podigne iznad tastature dok se kuca u pretrazi.
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={header}
        ListEmptyComponent={body ?? null}
        ListFooterComponent={
          model?.capped && model.visibleCount > 0 ? (
            <Text style={[styles.capped, { color: colors.mutedForeground }]}>{cappedNote(model.loadedCount)}</Text>
          ) : null
        }
        initialNumToRender={16}
        renderItem={({ item, index }: { item: MyTasksListItem; index: number }) => {
          if (item.type === 'header') {
            return (
              <Animated.View entering={entering(index)} style={index === 0 ? undefined : styles.sectionGap}>
                <MeSectionHeader title={item.title} count={item.count} tone={item.tone} startup={item.startup} />
              </Animated.View>
            );
          }
          if (item.type === 'more') {
            return (
              <Button
                variant="ghost"
                label={`Prikaži još ${moreStep(item.remaining)}`}
                onPress={() => {
                  haptics.select();
                  setPaging({ key: pagingKey, shown: showMore(shown, item.groupKey) });
                }}
              />
            );
          }
          return (
            <Animated.View
              entering={entering(index)}
              exiting={(model?.visibleCount ?? 0) <= LAYOUT_ANIMATION_MAX_ROWS ? exitFade(reduced) : undefined}>
              <TaskRow
                row={item.row}
                now={now}
                onToggleDone={completion.toggleDone}
                onOpen={openPanel}
                onLongPress={(row) => setActionsKey(row.key)}
                onSchedule={(row) => setRokKey(row.key)}
                onDenied={(row, reason) =>
                  Alert.alert(row.done ? 'Zadatak nije vraćen' : 'Zadatak nije završen', reason)
                }
                // Po startupu čip nosi zaglavlje grupe.
                showStartup={groupBy !== 'startup'}
                showStatus={groupBy !== 'status'}
              />
            </Animated.View>
          );
        }}
      />

      <FAB
        icon={Plus}
        accessibilityLabel="Brzi unos"
        // Stack ekran bez tab bara: FAB ide iznad home indikatora / gesture trake.
        style={{ bottom: insets.bottom + 16 }}
        onPress={() => {
          haptics.tap();
          setQuickAddOpen(true);
        }}
      />
      <UndoBar bottomOffset={72} />

      <TaskFiltersSheet
        visible={filtersOpen}
        filters={filters}
        startups={startupMinis}
        resultCount={model?.visibleCount ?? 0}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
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
        target={actionsRow ? { row: actionsRow, movable: null } : null}
        now={now}
        onClose={() => setActionsKey(null)}
        onOpen={(row) => {
          setActionsKey(null);
          // Dva sestrinska `Modal`-a istovremeno iOS ne prikazuje: panel čeka kraj izlaza sheet-a radnji.
          setTimeout(() => openPanel(row), DURATIONS.quick + 60);
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
        onMove={() => setActionsKey(null)}
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

const GROUP_OPTIONS = TASK_GROUP_BY_OPTIONS.map((option) => ({ id: option.value, label: option.label }));

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  header: {
    gap: space[3],
    paddingBottom: space[2],
  },
  subtitle: {
    ...text.body,
  },
  skeleton: {
    paddingTop: space[2],
  },
  sectionGap: {
    marginTop: space[3],
  },
  capped: {
    ...text.body,
    paddingHorizontal: space[1],
    paddingTop: space[3],
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    minHeight: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
});

