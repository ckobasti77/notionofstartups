import type { TaskRowModel } from '@devotion/shared';
import { CalendarCheck2, Sun } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/chat/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { enterFadeUp, exitFade, listLayout, NumberRoll, ProgressRing, useListEntering } from '@/components/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonTaskRow } from '@/components/ui/skeletons';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, space, text } from '@/theme/tokens';

import { MeSectionHeader } from '../section-header';
import { TaskRow } from '../task-row';
import {
  daySummary,
  hasOpenRows,
  LAYOUT_ANIMATION_MAX_ROWS,
  progressValueText,
  type MyDayGroupMode,
  type MyDayListItem,
  type MyDayModel,
} from './my-day-model';
import { MyDaySummaryChips, type MyDaySummaryChipsProps } from './summary-chips';

export type MyDayViewState =
  | { status: 'loading' }
  | { status: 'ready'; model: MyDayModel; items: MyDayListItem[]; groupMode: MyDayGroupMode };

export type MyDayRowActions = {
  onToggleDone: (row: TaskRowModel, done: boolean) => void;
  onOpen: (row: TaskRowModel) => void;
  onLongPress: (row: TaskRowModel) => void;
  onSchedule: (row: TaskRowModel) => void;
  onDenied: (row: TaskRowModel, reason: string) => void;
};

export type MyDayViewProps = {
  state: MyDayViewState;
  now: number;
  firstName: string | null;
  onGroupModeChange: (mode: MyDayGroupMode) => void;
  onToggleSection: (key: string) => void;
  summary: MyDaySummaryChipsProps;
  rowActions: MyDayRowActions;
  onPlanDay: () => void;
  /** „Moji zadaci“: CTA kad je sve završeno i dodirljiva napomena o odsečenju. */
  onOpenMyTasks: () => void;
  /** Pull-to-refresh (podrazumevano da); katalog ga gasi. */
  refreshable?: boolean;
};

const GROUP_OPTIONS = [
  { id: 'time', label: 'Po vremenu' },
  { id: 'startup', label: 'Po startupu' },
] as const satisfies ReadonlyArray<{ id: MyDayGroupMode; label: string }>;

/**
 * Prostor ispod poslednjeg reda: FAB (56 + 16) i traka „Poništi" iznad njega —
 * poslednji red se doskroluje iznad oba (isto merenje kao Komandni centar, E11).
 */
const LIST_BOTTOM_SPACE = 160;

/** Iznad ovoliko novih redova odjednom (npr. novi dan) ulaz se ne animira — kao web. */
const MAX_ANIMATED_ARRIVALS = 3;

/**
 * Moj dan — prikaz (podaci kroz props, pa ga koristi i dizajn-katalog). Par web
 * `MyDayView`: zaglavlje sa prstenom, prekidač „Po vremenu / Po startupu",
 * sažeti čipovi, sekcije sa brojem i redovi sa radnjama. Lista je
 * `Animated.FlatList` sa layout tranzicijom (`snappy`) — red koji pređe u drugu
 * sekciju se pomeri, ostali zatvore prazninu (granica E12: 60 redova).
 */
export function MyDayView(props: MyDayViewProps) {
  if (props.state.status === 'loading') return <MyDaySkeleton />;
  return <MyDayList {...props} state={props.state} />;
}

