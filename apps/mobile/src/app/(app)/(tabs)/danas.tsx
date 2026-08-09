import { useMutation, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { CalendarX2, ChevronDown, ChevronRight, ListTodo } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DaySummary, type DaySummaryCounts } from '@/components/danas/day-summary';
import { QuickAddFab } from '@/components/danas/quick-add-fab';
import { QuickAddSheet } from '@/components/danas/quick-add-sheet';
import { TaskActionsSheet } from '@/components/danas/task-actions-sheet';
import { TaskCard } from '@/components/danas/task-card';
import {
  UNASSIGNED_KEY,
  WorkloadStrip,
  type WorkloadEntry,
  type WorkloadFilter,
} from '@/components/danas/workload-strip';
import { SegmentedControl } from '@/components/chat/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  bucketTasksForToday,
  classifyDeadline,
  nextLocalMidnight,
  TODAY_SECTION_ORDER,
  type TodaySection,
} from '@/lib/deadline';
import type { TaskPriority, TaskStatus } from '@/lib/task-meta';
import {
  TODAY_SEGMENTS,
  type CommandCenterTask,
  type TodaySegmentId,
} from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, type ColorTokens } from '@/theme/tokens';

const SECTION_LABEL: Record<TodaySection, string> = {
  overdue: 'Prekoračeno',
  today: 'Danas',
  next: 'Sledeće',
  blocked: 'Blokirano',
};

/** `now` u stanju, sa preklasifikacijom na sledeću lokalnu ponoć (kao web). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = Math.max(1_000, nextLocalMidnight(now) - now);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}

/**
 * Tab „Danas" — komandni centar na telefonu (docs/mobile/02-EKRANI.md §4).
 * Segment Pregled/Moji zadaci nad aktivnim startupom; zadaci grupisani u
 * prekoračeno → danas → sledeće → blokirano; svajp/tap/long-press akcije; FAB za
 * brzo dodavanje. Bez kanbana — svajp lista.
 */
