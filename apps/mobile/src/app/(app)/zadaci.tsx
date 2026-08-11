import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ListTodo, Plus, SlidersHorizontal, TriangleAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuickAddSheet } from '@/components/danas/quick-add-sheet';
import { TaskActionsSheet } from '@/components/danas/task-actions-sheet';
import { TaskCard } from '@/components/danas/task-card';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FAB } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { SkeletonList, SkeletonTaskCard } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
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
import { accessErrorMessage } from '@/lib/errors';
import { classifyDeadline } from '@/lib/deadline';
import { haptics } from '@/lib/haptics';
import { TASK_STATUS_META, TASK_STATUS_ORDER, tasksWord, type TaskPriority, type TaskStatus } from '@/lib/task-meta';
import type { AllTasksTask } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

/**
 * Ogledalo `packages/backend/convex/taskAssignees.ts`'s `MAX_ASSIGNEE_LOOKUP_PAGES` —
 * `listForTasks` BACA iznad ovog broja id-jeva. Bez ove granice, dovoljno „Učitaj još"
 * (server strana `MAX_TASK_PAGE_SIZE` je 100 po stranici) srušilo bi CEO ekran u
 * `ErrorBoundary`. Iznad granice zadaci jednostavno ostaju bez prikazanih izvršilaca
 * na kartici — degradacija, ne pad.
 */
const MAX_ASSIGNEE_LOOKUP = 300;

/** Šta `areasV2.updatePage` sme da menja sa ovog ekrana — podskup njegovih args-a. */
type TaskPatch = Partial<{
  taskStatus: TaskStatus;
  taskPriority: TaskPriority;
  dueDate: number | null;
  assigneeProfileIds: Id<'profiles'>[];
}>;

/**
 * Ekran „Svi zadaci" (PARITET A3) — pregled CELOG startupa, ne samo mog dana kao
 * `danas.tsx`. Web nema jedan gotov ekran koji ovo radi (`tasks-view.tsx` je „Moji
 * zadaci", `task-table-view.tsx` je mrtav kod) — ovo je nov ekran nad
 * `tasks.listForStartup`, sa ponašanjem pozajmljenim iz oba: filter-skup iz
 * `task-table-view.tsx`, grupisanje-sa-brojačem iz kanban-a u `tasks-view.tsx`.
 *
 * Model dozvola je STROŽI od Danas: menja samo kreator (`areasV2.updatePage`,
 * bez izuzetka za izvršioca) — isto što web `tasks-view.tsx`/`task-table-view.tsx`
 * rade preko iste mutacije. `danas.tsx` ostaje netaknut, poseban je ekran.
 */
