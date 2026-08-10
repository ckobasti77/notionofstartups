import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  AtSign,
  BellRing,
  CalendarClock,
  CheckCheck,
  CheckSquare2,
  Flame,
  Gavel,
  Inbox,
  Lightbulb,
  MessageCircle,
  MessageSquare,
  Settings,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { notificationDestination } from '@/convex/lib/notificationTarget';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { formatActivityTime, formatDayHeading } from '@/lib/activity';
import { startOfLocalDay } from '@/lib/deadline';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { navigateToNotificationDestination } from '@/lib/notifications/navigate';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, space, type ColorTokens } from '@/theme/tokens';

const PAGE_SIZE = 25;

type NotificationItem = ReturnType<typeof useNotificationList>['results'][number];

function useNotificationList(startupId: Id<'startups'> | null) {
  return usePaginatedQuery(
    api.notifications.list,
    startupId ? { startupId } : 'skip',
    { initialNumItems: PAGE_SIZE },
  );
}

/** Ikonica po tipu — ogledalo `TYPE_ICON` iz web `notifications-panel.tsx`. */
const TYPE_ICON: Record<string, LucideIcon> = {
  task_assigned: CheckSquare2,
  task_status_changed: CheckSquare2,
  task_due_soon: CalendarClock,
  task_due_today: CalendarClock,
  task_overdue: Flame,
  idea_voted: Lightbulb,
  idea_converted: Sparkles,
  vote_requested: Gavel,
  request_resolved: Gavel,
  puls_ready: Sparkles,
  chat_message: MessageCircle,
  chat_mention: AtSign,
  chat_dm: MessageSquare,
};

/** Prekoračen rok je jedini tip koji sme da nosi crvenu (isto pravilo kao web). */
const LOUD_TYPES = new Set(['task_overdue']);

/**
 * Tab „Obaveštenja" — pandan web `notifications-panel` na ceo ekran
 * (docs/mobile/02-EKRANI.md §7). Deli backend sa webom: `notifications.list`
 * (paginirano), `unreadCount`, `markRead`, `markAllRead`.
 *
 * Razlike u odnosu na web, obe namerne:
 *  - **Nema `PushToggle`-a sa uključivanjem.** Na telefonu dozvolu traži
 *    `lib/notifications/register.ts` pri prijavi, a fina podešavanja (tipovi,
 *    zvuci, tihi sati, sistemske dozvole) žive na `/podesavanja-obavestenja`.
 *    Ovde stoji samo prečica ka tom ekranu — ista radnja, jedno mesto.
 *  - **Nema toasta za obaveštenje u prvom planu.** OS prikazuje sopstveni baner
 *    dok je aplikacija otvorena (`register.ts`), pa bi toast bio duplikat.
 *    Zato mobilni ne zove `notifications.latest`.
 */
export default function ObavestenjaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();
  const [now] = useState(() => Date.now());
  const [markingAll, setMarkingAll] = useState(false);

  const { results, status, loadMore } = useNotificationList(activeStartupId);
  const unread = useQuery(
    api.notifications.unreadCount,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const unreadCount = unread?.count ?? 0;
  const loadingFirst = activeStartupId === null || status === 'LoadingFirstPage';
  const sections = useMemo(() => groupByDay(results, now), [results, now]);
  const refreshControl = useListRefresh();

  const openNotification = useCallback(
    (item: NotificationItem) => {
      haptics.tap();
      // Označavanje je „ispali i zaboravi": navigacija ne sme da čeka mrežu, a
      // neuspeh (npr. offline) ne sme da sruši otvaranje cilja.
      if (item.readAt === null) {
        void markRead({ notificationId: item._id }).catch(() => {});
      }
      navigateToNotificationDestination(
        router,
        notificationDestination(item.targetType, item.targetId),
      );
    },
    [markRead, router],
  );

  const handleMarkAll = useCallback(async () => {
    if (activeStartupId === null || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllRead({ startupId: activeStartupId });
      haptics.success();
      AccessibilityInfo.announceForAccessibility('Sva obaveštenja su označena kao pročitana.');
    } catch (error) {
      haptics.error();
      AccessibilityInfo.announceForAccessibility(
        accessErrorMessage(error, 'Označavanje nije uspelo.'),
      );
    } finally {
      setMarkingAll(false);
    }
  }, [activeStartupId, markAllRead, markingAll, unreadCount]);

  return (
    <TabScreen
      title="Obaveštenja"
      actions={
        <>
          {/* Ikonica umesto tekstualnog dugmeta — naslov „Obaveštenja" je krupan
              (display) i tekst desno bi ga sabio ispod čitljive širine.
              Kad nema nepročitanih, dugme je onemogućeno umesto da tiho ne radi. */}
          <IconButton
            accessibilityLabel="Označi sve kao pročitano"
            accessibilityState={{ busy: markingAll }}
            disabled={unreadCount === 0 || markingAll}
            onPress={() => void handleMarkAll()}>
            <CheckCheck
              size={22}
              color={unreadCount === 0 || markingAll ? colors.subtle : colors.foreground}
            />
          </IconButton>
          <IconButton
            accessibilityLabel="Obaveštenja i zvuci"
            onPress={() => router.push('/podesavanja-obavestenja')}>
            <Settings size={22} color={colors.foreground} />
          </IconButton>
        </>
      }>
      {!loadingFirst && results.length === 0 ? (
        <EmptyState
          icon={<Inbox size={40} color={colors.mutedForeground} />}
          title="Sve je čisto."
          description="Nova obaveštenja o zadacima, glasanjima i porukama stižu ovde."
        />
      ) : (
        <LoadingSwap loading={loadingFirst} skeleton={<NotificationsSkeleton />}>
          {loadingFirst ? null : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item._id}
              renderItem={({ item, index }) => (
                <StaggerItem index={index}>
                  <NotificationRow item={item} colors={colors} onOpen={openNotification} />
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
                    <ActivityIndicator color={colors.primaryText} />
                  </View>
                ) : (
                  <View style={styles.footerSpacer} />
                )
              }
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + space[6] },
              ]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
            />
          )}
        </LoadingSwap>
      )}
    </TabScreen>
  );
}

