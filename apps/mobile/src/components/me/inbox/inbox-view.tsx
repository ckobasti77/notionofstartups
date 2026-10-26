import {
  formatInboxTime,
  groupInboxByDay,
  INBOX_SEGMENTS,
  inboxEmptyCopy,
  inboxPendingFor,
  inboxScopeKey,
  inboxUnreadFor,
  inboxUnreadWord,
  pendingIsVote,
  pendingKey,
  pendingTitle,
  type InboxCounts,
  type InboxScope,
  type InboxSegment,
  type PendingItemLike,
  type StartupMini,
} from '@devotion/shared';
import {
  ArrowRight,
  AtSign,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CheckSquare2,
  Flame,
  Gavel,
  GitMerge,
  Hourglass,
  Inbox,
  Lightbulb,
  MessageCircle,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, type ReactElement } from 'react';
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import {
  exitFade,
  listLayout,
  NumberRoll,
  swipeAccessibilityActions,
  SwipeRow,
  useListEntering,
  type SwipeAction,
} from '@/components/motion';
import { StartupChip } from '@/components/me/startup-chip';
import { MeHeader } from '@/components/me/me-header';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, text } from '@/theme/tokens';

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

/** Stavka feed-a (`inbox.feed`) onoliko koliko prikaz čita — par web `InboxItemModel`. */
export type InboxItemModel = {
  _id: string;
  type: string;
  title: string;
  body?: string;
  targetType: string;
  targetId: string | null;
  readAt: number | null;
  createdAt: number;
  startupId: string | null;
  startup: StartupMini | null;
  actor: { displayName: string; avatarUrl: string | null } | null;
};

/** Stavka „Čeka tebe" (`inbox.pending`) onoliko koliko prikaz čita. */
export type InboxPendingModel = PendingItemLike & {
  startup: StartupMini;
  createdAt: number;
  targetType: string;
  targetId: string;
};

export type InboxFeedState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      items: ReadonlyArray<InboxItemModel>;
      canLoadMore: boolean;
      loadingMore: boolean;
      onLoadMore: () => void;
    };

export type InboxPendingState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; items: ReadonlyArray<InboxPendingModel>; truncated: boolean };

export type InboxViewProps = {
  now: number;
  segment: InboxSegment;
  onSegmentChange: (segment: InboxSegment) => void;
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  startups: ReadonlyArray<StartupMini>;
  /** `null` dok brojači ne stignu (ili upit padne) — brojevi se tada ne prikazuju. */
  counts: InboxCounts | null;
  feed: InboxFeedState;
  pending: InboxPendingState;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
  onOpenPending: (item: InboxPendingModel) => void;
  onMarkAllRead: () => void;
  markingAll: boolean;
  onOpenSettings: () => void;
  /** Pull-to-refresh (`useListRefresh`); u katalogu ga nema. */
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Gornji safe-area (podrazumevano da); `false` samo za prikaz u katalogu. */
  safeArea?: boolean;
};

/**
 * Inbox (K14, plan K07 §1.5), par web `components/me/inbox/inbox-view.tsx`:
 * obaveštenja iz svih startupa i ličnih poruka na jednom mestu, segmenti
 * „Sve / Nepročitano / Čeka tebe", čipovi opsega, grupe Danas / Juče / Ranije.
 * Prezentacija: podaci i radnje kroz props (katalog ga prikazuje bez upita).
 * Swipe udesno = označi pročitano; dodir otvara cilj (to radi ekran).
 */
