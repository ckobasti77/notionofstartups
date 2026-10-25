import { findStartupRow, locateStartupRow, type StartupMini, type TaskRowModel } from '@devotion/shared';
import { useQuery } from 'convex/react';
import { CalendarX2, ListTodo } from 'lucide-react-native';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { SegmentedControl } from '@/components/chat/segmented-control';
import { DaySummary, type DaySummaryCounts } from '@/components/danas/day-summary';
import { QuickAddFab } from '@/components/danas/quick-add-fab';
import {
  UNASSIGNED_KEY,
  WorkloadStrip,
  type WorkloadEntry,
  type WorkloadFilter,
} from '@/components/danas/workload-strip';
import { EmptyState } from '@/components/empty-state';
import { LAYOUT_ANIMATION_MAX_ROWS } from '@/components/me/my-day/my-day-model';
import { QuickAddSheet } from '@/components/me/quick-add-sheet';
import { MeSectionHeader } from '@/components/me/section-header';
import { TaskRow } from '@/components/me/task-row';
import { useQuickAdd } from '@/components/me/use-quick-add';
import { exitFade, listLayout } from '@/components/motion';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonTaskCard } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { UndoBar } from '@/components/undo-bar';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRetained } from '@/hooks/use-retained';
import { classifyDeadline, type TodaySection } from '@/lib/deadline';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { readLastArea, readStoredDestination } from '@/lib/quick-add-memory';
import { TODAY_SEGMENTS, type CommandCenterTask, type TodaySegmentId } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { space, text } from '@/theme/tokens';

import { buildCommandSections, COMMAND_CENTER_LIST, sectionRowCount } from './startup-task-model';
import { useStartupTaskCommands } from './use-startup-task-commands';

/** Ogledalo `MAX_ASSIGNEE_LOOKUP_PAGES` u `taskAssignees.ts`. */
const MAX_ASSIGNEE_LOOKUP = 300;

const SECTION_LABEL: Record<TodaySection, string> = {
  overdue: 'Prekoračeno',
  today: 'Danas',
  next: 'Sledeće',
  blocked: 'Blokirano',
};

/**
 * Komandni centar startupa (docs/mobile/02-EKRANI.md §4) — do K09 je to bio tab
 * „Danas"; sada živi u tabu Prostor kao prvi segment (P15, plan K07 E14), jer je
 * „Danas" postao lični Moj dan. Od K18 (par web K17) redovi su zajednički red
 * zadatka (`TaskRow` nad `TaskRowModel`): swipe desno = završi sa „Poništi",
 * swipe levo = „Rok i plan", dugi pritisak = radnje (status, rok, prioritet,
 * „Dodaj u Moj dan", „Priključi se"), dodir = panel zadatka sa „Puni prikaz".
 * Mutacije i dozvole su iste kao na webu i u Moj dan (`useStartupTaskCommands`).
 * Brzi unos je isti sheet kao u Moj dan, sa unapred izabranim startupom.
 * Segment Pregled/Moji zadaci, traka opterećenja i sekcije prekoračeno → danas →
 * sledeće → blokirano ostaju. Bez kanbana — svajp lista.
 *
 * Greška upita (npr. korisnik više nije član) ostaje u ovom segmentu
 * (`CommandCenterBoundary`), pa „Oblasti" i ostatak Prostora rade dalje.
 */
export function CommandCenter({ startupId }: { startupId: Id<'startups'> }) {
  return (
    <CommandCenterBoundary key={startupId}>
      <CommandCenterBody startupId={startupId} />
    </CommandCenterBoundary>
  );
}

