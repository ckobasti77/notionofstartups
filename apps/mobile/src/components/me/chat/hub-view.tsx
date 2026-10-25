import {
  hubIsEmpty,
  normalizeSearchText,
  type HubChannel,
  type HubGroup,
  type HubInput,
} from '@devotion/shared';
import { MessagesSquare, SquarePen, TriangleAlert, Users } from 'lucide-react-native';
import { useMemo, type ReactElement } from 'react';
import { SectionList, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { EmptyState } from '@/components/empty-state';
import { exitFade, listLayout, useListEntering } from '@/components/motion';
import { MeHeader } from '@/components/me/me-header';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { spacing, text } from '@/theme/tokens';

import { hubHeaderSubtitle, hubSections, hubVisibleRowCount } from './hub-model';
import { HubGroupHeader, HubRow } from './hub-row';

/** Stanje liste razgovora (`chat.listConversations`) — par web `HubListState`. */
export type HubListState<C extends HubChannel = HubChannel> =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; input: HubInput<C>; capped: boolean };

export type ChatHubViewProps<C extends HubChannel = HubChannel> = {
  now: number;
  /** Moj profil („Ti: …" u pregledu); `null` dok ne stigne. */
  meId: string | null;
  state: HubListState<C>;
  /** Grupe posle pretrage i sklapanja (`hubGroups`); prazno dok lista nije spremna. */
  groups: ReadonlyArray<HubGroup<C>>;
  query: string;
  onQueryChange: (query: string) => void;
  onToggleGroup: (key: string) => void;
  onOpen: (channel: C) => void;
  onLongPress: (channel: C) => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
  /** Ukupno nepročitano (`chat.unreadSummary.total`, isto kao bedž taba); `null` dok ne stigne. */
  unreadTotal: { unreadCount: number } | null;
  /** Pull-to-refresh (`useListRefresh`); u katalogu ga nema. */
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Gornji safe-area (podrazumevano da); `false` samo za prikaz u katalogu. */
  safeArea?: boolean;
};

/** Iznad ovoliko vidljivih redova nema layout animacija (E12) — svaki red bi pratio sve ostale. */
const LAYOUT_ANIMATION_MAX_ROWS = 60;

/**
 * Tab „Poruke" (K16, plan K07 §1.6), par web `HubList`: „Lično" pa grupe po
 * startupima (sklopive, sa nepročitanim), pretraga po imenu razgovora i
 * startupa, „Nova poruka" i „Nova grupa" u zaglavlju. Prezentacija: podaci i
 * radnje kroz props (katalog ga prikazuje bez upita).
 */
