import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLiveNow } from '@/components/collab/use-live-now';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

import { ActivityRow, openActivityTarget } from './activity-row';
import { BlockEmpty, BlockLinkRow } from './command-block-parts';
import { activityRowModel, BLOCK_TEXT, RECENT_LIMIT, type ActivityRowModel } from './command-blocks-model';

/**
 * „Nedavne izmene" (PROSTOR P24, K19): poslednjih 5 izmena u startupu — rečenica i
 * „pre N" iz shared-a, dodir vodi na stranicu, ideju ili oblast, a „Sva aktivnost"
 * na ekran Aktivnost. Prezentaciona: `rows === undefined` je učitavanje.
 */
export function RecentChangesView({
  rows,
  onOpen,
  onOpenAll,
}: {
  rows: ReadonlyArray<ActivityRowModel> | undefined;
  onOpen: (target: ActivityRowModel['target']) => void;
  onOpenAll: () => void;
}) {
  return (
    <View>
      <SectionHeader title="Nedavne izmene" />
      {rows === undefined ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje nedavnih izmena">
          <SkeletonList
            count={3}
            item={() => (
              <View style={styles.skeletonRow}>
                <Skeleton width={20} height={20} borderRadius={6} />
                <View style={styles.skeletonBody}>
                  <Skeleton width="82%" height={16} />
                  <Skeleton width="30%" height={13} />
                </View>
              </View>
            )}
          />
        </View>
      ) : rows.length === 0 ? (
        <BlockEmpty text={BLOCK_TEXT.recentEmpty} />
      ) : (
        <>
          {rows.map((model) => (
            <ActivityRow key={model.id} model={model} onOpen={onOpen} />
          ))}
          <BlockLinkRow title={BLOCK_TEXT.allActivity} onPress={onOpenAll} />
        </>
      )}
    </View>
  );
}

/**
 * Kontejner: `activity.listPaginated` (samo prva strana, 5 izmena) kroz običan
 * `useQuery`. Vreme „pre N" tiče na 30 s (`useLiveNow`), upit ne čita sat.
 */
export function RecentChangesBlock({ startupId }: { startupId: Id<'startups'> }) {
  const router = useRouter();
  const now = useLiveNow();
  const result = useQuery(api.activity.listPaginated, {
    startupId,
    paginationOpts: { numItems: RECENT_LIMIT, cursor: null },
  });
  const rows = useMemo(
    () => result?.page.slice(0, RECENT_LIMIT).map((item) => activityRowModel(item, now)),
    [result, now],
  );
  return (
    <RecentChangesView
      rows={rows}
      onOpen={(target) => openActivityTarget(router, target)}
      onOpenAll={() => router.push('/aktivnost')}
    />
  );
}

const styles = StyleSheet.create({
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  skeletonBody: {
    flex: 1,
    gap: 6,
  },
});
