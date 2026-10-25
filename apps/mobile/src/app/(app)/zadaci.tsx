import { findStartupRow, locateStartupRow, type StartupMini, type TaskRowModel } from '@devotion/shared';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ListTodo, Plus, SlidersHorizontal, TriangleAlert } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { QuickAddSheet } from '@/components/me/quick-add-sheet';
import { MeSectionHeader } from '@/components/me/section-header';
import { TaskRow } from '@/components/me/task-row';
import { useQuickAdd } from '@/components/me/use-quick-add';
import { exitFade, listLayout } from '@/components/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FAB } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SkeletonList, SkeletonTaskCard } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { UndoBar } from '@/components/undo-bar';
import {
  TasksFilterSheet,
  type AssigneeFilter,
  type DueFilter,
  type PriorityFilter,
  type StatusFilter,
} from '@/components/zadaci/tasks-filter-sheet';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRetained } from '@/hooks/use-retained';
import { classifyDeadline } from '@/lib/deadline';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { readLastArea, readStoredDestination } from '@/lib/quick-add-memory';
import { TASK_STATUS_META, tasksWord } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

/**
 * Ogledalo `packages/backend/convex/taskAssignees.ts`'s `MAX_ASSIGNEE_LOOKUP_PAGES` —
 * `listForTasks` BACA iznad ovog broja id-jeva. Bez ove granice, dovoljno „Učitaj još"
 * (server strana `MAX_TASK_PAGE_SIZE` je 100 po stranici) srušilo bi CEO ekran u
 * `ErrorBoundary`. Iznad granice zadaci jednostavno ostaju bez prikazanih izvršilaca
 * (pa ne-kreator na njima nema radnje statusa dok se ne otvori panel) — degradacija,
 * ne pad.
 */
const MAX_ASSIGNEE_LOOKUP = 300;

/**
 * Ekran „Svi zadaci" (PARITET A3) — pregled CELOG startupa, ne samo mog dana kao
 * Komandni centar. Od K18 (par web K17 „Moji zadaci u startupu") redovi su isti
 * zajednički red zadatka kao u Komandnom centru i u Moj dan, a radnje dolaze iz
 * istog hooka (`useStartupTaskCommands`): swipe desno završi sa „Poništi", swipe
 * levo „Rok i plan", dugi pritisak radnje, dodir panel sa „Puni prikaz".
 *
 * Dozvole su iste kao na webu (`tasks.updateMetadata`): kreator menja sve,
 * izvršilac status, ostali vide zaključane radnje sa razlogom. Do K18 je ovaj
 * ekran pisao kroz `areasV2.updatePage` (samo kreator) — to je bila razlika od
 * weba, sada ukinuta.
 */
