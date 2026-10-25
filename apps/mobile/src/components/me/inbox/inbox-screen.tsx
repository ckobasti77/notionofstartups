import { useMutation, usePaginatedQuery } from 'convex/react';
import {
  inboxFeedArgs,
  inboxMarkAllArgs,
  inboxMarkedMessage,
  inboxScopeKey,
  inboxTarget,
  type InboxScope,
  type InboxSegment,
  type InboxTarget,
  type StartupMini,
} from '@devotion/shared';
import { useRouter } from 'expo-router';
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { notificationDestination, type NotificationDestination } from '@/convex/lib/notificationTarget';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useQueryState } from '@/hooks/use-query-state';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useToday } from '@/hooks/use-today';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { navigateToNotificationDestination } from '@/lib/notifications/navigate';

import {
  InboxView,
  type InboxFeedState,
  type InboxItemModel,
  type InboxPendingModel,
  type InboxPendingState,
} from './inbox-view';

const PAGE_SIZE = 25;

type FeedArgs = { startupId?: Id<'startups'> | null; unreadOnly?: boolean };

/**
 * Tab „Inbox" (K14), par web `InboxContainer`: `inbox.feed` (paginirano),
 * `inbox.unreadCounts`, `inbox.pending` i `inbox.markAllRead`. Dodir na red
 * označi pročitano pa otvara cilj kroz `inboxTarget` (ista logika kao web);
 * startup cilj prvo menja aktivan startup (ekrani entiteta ga čitaju), lični
 * razgovor ide na `razgovor/[id]` BEZ promene startupa. Greška feed-a (baca je
 * `usePaginatedQuery`) i greška „Čeka tebe" su odvojene. „Pokušaj ponovo"
 * ponovo montira ekran (nova pretplata).
 */
export function InboxScreen() {
  const [attempt, setAttempt] = useState(0);
  // Segment i opseg žive iznad ponovnog montiranja: „Pokušaj ponovo“ ih ne vraća na „Sve / Svi“.
  const [segment, setSegment] = useState<InboxSegment>('all');
  const [scope, setScope] = useState<InboxScope>({ kind: 'all' });
  return (
    <InboxContent
      key={attempt}
      retry={() => setAttempt((value) => value + 1)}
      segment={segment}
      setSegment={setSegment}
      scope={scope}
      setScope={setScope}
    />
  );
}