export default function ZadaciScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();
  const [now] = useState(() => Date.now());

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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
  const assigneeRows = useQuery(
    api.taskAssignees.listForTasks,
    activeStartupId && taskIds.length > 0
      ? { startupId: activeStartupId, taskPageIds: taskIds }
      : 'skip',
  );
  const assigneesByTask = useMemo(() => {
    const map = new Map<Id<'pages'>, NonNullable<typeof assigneeRows>[number]['assignees']>();
    assigneeRows?.forEach((row) => map.set(row.taskPageId, row.assignees));
    return map;
  }, [assigneeRows]);

  const areaById = useMemo(() => {
    const map = new Map<Id<'startupAreas'>, string>();
    startup?.areas.forEach((area) => map.set(area._id, area.label));
    return map;
  }, [startup]);

  // Filter „Nedodeljeno" zavisi od potpunih podataka o izvršiocima — dok oni stižu,
  // ekran ostaje u stanju učitavanja umesto da nakratko pokaže SVE kao nedodeljeno.
  const waitingForAssignees =
    assigneeFilter === 'unassigned' && taskIds.length > 0 && assigneeRows === undefined;

  const filteredResults = useMemo(() => {
    return results.filter((task) => {
      if (priorityFilter !== 'all' && (task.taskPriority ?? 'medium') !== priorityFilter) {
        return false;
      }
      if (assigneeFilter === 'unassigned' && (assigneesByTask.get(task._id) ?? []).length > 0) {
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

  const grouped = useMemo(() => {
    if (statusFilter !== 'all') return null;
    const map = new Map<TaskStatus, AllTasksTask[]>();
    TASK_STATUS_ORDER.forEach((value) => map.set(value, []));
    filteredResults.forEach((task) => {
      const key = task.taskStatus ?? 'backlog';
      map.get(key)?.push(task);
    });
    return map;
  }, [statusFilter, filteredResults]);

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

  // Meni akcija cilja živi zadatak po id-ju, pa prati realtime izmene / nestanak
  // (npr. status promenjen na drugom uređaju baš dok je meni otvoren).
  const [menuTaskId, setMenuTaskId] = useState<Id<'pages'> | null>(null);
  const [menuStatusOnly, setMenuStatusOnly] = useState(false);
  const menuTask = useMemo(
    () => (menuTaskId ? (filteredResults.find((task) => task._id === menuTaskId) ?? null) : null),
    [menuTaskId, filteredResults],
  );

  const updateTaskPage = useMutation(api.areasV2.updatePage);
  const join = useMutation(api.taskAssignees.join);
  const leave = useMutation(api.taskAssignees.leave);
  const createPage = useMutation(api.pages.create);

  const refreshControl = useListRefresh();

  // Brava protiv dupliranog swipe/tap-a na ISTI zadatak dok je prethodna mutacija
  // u letu (nema vizuelni spiner na kartici — `TaskCard` je deljena komponenta,
  // ne menja se ovde — ali sprečava dva istovremena `updatePage` poziva nad istim,
  // potencijalno zastarelim `revision`om).
  const [busyTaskId, setBusyTaskId] = useState<Id<'pages'> | null>(null);

  const patchTask = (task: AllTasksTask, patch: TaskPatch) => {
    if (!activeStartupId || busyTaskId !== null) return;
    setBusyTaskId(task._id);
    void updateTaskPage({
      startupId: activeStartupId,
      pageId: task._id,
      expectedRevision: task.revision,
      ...patch,
    })
      .then(() => haptics.success())
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Zadatak nije ažuriran.'));
      })
      .finally(() => setBusyTaskId(null));
  };

  const canEditAllFor = (task: AllTasksTask) => myId !== null && task.createdByProfileId === myId;

  const openMenu = (task: AllTasksTask, statusOnly: boolean) => {
    setMenuStatusOnly(statusOnly);
    setMenuTaskId(task._id);
  };
  const closeMenu = () => setMenuTaskId(null);

  const markDone = (task: AllTasksTask) => patchTask(task, { taskStatus: 'done' });
  const applyStatus = (status: TaskStatus) => {
    if (menuTask) patchTask(menuTask, { taskStatus: status });
    closeMenu();
  };
  const applyPriority = (priority: TaskPriority) => {
    if (menuTask) patchTask(menuTask, { taskPriority: priority });
    closeMenu();
  };
  const applyDue = (dueDate: number | null) => {
    if (menuTask) patchTask(menuTask, { dueDate });
    closeMenu();
  };
  const applySetAssignees = (profileIds: Id<'profiles'>[]) => {
    if (menuTask) patchTask(menuTask, { assigneeProfileIds: profileIds });
  };
  // `canEditAll` je ovde UVEK jednak `canChangeStatus` (stroži model, videti
  // dokumentaciju gore) — ali `TaskActionsSheet` i dalje prikazuje red „Priključi
  // se / napusti" za ne-kreatora (sopstvena grana u sheet-u, nezavisna od statusa).
  // Taj red MORA da radi, ne samo da izgleda dodirljivo — otud stvarne mutacije
  // ovde, ne no-op (odstupanje od plana faze 4, zapisano u planu).
  const applyJoinLeave = (isSelfAssigned: boolean) => {
    if (!menuTaskId || busyTaskId !== null) return;
    setBusyTaskId(menuTaskId);
    const action = isSelfAssigned ? leave({ taskPageId: menuTaskId }) : join({ taskPageId: menuTaskId });
    void action
      .then(() => haptics.success())
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Radnja nije uspela.'));
      })
      .finally(() => setBusyTaskId(null));
  };

  const createTask = async (title: string, areaId: Id<'startupAreas'>) => {
    if (!activeStartupId) return;
    setCreating(true);
    try {
      await createPage({ startupId: activeStartupId, areaId, parentPageId: null, kind: 'task', title });
      setQuickAddOpen(false);
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Zadatak nije kreiran.'));
    } finally {
      setCreating(false);
    }
  };

  const renderTask = (task: AllTasksTask, index: number) => (
    <StaggerItem key={task._id} index={index}>
      <TaskCard
        task={task}
        areaLabel={areaById.get(task.areaId) ?? 'Bez oblasti'}
        assignees={assigneesByTask.get(task._id) ?? []}
        now={now}
        canDone={canEditAllFor(task)}
        onDone={() => markDone(task)}
        onOpen={() => router.push({ pathname: '/zadatak/[id]', params: { id: task._id } })}
        onMenu={() => openMenu(task, false)}
        onQuickStatus={() => openMenu(task, true)}
      />
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
    pageStatus === 'LoadingFirstPage' || startup === undefined || waitingForAssignees;

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
        {loading ? null : filteredResults.length === 0 ? (
          <EmptyState
            icon={<ListTodo size={40} color={colors.mutedForeground} />}
            title={filtersActive ? 'Nijedan zadatak ne odgovara filterima' : 'Nema zadataka'}
            description={
              filtersActive
                ? pageStatus === 'CanLoadMore'
                  ? 'Nema podudaranja među trenutno učitanim zadacima. Učitaj još zadataka ili promeni filtere.'
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
              {grouped ? (
                TASK_STATUS_ORDER.map((statusKey) => {
                  const items = grouped.get(statusKey) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <View key={statusKey} style={styles.section}>
                      <SectionHeader title={TASK_STATUS_META[statusKey].label} count={items.length} />
                      <View style={styles.cards}>{items.map(renderTask)}</View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.section}>
                  <Text style={[styles.summary, { color: colors.mutedForeground }]}>
                    {filteredResults.length} {tasksWord(filteredResults.length)}
                  </Text>
                  <View style={styles.cards}>{filteredResults.map(renderTask)}</View>
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

      <TaskActionsSheet
        task={menuTask}
        statusOnly={menuStatusOnly}
        now={now}
        assignees={menuTaskId ? (assigneesByTask.get(menuTaskId) ?? []) : []}
        members={members}
        currentProfileId={myId}
        canChangeStatus={menuTask ? canEditAllFor(menuTask) : false}
        canEditAll={menuTask ? canEditAllFor(menuTask) : false}
        onStatus={applyStatus}
        onPriority={applyPriority}
        onDue={applyDue}
        onJoinLeave={applyJoinLeave}
        onSetAssignees={applySetAssignees}
        onClose={closeMenu}
      />

      <QuickAddSheet
        visible={quickAddOpen}
        areas={startup?.areas ?? []}
        submitting={creating}
        onClose={() => setQuickAddOpen(false)}
        onCreate={(title, areaId) => void createTask(title, areaId)}
      />
    </View>
  );
}

/** Oblik onoga što stiže: 5 kartica zadatka, bez sekcijskih zaglavlja. */
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
  return <ZadaciErrorState message={error.message} onRetry={retry} />;
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
    gap: 10,
  },
  summary: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cards: {
    gap: 10,
  },
  loadMore: {
    marginTop: 4,
    alignSelf: 'center',
  },
});