export default function ZadaciScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const profile = useQuery(api.profiles.getCurrent, {});
  const myId = profile?._id ?? null;
  const startup = useQuery(
    api.startups.get,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const members = useQuery(
    api.startups.listMembers,
    activeStartupId ? { startupId: activeStartupId, limit: 50 } : 'skip',
  );

  // Status + izvršilac idu server-side (`tasks.listForStartup` ih podržava direktno).
  // „Nedodeljeno" NIJE `assigneeProfileId` (taj argument znači „ima ovog izvršioca") —
  // filtrira se klijentski, ispod. `dueStart`/`dueEnd` se namerno NIKAD ne šalju: server
  // odbija kombinaciju roka sa statusom/izvršiocem (`tasks.ts:77-81`), pa rok ostaje
  // isključivo klijentski filter.
  const {
    results,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.tasks.listForStartup,
    activeStartupId
      ? {
          startupId: activeStartupId,
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          ...(assigneeFilter !== 'all' && assigneeFilter !== 'unassigned'
            ? { assigneeProfileId: assigneeFilter }
            : {}),
        }
      : 'skip',
    { initialNumItems: 50 },
  );

  const taskIds = useMemo(
    () => results.slice(0, MAX_ASSIGNEE_LOOKUP).map((task) => task._id),
    [results],
  );
  const liveAssigneeRows = useQuery(
    api.taskAssignees.listForTasks,
    activeStartupId && taskIds.length > 0
      ? { startupId: activeStartupId, taskPageIds: taskIds }
      : 'skip',
  );
  // Nova strana ili promena liste menja argumente pa upit nakratko vraća `undefined`:
  // zadržavamo poslednji odgovor (kvačice ne trepnu u zaključano, bez skeletona).
  const assigneeRows = useRetained(liveAssigneeRows ?? null) ?? undefined;
  const assigneesByTask = useMemo(() => {
    const map = new Map<Id<'pages'>, NonNullable<typeof assigneeRows>[number]['assignees']>();
    assigneeRows?.forEach((row) => map.set(row.taskPageId, row.assignees));
    return map;
  }, [assigneeRows]);
  // Dok se izvršioci ne učitaju, ne-kreator nije izvršilac (server je izvor istine).
  const assigneeIdsByTask = useMemo<ReadonlyMap<string, ReadonlyArray<string>> | null>(() => {
    if (taskIds.length > 0 && assigneeRows === undefined) return null;
    return new Map([...assigneesByTask].map(([id, list]) => [id, list.map((a) => a.profileId)]));
  }, [taskIds, assigneeRows, assigneesByTask]);

  const areaLabels = useMemo(() => {
    const map = new Map<string, string>();
    startup?.areas.forEach((area) => map.set(area._id, area.label));
    return map;
  }, [startup]);
  const startupMini = useMemo<StartupMini | null>(
    () => (startup ? { _id: startup._id, name: startup.name, logoUrl: startup.logoUrl ?? null } : null),
    [startup],
  );

  // Filter „Nedodeljeno" zavisi od potpunih podataka o izvršiocima — dok oni stižu,
  // ekran ostaje u stanju učitavanja umesto da nakratko pokaže SVE kao nedodeljeno.
  const waitingForAssignees =
    assigneeFilter === 'unassigned' && taskIds.length > 0 && assigneeRows === undefined;

  // Sat je jedan za filter roka i redove (menja se u ponoć), pa se ne razilaze.
  const sectionsRef = useRef<StatusSection[]>([]);
  const commands = useStartupTaskCommands({
    locate: (key) => locateStartupRow(ALL_TASKS_LIST, sectionsRef.current, key),
  });
  const { now } = commands;

  const filteredResults = useMemo(() => {
    return results.filter((task) => {
      if (priorityFilter !== 'all' && (task.taskPriority ?? 'medium') !== priorityFilter) {
        return false;
      }
      // „Nedodeljeno": samo zadaci čiji izvršioci su poznati i prazni (iznad granice od 300 ne znamo).
      if (assigneeFilter === 'unassigned' && assigneesByTask.get(task._id)?.length !== 0) {
        return false;
      }
      if (dueFilter !== 'all') {
        const urgency = classifyDeadline({
          dueDate: task.dueDate,
          taskStatus: task.taskStatus,
          now,
        }).urgency;
        if (dueFilter === 'today' && urgency !== 'today') return false;
        if (dueFilter === 'overdue' && urgency !== 'overdue') return false;
        if (
          dueFilter === 'upcoming' &&
          urgency !== 'tomorrow' &&
          urgency !== 'week' &&
          urgency !== 'later'
        ) {
          return false;
        }
      }
      return true;
    });
  }, [results, priorityFilter, assigneeFilter, dueFilter, assigneesByTask, now]);

  // Sekcije na ekranu (sa zadržanim redovima) — rukovaoci posle dodira čitaju najnovije.
  // Redovi po grupama: zajednički `TaskRowModel` (dozvole, plan, zadržavanje).
  const sections = useMemo<StatusSection[] | undefined>(() => {
    if (!startupMini || !myId) return undefined;
    const context = {
      profileId: myId,
      startup: startupMini,
      areaLabels,
      assigneeIdsByTask,
      // Lista je već filtrirana na mene: izvršilac sam i bez učitanih izvršilaca.
      assumeAssignee: assigneeFilter === myId,
      plannedKeys: commands.plannedKeys,
      holds: commands.holds,
      pending: commands.pending,
    };
    return statusFilter === 'all'
      ? buildStatusSections(filteredResults, context)
      : buildFlatSection(filteredResults, context, statusFilter);
  }, [
    startupMini,
    myId,
    areaLabels,
    assigneeIdsByTask,
    assigneeFilter,
    statusFilter,
    filteredResults,
    commands.plannedKeys,
    commands.holds,
    commands.pending,
  ]);
  useEffect(() => {
    sectionsRef.current = sections ?? [];
  }, [sections]);

  const filtersActive =
    statusFilter !== 'all' || priorityFilter !== 'all' || assigneeFilter !== 'all' || dueFilter !== 'all';
  const activeFilterCount = [
    statusFilter !== 'all',
    priorityFilter !== 'all',
    assigneeFilter !== 'all',
    dueFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setDueFilter('all');
  };

  // --- Brzi unos: isti sheet i isti tok kao u Moj dan i Komandnom centru ---
  const quickAdd = useQuickAdd({
    dayKey: commands.dayKey,
    profileId: myId,
    planMutation: commands.mutations.planMutation,
  });

  const refreshControl = useListRefresh();
  const layoutPreset = useMemo(() => listLayout(reduced), [reduced]);
  const rowCount = sections ? sectionRowCount(sections) : 0;
  const layout = rowCount <= LAYOUT_ANIMATION_MAX_ROWS ? layoutPreset : undefined;

  const renderRow = (row: TaskRowModel, index: number) => (
    <StaggerItem key={row.key} index={index}>
      <Animated.View layout={layout} exiting={exitFade(reduced)}>
        {/* Startup je isti za ceo ekran (zaglavlje ga nosi), pa bez čipa. */}
        <TaskRow row={row} now={commands.now} showStartup={false} {...commands.rowActions} />
      </Animated.View>
    </StaggerItem>
  );

  if (activeStartupId === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Svi zadaci" onBack={() => router.back()} />
        <EmptyState
          icon={<ListTodo size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Zadaci se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      </View>
    );
  }

  const loading =
    pageStatus === 'LoadingFirstPage' ||
    startup === undefined ||
    sections === undefined ||
    waitingForAssignees;
  // Zadržan red (kvačica) drži listu neispraznom dok se animacija ne smiri.
  const empty = sections !== undefined && rowCount === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Svi zadaci"
        onBack={() => router.back()}
        actions={
          <View>
            <IconButton
              accessibilityLabel={
                activeFilterCount > 0 ? `Filteri, ${activeFilterCount} aktivno` : 'Filteri'
              }
              onPress={() => {
                haptics.tap();
                setFilterSheetOpen(true);
              }}>
              <SlidersHorizontal size={20} color={colors.foreground} />
            </IconButton>
            {activeFilterCount > 0 ? (
              <View
                style={styles.filterBadge}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <Badge label={String(activeFilterCount)} variant="destructive" />
              </View>
            ) : null}
          </View>
        }
      />

      <LoadingSwap loading={loading} skeleton={<TasksSkeleton />}>
        {loading || sections === undefined ? null : empty ? (
          <EmptyState
            icon={<ListTodo size={40} color={colors.mutedForeground} />}
            title={filtersActive ? 'Nijedan zadatak ne odgovara filterima' : 'Nema zadataka'}
            description={
              filtersActive
                ? pageStatus === 'CanLoadMore'
                  ? 'Nema podudaranja među trenutno učitanim zadacima. Očisti filtere ili ih promeni.'
                  : 'Nijedan zadatak ne odgovara trenutno izabranim filterima.'
                : 'Ovaj startup još nema zadataka. Napravi prvi odmah!'
            }
            actionLabel={filtersActive ? 'Očisti filtere' : 'Novi zadatak'}
            onAction={() => {
              if (filtersActive) clearFilters();
              else setQuickAddOpen(true);
            }}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 160 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}>
            <StaggerGroup
              resetKey={`${statusFilter}:${priorityFilter}:${assigneeFilter}:${dueFilter}`}>
              {statusFilter === 'all' ? (
                sections.map((section) =>
                  section.rows.length === 0 ? null : (
                    <View key={section.id} style={styles.section}>
                      <MeSectionHeader title={TASK_STATUS_META[section.id].label} count={section.rows.length} />
                      <View>{section.rows.map(renderRow)}</View>
                    </View>
                  ),
                )
              ) : (
                <View style={styles.section}>
                  <Text style={[styles.summary, { color: colors.mutedForeground }]}>
                    {rowCount} {tasksWord(rowCount)}
                  </Text>
                  <View>{sections.flatMap((section) => section.rows).map(renderRow)}</View>
                </View>
              )}
            </StaggerGroup>

            {pageStatus === 'CanLoadMore' ? (
              <Button
                label="Učitaj još"
                variant="ghost"
                onPress={() => loadMore(50)}
                style={styles.loadMore}
              />
            ) : pageStatus === 'LoadingMore' ? (
              <ActivityIndicator color={colors.primary} style={styles.loadMore} />
            ) : null}
          </ScrollView>
        )}
      </LoadingSwap>

      <FAB
        icon={Plus}
        accessibilityLabel="Novi zadatak"
        onPress={() => {
          haptics.tap();
          setQuickAddOpen(true);
        }}
        style={{ bottom: insets.bottom + 16 }}
      />
      {/* „Završeno: …" i „Uklonjeno iz Moj dan" vraćaju se odavde (par web toasta). */}
      <UndoBar bottomOffset={72} />

      <TasksFilterSheet
        open={filterSheetOpen}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        priority={priorityFilter}
        onPriorityChange={setPriorityFilter}
        assignee={assigneeFilter}
        onAssigneeChange={setAssigneeFilter}
        due={dueFilter}
        onDueChange={setDueFilter}
        members={members}
        onClear={clearFilters}
        onClose={() => setFilterSheetOpen(false)}
      />

      {commands.renderSheets((key) => findStartupRow(sections ?? [], key))}

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        now={commands.now}
        startups={quickAdd.startups}
        preset={{ startupId: activeStartupId }}
        readStored={readStoredDestination}
        rememberedArea={readLastArea}
        onSubmit={quickAdd.submit}
      />
    </View>
  );
}

/** Oblik onoga što stiže: 5 redova zadatka, bez sekcijskih zaglavlja. */
function TasksSkeleton() {
  return (
    <View
      style={styles.listContent}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje zadataka">
      <SkeletonList count={5} gap={10} item={(index) => <SkeletonTaskCard index={index} />} />
    </View>
  );
}

/** Greška: `tasks.listForStartup`/`startups.get` bacaju kad korisnik nije član startupa. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ZadaciErrorState
      message={accessErrorMessage(error, 'Došlo je do greške pri učitavanju zadataka.')}
      onRetry={retry}
    />
  );
}

function ZadaciErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Svi zadaci" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Zadaci se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju zadataka.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 20,
  },
  section: {
    gap: 4,
  },
  summary: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  loadMore: {
    marginTop: 4,
    alignSelf: 'center',
  },
});