export function InboxView({
  now,
  segment,
  onSegmentChange,
  scope,
  onScopeChange,
  startups,
  counts,
  feed,
  pending,
  onOpen,
  onMarkRead,
  onOpenPending,
  onMarkAllRead,
  markingAll,
  onOpenSettings,
  refreshControl,
  safeArea = true,
}: InboxViewProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const resetKey = `${segment}|${inboxScopeKey(scope)}|${segment === 'pending' ? pending.status : feed.status}`;
  const entering = useListEntering(reduced, resetKey);

  const scoped = counts ? inboxUnreadFor(counts, scope) : null;
  const pendingScoped = pending.status === 'ready' ? inboxPendingFor(pending.items, scope) : null;
  const total = counts?.total ?? null;
  // U „Čeka tebe“ se vide samo odluke, pa masovno označavanje obaveštenja tu ne važi.
  const canMarkAll = !markingAll && segment !== 'pending' && scoped !== null && scoped.count > 0;

  const subtitle =
    total === null
      ? undefined
      : total.count === 0
        ? 'Sve je pročitano'
        : total.capped || total.count > 99
          ? 'Više od 99 nepročitanih'
          : `${total.count} ${inboxUnreadWord(total.count)}`;

  const header = (
    <MeHeader
      title="Inbox"
      // Nerazdvojivi razmak drži visinu zaglavlja dok brojači ne stignu (bez skoka).
      subtitle={subtitle ?? ' '}
      safeArea={safeArea}
      actions={
        <>
          <IconButton
            accessibilityLabel="Označi sve kao pročitano"
            accessibilityState={{ busy: markingAll, disabled: !canMarkAll }}
            disabled={!canMarkAll}
            onPress={onMarkAllRead}>
            <CheckCheck size={22} color={canMarkAll ? colors.foreground : colors.subtle} />
          </IconButton>
          <IconButton accessibilityLabel="Podešavanja obaveštenja" onPress={onOpenSettings}>
            <Settings size={22} color={colors.foreground} />
          </IconButton>
        </>
      }
      below={
        <InboxSegments
          segment={segment}
          onChange={onSegmentChange}
          unread={scoped}
          pendingCount={pendingScoped === null ? null : pendingScoped.length}
        />
      }
    />
  );

  const chips =
    startups.length > 0 ? (
      <ScopeChips
        scope={scope}
        onChange={onScopeChange}
        startups={startups}
        counts={counts}
        pending={pending}
        segment={segment}
      />
    ) : null;

  const bottomPadding = (safeArea ? insets.bottom : 0) + space[6];

  let body: ReactElement;
  if (segment === 'pending') {
    body = (
      <PendingBody
        state={pending}
        scope={scope}
        segment={segment}
        now={now}
        onOpen={onOpenPending}
        refreshControl={refreshControl}
        bottomPadding={bottomPadding}
      />
    );
  } else if (feed.status === 'loading') {
    body = <InboxSkeleton />;
  } else if (feed.status === 'error') {
    body = <InboxError title="Inbox se ne može učitati" retry={feed.retry} />;
  } else {
    body = (
      <FeedBody
        feed={feed}
        scope={scope}
        segment={segment}
        now={now}
        onOpen={onOpen}
        onMarkRead={onMarkRead}
        refreshControl={refreshControl}
        bottomPadding={bottomPadding}
        entering={entering}
        reduced={reduced}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {header}
      {chips}
      <View style={styles.body}>{body}</View>
    </View>
  );
}

/**
 * Segmenti sa brojem u kutku (odskače iznad trake): reč „Nepročitano" zauzima
 * skoro celu širinu segmenta na 390 pt, pa broj ne ide uz nju. Broj se kotrlja.
 */
function InboxSegments({
  segment,
  onChange,
  unread,
  pendingCount,
}: {
  segment: InboxSegment;
  onChange: (segment: InboxSegment) => void;
  unread: { count: number; capped: boolean } | null;
  pendingCount: number | null;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="tablist" style={[styles.segTrack, { backgroundColor: colors.muted }]}>
      {INBOX_SEGMENTS.map(({ key, label }) => {
        const active = key === segment;
        const count =
          key === 'unread' ? unread?.count ?? 0 : key === 'pending' ? pendingCount ?? 0 : 0;
        const capped = key === 'unread' ? unread?.capped ?? false : false;
        const noun = key === 'unread' ? 'nepročitanih' : 'čeka tvoju odluku';
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count > 0 ? `${label}, ${capped ? 'više od 99' : count} ${noun}` : label}
            onPress={() => {
              if (!active) haptics.select();
              onChange(key);
            }}
            style={[
              styles.segment,
              active && { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={[styles.segLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
              {label}
            </Text>
            {count > 0 ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.segBadge, { backgroundColor: colors.primary }]}>
                <NumberRoll
                  value={capped ? 100 : count}
                  style={[styles.segBadgeText, { color: colors.primaryForeground }]}
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Vodoravni red čipova opsega: Svi · Lično · startupi. */
function ScopeChips({
  scope,
  onChange,
  startups,
  counts,
  pending,
  segment,
}: {
  scope: InboxScope;
  onChange: (scope: InboxScope) => void;
  startups: ReadonlyArray<StartupMini>;
  counts: InboxCounts | null;
  pending: InboxPendingState;
  segment: InboxSegment;
}) {
  const colors = useThemeColors();
  const chip = (
    key: string,
    target: InboxScope,
    label: string,
    leading: ReactElement | null,
    count: { count: number; capped: boolean } | null,
  ) => {
    const active = inboxScopeKey(scope) === inboxScopeKey(target);
    const shown = count !== null && count.count > 0 ? (count.capped || count.count > 99 ? '99+' : String(count.count)) : null;
    return (
      <Pressable
        key={key}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        accessibilityLabel={
          shown ? `${label}, ${shown} ${segment === 'pending' ? 'čeka odluku' : 'nepročitanih'}` : label
        }
        onPress={() => {
          if (!active) haptics.select();
          onChange(target);
        }}
        style={[
          styles.chip,
          active
            ? { backgroundColor: colors.accent, borderColor: colors.primary }
            : { backgroundColor: colors.surface, borderColor: colors.input },
        ]}>
        {leading}
        <Text
          numberOfLines={1}
          style={[styles.chipLabel, { color: active ? colors.accentForeground : colors.foreground }]}>
          {label}
        </Text>
        {shown ? (
          <Text style={[styles.chipCount, { color: active ? colors.accentForeground : colors.mutedForeground }]}>
            {shown}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  // Broj na čipu prati segment: „Čeka tebe" broji odluke, ostalo nepročitano.
  const countFor = (target: InboxScope) => {
    if (segment === 'pending') {
      return pending.status === 'ready'
        ? { count: inboxPendingFor(pending.items, target).length, capped: false }
        : null;
    }
    return counts ? inboxUnreadFor(counts, target) : null;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Opseg obaveštenja"
      style={styles.chipScroll}
      contentContainerStyle={styles.chipRow}>
      {chip('all', { kind: 'all' }, 'Svi', null, countFor({ kind: 'all' }))}
      {chip(
        'personal',
        { kind: 'personal' },
        'Lično',
        <StartupChip startup={null} size="sm" />,
        segment === 'pending' ? { count: 0, capped: false } : countFor({ kind: 'personal' }),
      )}
      {startups.map((startup) =>
        chip(
          startup._id,
          { kind: 'startup', startupId: startup._id },
          startup.name,
          <StartupChip startup={startup} size="sm" />,
          countFor({ kind: 'startup', startupId: startup._id }),
        ),
      )}
    </ScrollView>
  );
}

function FeedBody({
  feed,
  scope,
  segment,
  now,
  onOpen,
  onMarkRead,
  refreshControl,
  bottomPadding,
  entering,
  reduced,
}: {
  feed: Extract<InboxFeedState, { status: 'ready' }>;
  scope: InboxScope;
  segment: InboxSegment;
  now: number;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
  bottomPadding: number;
  entering: ReturnType<typeof useListEntering>;
  reduced: boolean;
}) {
  const colors = useThemeColors();
  const sections = useMemo(
    () =>
      groupInboxByDay(feed.items, now).map((group) => ({
        key: group.key,
        title: group.title,
        data: group.items,
      })),
    [feed.items, now],
  );

  if (feed.items.length === 0) {
    const copy = inboxEmptyCopy(segment, scope);
    // Backend filtrira stavke POSLE paginacije: stranica može doći prazna, a da ima još.
    const more = feed.canLoadMore || feed.loadingMore;
    return (
      <EmptyState
        icon={<Inbox size={40} color={colors.mutedForeground} />}
        title={more ? 'Nema ništa na ovoj strani' : copy.title}
        description={more ? 'Ostalo može biti dalje u istoriji.' : copy.description}
        actionLabel={more ? (feed.loadingMore ? 'Učitavam…' : 'Učitaj još') : undefined}
        onAction={more && !feed.loadingMore ? feed.onLoadMore : undefined}
      />
    );
  }

  // Layout animacije samo u kratkim listama (E12): u dugim bi svaki red pratio sve ostale.
  const animateRows = feed.items.length <= 60;
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item._id}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => (
        <View
          accessibilityRole="header"
          style={[styles.dayHeader, { backgroundColor: colors.background }]}>
          <Text style={[styles.dayTitle, { color: colors.mutedForeground }]}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item, index: rowIndex }) => {
        return (
          <Animated.View
            entering={animateRows ? entering(rowIndex) : undefined}
            exiting={animateRows ? exitFade(reduced) : undefined}
            layout={animateRows ? listLayout(reduced) : undefined}>
            <InboxRow item={item} now={now} onOpen={onOpen} onMarkRead={onMarkRead} />
          </Animated.View>
        );
      }}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (feed.canLoadMore) feed.onLoadMore();
      }}
      ListFooterComponent={
        feed.loadingMore ? (
          <View style={styles.footer} accessible accessibilityLabel="Učitavam još" accessibilityLiveRegion="polite">
            <Skeleton width="60%" height={14} />
          </View>
        ) : null
      }
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    />
  );
}

/**
 * Red obaveštenja. Sklopljen ručno (kao `TaskRow`): swipe red mora da nosi i
 * `accessibilityActions` istog gesta, što deljeni `Row` ne propušta.
 */
export function InboxRow({
  item,
  now,
  onOpen,
  onMarkRead,
}: {
  item: InboxItemModel;
  now: number;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
}) {
  const colors = useThemeColors();
  const Icon = TYPE_ICON[item.type] ?? BellRing;
  const unread = item.readAt === null;
  const tint = LOUD_TYPES.has(item.type) ? colors.danger : colors.primaryText;
  const time = formatInboxTime(item.createdAt, now);
  const place = item.startup === null ? 'Lično' : item.startup.name;
  const label = [
    unread ? 'Nepročitano' : null,
    item.title,
    item.body ?? null,
    place,
    time,
  ]
    .filter(Boolean)
    .join('. ');

  const markAction: SwipeAction | undefined = unread
    ? {
        label: 'Označi kao pročitano',
        icon: Check,
        tone: 'success',
        onCommit: () => onMarkRead(item),
      }
    : undefined;
  const a11y = swipeAccessibilityActions({ right: markAction });

  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        item.startup === null && item.targetType !== 'chat'
          ? 'Označava obaveštenje kao pročitano'
          : 'Otvara ono na šta se obaveštenje odnosi'
      }
      {...a11y}
      onPress={() => {
        haptics.tap();
        onOpen(item);
      }}
      style={({ pressed }) => [
        styles.row,
        unread && { borderColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}>
      {item.actor ? (
        <Avatar name={item.actor.displayName} uri={item.actor.avatarUrl} size={32} />
      ) : (
        <View style={[styles.rowIcon, { backgroundColor: `${tint}22` }]}>
          <Icon size={16} color={tint} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text
          numberOfLines={2}
          style={[
            styles.rowTitle,
            { color: unread ? colors.foreground : colors.mutedForeground },
            unread && { fontWeight: fontWeight.semibold },
          ]}>
          {item.title}
        </Text>
        {item.body ? (
          <Text numberOfLines={2} style={[styles.rowBody, { color: colors.mutedForeground }]}>
            {item.body}
          </Text>
        ) : null}
        <View style={styles.rowMeta}>
          <StartupChip startup={item.startup} size="sm" showName />
          <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>· {time}</Text>
        </View>
      </View>
      {unread ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.unreadDot, { backgroundColor: colors.primaryText }]}
        />
      ) : null}
    </Pressable>
  );

  return (
    <SwipeRow
      rightAction={markAction}
      rowBackground={unread ? colors.card : colors.background}
      borderRadius={radius.card}>
      {content}
    </SwipeRow>
  );
}

function PendingBody({
  state,
  scope,
  segment,
  now,
  onOpen,
  refreshControl,
  bottomPadding,
}: {
  state: InboxPendingState;
  scope: InboxScope;
  segment: InboxSegment;
  now: number;
  onOpen: (item: InboxPendingModel) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
  bottomPadding: number;
}) {
  const colors = useThemeColors();
  if (state.status === 'loading') return <InboxSkeleton />;
  if (state.status === 'error') {
    return <InboxError title="„Čeka tebe“ se ne može učitati" retry={state.retry} />;
  }
  const items = inboxPendingFor(state.items, scope);
  if (items.length === 0) {
    const copy = inboxEmptyCopy(segment, scope);
    return (
      <EmptyState
        icon={<Hourglass size={40} color={colors.mutedForeground} />}
        title={copy.title}
        description={copy.description}
      />
    );
  }
  return (
    <ScrollView
      contentContainerStyle={[styles.listContent, styles.pendingList, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}>
      {items.map((item) => (
        <PendingRow key={pendingKey(item)} item={item} now={now} onOpen={onOpen} />
      ))}
      {state.truncated ? (
        <Text style={[styles.truncated, { color: colors.mutedForeground }]}>
          Prikazan je samo deo. Ostalo je u Odobrenjima.
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Red „Čeka tebe": glasanje ili predlog premeštanja, dugme vodi u odobrenja tog startupa. */
export function PendingRow({
  item,
  now,
  onOpen,
}: {
  item: InboxPendingModel;
  now: number;
  onOpen: (item: InboxPendingModel) => void;
}) {
  const colors = useThemeColors();
  // PROSTOR P22: ideja čeka glas („Glasaj"); stari tipovi ostaju prepoznati.
  const vote = pendingIsVote(item);
  const Icon = item.kind === 'idea_vote' ? Lightbulb : vote ? ShieldCheck : GitMerge;
  const title = pendingTitle(item);
  const action = vote ? 'Glasaj' : 'Pogledaj';
  const time = formatInboxTime(item.createdAt, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action}: ${title}. ${item.startup.name}. ${time}`}
      accessibilityHint={item.kind === 'idea_vote' ? 'Otvara ideju' : 'Otvara odobrenja tog startupa'}
      onPress={() => {
        haptics.tap();
        onOpen(item);
      }}
      style={({ pressed }) => [
        styles.pendingRow,
        { backgroundColor: pressed ? colors.muted : colors.card, borderColor: colors.border },
      ]}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primaryText}22` }]}>
        <Icon size={16} color={colors.primaryText} />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={3} style={[styles.rowTitle, { color: colors.foreground, fontWeight: fontWeight.semibold }]}>
          {title}
        </Text>
        <View style={styles.rowMeta}>
          <StartupChip startup={item.startup} size="sm" showName />
          <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>· {time}</Text>
        </View>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.pendingAction, { backgroundColor: vote ? colors.primary : colors.secondary }]}>
        <Text
          style={[
            styles.pendingActionText,
            { color: vote ? colors.primaryForeground : colors.secondaryForeground },
          ]}>
          {action}
        </Text>
        <ArrowRight size={16} color={vote ? colors.primaryForeground : colors.secondaryForeground} />
      </View>
    </Pressable>
  );
}

/** Oblik `InboxRow`: ikonica + dva reda teksta + meta. */
export function InboxSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLabel="Učitavanje obaveštenja"
      accessibilityLiveRegion="polite">
      <Skeleton width="20%" height={13} style={styles.skeletonHead} />
      <SkeletonList
        count={6}
        gap={space[4]}
        item={(rowIndex) => (
          <View style={styles.skeletonRow}>
            <Skeleton width={32} height={32} borderRadius={radius.md} />
            <View style={styles.skeletonBody}>
              <Skeleton width={rowIndex % 2 === 0 ? '78%' : '60%'} height={15} />
              <Skeleton width="45%" height={12} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

function InboxError({ title, retry }: { title: string; retry: () => void }) {
  const colors = useThemeColors();
  return (
    <EmptyState
      icon={<TriangleAlert size={40} color={colors.destructive} />}
      title={title}
      description="Proveri vezu i pokušaj ponovo."
      actionLabel="Pokušaj ponovo"
      onAction={retry}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  segTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.lg,
    gap: 3,
    // Broj u kutku izlazi iznad trake.
    marginTop: space[2],
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingHorizontal: space[1],
  },
  segLabel: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  segBadge: {
    position: 'absolute',
    top: -space[2],
    right: space[1],
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBadgeText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: fontWeight.bold,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipRow: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    gap: space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipLabel: {
    ...text.body,
    fontWeight: fontWeight.medium,
    maxWidth: 160,
  },
  chipCount: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  listContent: {
    paddingHorizontal: space[4],
  },
  pendingList: {
    paddingTop: space[2],
    gap: space[2],
  },
  dayHeader: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingTop: space[2],
  },
  dayTitle: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    minHeight: 56,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...text.body,
  },
  rowBody: {
    ...text.meta,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    marginTop: 2,
  },
  rowTime: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    marginTop: space[2],
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 64,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pendingAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: 36,
    paddingHorizontal: space[3],
    borderRadius: radius.control,
  },
  pendingActionText: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  truncated: {
    ...text.meta,
    paddingHorizontal: space[1],
    paddingTop: space[2],
  },
  footer: {
    paddingVertical: space[4],
    alignItems: 'center',
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