export function ChatHubView<C extends HubChannel>({
  now,
  meId,
  state,
  groups,
  query,
  onQueryChange,
  onToggleGroup,
  onOpen,
  onLongPress,
  onNewMessage,
  onNewGroup,
  unreadTotal,
  refreshControl,
  safeArea = true,
}: ChatHubViewProps<C>) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  // Ulaz redova samo na prvo punjenje; kucanje u pretrazi, sklapanje i
  // reaktivna osvežavanja menjaju listu bez stagger-a (plan K07 §4.1, tačka 8).
  const entering = useListEntering(reduced, state.status);
  const layoutPreset = useMemo(() => listLayout(reduced), [reduced]);

  const sections = useMemo(() => hubSections(groups), [groups]);
  // Redni broj reda u celoj listi (stagger ide preko granica grupa).
  const offsets = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const section of sections) {
      map.set(section.key, total);
      total += section.data.length;
    }
    return map;
  }, [sections]);
  const rowAnimations = hubVisibleRowCount(sections) <= LAYOUT_ANIMATION_MAX_ROWS;
  const layout = rowAnimations ? layoutPreset : undefined;
  // Isto pravilo kao `hubGroups` (shared): upit od same interpunkcije nije pretraga.
  const searching = normalizeSearchText(query).trim().length > 0;

  const header = (
    <MeHeader
      title="Poruke"
      subtitle={hubHeaderSubtitle(unreadTotal) ?? ' '}
      safeArea={safeArea}
      actions={
        <>
          <IconButton
            accessibilityLabel="Nova poruka"
            onPress={() => {
              haptics.tap();
              onNewMessage();
            }}>
            <SquarePen size={22} color={colors.foreground} />
          </IconButton>
          <IconButton
            accessibilityLabel="Nova grupa"
            onPress={() => {
              haptics.tap();
              onNewGroup();
            }}>
            <Users size={22} color={colors.foreground} />
          </IconButton>
        </>
      }
      // Pretraga stoji i dok se lista učitava (onemogućena), da zaglavlje ne
      // skoči kad podaci stignu; u praznom hubu i grešci nema šta da se traži.
      below={
        state.status === 'loading' || (state.status === 'ready' && !hubIsEmpty(state.input)) ? (
          <SearchField
            value={query}
            onChange={onQueryChange}
            placeholder="Pretraži razgovore…"
            editable={state.status === 'ready'}
          />
        ) : undefined
      }
    />
  );

  let body: ReactElement;
  if (state.status === 'loading') {
    body = <ChatHubSkeleton />;
  } else if (state.status === 'error') {
    body = (
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Razgovori se ne mogu učitati"
        description="Proveri vezu i pokušaj ponovo."
        actionLabel="Pokušaj ponovo"
        onAction={state.retry}
      />
    );
  } else if (hubIsEmpty(state.input)) {
    body = (
      <EmptyState
        icon={<MessagesSquare size={40} color={colors.mutedForeground} />}
        title="Još nemaš razgovora"
        description="Pošalji poruku nekome iz tima ili napravi grupu."
        actionLabel="Nova poruka"
        onAction={onNewMessage}
      />
    );
  } else if (searching && groups.length === 0) {
    body = (
      <View style={styles.noResults}>
        <Text style={[styles.noResultsText, { color: colors.mutedForeground }]}>
          {`Nema razgovora za „${query.trim()}“.`}
        </Text>
        <Button label="Obriši pretragu" variant="ghost" onPress={() => onQueryChange('')} />
      </View>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(item) => item._id}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // iOS: tastatura iz pretrage ne pokriva poslednje redove.
        automaticallyAdjustKeyboardInsets
        renderSectionHeader={({ section }) => (
          <HubGroupHeader
            group={section.group}
            onToggle={searching ? undefined : () => onToggleGroup(section.key)}
          />
        )}
        renderItem={({ item, index, section }) => (
          <Animated.View
            entering={entering((offsets.get(section.key) ?? 0) + index)}
            exiting={rowAnimations ? exitFade(reduced) : undefined}
            layout={layout}>
            <HubRow
              channel={item}
              now={now}
              meId={meId}
              place={section.group.title}
              onPress={() => onOpen(item)}
              onLongPress={() => onLongPress(item)}
            />
          </Animated.View>
        )}
        ListFooterComponent={
          state.capped ? (
            <Text style={[styles.capped, { color: colors.mutedForeground }]}>
              Prikazani su samo najsvežiji razgovori. Stariji su u kanalima svakog startupa.
            </Text>
          ) : null
        }
        // Donji safe-area pokriva tab bar; ovde samo vazduh ispod poslednjeg reda.
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {header}
      <View style={styles.body}>{body}</View>
    </View>
  );
}

/** Oblik huba: overline grupe + 6 redova (avatar 44 + dva reda teksta + vreme). */
export function ChatHubSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLabel="Učitavanje razgovora"
      accessibilityLiveRegion="polite">
      <Skeleton width="18%" height={13} style={styles.skeletonHead} />
      <SkeletonList
        count={6}
        item={(index) => <SkeletonRow index={index} leading="circle" subtitle trailing="value" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  noResults: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
  },
  noResultsText: {
    ...text.body,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  capped: {
    ...text.meta,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  skeleton: {
    paddingTop: spacing.sm,
  },
  skeletonHead: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
});
