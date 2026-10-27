import { usePaginatedQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Activity, TriangleAlert } from 'lucide-react-native';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLiveNow } from '@/components/collab/use-live-now';
import { EmptyState } from '@/components/empty-state';
import { ActivityRow, openActivityTarget } from '@/components/komandni-centar/activity-row';
import { activityRowModel } from '@/components/komandni-centar/command-blocks-model';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { groupActivitiesByDay } from '@/lib/activity';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';
import { accessErrorMessage } from '@/lib/errors';

const PAGE_SIZE = 30;

/**
 * Ekran „Aktivnost" — hronološki trag promena tima (docs/mobile/02-EKRANI.md #8).
 * Paginirano preko `activity.listPaginated` (najnovije prvo), grupisano po danu.
 * Od PROSTOR K19 red je rečenica iz shared `formatActivity` sa vremenom
 * `formatEditTime` i vodi kroz `activityTarget` — isto kao blok „Nedavne izmene" u
 * Komandnom centru (`ActivityRow`). Samo za čitanje; deli backend sa webom.
 */
export default function AktivnostScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();
  const now = useLiveNow();

  const { results, status, loadMore } = usePaginatedQuery(
    api.activity.listPaginated,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
    { initialNumItems: PAGE_SIZE },
  );

  const loadingFirst = activeStartupId === null || status === 'LoadingFirstPage';
  const sections = groupActivitiesByDay(results, now);
  const refreshControl = useListRefresh();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Aktivnost" onBack={() => router.back()} />

      {!loadingFirst && results.length === 0 ? (
        <EmptyState
          icon={<Activity size={40} color={colors.mutedForeground} />}
          title="Nema aktivnosti."
        />
      ) : (
        <LoadingSwap loading={loadingFirst} skeleton={<ActivitySkeleton />}>
          {loadingFirst ? null : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item._id}
              // `index` je po sekciji, pa je stagger po danu — što je i tačno:
              // dan je vizuelna celina.
              renderItem={({ item, index }) => (
                <StaggerItem index={index}>
                  <ActivityRow
                    model={activityRowModel(item, now)}
                    onOpen={(target) => openActivityTarget(router, target)}
                    style={styles.row}
                  />
                </StaggerItem>
              )}
              renderSectionHeader={({ section }) => (
                <SectionHeader
                  title={section.title}
                  style={[styles.dayHeader, { backgroundColor: colors.background }]}
                />
              )}
              stickySectionHeadersEnabled
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
              }}
              ListFooterComponent={
                status === 'LoadingMore' ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <View style={styles.footerSpacer} />
                )
              }
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + space[6] }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
            />
          )}
        </LoadingSwap>
      )}
    </View>
  );
}

/** Oblik `ActivityRow`: zaglavlje dana, pa ikonica + dva reda teksta. */
function ActivitySkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje aktivnosti">
      <Skeleton width="30%" height={14} style={styles.skeletonHead} />
      <SkeletonList
        count={5}
        gap={space[4]}
        item={(index) => (
          <View style={styles.skeletonRow}>
            <Skeleton width={20} height={20} borderRadius={radius.sm} />
            <View style={styles.skeletonBody}>
              <Skeleton width={index % 2 === 0 ? '75%' : '62%'} height={15} />
              <Skeleton width="45%" height={12} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AktivnostErrorState message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

function AktivnostErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Aktivnost" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Aktivnost nije učitana."
        description={message || 'Proveri vezu i pokušaj ponovo.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: space[4],
  },
  dayHeader: {
    paddingTop: space[2],
  },
  row: {
    gap: space[3],
    minHeight: 56,
    paddingVertical: space[1],
    // Horizontalni razmak nosi lista (listContent), pa red poništava podrazumevani
    // paddingHorizontal iz <Row> da se ne dupla uvlačenje.
    paddingHorizontal: 0,
  },
  footer: {
    paddingVertical: space[4],
    alignItems: 'center',
  },
  footerSpacer: {
    height: space[2],
  },
  skeleton: {
    paddingHorizontal: space[4],
    paddingTop: space[4],
  },
  skeletonHead: {
    marginBottom: space[1],
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  skeletonBody: {
    flex: 1,
    gap: 8,
  },
});