function CommandCenterBody({ startupId }: { startupId: Id<'startups'> }) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const [segment, setSegment] = useState<TodaySegmentId>('overview');
  const [blockedOpen, setBlockedOpen] = useState(false);
  // Filter trake opterećenja: `null` = svi, `UNASSIGNED_KEY` = bez izvršioca.
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);

  const profile = useQuery(api.profiles.getCurrent, {});
  const myId = profile?._id ?? null;

  const startupArg = { startupId };
  const command = useQuery(api.tasks.commandCenter, startupArg);
  const startup = useQuery(api.startups.get, startupArg);
  // Članovi su potrebni traci opterećenja — jedna pretplata.
  const members = useQuery(api.startups.listMembers, { startupId, limit: 50 });

  const tasks = command?.tasks;
  // `listForTasks` BACA iznad 300 id-jeva (`MAX_ASSIGNEE_LOOKUP_PAGES`), a Komandni centar
  // ih može imati do 600: zadaci iznad granice ostaju bez poznatih izvršilaca (dozvole
  // padaju na „ne znamo"), umesto da ceo segment padne u granicu greške.
  const taskIds = useMemo(
    () => tasks?.slice(0, MAX_ASSIGNEE_LOOKUP).map((task) => task._id) ?? [],
    [tasks],
  );
  const liveAssigneeRows = useQuery(
    api.taskAssignees.listForTasks,
    taskIds.length > 0 ? { startupId, taskPageIds: taskIds } : 'skip',
  );
  // Svaka promena liste (završen zadatak…) menja argumente pa upit nakratko vraća
  // `undefined`: zadržavamo poslednji odgovor da kvačice ne trepnu u zaključano
  // i da lista ne ode u skeleton (par web `useLastReady`).
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

  // Sekcije na ekranu (sa zadržanim redovima) — rukovaoci posle dodira čitaju najnovije.
  const sectionsRef = useRef<ReturnType<typeof buildCommandSections>>([]);
  const commands = useStartupTaskCommands({
    locate: (key) => locateStartupRow(COMMAND_CENTER_LIST, sectionsRef.current, key),
  });
  const { now } = commands;

  // „Moji zadaci" = otvoreni zadaci aktivnog startupa gde sam izvršilac.
  const segmentTasks = useMemo<CommandCenterTask[] | undefined>(() => {
    if (tasks === undefined) return undefined;
    if (segment === 'overview') return tasks;
    if (taskIds.length > 0 && assigneeRows === undefined) return undefined; // čeka izvršioce
    if (myId === null) return [];
    return tasks.filter((task) => assigneesByTask.get(task._id)?.some((a) => a.profileId === myId));
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
      // Nepoznati izvršioci (nije stigao odgovor ili je iznad granice) se ne broje.
      const taskAssignees = assigneesByTask.get(task._id);
      if (taskAssignees === undefined) continue;
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
      return segmentTasks.filter((task) => assigneesByTask.get(task._id)?.length === 0);
    }
    return segmentTasks.filter((task) =>
      (assigneesByTask.get(task._id) ?? []).some((a) => a.profileId === memberFilter),
    );
  }, [segmentTasks, segment, memberFilter, assigneesByTask]);

  // Redovi po sekcijama: zajednički `TaskRowModel` (dozvole, plan, zadržavanje).
  const sections = useMemo(
    () =>
      visibleTasks && startupMini && myId
        ? buildCommandSections(visibleTasks, now, {
            profileId: myId,
            startup: startupMini,
            areaLabels,
            assigneeIdsByTask,
            assumeAssignee: segment === 'mine',
            plannedKeys: commands.plannedKeys,
            holds: commands.holds,
            pending: commands.pending,
          })
        : undefined,
    [
      visibleTasks,
      startupMini,
      myId,
      now,
      areaLabels,
      assigneeIdsByTask,
      segment,
      commands.plannedKeys,
      commands.holds,
      commands.pending,
    ],
  );
  useEffect(() => {
    sectionsRef.current = sections ?? [];
  }, [sections]);

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

  // Promena startupa nosi druge članove — roditelj zato montira ovu komponentu sa
  // `key={startupId}`, pa filter (i sve ostalo stanje) kreće iz početka.

  const firstName = profile?.displayName.trim().split(/\s+/)[0] ?? null;
  const filteredName =
    memberFilter === null ? null : (workload.find((e) => e.key === memberFilter)?.name ?? null);
  const segmentLabel = filteredName ?? (segment === 'mine' ? 'Moji zadaci' : 'Pregled');

  // --- Brzi unos: isti sheet i isti tok kao u Moj dan, startup je unapred izabran ---
  const [quickAddOpen, setQuickAddOpen] = useState(false);
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
        {/* Startup je isti za ceo ekran (zaglavlje Prostora ga nosi), pa bez čipa. */}
        <TaskRow row={row} now={now} showStartup={false} showStatus {...commands.rowActions} />
      </Animated.View>
    </StaggerItem>
  );

  const loading =
    command === undefined ||
    startup === undefined ||
    visibleTasks === undefined ||
    sections === undefined;
  const allEmpty = sections !== undefined && rowCount === 0;
  const startupReady = startup !== undefined;

  return (
    <View style={styles.root}>
      {/* Segment Pregled/Moji zadaci je prvi red sadržaja: zaglavlje Prostora već
          nosi segment „Komandni centar | Oblasti". */}
      <View style={styles.segmentRow}>
        <SegmentedControl options={TODAY_SEGMENTS} value={segment} onChange={setSegment} />
      </View>
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

      {allEmpty && memberFilter !== null ? (
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
        <LoadingSwap loading={loading} skeleton={<LoadingList />}>
          {sections === undefined ? null : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}>
              <DaySummary
                firstName={firstName}
                counts={summaryCounts}
                segmentLabel={segmentLabel}
              />
              {/* Promena segmenta ili filtera je NOVO punjenje liste — `resetKey`
                  restartuje stagger da se to i vidi. */}
              <StaggerGroup resetKey={`${segment}:${memberFilter ?? 'all'}`}>
                {sections.map((section) => {
                  if (section.rows.length === 0) return null;
                  const isBlocked = section.id === 'blocked';
                  const open = !isBlocked || blockedOpen;
                  return (
                    <View key={section.id} style={styles.section}>
                      <MeSectionHeader
                        title={SECTION_LABEL[section.id]}
                        count={section.rows.length}
                        tone={section.id === 'overdue' ? 'danger' : 'default'}
                        collapsible={isBlocked}
                        collapsed={!open}
                        onToggle={isBlocked ? () => setBlockedOpen((value) => !value) : undefined}
                      />
                      {open ? <View>{section.rows.map(renderRow)}</View> : null}
                    </View>
                  );
                })}
              </StaggerGroup>

              {/* `tasks.commandCenter` seče na 150 zadataka po statusu i to javi
                  kroz `hasMore`. Web to i prikazuje; mobilni je dosad tiho
                  odsecao, pa je lista izgledala potpuno a nije bila. */}
              {command?.hasMore ? (
                <Text style={[styles.truncated, { color: colors.mutedForeground }]}>
                  Prikazano je prvih 150 zadataka po statusu. Suzi filter ili
                  otvori oblast u Prostoru za pun spisak.
                </Text>
              ) : null}
            </ScrollView>
          )}
        </LoadingSwap>
      )}

      {startupReady ? (
        <QuickAddFab
          onPress={() => {
            haptics.tap();
            setQuickAddOpen(true);
          }}
        />
      ) : null}
      {/* „Završeno: …" i „Uklonjeno iz Moj dan" vraćaju se odavde (par web toasta). */}
      <UndoBar bottomOffset={72} />

      {commands.renderSheets((key) => findStartupRow(sections ?? [], key))}

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        now={now}
        startups={quickAdd.startups}
        preset={{ startupId }}
        readStored={readStoredDestination}
        rememberedArea={readLastArea}
        onSubmit={quickAdd.submit}
      />
    </View>
  );
}

