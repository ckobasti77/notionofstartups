import { usePaginatedQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  Activity,
  Building2,
  FileText,
  FolderTree,
  Mail,
  PenLine,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import {
  formatActivityTime,
  groupActivitiesByDay,
  type ActivityItem,
} from '@/lib/activity';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, space, type ColorTokens } from '@/theme/tokens';

const PAGE_SIZE = 30;

/** Ikona i boja po vrsti radnje — kategorije iz `activities.action`. */
function actionVisual(action: ActivityItem['action'], colors: ColorTokens): {
  Icon: LucideIcon;
  tint: string;
} {
  if (action.startsWith('page_')) return { Icon: FileText, tint: colors.info };
  if (action === 'task_updated') return { Icon: FileText, tint: colors.primary };
  if (action.startsWith('member_')) return { Icon: Users, tint: colors.info };
  if (action.startsWith('invite_')) return { Icon: Mail, tint: colors.primary };
  if (action.startsWith('deletion_')) return { Icon: Vote, tint: colors.destructive };
  if (action.startsWith('nesting_')) return { Icon: FolderTree, tint: colors.warning };
  if (action.startsWith('contribution_')) return { Icon: PenLine, tint: colors.info };
  if (action === 'content_recovered') return { Icon: RotateCcw, tint: colors.success };
  if (action === 'content_soft_deleted') return { Icon: Trash2, tint: colors.destructive };
  return { Icon: Building2, tint: colors.primary };
}

/**
 * Ekran „Aktivnost" — hronološki trag promena tima (docs/mobile/02-EKRANI.md #8).
 * Paginirano preko `activity.listPaginated` (najnovije prvo), grupisano po danu.
 * Samo za čitanje; deli backend sa webom.
 */
export default function AktivnostScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();
  const [now] = useState(() => Date.now());

  const { results, status, loadMore } = usePaginatedQuery(
    api.activity.listPaginated,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
    { initialNumItems: PAGE_SIZE },
  );

  const loadingFirst = activeStartupId === null || status === 'LoadingFirstPage';
  const sections = groupActivitiesByDay(results, now);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Aktivnost" onBack={() => router.back()} />

      {loadingFirst ? (
        <ActivitySkeleton colors={colors} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<Activity size={40} color={colors.mutedForeground} />}
          title="Još nema aktivnosti"
          description="Kreiranje stranice, zadatka ili poziva pojaviće se ovde."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <ActivityRow item={item} colors={colors} />}
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
        />
      )}
    </View>
  );
}

function ActivityRow({ item, colors }: { item: ActivityItem; colors: ColorTokens }) {
  const { Icon, tint } = actionVisual(item.action, colors);
  return (
    <Row
      style={styles.row}
      icon={
        <View style={[styles.rowIcon, { backgroundColor: `${tint}22` }]}>
          <Icon size={16} color={tint} />
        </View>
      }
      title={item.title}
      titleNumberOfLines={2}
      subtitle={`${item.detail ? `${item.detail} · ` : ''}${formatActivityTime(item.createdAt)}`}
      value={
        item.actor ? (
          <Avatar name={item.actor.displayName} uri={item.actor.avatarUrl} size={28} />
        ) : undefined
      }
    />
  );
}

function ActivitySkeleton({ colors }: { colors: ColorTokens }) {
  return (
    <View style={styles.skeleton} accessibilityLabel="Učitavanje aktivnosti">
      <Skeleton width="30%" height={14} style={styles.skeletonHead} />
      {[0, 1, 2, 3, 4].map((item) => (
        <View key={item} style={styles.skeletonRow}>
          <Skeleton width={32} height={32} borderRadius={radius.md} />
          <View style={styles.skeletonBody}>
            <Skeleton width="75%" height={15} />
            <Skeleton width="45%" height={12} />
          </View>
          <Skeleton width={28} height={28} borderRadius={radius.full} />
        </View>
      ))}
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AktivnostErrorState message={error.message} onRetry={retry} />;
}

function AktivnostErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Aktivnost" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Aktivnost se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju aktivnosti.'}
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
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: space[4],
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