/** „Danas" / „Juče" / datum — isto grupisanje kao ekran Aktivnost. */
function groupByDay(
  items: readonly NotificationItem[],
  now: number,
): Array<{ key: string; title: string; data: NotificationItem[] }> {
  const sections: Array<{ key: string; title: string; data: NotificationItem[] }> = [];
  let current: { key: string; title: string; data: NotificationItem[]; dayStart: number } | null =
    null;

  for (const item of items) {
    const dayStart = startOfLocalDay(item.createdAt);
    if (current === null || current.dayStart !== dayStart) {
      current = {
        key: String(dayStart),
        title: formatDayHeading(dayStart, now),
        data: [],
        dayStart,
      };
      sections.push(current);
    }
    current.data.push(item);
  }
  return sections;
}

function NotificationRow({
  item,
  colors,
  onOpen,
}: {
  item: NotificationItem;
  colors: ColorTokens;
  onOpen: (item: NotificationItem) => void;
}) {
  const Icon = TYPE_ICON[item.type] ?? BellRing;
  const unread = item.readAt === null;
  const loud = LOUD_TYPES.has(item.type);
  const tint = loud ? colors.danger : colors.primaryText;

  return (
    <Row
      style={[
        styles.row,
        unread && {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}
      icon={
        item.actor ? (
          <Avatar name={item.actor.displayName} uri={item.actor.avatarUrl} size={32} />
        ) : (
          <View style={[styles.rowIcon, { backgroundColor: `${tint}22` }]}>
            <Icon size={16} color={tint} />
          </View>
        )
      }
      title={item.title}
      titleNumberOfLines={2}
      subtitle={`${item.body ? `${item.body} · ` : ''}${formatActivityTime(item.createdAt)}`}
      // Bez ovoga bi čitač ekrana pročitao isti tekst za pročitano i nepročitano.
      accessibilityLabel={`${unread ? 'Nepročitano. ' : ''}${item.title}${
        item.body ? `. ${item.body}` : ''
      }. ${formatActivityTime(item.createdAt)}`}
      accessibilityHint="Otvara ono na šta se obaveštenje odnosi"
      value={
        unread ? (
          <View
            style={[styles.unreadDot, { backgroundColor: colors.primaryText }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : undefined
      }
      showChevron={false}
      onPress={() => onOpen(item)}
    />
  );
}

/** Oblik `NotificationRow`: čip/avatar + dva reda teksta + tačka nepročitanog. */
function NotificationsSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLabel="Učitavanje obaveštenja"
      accessibilityLiveRegion="polite">
      <Skeleton width="30%" height={14} style={styles.skeletonHead} />
      <SkeletonList
        count={5}
        gap={space[4]}
        item={(index) => (
          <View style={styles.skeletonRow}>
            <Skeleton width={32} height={32} borderRadius={radius.md} />
            <View style={styles.skeletonBody}>
              <Skeleton width={index % 2 === 0 ? '78%' : '60%'} height={15} />
              <Skeleton width="45%" height={12} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ObavestenjaErrorState message={error.message} onRetry={retry} />;
}

function ObavestenjaErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Obaveštenja" />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Obaveštenja se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju obaveštenja.'}
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
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.card,
    borderColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
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