function MyDayList({
  state,
  now,
  firstName,
  onGroupModeChange,
  onToggleSection,
  summary,
  rowActions,
  onPlanDay,
  onOpenMyTasks,
  refreshable = true,
}: MyDayViewProps & { state: Extract<MyDayViewState, { status: 'ready' }> }) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const refreshControl = useListRefresh();
  const { model, items, groupMode } = state;
  // Ulaz liste: prvo punjenje i promena rasporeda (plan K07 §4.1 #8).
  const entering = useListEntering(reduced, groupMode);
  // Jedna instanca preseta za celu listu (ne nova po renderu).
  const layoutPreset = useMemo(() => listLayout(reduced), [reduced]);
  const layout = model.rowCount <= LAYOUT_ANIMATION_MAX_ROWS ? layoutPreset : undefined;
  const arrivals = useArrivals(items);
  const insets = useSafeAreaInsets();

  const header = (
    <View style={styles.header}>
      <SummaryCard model={model} firstName={firstName} />
      <SegmentedControl options={GROUP_OPTIONS} value={groupMode} onChange={onGroupModeChange} />
      <MyDaySummaryChips {...summary} />
      {hasOpenRows(model) ? null : (
        <View style={styles.inlineEmpty}>
          {model.counts.doneToday > 0 ? (
            <EmptyState
              icon={<CalendarCheck2 size={40} color={colors.mutedForeground} />}
              title="Sve za danas je završeno"
              description={`Završeno danas: ${model.counts.doneToday}. Pogledaj šta je sledeće.`}
              actionLabel="Moji zadaci"
              onAction={onOpenMyTasks}
            />
          ) : (
            <EmptyState
              icon={<Sun size={40} color={colors.mutedForeground} />}
              title="Danas je mirno"
              description="Nema rokova ni planova za danas."
              actionLabel="Isplaniraj dan"
              onAction={onPlanDay}
            />
          )}
        </View>
      )}
    </View>
  );

  return (
    <Animated.FlatList
      data={items}
      keyExtractor={(item) => item.key}
      itemLayoutAnimation={layout}
      // Traka „Poništi" računa i donji inset iznad tab bara — lista ga dodaje i ovde.
      contentContainerStyle={[styles.listContent, { paddingBottom: LIST_BOTTOM_SPACE + insets.bottom }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshable ? refreshControl : undefined}
      ListHeaderComponent={header}
      ListFooterComponent={
        model.capped ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Prikazan je deo zadataka. Otvori Moje zadatke."
            onPress={() => {
              haptics.tap();
              onOpenMyTasks();
            }}
            style={styles.cappedPress}>
            <Text style={[styles.capped, { color: colors.mutedForeground }]}>
              Prikazan je deo zadataka. Sve nađi u <Text style={{ color: colors.primaryText }}>Mojim zadacima</Text>.
            </Text>
          </Pressable>
        ) : null
      }
      initialNumToRender={16}
      renderItem={({ item, index }) =>
        item.type === 'header' ? (
          <Animated.View entering={entering(index)} style={index === 0 ? undefined : styles.sectionGap}>
            <MeSectionHeader
              title={item.section.title}
              count={item.section.rows.length}
              tone={item.section.tone}
              startup={item.section.startup}
              collapsible={item.section.collapsible}
              collapsed={item.collapsed}
              onToggle={item.section.collapsible ? () => onToggleSection(item.section.key) : undefined}
            />
          </Animated.View>
        ) : (
          <Animated.View
            entering={arrivals.has(item.key) ? enterFadeUp(0, reduced) : entering(index)}
            exiting={exitFade(reduced)}>
            <TaskRow
              row={item.row}
              now={now}
              onToggleDone={rowActions.onToggleDone}
              onOpen={rowActions.onOpen}
              onLongPress={rowActions.onLongPress}
              onSchedule={rowActions.onSchedule}
              onDenied={rowActions.onDenied}
              // Po startupu čip nosi zaglavlje grupe; „Završeno danas" meša startupe.
              showStartup={groupMode === 'time' || item.sectionKey === 'startup:doneToday'}
            />
          </Animated.View>
        )
      }
    />
  );
}

/**
 * Redovi koji su se upravo pojavili u podacima (brzi unos, plan dana, drugi
 * uređaj) — dobijaju ulaz `enterFadeUp` (trenutak 4); skrol i premeštanje
 * između sekcija nisu „novi" (isti ključ).
 */
function useArrivals(items: ReadonlyArray<MyDayListItem>): ReadonlySet<string> {
  const known = useRef<ReadonlySet<string> | null>(null);
  const keys = useMemo(() => items.filter((item) => item.type === 'row').map((item) => item.key), [items]);
  const arrivals = useMemo(() => {
    const previous = known.current;
    if (previous === null) return new Set<string>();
    const fresh = keys.filter((key) => !previous.has(key));
    return fresh.length > 0 && fresh.length <= MAX_ANIMATED_ARRIVALS ? new Set(fresh) : new Set<string>();
  }, [keys]);
  useEffect(() => {
    known.current = new Set(keys);
  }, [keys]);
  return arrivals;
}

/** Pozdrav, sažetak i prsten napretka (obaveze dana: planirano ∪ rok danas). */
export function SummaryCard({ model, firstName }: { model: MyDayModel; firstName: string | null }) {
  const colors = useThemeColors();
  const { done, total } = model.progress;
  return (
    <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {total > 0 ? (
        <ProgressRing
          progress={done / total}
          accessibilityLabel="Napredak dana"
          valueText={progressValueText(model.progress)}>
          <NumberRoll value={done} style={[styles.ringNumber, { color: colors.foreground }]} />
        </ProgressRing>
      ) : null}
      <View style={styles.summaryText}>
        <Text style={[styles.greeting, { color: colors.foreground }]}>
          {firstName ? `Zdravo, ${firstName}.` : 'Zdravo.'}
        </Text>
        <Text style={[styles.summaryLine, { color: colors.mutedForeground }]}>{daySummary(model.counts)}</Text>
      </View>
    </View>
  );
}

/** Oblik onoga što stiže: kartica sažetka, prekidač, naslov sekcije, tri reda. */
function MyDaySkeleton() {
  return (
    <View
      style={[styles.listContent, styles.header]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje dana">
      <Skeleton width="100%" height={72} borderRadius={radius.card} />
      <Skeleton width="100%" height={44} borderRadius={radius.card} />
      <Skeleton width="30%" height={13} />
      <SkeletonList count={3} item={(index) => <SkeletonTaskRow index={index} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: LIST_BOTTOM_SPACE,
  },
  header: {
    gap: space[3],
    paddingBottom: space[2],
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  summaryLine: {
    ...text.body,
  },
  ringNumber: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  inlineEmpty: {
    minHeight: 240,
  },
  sectionGap: {
    marginTop: space[3],
  },
  cappedPress: {
    minHeight: 44,
    justifyContent: 'center',
    paddingTop: space[2],
  },
  capped: {
    ...text.body,
    paddingHorizontal: space[1],
  },
});
