import { rescheduleCandidates, type TaskRowModel } from '@devotion/shared';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AssigneeStack, type StackAssignee } from '@/components/danas/assignee-stack';
import { SectionChevron } from '@/components/me/section-header';
import { TaskRow } from '@/components/me/task-row';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonTaskRow } from '@/components/ui/skeletons';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text } from '@/theme/tokens';

import { BlockEmpty, BlockLinkRow, blockRowStyle, useBlockMotion } from './command-block-parts';
import {
  BLOCK_TEXT,
  buildTriageSections,
  filterTasksByMember,
  moreValue,
  rescheduleButtonLabel,
  staleLabel,
  triageEmptyText,
  triageGroups,
  UNASSIGNED_KEY,
  visibleTriageRows,
  type TriageGroupView,
  type TriageList,
} from './command-blocks-model';
import type { RegisterSections } from './command-sections';
import { RescheduleSheet } from './reschedule-sheet';
import type { StartupRowActions, StartupTaskCommands } from './use-startup-task-commands';
import { useTriageData } from './use-triage-data';

const TRIAGE_SECTION = 'trijaza';

/**
 * Trijaža (PROSTOR P10, K19): Prekoračeno · Danas · Sledeće · Blokirano (IZUZETAK od
 * weba, ostaju četiri mobilne grupe), po grupi najviše 5 redova i red „Sve u Zadacima".
 * Iz Prekoračenog je izdvojen skupljen red „Zastarelo · N" (dodir ga otvara). U zaglavlju
 * je „Sredi rokove · N" (samo kad ima prekoračenih). Prezentaciona: `groups === undefined`
 * je učitavanje; filter člana dolazi iz bloka Tim.
 */
