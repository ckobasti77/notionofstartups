import type { TrashKind } from '@devotion/shared';
import { History, Lightbulb, Paperclip, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { EmptyState } from '@/components/empty-state';
import { LAYOUT_ANIMATION_MAX_ROWS } from '@/components/me/my-day/my-day-model';
import { exitFade, listLayout, useListEntering } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useThemeColors } from '@/theme/theme-provider';

import {
  TRASH_EMPTY_COPY,
  trashItemKey,
  type RecoveredTrashItem,
  type RestorableTrashItem,
  type TrashItem,
} from './trash-model';
import { TrashRow } from './trash-row';

export type TrashListState =
  | { status: 'loading' }
  | { status: 'ready'; items: TrashItem[]; canLoadMore: boolean; loadingMore: boolean };

const EMPTY_ICON: Record<TrashKind, LucideIcon> = {
  page: Trash2,
  idea: Lightbulb,
  file: Paperclip,
  recovered: History,
};

/**
 * Lista jednog segmenta Korpe — prezentaciona (podaci kroz props, bez upita),
 * pa je Dizajn katalog prikazuje sa fixture-om. Vraćen red izlazi pretapanjem,
 * a susedi se pomere layout springom (plan K07 §8) — do granice E12, iznad nje
 * („Učitaj još" nema plafon) bez layout i izlazne animacije. Prvo punjenje
 * ulazi sa stagger-om. Dok jedan red radi, dugmad ostalih su onemogućena.
 */
export function TrashList({
  kind,
  state,
  now,
  busyKey,
  onRestore,
  onDismiss,
  onLoadMore,
  bottomInset,
}: {
  kind: TrashKind;
  state: TrashListState;
  now: number;
  /** Ključ reda čija radnja upravo radi (`trashItemKey`). */
  busyKey: string | null;
  onRestore: (item: RestorableTrashItem) => void;
  onDismiss: (item: RecoveredTrashItem) => void;
  onLoadMore: () => void;
  /** Donji prostor ispod poslednjeg reda (safe area + traka „Vraćeno"). */
  bottomInset: number;
}) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const ready = state.status === 'ready';
  const entering = useListEntering(reduced, `${kind}:${ready ? 'spremno' : 'ucitavanje'}`);

  if (state.status === 'loading') return <TrashListSkeleton />;

  if (state.items.length === 0) {
    const copy = TRASH_EMPTY_COPY[kind];
    const Icon = EMPTY_ICON[kind];
    return (
      <EmptyState
        icon={<Icon size={40} color={colors.mutedForeground} />}
        title={copy.title}
        description={copy.description}
      />
    );
  }

  const animated = state.items.length <= LAYOUT_ANIMATION_MAX_ROWS;
  const renderItem = ({ item, index }: { item: TrashItem; index: number }): ReactElement => (
    <Animated.View entering={entering(index)} exiting={animated ? exitFade(reduced) : undefined}>
      <TrashRow
        item={item}
        now={now}
        busy={busyKey === trashItemKey(item)}
        locked={busyKey !== null && busyKey !== trashItemKey(item)}
        onRestore={onRestore}
        onDismiss={onDismiss}
      />
    </Animated.View>
  );

  return (
    <Animated.FlatList
      data={state.items}
      keyExtractor={trashItemKey}
      renderItem={renderItem}
      itemLayoutAnimation={animated ? listLayout(reduced) : undefined}
      // Dizajn katalog je drži u ScrollView-u; na ekranu Korpe nema efekta.
      nestedScrollEnabled
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (state.canLoadMore) onLoadMore();
      }}
      ListFooterComponent={
        state.loadingMore ? (
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel="Učitavanje"
            style={styles.footer}
          />
        ) : state.canLoadMore ? (
          <Button label="Učitaj još" variant="ghost" onPress={onLoadMore} style={styles.footer} />
        ) : null
      }
    />
  );
}

/** Pet redova u obliku pravog reda Korpe (ikonica, naslov + meta, dugme). */
export function TrashListSkeleton() {
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje Korpe">
      <SkeletonList
        count={5}
        gap={0}
        item={(index) => <SkeletonRow index={index} leading="icon" subtitle trailing="value" />}
      />
    </View>
  );
}

/** Greška segmenta: „Korpa nije učitana." + „Pokušaj ponovo" (ponovo montira listu). */
export function TrashListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <EmptyState
      icon={<TriangleAlert size={40} color={colors.destructive} />}
      title="Korpa nije učitana."
      description={message}
      actionLabel="Pokušaj ponovo"
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: 16,
    alignSelf: 'center',
  },
});