function InboxContent({
  retry,
  segment,
  setSegment,
  scope,
  setScope,
}: {
  retry: () => void;
  segment: InboxSegment;
  setSegment: (segment: InboxSegment) => void;
  scope: InboxScope;
  setScope: (scope: InboxScope) => void;
}) {
  const router = useRouter();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const today = useToday();
  const [markingAll, setMarkingAll] = useState(false);

  const {
    results: startupResults,
    status: startupsStatus,
    loadMore: loadMoreStartups,
  } = usePaginatedQuery(api.startups.listForCurrent, {}, { initialNumItems: 50 });
  // Čipovi opsega moraju da obuhvate SVE startupe (lista se dovlači do kraja).
  useEffect(() => {
    if (startupsStatus === 'CanLoadMore') loadMoreStartups(50);
  }, [startupsStatus, loadMoreStartups]);
  const startups = useMemo<StartupMini[]>(
    () => startupResults.map((item) => ({ _id: item._id, name: item.name, logoUrl: item.logoUrl })),
    [startupResults],
  );
  const counts = useQueryTolerant(api.inbox.unreadCounts, {}) ?? null;
  const pendingQuery = useQueryState(api.inbox.pending, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.inbox.markAllRead);
  const refreshControl = useListRefresh();

  // Čip koji više ne postoji (napušten startup) vraća prikaz na „Svi".
  const effectiveScope: InboxScope =
    // Dok se lista startupa učitava, izabrani čip se ne dira (nema trke ka „Svi“).
    scope.kind === 'startup' &&
    startupsStatus !== 'LoadingFirstPage' &&
    startupsStatus !== 'CanLoadMore' &&
    startupsStatus !== 'LoadingMore' &&
    !startups.some((startup) => startup._id === scope.startupId)
      ? { kind: 'all' }
      : scope;

  const pending: InboxPendingState =
    pendingQuery.status === 'loading'
      ? { status: 'loading' }
      : pendingQuery.status === 'error'
        ? { status: 'error', retry }
        : {
            status: 'ready',
            items: pendingQuery.data.items as ReadonlyArray<InboxPendingModel>,
            truncated: pendingQuery.data.truncated,
          };

  const navigate = useCallback(
    (target: InboxTarget<NotificationDestination>) => {
      if (target.kind === 'none') return;
      if (target.kind === 'personal-chat') {
        // Lični razgovor se otvara po id-ju, van startupa (aktivan startup ostaje).
        navigateToNotificationDestination(
          router,
          notificationDestination('chat', target.channelId, null),
        );
        return;
      }
      // Ekrani entiteta čitaju aktivan startup, pa se postavlja PRE navigacije;
      // isti startup se ne postavlja ponovo (promena briše traku „Poništi").
      if (target.startupId !== activeStartupId) {
        setActiveStartupId(target.startupId as Id<'startups'>);
      }
      navigateToNotificationDestination(router, target.destination);
    },
    [activeStartupId, router, setActiveStartupId],
  );

  const open = (item: InboxItemModel) => {
    if (item.readAt === null) {
      // „Ispali i zaboravi": navigacija ne sme da čeka mrežu, a neuspeh (offline)
      // ne sme da sruši otvaranje cilja.
      void markRead({ notificationId: item._id as Id<'notifications'> }).catch(() => {});
    }
    const target = inboxTarget(item, notificationDestination);
    if (target.kind === 'none') {
      // Par web toasta: lično obaveštenje bez odredišta samo se označi pročitano.
      Alert.alert('Nema odredišta', 'Ovo obaveštenje nema odredište. Označeno je kao pročitano.');
      return;
    }
    navigate(target);
  };

  const markOne = (item: InboxItemModel) => {
    void markRead({ notificationId: item._id as Id<'notifications'> }).catch((error: unknown) => {
      haptics.error();
      Alert.alert('Označavanje nije uspelo', accessErrorMessage(error, 'Pokušaj ponovo.'));
    });
  };

  const openPending = (item: InboxPendingModel) => {
    navigate(
      inboxTarget(
        { targetType: item.targetType, targetId: item.targetId, startupId: item.startup._id },
        notificationDestination,
      ),
    );
  };

  const markAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const result = await markAllRead(
        inboxMarkAllArgs(effectiveScope) as { startupId?: Id<'startups'> | null },
      );
      haptics.success();
      AccessibilityInfo.announceForAccessibility(inboxMarkedMessage(result));
    } catch (error) {
      haptics.error();
      // Vidljivo svima, ne samo čitaču ekrana (Alert ga i najavi).
      Alert.alert('Označavanje nije uspelo', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setMarkingAll(false);
    }
  };

  const renderView = (feed: InboxFeedState) => (
    <InboxView
      now={today.now}
      segment={segment}
      onSegmentChange={setSegment}
      scope={effectiveScope}
      onScopeChange={setScope}
      startups={startups}
      counts={counts}
      feed={feed}
      pending={pending}
      onOpen={open}
      onMarkRead={markOne}
      onOpenPending={openPending}
      onMarkAllRead={() => void markAll()}
      markingAll={markingAll}
      onOpenSettings={() => router.push('/podesavanja-obavestenja')}
      refreshControl={refreshControl}
    />
  );

  return (
    <FeedBoundary
      retry={retry}
      render={renderView}
      resetKey={`${segment}|${inboxScopeKey(effectiveScope)}`}>
      <FeedBridge args={inboxFeedArgs(effectiveScope, segment) as FeedArgs} render={renderView} />
    </FeedBoundary>
  );
}

/** Pretplata na feed; stanje daje prikazu (bacanje greške hvata `FeedBoundary`). */
function FeedBridge({
  args,
  render,
}: {
  args: FeedArgs;
  render: (feed: InboxFeedState) => ReactNode;
}) {
  const { results, status, loadMore } = usePaginatedQuery(api.inbox.feed, args, {
    initialNumItems: PAGE_SIZE,
  });
  const feed: InboxFeedState =
    status === 'LoadingFirstPage'
      ? { status: 'loading' }
      : {
          status: 'ready',
          items: results as ReadonlyArray<InboxItemModel>,
          canLoadMore: status === 'CanLoadMore',
          loadingMore: status === 'LoadingMore',
          onLoadMore: () => loadMore(PAGE_SIZE),
        };
  return <>{render(feed)}</>;
}

/**
 * `usePaginatedQuery` baca grešku servera tokom rendera. Granica je oko samog
 * feed-a, da zaglavlje, segmenti i „Čeka tebe" ostanu živi i da greška feed-a
 * bude odvojena od greške „Čeka tebe" (plan K07 §1.5).
 */
class FeedBoundary extends Component<
  {
    children: ReactNode;
    retry: () => void;
    render: (feed: InboxFeedState) => ReactNode;
    /** Promena segmenta ili opsega nova je pretplata: greška starog filtera ne važi. */
    resetKey: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.render({ status: 'error', retry: this.props.retry });
    return this.props.children;
  }
}