export function TriageView({
  groups,
  filterName,
  rescheduleCount,
  staleOpen,
  now,
  rowActions,
  assigneesByTask,
  truncated,
  onToggleStale,
  onReschedule,
  onClearFilter,
  onOpenTasks,
}: {
  groups: ReadonlyArray<TriageGroupView> | undefined;
  /** Izabrani član iz bloka Tim (`null` = ceo tim). */
  filterName: string | null;
  rescheduleCount: number;
  staleOpen: boolean;
  now: number;
  rowActions: StartupRowActions;
  assigneesByTask: ReadonlyMap<string, StackAssignee[]>;
  /** `tasks.commandCenter` je presekao na 150 zadataka po statusu. */
  truncated: boolean;
  onToggleStale: () => void;
  onReschedule: () => void;
  onClearFilter: () => void;
  onOpenTasks: () => void;
}) {
  const colors = useThemeColors();
  const motion = useBlockMotion(
    visibleTriageRows(groups ?? [], staleOpen),
    `${filterName ?? 'svi'}:${groups === undefined ? 'ucitavanje' : 'spremno'}`,
  );

  // Indeks reda kroz celu Trijažu (ulaz kasni najviše za prvih 6 redova).
  let rowIndex = 0;
  const renderRow = (row: TaskRowModel) => {
    const assignees = assigneesByTask.get(row.id);
    return (
      <Animated.View
        key={row.key}
        entering={motion.entering(rowIndex++)}
        exiting={motion.exiting}
        layout={motion.layout}>
        <TaskRow
          row={row}
          now={now}
          showStartup={false}
          showStatus
          // Izvršioci na redu (kao web `AssigneeStack` u `extraMeta`); bez unosa u
          // odgovoru (granica od 300 ili učitavanje) — ništa.
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
          {...rowActions}
        />
      </Animated.View>
    );
  };
  const renderMore = (list: TriageList) =>
    list.more > 0 ? (
      <BlockLinkRow title={BLOCK_TEXT.allInTasks} value={moreValue(list.more)} onPress={onOpenTasks} />
    ) : null;

  return (
    <View>
      <SectionHeader
        title="Trijaža"
        action={
          rescheduleCount > 0 ? (
            <Button
              label={rescheduleButtonLabel(rescheduleCount)}
              accessibilityHint="Otvara izbor prekoračenih zadataka za novi rok"
              variant="secondary"
              size="md"
              onPress={() => {
                haptics.tap();
                onReschedule();
              }}
            />
          ) : undefined
        }
      />
      {groups === undefined ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje trijaže">
          <Skeleton width="28%" height={13} style={styles.skeletonLabel} />
          <SkeletonList count={3} item={(index) => <SkeletonTaskRow index={index} />} />
        </View>
      ) : groups.length === 0 ? (
        <BlockEmpty
          text={triageEmptyText(filterName)}
          actionLabel={filterName === null ? undefined : BLOCK_TEXT.showAll}
          onAction={filterName === null ? undefined : onClearFilter}
        />
      ) : (
        <>
          {filterName === null ? null : (
            <View style={styles.filterNote}>
              <Text numberOfLines={1} style={[styles.filterText, { color: colors.mutedForeground }]}>
                {`Prikazano: ${filterName}`}
              </Text>
              <Button label={BLOCK_TEXT.showAll} variant="ghost" size="md" onPress={onClearFilter} />
            </View>
          )}
          {groups.map((group) => (
            <Animated.View key={group.id} layout={motion.layout}>
              <GroupLabel title={group.title} count={group.count} danger={group.id === 'overdue'} />
              {group.list.rows.map(renderRow)}
              {renderMore(group.list)}
              {group.stale ? (
                <>
                  <Row
                    icon={<SectionChevron collapsed={!staleOpen} color={colors.mutedForeground} />}
                    title={staleLabel(group.stale.count)}
                    showChevron={false}
                    accessibilityLabel={`Zastarelo, ${group.stale.count}`}
                    accessibilityHint={staleOpen ? 'Sakriva zastarele zadatke' : 'Prikazuje zastarele zadatke'}
                    accessibilityState={{ expanded: staleOpen }}
                    onPress={() => {
                      haptics.select();
                      onToggleStale();
                    }}
                    style={styles.staleRow}
                  />
                  {staleOpen ? (
                    <>
                      {group.stale.rows.map(renderRow)}
                      {renderMore(group.stale)}
                    </>
                  ) : null}
                </>
              ) : null}
            </Animated.View>
          ))}
          {truncated ? (
            <Text style={[styles.truncated, { color: colors.mutedForeground }]}>
              Prikazano je prvih 150 zadataka po statusu. Pun spisak je u Zadacima.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Oznaka grupe (ispod naslova sekcije): meta nivo, normalna slova, broj uz nju. */
function GroupLabel({ title, count, danger }: { title: string; count: number; danger: boolean }) {
  const colors = useThemeColors();
  const color = danger ? colors.danger : colors.mutedForeground;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${count}`} style={styles.groupLabel}>
      <Text style={[styles.groupTitle, { color }]}>{title}</Text>
      <Text style={[styles.groupCount, { color }]}>{count}</Text>
    </View>
  );
}

/**
 * Kontejner: `tasks.commandCenter` + `taskAssignees.listForTasks` + `startups.listMembers`
 * + `startups.get` (`useTriageData`), filter člana, grupe i „Sredi rokove". Sekcije
 * (uključujući `stale`) se prijavljuju registru redova.
 */
export function TriageBlock({
  startupId,
  commands,
  memberFilter,
  onClearFilter,
  registerSections,
}: {
  startupId: Id<'startups'>;
  commands: StartupTaskCommands;
  memberFilter: string | null;
  onClearFilter: () => void;
  registerSections: RegisterSections;
}) {
  const router = useRouter();
  const data = useTriageData(startupId);
  const { now, plannedKeys, holds, pending } = commands;
  const [staleOpen, setStaleOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Filter člana sužava i grupe i „Sredi rokove": dugme radi nad onim što se vidi.
  const visibleTasks = useMemo(
    () => (data.tasks ? filterTasksByMember(data.tasks, data.assigneesByTask, memberFilter) : undefined),
    [data.tasks, data.assigneesByTask, memberFilter],
  );
  const sections = useMemo(
    () =>
      visibleTasks && data.startupMini && data.myId
        ? buildTriageSections(visibleTasks, now, {
            profileId: data.myId,
            startup: data.startupMini,
            areaLabels: data.areaLabels,
            assigneeIdsByTask: data.assigneeIdsByTask,
            assumeAssignee: false,
            plannedKeys,
            isManager: data.isManager,
            holds,
            pending,
          })
        : undefined,
    [visibleTasks, data.startupMini, data.myId, data.isManager, data.areaLabels, data.assigneeIdsByTask, now, plannedKeys, holds, pending],
  );
  useEffect(() => {
    registerSections(TRIAGE_SECTION, sections ?? null);
    return () => registerSections(TRIAGE_SECTION, null);
  }, [sections, registerSections]);

  const groups = useMemo(() => (sections ? triageGroups(sections) : undefined), [sections]);
  const candidates = useMemo(() => (visibleTasks ? rescheduleCandidates(visibleTasks, now) : []), [visibleTasks, now]);

  const filterName =
    memberFilter === null
      ? null
      : memberFilter === UNASSIGNED_KEY
        ? 'Nedodeljeno'
        : (data.members?.find((member) => member.profile._id === memberFilter)?.profile.displayName ??
          'Izabrani član');

  return (
    <View>
      <TriageView
        groups={groups}
        filterName={filterName}
        rescheduleCount={candidates.length}
        staleOpen={staleOpen}
        now={now}
        rowActions={commands.rowActions}
        assigneesByTask={data.assigneesByTask}
        truncated={data.hasMore}
        onToggleStale={() => setStaleOpen((value) => !value)}
        onReschedule={() => setRescheduleOpen(true)}
        onClearFilter={onClearFilter}
        onOpenTasks={() => router.push('/zadaci')}
      />
      <RescheduleSheet
        startupId={startupId}
        visible={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        candidates={candidates}
        now={now}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonLabel: {
    marginTop: 12,
    marginBottom: 4,
  },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  groupTitle: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  groupCount: {
    ...text.body,
    fontWeight: fontWeight.regular,
    fontVariant: ['tabular-nums'],
  },
  staleRow: {
    ...blockRowStyle,
    minHeight: MIN_TOUCH_TARGET,
  },
  filterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  filterText: {
    ...text.body,
    flexShrink: 1,
  },
  truncated: {
    ...text.body,
    paddingHorizontal: 4,
    paddingTop: 12,
  },
});
