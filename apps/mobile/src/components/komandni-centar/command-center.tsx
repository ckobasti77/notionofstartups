import { findStartupRow, locateStartupRow, type StartupMini, type TaskRowModel } from '@devotion/shared';
import { useQuery } from 'convex/react';
import { CalendarX2, ListTodo } from 'lucide-react-native';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AssigneeStack } from '@/components/danas/assignee-stack';
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
import { exitFade, listLayout, useListEntering } from '@/components/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonTaskCard } from '@/components/ui/skeletons';
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
import type { CommandCenterTask } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { space, text } from '@/theme/tokens';

import { buildCommandSections, COMMAND_CENTER_LIST, sectionRowCount } from './startup-task-model';
import { useStartupTaskCommands } from './use-startup-task-commands';

/** Ogledalo `MAX_ASSIGNEE_LOOKUP_PAGES` u `taskAssignees.ts`. */
const MAX_ASSIGNEE_LOOKUP = 300;

type CommandListItem =
  | { kind: 'header'; key: string; id: TodaySection; count: number; open: boolean }
  | { kind: 'row'; key: string; row: TaskRowModel };

const SECTION_LABEL: Record<TodaySection, string> = {
  overdue: 'Prekoračeno',
  today: 'Danas',
  next: 'Sledeće',
  blocked: 'Blokirano',
};

/**
 * Komandni centar startupa (docs/mobile/02-EKRANI.md §4) — do LICNO K09 je to bio
 * tab „Danas"; od PROSTOR K09 je to SAMA početna taba Prostor (P18, plan K07
 * §4.2): bez segmenata Pregled/Moji zadaci, a iznad blokova stoje redovi Prostora
 * (`header`; „Moji" su sada filter u Zadacima). Od K18 (par web K17) redovi su zajednički red
 * zadatka (`TaskRow` nad `TaskRowModel`): swipe desno = završi sa „Poništi",
 * swipe levo = „Rok i plan", dugi pritisak = radnje (status, rok, prioritet,
 * „Dodaj u Moj dan", „Priključi se"), dodir = panel zadatka sa „Puni prikaz".
 * Mutacije i dozvole su iste kao na webu i u Moj dan (`useStartupTaskCommands`).
 * Brzi unos je isti sheet kao u Moj dan, sa unapred izabranim startupom.
 * Traka opterećenja i sekcije prekoračeno → danas → sledeće → blokirano ostaju
 * (blokove 2.0 pravi K19). Bez kanbana — svajp lista.
 *
 * Greška upita (npr. korisnik više nije član) ostaje u blokovima
 * (`CommandCenterBoundary`): redovi Prostora (`header`, `footer`) ostaju na
 * ekranu i rade dalje.
 */
export function CommandCenter({
  startupId,
  header,
  footer,
}: {
  startupId: Id<'startups'>;
  /** Iznad blokova, u istom skrolu (redovi Prostora, plan K07 E4). */
  header?: ReactNode;
  /** Ispod blokova (privremeni redovi Puls/Aktivnost do K19). */
  footer?: ReactNode;
}) {
  return (
    <CommandCenterBoundary
      key={startupId}
      fallback={(error, retry) => (
        <ScrollView contentContainerStyle={styles.fallbackContent} showsVerticalScrollIndicator={false}>
          {header}
          <View style={styles.fallbackError}>
            <CommandCenterErrorState
              message={accessErrorMessage(error, 'Došlo je do greške pri učitavanju zadataka.')}
              onRetry={retry}
            />
          </View>
          {footer ? <View style={styles.footerWrap}>{footer}</View> : null}
        </ScrollView>
      )}>
      <CommandCenterBody startupId={startupId} header={header} footer={footer} />
    </CommandCenterBoundary>
  );
}

