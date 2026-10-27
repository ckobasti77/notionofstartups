import { findStartupRow, locateStartupRow, STARTUP_TASK_STATUSES, type StartupMini, type StartupTaskStatus } from '@devotion/shared';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { ListTodo } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import {
  ALL_TASKS_LIST,
  buildFlatSection,
  buildStatusSections,
  sectionRowCount,
  type StatusSection,
} from '@/components/komandni-centar/startup-task-model';
import { useStartupTaskCommands } from '@/components/komandni-centar/use-startup-task-commands';
import { LAYOUT_ANIMATION_MAX_ROWS } from '@/components/me/my-day/my-day-model';
import { MeSectionHeader } from '@/components/me/section-header';
import { TaskRow } from '@/components/me/task-row';
import { exitFade, listLayout, useListEntering } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { OptionChip } from '@/components/ui/option-chip';
import { SkeletonList, SkeletonTaskRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRetained } from '@/hooks/use-retained';
import { TASK_STATUS_META } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Ogledalo `taskAssignees.ts › MAX_ASSIGNEE_LOOKUP_PAGES` — `listForTasks` baca iznad
 * ovog broja id-jeva (isti razlog i ista degradacija kao u ekranu Zadaci).
 */
const MAX_ASSIGNEE_LOOKUP = 300;
const PAGE_SIZE = 50;

type StatusFilter = 'all' | StartupTaskStatus;

/** Stavka spljoštene liste: zaglavlje statusa ili red zadatka. */
type ListItem =
  | { kind: 'header'; key: string; section: StatusSection }
  | { kind: 'row'; key: string; row: StatusSection['rows'][number] };

/**
 * Kartica Zadaci ekrana oblasti (plan K07 §5.5, K14): zadaci oblasti kao isti red
 * zadatka kao u „Svi zadaci" (`TaskRow` + `useStartupTaskCommands`: kvačica sa
 * „Poništi", rok i plan, radnje, panel). Čipovi statusa su server filter
 * (`tasks.listForArea › status`). Kraća strana nije kraj liste (R6): dok je filtrirana
 * lista prazna a ima još strana, učitava se dalje.
 */