/**
 * Skeleton u obliku onoga što stiže: pozdrav dana, pa naslov sekcije, pa redovi
 * zadatka sa istim merama kao pravi — prelaz je zato čist crossfade.
 */
function LoadingList() {
  return (
    <View style={styles.listContent}>
      <View style={styles.skeletonSummary}>
        <Skeleton width="55%" height={20} />
        <Skeleton width="35%" height={13} />
      </View>
      <Skeleton width="30%" height={13} style={styles.skeletonHeader} />
      <SkeletonList count={3} gap={10} item={(index) => <SkeletonTaskCard index={index} />} />
    </View>
  );
}

/** Granica greške samo za ovaj segment — ostatak Prostora radi dalje. */
class CommandCenterBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <CommandCenterErrorState
          message={accessErrorMessage(this.state.error, 'Došlo je do greške pri učitavanju zadataka.')}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/** `commandCenter`/`get` bacaju kad korisnik nije član startupa. */
function CommandCenterErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <EmptyState
      icon={<CalendarX2 size={40} color={colors.destructive} />}
      title="Zadaci se ne mogu učitati"
      description={message || 'Došlo je do greške pri učitavanju zadataka.'}
      actionLabel="Pokušaj ponovo"
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  truncated: {
    ...text.body,
    paddingHorizontal: space[4],
    paddingTop: space[3],
  },
  root: {
    flex: 1,
  },
  segmentRow: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[1],
  },
  listContent: {
    paddingHorizontal: 16,
    // IZMERENO na emulatoru (E11): sa 96 poslednja kartica na kraju skrola
    // završava ~47dp ISPOD vrha FAB-a (efektivni razmak ~25dp, ne 96). 160 daje
    // ≥ 8dp zazora iznad FAB-a (56 + bottom 16). Ne smanjuj bez merenja.
    paddingBottom: 160,
    gap: 20,
  },
  section: {
    gap: 4,
  },
  skeletonSummary: {
    gap: 8,
  },
  skeletonHeader: {
    marginBottom: 4,
  },
});