function CommandCenterBody({
  startupId,
  header,
  footer,
}: {
  startupId: Id<'startups'>;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
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

  // Filter po članu iz trake opterećenja („Moji" su od K09 filter u Zadacima).
  const visibleTasks = useMemo<CommandCenterTask[] | undefined>(() => {
    if (tasks === undefined) return undefined;
    if (memberFilter === null) return tasks;
    if (memberFilter === UNASSIGNED_KEY) {
      return tasks.filter((task) => assigneesByTask.get(task._id)?.length === 0);
    }
    return tasks.filter((task) =>
      (assigneesByTask.get(task._id) ?? []).some((a) => a.profileId === memberFilter),
    );
  }, [tasks, memberFilter, assigneesByTask]);

  // Redovi po sekcijama: zajednički `TaskRowModel` (dozvole, plan, zadržavanje).
  const sections = useMemo(
    () =>
      visibleTasks && startupMini && myId
        ? buildCommandSections(visibleTasks, now, {
            profileId: myId,
            startup: startupMini,
            areaLabels,
            assigneeIdsByTask,
            assumeAssignee: false,
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
      commands.plannedKeys,
      commands.holds,
      commands.pending,
    ],
  );
  useEffect(() => {
    sectionsRef.current = sections ?? [];
  }, [sections]);

  // Brojači za `DaySummary` — isti skup zadataka koji je i u listi, pa se pozdrav i
  // lista ne mogu razići (filter člana sužava oba).
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
  // Na šta se brojači odnose (čitač ekrana): izabran član ili ceo tim.
  const segmentLabel = filteredName ?? 'ceo tim';

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
  // Granica E12 važi i za izlaz (kao „Svi zadaci” i Moj dan).
  const exiting = rowCount <= LAYOUT_ANIMATION_MAX_ROWS ? exitFade(reduced) : undefined;
  // Ulaz iz rečnika (`components/motion`, 24 ms): prvo punjenje i promena
  // filtera člana su novo punjenje liste.
  const entering = useListEntering(
    reduced,
    `${memberFilter ?? 'all'}:${sections === undefined ? 'ucitavanje' : 'spremno'}`,
  );
  // Spljoštena lista (zaglavlja + redovi) za virtualizaciju: do 150 zadataka po
  // statusu je do 600 teških redova (swipe, kvačica, layout), pa ne ScrollView.
  const listItems = useMemo<CommandListItem[]>(() => {
    if (!sections) return [];
    return sections.flatMap((section): CommandListItem[] => {
      if (section.rows.length === 0) return [];
      const open = section.id !== 'blocked' || blockedOpen;
      return [
        { kind: 'header', key: `sekcija:${section.id}`, id: section.id, count: section.rows.length, open },
        ...(open ? section.rows.map((row): CommandListItem => ({ kind: 'row', key: row.key, row })) : []),
      ];
    });
  }, [sections, blockedOpen]);

  const renderRow = (row: TaskRowModel, index: number) => {
    // Izvršioci na redu (kao web `AssigneeStack` u `extraMeta` i stara kartica pre
    // K18); bez unosa u odgovoru (granica od 300 ili učitavanje) — ništa.
    const assignees = assigneesByTask.get(row.id as Id<'pages'>);
    return (
      <Animated.View entering={entering(index)} exiting={exiting}>
        {/* Startup je isti za ceo ekran (zaglavlje Prostora ga nosi), pa bez čipa. */}
        <TaskRow
          row={row}
          now={now}
          showStartup={false}
          showStatus
          extraMeta={
            assignees === undefined ? undefined : (
              <AssigneeStack assignees={assignees} size={20} accessible={false} />
            )
          }
          extraMetaLabel={
            assignees === undefined
              ? undefined
              : assignees.length === 0
                ? 'nedodeljeno'
                : `izvršioci: ${assignees.map((a) => a.displayName).join(', ')}`
          }
          {...commands.rowActions}
        />
      </Animated.View>
    );
  };

  const loading =
    command === undefined ||
    startup === undefined ||
    visibleTasks === undefined ||
    sections === undefined;
  const allEmpty = sections !== undefined && rowCount === 0;
  const startupReady = startup !== undefined;

  // Prazno stanje i učitavanje stoje U listi (`ListEmptyComponent`), ne umesto
  // nje: redovi Prostora (`header`) i traka opterećenja moraju ostati na ekranu i
  // dok zadaci stižu i kad filter isprazni listu (dugme „Prikaži sve").
  const emptyBody = loading ? (
    <LoadingList />
  ) : allEmpty && memberFilter !== null ? (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon={<ListTodo size={40} color={colors.mutedForeground} />}
        title="Za izabranog člana nema otvorenih zadataka"
        description="Filter je uključen u traci opterećenja iznad."
        actionLabel="Prikaži sve"
        onAction={() => setMemberFilter(null)}
      />
    </View>
  ) : allEmpty ? (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon={<ListTodo size={40} color={colors.mutedForeground} />}
        title="Nema otvorenih zadataka"
        description="Otvoreni zadaci tima pojaviće se ovde."
        actionLabel="Brzi unos"
        onAction={() => setQuickAddOpen(true)}
      />
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <Animated.FlatList
        data={loading ? [] : listItems}
        keyExtractor={(item) => item.key}
        itemLayoutAnimation={layout}
        initialNumToRender={16}
        contentContainerStyle={styles.flatContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <>
            {header}
            {/* Traka opterećenja je FILTER: ide pre liste, a kad filter isprazni
                listu, ostaje na ekranu sa „Prikaži sve" ispod. Lista ima svoj
                horizontalni razmak, pa traka (koja ga nosi sama) izlazi do ivica. */}
            {startupReady ? (
              <View style={styles.workloadWrap}>
                <WorkloadStrip
                  entries={workload}
                  totalOpen={tasks?.length ?? 0}
                  activeKey={memberFilter}
                  onSelect={setMemberFilter}
                  loading={members === undefined || command === undefined}
                />
              </View>
            ) : null}
            {!loading && !allEmpty ? (
              <View style={styles.summaryWrap}>
                <DaySummary firstName={firstName} counts={summaryCounts} segmentLabel={segmentLabel} />
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={emptyBody}
        renderItem={({ item, index }) =>
          item.kind === 'header' ? (
            <Animated.View
              entering={entering(index)}
              exiting={exiting}
              style={index === 0 ? styles.sectionHeaderFirst : styles.sectionHeader}>
              <MeSectionHeader
                title={SECTION_LABEL[item.id]}
                count={item.count}
                tone={item.id === 'overdue' ? 'danger' : 'default'}
                collapsible={item.id === 'blocked'}
                collapsed={!item.open}
                onToggle={item.id === 'blocked' ? () => setBlockedOpen((value) => !value) : undefined}
              />
            </Animated.View>
          ) : (
            renderRow(item.row, index)
          )
        }
        ListFooterComponent={
          <>
            {/* `tasks.commandCenter` seče na 150 zadataka po statusu i to javi
                kroz `hasMore` (isto kao web). */}
            {command?.hasMore ? (
              <Text style={[styles.truncated, styles.truncatedGap, { color: colors.mutedForeground }]}>
                Prikazano je prvih 150 zadataka po statusu. Pun spisak je u Zadacima.
              </Text>
            ) : null}
            {footer ? <View style={styles.footerWrap}>{footer}</View> : null}
          </>
        }
      />

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
    <View
      style={styles.loadingList}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje zadataka">
      <View style={styles.skeletonSummary}>
        <Skeleton width="55%" height={20} />
        <Skeleton width="35%" height={13} />
      </View>
      <Skeleton width="30%" height={13} style={styles.skeletonHeader} />
      <SkeletonList count={3} gap={10} item={(index) => <SkeletonTaskCard index={index} />} />
    </View>
  );
}

/**
 * Granica greške samo za blokove: `fallback` crta redove Prostora oko greške, pa
 * ostatak Prostora radi dalje.
 */
class CommandCenterBoundary extends Component<
  { children: ReactNode; fallback: (error: Error, retry: () => void) => ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, () => this.setState({ error: null }));
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
  // Skeleton stoji u listi (ispod redova Prostora), pa nema svoj okvir ekrana.
  loadingList: {
    paddingTop: 24,
    gap: 20,
  },
  // Lista je virtualizovana (`Animated.FlatList`): `gap` bi važio između SVIH
  // ćelija, pa razmaci idu kroz zaglavlja (20 između sekcija, 4 do redova).
  flatContent: {
    paddingHorizontal: 16,
    // IZMERENO na emulatoru (E11): sa 96 poslednja kartica na kraju skrola
    // završava ~47dp ISPOD vrha FAB-a (efektivni razmak ~25dp, ne 96). 160 daje
    // ≥ 8dp zazora iznad FAB-a (56 + bottom 16). Ne smanjuj bez merenja.
    paddingBottom: 160,
  },
  // Isti okvir kad blokovi padnu (`fallback`): redovi Prostora + greška.
  fallbackContent: {
    paddingHorizontal: 16,
    paddingBottom: 160,
  },
  fallbackError: {
    paddingVertical: 24,
  },
  // Traka opterećenja nosi svoj `paddingHorizontal: 16` — poništava razmak liste.
  // Razmak između sekcija je 24 (DIZAJN-SMIRENJE §3): redovi Prostora → blokovi.
  workloadWrap: {
    marginHorizontal: -16,
    marginTop: 24,
  },
  emptyWrap: {
    paddingVertical: 24,
  },
  footerWrap: {
    marginTop: 24,
  },
  summaryWrap: {
    marginBottom: 20,
  },
  sectionHeaderFirst: {
    marginBottom: 4,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 4,
  },
  truncatedGap: {
    marginTop: 20,
  },
  skeletonSummary: {
    gap: 8,
  },
  skeletonHeader: {
    marginBottom: 4,
  },
});