export function AreaTasks({
  startupId,
  areaId,
  onCreate,
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  onCreate: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const profile = useQuery(api.profiles.getCurrent, {});
  const myId = profile?._id ?? null;
  const startup = useQuery(api.startups.get, { startupId });

  const {
    results,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.tasks.listForArea,
    { startupId, areaId, ...(statusFilter === 'all' ? {} : { status: statusFilter }) },
    { initialNumItems: PAGE_SIZE },
  );

  // R6: server filtrira posle čitanja strane, pa filtrirana strana ume da bude prazna
  // iako ima još — to nije kraj liste.
  useEffect(() => {
    if (pageStatus === 'CanLoadMore' && results.length === 0) loadMore(PAGE_SIZE);
  }, [pageStatus, results.length, loadMore]);

  const taskIds = useMemo(
    () => results.slice(0, MAX_ASSIGNEE_LOOKUP).map((task) => task._id),
    [results],
  );
  const liveAssigneeRows = useQuery(
    api.taskAssignees.listForTasks,
    taskIds.length > 0 ? { startupId, taskPageIds: taskIds } : 'skip',
  );
  // Nova strana menja argumente pa upit nakratko vraća `undefined`: poslednji odgovor
  // se zadržava (kvačice ne trepnu u zaključano).
  const assigneeRows = useRetained(liveAssigneeRows ?? null) ?? undefined;
  const assigneeIdsByTask = useMemo<ReadonlyMap<string, ReadonlyArray<string>> | null>(() => {
    if (taskIds.length > 0 && assigneeRows === undefined) return null;
    return new Map((assigneeRows ?? []).map((row) => [row.taskPageId, row.assignees.map((a) => a.profileId)]));
  }, [taskIds, assigneeRows]);

  const areaLabels = useMemo(() => {
    const map = new Map<string, string>();
    startup?.areas.forEach((area) => map.set(area._id, area.label));
    return map;
  }, [startup]);
  const startupMini = useMemo<StartupMini | null>(
    () => (startup ? { _id: startup._id, name: startup.name, logoUrl: startup.logoUrl ?? null } : null),
    [startup],
  );

  const sectionsRef = useRef<StatusSection[]>([]);
  const commands = useStartupTaskCommands({
    locate: (key) => locateStartupRow(ALL_TASKS_LIST, sectionsRef.current, key),
  });

  const sections = useMemo<StatusSection[] | undefined>(() => {
    if (!startupMini || !myId) return undefined;
    const context = {
      profileId: myId,
      startup: startupMini,
      areaLabels,
      assigneeIdsByTask,
      plannedKeys: commands.plannedKeys,
      holds: commands.holds,
      pending: commands.pending,
    };
    return statusFilter === 'all'
      ? buildStatusSections(results, context)
      : buildFlatSection(results, context, statusFilter);
  }, [
    startupMini,
    myId,
    areaLabels,
    assigneeIdsByTask,
    statusFilter,
    results,
    commands.plannedKeys,
    commands.holds,
    commands.pending,
  ]);
  useEffect(() => {
    sectionsRef.current = sections ?? [];
  }, [sections]);

  const refreshControl = useListRefresh();
  const rowCount = sections ? sectionRowCount(sections) : 0;
  // Granica E12: iznad nje nema layout ni izlazne animacije.
  const layout = rowCount <= LAYOUT_ANIMATION_MAX_ROWS ? listLayout(reduced) : undefined;
  const exiting = rowCount <= LAYOUT_ANIMATION_MAX_ROWS ? exitFade(reduced) : undefined;

  const loading = pageStatus === 'LoadingFirstPage' || sections === undefined;
  // Prazna strana uz „ima još" je učitavanje, ne „nema zadataka".
  const loadingMore =
    (pageStatus === 'CanLoadMore' || pageStatus === 'LoadingMore') && results.length === 0;
  const entering = useListEntering(
    reduced,
    `${areaId}:${statusFilter}:${loading ? 'ucitavanje' : 'spremno'}`,
  );

  const listItems = useMemo<ListItem[]>(() => {
    if (!sections) return [];
    if (statusFilter !== 'all') {
      return sections.flatMap((section) => section.rows).map((row) => ({ kind: 'row', key: row.key, row }));
    }
    return sections.flatMap((section): ListItem[] =>
      section.rows.length === 0
        ? []
        : [
            { kind: 'header', key: `sekcija:${section.id}`, section },
            ...section.rows.map((row): ListItem => ({ kind: 'row', key: row.key, row })),
          ],
    );
  }, [sections, statusFilter]);

  const renderItem = (item: ListItem, index: number) =>
    item.kind === 'header' ? (
      <Animated.View
        entering={entering(index)}
        exiting={exiting}
        style={index === 0 ? styles.sectionHeaderFirst : styles.sectionHeader}>
        <MeSectionHeader title={TASK_STATUS_META[item.section.id].label} count={item.section.rows.length} />
      </Animated.View>
    ) : (
      <Animated.View entering={entering(index)} exiting={exiting}>
        {/* Startup i oblast su isti za ceo ekran (zaglavlje ih nosi), pa bez čipa. */}
        <TaskRow row={item.row} now={commands.now} showStartup={false} {...commands.rowActions} />
      </Animated.View>
    );

  const empty = sections !== undefined && rowCount === 0 && !loadingMore;

  return (
    <View style={styles.container}>
      {/* Čipovi statusa su van liste — filter ne odskroluje sa njom. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}>
        <OptionChip label="Svi" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
        {STARTUP_TASK_STATUSES.map((status) => (
          <OptionChip
            key={status}
            label={TASK_STATUS_META[status].label}
            active={statusFilter === status}
            onPress={() => setStatusFilter(statusFilter === status ? 'all' : status)}
          />
        ))}
      </ScrollView>

      <LoadingSwap loading={loading || loadingMore} skeleton={<TasksSkeleton />}>
        {loading || sections === undefined ? null : empty ? (
          statusFilter === 'all' ? (
            <EmptyState
              icon={<ListTodo size={20} color={colors.mutedForeground} />}
              title="Oblast nema zadataka."
              actionLabel="Novi zadatak"
              onAction={onCreate}
            />
          ) : (
            <EmptyState
              icon={<ListTodo size={20} color={colors.mutedForeground} />}
              title="Nema rezultata za ovaj filter."
              actionLabel="Prikaži sve"
              onAction={() => setStatusFilter('all')}
            />
          )
        ) : (
          <Animated.FlatList
            data={listItems}
            keyExtractor={(item) => item.key}
            renderItem={({ item, index }) => renderItem(item, index)}
            itemLayoutAnimation={layout}
            initialNumToRender={16}
            contentContainerStyle={[styles.flatContent, { paddingBottom: insets.bottom + 160 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
            ListFooterComponent={
              pageStatus === 'CanLoadMore' ? (
                <Button
                  label="Učitaj još"
                  variant="ghost"
                  onPress={() => loadMore(PAGE_SIZE)}
                  style={styles.loadMore}
                />
              ) : pageStatus === 'LoadingMore' ? (
                <ActivityIndicator color={colors.primary} style={styles.loadMore} />
              ) : null
            }
          />
        )}
      </LoadingSwap>

      {commands.renderSheets((key) => findStartupRow(sections ?? [], key))}
    </View>
  );
}

/** Oblik onoga što stiže: 5 redova zadatka. */
function TasksSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje zadataka">
      <SkeletonList count={5} item={(index) => <SkeletonTaskRow index={index} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skeleton: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 20,
  },
  flatContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // Isti ritam kao u Zadacima: 20 između sekcija, 4 do redova.
  sectionHeaderFirst: {
    marginBottom: 4,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 4,
  },
  loadMore: {
    marginTop: 24,
    alignSelf: 'center',
  },
});
