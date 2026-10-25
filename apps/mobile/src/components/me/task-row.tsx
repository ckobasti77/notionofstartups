import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PriorityDot } from '@/components/danas/priority-dot';
import { AnimatedCheck } from '@/components/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { REDUCED_FADE, standardTiming } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

import { DueChip, dueChipText } from './due-chip';
import { STATUS_DENIED_REASON, type MyDayRowData } from './my-day/my-day-model';
import { StartupChip } from './startup-chip';

export type TaskRowProps = {
  row: MyDayRowData;
  now: number;
  onToggleDone: (row: MyDayRowData, done: boolean) => void;
  /** Bez rukovaoca telo reda je samo za čitanje (lični zadatak do panela, K13). */
  onOpen?: (row: MyDayRowData) => void;
  showStartup?: boolean;
};

/**
 * Red zadatka ličnog nivoa (v1, K09), par web `components/me/task-row.tsx`:
 * kvačica, naslov, čip startupa ili „Lično", oblast i rok; tačka prioriteta
 * kad prioritet postoji. Kvačica i telo su ZASEBNI elementi za čitač ekrana
 * (kvačica je `checkbox`, telo je dugme „otvori"). K12 dodaje swipe i radnje.
 *
 * Završavanje (potpisni trenutak 1): kvačica se puni (`bouncy`) i haptika
 * `success` stiže u istom frejmu, naslov prelazi u prigušeno, a precrt prolazi
 * sleva nadesno (`DURATION.base`). Smanjen pokret: precrt se samo pretopi.
 */
export function TaskRow({ row, now, onToggleDone, onOpen, showStartup = true }: TaskRowProps) {
  const colors = useThemeColors();
  const due = dueChipText(row.dueDate, now, row.done);
  const place = row.startup === null ? 'Lično' : row.startup.name;
  const context = [showStartup ? place : null, row.areaLabel].filter(Boolean).join(' · ');
  const label = [row.title, context || null, due.tone === 'none' ? null : due.ariaLabel]
    .filter(Boolean)
    .join(', ');

  const body = (
    <>
      <View style={styles.titleWrap}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: row.done ? colors.mutedForeground : colors.foreground }]}>
          {row.title}
        </Text>
        <Strike done={row.done} color={colors.mutedForeground} />
      </View>
      <View style={styles.meta}>
        {showStartup ? <StartupChip startup={row.startup} size="sm" showName /> : null}
        {row.areaLabel ? (
          <Text numberOfLines={1} style={[styles.area, { color: colors.mutedForeground }]}>
            {showStartup ? '· ' : ''}
            {row.areaLabel}
          </Text>
        ) : null}
        <View style={styles.grow} />
        <DueChip dueDate={row.dueDate} now={now} done={row.done} accessible={false} />
      </View>
    </>
  );

  return (
    <View style={styles.row}>
      <AnimatedCheck
        checked={row.done}
        onToggle={(next) => onToggleDone(row, next)}
        // Imenica, ne glagol: stanje (završeno/otvoreno) čita `checked`.
        accessibilityLabel={`Zadatak: ${row.title}`}
        disabled={!row.canComplete}
        disabledReason={STATUS_DENIED_REASON}
      />
      {onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}${row.done ? ', završeno' : ''}`}
          accessibilityHint="Otvara zadatak u njegovom startupu"
          onPress={() => {
            haptics.tap();
            onOpen(row);
          }}
          style={({ pressed }) => [
            styles.body,
            pressed && { backgroundColor: colors.muted },
          ]}>
          {body}
        </Pressable>
      ) : (
        <View
          style={styles.body}
          accessible
          accessibilityLabel={`${label}${row.done ? ', završeno' : ''}`}>
          {body}
        </View>
      )}
      {/* Samo visok i hitan: srednji je podrazumevan za skoro svaki zadatak, pa bi
          tačka na svakom redu bila šum, a ne signal. */}
      {row.priority === 'high' || row.priority === 'urgent' ? (
        <View style={styles.priority}>
          <PriorityDot priority={row.priority} />
        </View>
      ) : null}
    </View>
  );
}

/** Precrt koji prolazi sleva nadesno (`scaleX` sa levim osloncem). */
function Strike({ done, color }: { done: boolean; color: string }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(done ? 1 : 0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = done ? 1 : 0;
    progress.value = reduced
      ? withTiming(target, REDUCED_FADE)
      : withTiming(target, standardTiming(done ? 'base' : 'quick'));
  }, [done, reduced, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: reduced ? progress.value : progress.value > 0.001 ? 1 : 0,
    transform: [{ scaleX: reduced ? 1 : progress.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.strike, { backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  body: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 8,
    paddingLeft: 2,
    borderRadius: radius.card,
  },
  // Naslov je širok koliko tekst (ne ceo red), da precrt ne pređe preko praznog.
  titleWrap: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    justifyContent: 'center',
  },
  title: {
    ...text.body,
  },
  strike: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1.5,
    transformOrigin: 'left',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  area: {
    ...text.meta,
    flexShrink: 1,
  },
  grow: {
    flexGrow: 1,
  },
  priority: {
    paddingRight: 8,
  },
});