export default function DanasScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const now = useNow();
  const { activeStartupId } = useActiveStartup();
  const [segment, setSegment] = useState<TodaySegmentId>('overview');
  const [blockedOpen, setBlockedOpen] = useState(false);
  // Filter trake opterećenja: `null` = svi, `UNASSIGNED_KEY` = bez izvršioca.
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);

  const profile = useQuery(api.profiles.getCurrent, {});
  const myId = profile?._id ?? null;

  const startupArg = activeStartupId ? { startupId: activeStartupId } : 'skip';
  const command = useQuery(api.tasks.commandCenter, startupArg);
  const startup = useQuery(api.startups.get, startupArg);
  // Članovi su potrebni i traci opterećenja i meniju akcija — jedna pretplata za oba.
  const members = useQuery(
    api.startups.listMembers,
    activeStartupId ? { startupId: activeStartupId, limit: 50 } : 'skip',
  );

  const tasks = command?.tasks;
  const taskIds = useMemo(() => tasks?.map((task) => task._id) ?? [], [tasks]);
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
  const assigneesOf = (taskId: Id<'pages'>) => assigneesByTask.get(taskId) ?? [];

  const areaById = useMemo(() => {
    const map = new Map<Id<'startupAreas'>, NonNullable<typeof startup>['areas'][number]>();
    startup?.areas.forEach((area) => map.set(area._id, area));
    return map;
  }, [startup]);

  // „Moji zadaci" = otvoreni zadaci aktivnog startupa gde sam izvršilac.
  const segmentTasks = useMemo<CommandCenterTask[] | undefined>(() => {
    if (tasks === undefined) return undefined;
    if (segment === 'overview') return tasks;
    if (taskIds.length > 0 && assigneeRows === undefined) return undefined; // čeka izvršioce
    if (myId === null) return [];
    return tasks.filter((task) =>
      assigneesByTask.get(task._id)?.some((a) => a.profileId === myId),
    );
  }, [tasks, segment, taskIds, assigneeRows, myId, assigneesByTask]);

  // Opterećenje tima (traka čipova) — računa se iz SVIH otvorenih zadataka, ne iz
  // filtriranih, da brojači po članu ostanu stabilni dok se filter menja (kao web).
  const workload = useMemo<WorkloadEntry[]>(() => {
    if (tasks === undefined || members === undefined) return [];
    const entries: WorkloadEntry[] = members.map((member) => ({
      key: member.profile._id,
      name: member.profile.displayName,
      avatar: { displayName: member.profile.displayName, avatarUrl: member.profile.avatarUrl },
      open: 0,
      overdue: 0,
      urgent: 0,
    }));
    const unassigned: WorkloadEntry = {
      key: UNASSIGNED_KEY,
      name: 'Nedodeljeno',
      avatar: null,
      open: 0,
      overdue: 0,
      urgent: 0,
    };
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));

    for (const task of tasks) {
      // Svi izvršioci su ravnopravni, pa zadatak ulazi u opterećenje svakog od njih;
      // zbir po članovima je zato veći od broja zadataka.
      const taskAssignees = assigneesByTask.get(task._id) ?? [];
      const targets =
        taskAssignees.length === 0
          ? [unassigned]
          : taskAssignees.flatMap((assignee) => {
              const entry = byKey.get(assignee.profileId);
              return entry === undefined ? [] : [entry];
            });
      const overdue =
        classifyDeadline({ dueDate: task.dueDate, taskStatus: task.taskStatus, now }).urgency ===
        'overdue';
      for (const entry of targets) {
        entry.open += 1;
        if (overdue) entry.overdue += 1;
        if (task.taskPriority === 'urgent') entry.urgent += 1;
      }
    }

    return unassigned.open > 0 ? [...entries, unassigned] : entries;
  }, [tasks, members, assigneesByTask, now]);

  // Filter po članu važi samo u segmentu „Pregled" — u „Mojim zadacima" bi sužavao
  // listu koja je već svedena na jednog čoveka.
  const visibleTasks = useMemo<CommandCenterTask[] | undefined>(() => {
    if (segmentTasks === undefined) return undefined;
    if (segment !== 'overview' || memberFilter === null) return segmentTasks;
    if (memberFilter === UNASSIGNED_KEY) {
      return segmentTasks.filter((task) => (assigneesByTask.get(task._id) ?? []).length === 0);
    }
    return segmentTasks.filter((task) =>
      (assigneesByTask.get(task._id) ?? []).some((a) => a.profileId === memberFilter),
    );
  }, [segmentTasks, segment, memberFilter, assigneesByTask]);

  const buckets = useMemo(
    () => (visibleTasks ? bucketTasksForToday(visibleTasks, now) : undefined),
    [visibleTasks, now],
  );

  // Brojači za `DaySummary` — isti skup zadataka koji je i u listi, pa se pozdrav i
  // lista ne mogu razići (segment „Moji zadaci" sužava oba).
  const summaryCounts = useMemo<DaySummaryCounts | null>(() => {
    if (visibleTasks === undefined) return null;
    let overdue = 0;
    let urgent = 0;
    for (const task of visibleTasks) {
      if (
        classifyDeadline({ dueDate: task.dueDate, taskStatus: task.taskStatus, now }).urgency ===
        'overdue'
      ) {
        overdue += 1;
      }
      if (task.taskPriority === 'urgent') urgent += 1;
    }
    return { open: visibleTasks.length, overdue, urgent };
  }, [visibleTasks, now]);

  // Promena startupa nosi druge članove — stari filter bi ostao kao mrtav id.
  useEffect(() => {
    setMemberFilter(null);
  }, [activeStartupId]);

  const firstName = profile?.displayName.trim().split(/\s+/)[0] ?? null;
  const filteredName =
    memberFilter === null ? null : (workload.find((e) => e.key === memberFilter)?.name ?? null);
  const segmentLabel =
    filteredName ?? (segment === 'mine' ? 'Moji zadaci' : 'Pregled');

  // Meni akcija cilja živi zadatak po id-ju, pa prati realtime izmene / nestanak.
  const [menuTaskId, setMenuTaskId] = useState<Id<'pages'> | null>(null);
  const [menuStatusOnly, setMenuStatusOnly] = useState(false);
  const menuTask = useMemo(
    () => (menuTaskId ? (tasks?.find((task) => task._id === menuTaskId) ?? null) : null),
    [menuTaskId, tasks],
  );
  useEffect(() => {
    // Zadatak je napustio otvoreni skup (npr. označen „gotovo") → zatvori meni.
    if (menuTaskId && menuTask === null) setMenuTaskId(null);
  }, [menuTaskId, menuTask]);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const join = useMutation(api.taskAssignees.join);
  const leave = useMutation(api.taskAssignees.leave);
  const setAssignees = useMutation(api.taskAssignees.setAssignees);
  const createPage = useMutation(api.pages.create);

  const notifyError = (error: unknown) =>
    Alert.alert('Nešto nije prošlo', error instanceof Error ? error.message : 'Pokušaj ponovo.');
  const run = (promise: Promise<unknown>) => {
    void promise.catch(notifyError);
  };

  const canChangeStatusFor = (task: CommandCenterTask) =>
    myId !== null &&
    (task.createdByProfileId === myId || assigneesOf(task._id).some((a) => a.profileId === myId));
  const canEditAllFor = (task: CommandCenterTask) =>
    myId !== null && task.createdByProfileId === myId;

  const openMenu = (task: CommandCenterTask, statusOnly: boolean) => {
    setMenuStatusOnly(statusOnly);
    setMenuTaskId(task._id);
  };
  const closeMenu = () => setMenuTaskId(null);

  const markDone = (task: CommandCenterTask) =>
    run(updateMetadata({ pageId: task._id, status: 'done' }));

  const applyStatus = (status: TaskStatus) => {
    if (menuTaskId) run(updateMetadata({ pageId: menuTaskId, status }));
    closeMenu();
  };
  const applyPriority = (priority: TaskPriority) => {
    if (menuTaskId) run(updateMetadata({ pageId: menuTaskId, priority }));
    closeMenu();
  };
  const applyDue = (dueDate: number | null) => {
    if (menuTaskId) run(updateMetadata({ pageId: menuTaskId, dueDate }));
    closeMenu();
  };
  const applyJoinLeave = (isSelfAssigned: boolean) => {
    if (!menuTaskId) return;
    run(isSelfAssigned ? leave({ taskPageId: menuTaskId }) : join({ taskPageId: menuTaskId }));
  };
  const applySetAssignees = (profileIds: Id<'profiles'>[]) => {
    if (menuTaskId) run(setAssignees({ taskPageId: menuTaskId, profileIds }));
  };

  const createTask = async (title: string, areaId: Id<'startupAreas'>) => {
    if (!activeStartupId) return;
    setCreating(true);
    try {
      await createPage({
        startupId: activeStartupId,
        areaId,
        parentPageId: null,
        kind: 'task',
        title,
      });
      setQuickAddOpen(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setCreating(false);
    }
  };

  const renderTask = (task: CommandCenterTask) => (
    <TaskCard
      key={task._id}
      task={task}
      areaLabel={areaById.get(task.areaId)?.label ?? 'Bez oblasti'}
      assignees={assigneesOf(task._id)}
      now={now}
      canDone={canChangeStatusFor(task)}
      onDone={() => markDone(task)}
      onOpen={() => router.push({ pathname: '/zadatak/[id]', params: { id: task._id } })}
      onMenu={() => openMenu(task, false)}
      onQuickStatus={() => openMenu(task, true)}
    />
  );

  const loading =
    activeStartupId === null ||
    command === undefined ||
    startup === undefined ||
    visibleTasks === undefined ||
    buckets === undefined;
  const allEmpty =
    buckets !== undefined && TODAY_SECTION_ORDER.every((key) => buckets[key].length === 0);
  const startupReady = startup !== undefined && activeStartupId !== null;

  return (
    <TabScreen
      title="Danas"
      // Segment je deo zaglavlja: jedan blok gore umesto treće trake ispod njega.
      below={<SegmentedControl options={TODAY_SEGMENTS} value={segment} onChange={setSegment} />}>
      <GestureHandlerRootView style={styles.root}>
        {/* Traka opterećenja je FILTER, pa stoji van skrola liste: kad filter isprazni
            listu, dugme za gašenje filtera mora ostati na ekranu. */}
        {segment === 'overview' && startupReady ? (
          <WorkloadStrip
            entries={workload}
            totalOpen={tasks?.length ?? 0}
            activeKey={memberFilter}
            onSelect={setMemberFilter}
            loading={members === undefined || command === undefined}
          />
        ) : null}

        {loading ? (
          <LoadingList />
        ) : allEmpty && memberFilter !== null ? (
          <EmptyState
            icon={<ListTodo size={40} color={colors.mutedForeground} />}
            title="Za izabranog člana nema otvorenih zadataka."
            description="Filter je uključen u traci opterećenja iznad."
            actionLabel="Prikaži sve"
            onAction={() => setMemberFilter(null)}
          />
        ) : allEmpty ? (
          <EmptyState
            icon={<ListTodo size={40} color={colors.mutedForeground} />}
            title="Nema zadataka za danas."
            description={
              segment === 'mine'
                ? 'Kad ti neko dodeli zadatak, pojaviće se ovde.'
                : 'Otvoreni zadaci tima pojaviće se ovde.'
            }
            actionLabel="Novi zadatak"
            onAction={() => setQuickAddOpen(true)}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}>
            <DaySummary
              firstName={firstName}
              startupName={startup?.name ?? null}
              counts={summaryCounts}
              segmentLabel={segmentLabel}
            />
            {TODAY_SECTION_ORDER.map((key) => {
              const items = buckets[key];
              if (items.length === 0) return null;
              const isBlocked = key === 'blocked';
              const open = !isBlocked || blockedOpen;
              const danger = key === 'overdue';
              return (
                <View key={key} style={styles.section}>
                  <SectionHeader
                    label={SECTION_LABEL[key]}
                    count={items.length}
                    danger={danger}
                    collapsible={isBlocked}
                    open={open}
                    onToggle={() => setBlockedOpen((value) => !value)}
                    colors={colors}
                  />
                  {open ? <View style={styles.cards}>{items.map(renderTask)}</View> : null}
                </View>
              );
            })}
          </ScrollView>
        )}

        {startupReady ? <QuickAddFab onPress={() => setQuickAddOpen(true)} /> : null}

        <TaskActionsSheet
          task={menuTask}
          statusOnly={menuStatusOnly}
          now={now}
          assignees={menuTaskId ? assigneesOf(menuTaskId) : []}
          members={members}
          currentProfileId={myId}
          canChangeStatus={menuTask ? canChangeStatusFor(menuTask) : false}
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
          onCreate={createTask}
        />
      </GestureHandlerRootView>
    </TabScreen>
  );
}

