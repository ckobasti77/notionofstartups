import type { TaskRowModel } from '@devotion/shared';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { TaskRow } from '@/components/me/task-row';
import { SectionHeader } from '@/components/ui/section-header';
import { SkeletonList, SkeletonTaskRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

import { BlockEmpty, BlockLinkRow, useBlockMotion } from './command-block-parts';
import {
  allMineLabel,
  BLOCK_TEXT,
  buildForYouSection,
  FOR_YOU_SECTION,
} from './command-blocks-model';
import type { RegisterSections } from './command-sections';
import type { StartupRowActions, StartupTaskCommands } from './use-startup-task-commands';

/**
 * „Za tebe" (PROSTOR P8, K19): moji otvoreni zadaci u ovom startupu — prekoračeno,
 * pa danas, pa u toku — najviše 5 redova i red „Svi moji zadaci · N". Prezentaciona:
 * `rows === undefined` je učitavanje. Redovi su isti `TaskRow` kao u Trijaži.
 */
export function ForYouView({
  rows,
  total,
  now,
  rowActions,
  onOpenAll,
}: {
  rows: ReadonlyArray<TaskRowModel> | undefined;
  total: number;
  now: number;
  rowActions: StartupRowActions;
  onOpenAll: () => void;
}) {
  const motion = useBlockMotion(rows?.length ?? 0, rows === undefined ? 'ucitavanje' : 'spremno');
  return (
    <View>
      <SectionHeader title="Za tebe" />
      {rows === undefined ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje tvojih zadataka">
          <SkeletonList count={3} item={(index) => <SkeletonTaskRow index={index} />} />
        </View>
      ) : rows.length === 0 ? (
        <BlockEmpty text={BLOCK_TEXT.forYouEmpty} />
      ) : (
        <>
          {rows.map((row, index) => (
            <Animated.View
              key={row.key}
              entering={motion.entering(index)}
              exiting={motion.exiting}
              layout={motion.layout}>
              {/* Startup je isti za ceo ekran (zaglavlje Prostora ga nosi), pa bez čipa. */}
              <TaskRow row={row} now={now} showStartup={false} showStatus {...rowActions} />
            </Animated.View>
          ))}
          {total > 0 ? (
            <View style={styles.link}>
              <BlockLinkRow title={allMineLabel(total)} onPress={onOpenAll} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * Kontejner: `tasks.listEverywhere({ scope: 'open', startupId })` → `forYouTasks`.
 * Redovi dobijaju prefiks ključa (`za-tebe:`) jer isti zadatak može biti i u
 * Trijaži; sekcija se prijavljuje registru da `locate`/`getRow` (zadržavanje posle
 * kvačice, sheetovi radnji) nađu red u obe liste.
 */
export function ForYouBlock({
  startupId,
  commands,
  registerSections,
}: {
  startupId: Id<'startups'>;
  commands: StartupTaskCommands;
  registerSections: RegisterSections;
}) {
  const router = useRouter();
  const result = useQuery(api.tasks.listEverywhere, { scope: 'open', startupId });
  const { now, plannedKeys, holds, pending } = commands;

  const built = useMemo(
    () => (result ? buildForYouSection(result.items, now, { plannedKeys, holds, pending }) : undefined),
    [result, now, plannedKeys, holds, pending],
  );
  useEffect(() => {
    registerSections(FOR_YOU_SECTION, built ? [built.section] : null);
    return () => registerSections(FOR_YOU_SECTION, null);
  }, [built, registerSections]);

  return (
    <ForYouView
      rows={built?.section.rows}
      total={built?.total ?? 0}
      now={now}
      rowActions={commands.rowActions}
      onOpenAll={() => router.push({ pathname: '/zadaci', params: { filter: 'moji' } })}
    />
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: 4,
  },
});