function SectionHeader({
  label,
  count,
  danger,
  collapsible,
  open,
  onToggle,
  colors,
}: {
  label: string;
  count: number;
  danger: boolean;
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  colors: ColorTokens;
}) {
  const tint = danger ? colors.destructive : colors.foreground;
  const content = (
    <>
      <View style={styles.sectionHeaderLeft}>
        <Text style={[styles.sectionTitle, { color: tint }]}>{label}</Text>
        <View
          style={[
            styles.countPill,
            { backgroundColor: danger ? `${colors.destructive}22` : colors.muted },
          ]}>
          <Text
            style={[styles.countText, { color: danger ? colors.destructive : colors.mutedForeground }]}>
            {count}
          </Text>
        </View>
      </View>
      {collapsible ? (
        open ? (
          <ChevronDown size={20} color={colors.mutedForeground} />
        ) : (
          <ChevronRight size={20} color={colors.mutedForeground} />
        )
      ) : null}
    </>
  );

  if (collapsible) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${count}`}
        onPress={onToggle}
        style={[styles.sectionHeaderRow, styles.sectionHeaderTappable]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityRole="header" style={styles.sectionHeaderRow}>
      {content}
    </View>
  );
}

function LoadingList() {
  const colors = useThemeColors();
  return (
    <View style={styles.listContent}>
      <Skeleton width="40%" height={16} style={styles.skeletonHeader} />
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.skeletonBody}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="45%" height={13} />
          </View>
          <Skeleton width={26} height={26} borderRadius={radius.full} />
        </View>
      ))}
    </View>
  );
}

/** Greška ekrana — `commandCenter`/`get` bacaju kad korisnik nije član startupa. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <DanasErrorState message={error.message} onRetry={retry} />;
}

function DanasErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <TabScreen title="Danas">
      <EmptyState
        icon={<CalendarX2 size={40} color={colors.destructive} />}
        title="Zadaci se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju zadataka.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  sectionHeaderTappable: {
    minHeight: 44,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  countPill: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
  },
  cards: {
    gap: 10,
  },
  skeletonHeader: {
    marginBottom: 4,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  skeletonBody: {
    flex: 1,
    gap: 8,
  },
});
