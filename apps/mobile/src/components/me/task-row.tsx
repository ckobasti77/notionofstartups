import { STATUS_LABELS, type TaskRowModel } from '@devotion/shared';
import { CalendarClock, Check, Lock, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PriorityDot } from '@/components/danas/priority-dot';
import { AnimatedCheck, SwipeRow, swipeAccessibilityActions, type SwipeAction } from '@/components/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { LONG_PRESS_MS, REDUCED_FADE, standardTiming } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

import { DueChip, dueChipText } from './due-chip';
import { STATUS_DENIED_REASON } from './my-day/my-day-model';
import { rowSwipeSpec } from './row-actions';
import { StartupChip } from './startup-chip';

export type TaskRowProps = {
  row: TaskRowModel;
  now: number;
  onToggleDone: (row: TaskRowModel, done: boolean) => void;
  /** Dodir na telo reda: zadatak u startupu se otvara u svom startupu. */
  onOpen?: (row: TaskRowModel) => void;
  /** Dugi pritisak (300 ms): sheet radnji. */
  onLongPress?: (row: TaskRowModel) => void;
  /**
   * Swipe radnje (trenutak 6): desno završi/vrati, levo „Rok i plan". Bez ovog
   * propa red nema gest (npr. katalog v1).
   */
  onSchedule?: (row: TaskRowModel) => void;
  /**
   * Dodir ili swipe na zabranjenu radnju (zaključana kvačica): pozivalac
   * pokaže razlog (E15), kao toast na webu. Bez rukovaoca samo haptika.
   */
  onDenied?: (row: TaskRowModel, reason: string) => void;
  showStartup?: boolean;
  /** Oznaka statusa u meta-liniji (Moji zadaci, osim kad se grupiše po statusu) — kao web `showStatus`. */
  showStatus?: boolean;
};

/**
 * Red zadatka ličnog nivoa, par web `components/me/task-row.tsx`: kvačica,
 * naslov, čip startupa ili „Lično", oblast i rok; tačka prioriteta za visok i
 * hitan. Ulaz je zajednički `TaskRowModel` (shared `task-row.ts`), pa dozvole
 * i radnje odlučuju isto kao na webu.
 *
 * Gestovi (plan K07 §6.2): dodir = otvori, dugi pritisak = radnje, swipe desno
 * = završi, swipe levo = „Rok i plan". Gest je nevidljiv čitaču ekrana, pa
 * iste radnje stoje i kao `accessibilityActions` na telu reda.
 *
 * Završavanje (trenutak 1): kvačica se puni (`bouncy`) uz haptiku `success`,
 * naslov prelazi u prigušeno, a precrt prolazi sleva nadesno (`DURATION.base`).
 * Smanjen pokret: precrt se samo pretopi.
 */
export function TaskRow({
  row,
  now,
  onToggleDone,
  onOpen,
  onLongPress,
  onSchedule,
  onDenied,
  showStartup = true,
  showStatus = false,
}: TaskRowProps) {
  const colors = useThemeColors();
  const due = dueChipText(row.dueDate, now, row.done);
  const place = row.startup === null ? 'Lično' : row.startup.name;
  const context = [showStartup ? place : null, row.areaLabel].filter(Boolean).join(' · ');
  const label = [
    row.title,
    context || null,
    due.tone === 'none' ? null : due.ariaLabel,
    showStatus ? STATUS_LABELS[row.status] : null,
    row.planned ? 'u Moj dan' : null,
    row.done ? 'završeno' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const spec = rowSwipeSpec(row);
  const rightAction: SwipeAction | undefined = onSchedule
    ? {
        label: spec.right.label,
        // Zabranjeno: katanac i ton upozorenja, ne zeleno „Završi" (E15).
        icon: !spec.right.allowed ? Lock : spec.right.command === 'reopen' ? RotateCcw : Check,
        tone: !spec.right.allowed ? 'warning' : spec.right.command === 'reopen' ? 'primary' : 'success',
        allowed: spec.right.allowed,
        onDenied: onDenied ? () => onDenied(row, spec.right.reason ?? STATUS_DENIED_REASON) : undefined,
        commitHaptic: spec.right.command === 'reopen' ? 'select' : 'success',
        onCommit: () => onToggleDone(row, !row.done),
      }
    : undefined;
  const leftAction: SwipeAction | undefined = onSchedule
    ? {
        label: spec.left.label,
        icon: CalendarClock,
        tone: 'primary',
        commitHaptic: 'select',
        onCommit: () => onSchedule(row),
      }
    : undefined;

  const a11y = swipeAccessibilityActions(
    { right: rightAction, left: leftAction },
    onLongPress ? [{ name: 'actions', label: 'Radnje', onAction: () => onLongPress(row) }] : [],
  );

  const tap = onOpen ?? onLongPress;
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
        {showStatus ? (
          <Text numberOfLines={1} style={[styles.area, { color: colors.mutedForeground }]}>
            {row.areaLabel || showStartup ? '· ' : ''}
            {STATUS_LABELS[row.status]}
          </Text>
        ) : null}
        <View style={styles.grow} />
        <DueChip dueDate={row.dueDate} now={now} done={row.done} accessible={false} />
      </View>
    </>
  );

  const content = (
    <View style={styles.row}>
      <AnimatedCheck
        checked={row.done}
        onToggle={(next) => onToggleDone(row, next)}
        // Imenica, ne glagol: stanje (završeno/otvoreno) čita `checked`.
        accessibilityLabel={`Zadatak: ${row.title}`}
        disabled={!row.permissions.status.allowed}
        disabledReason={row.permissions.status.reason ?? STATUS_DENIED_REASON}
        onDisabledPress={
          onDenied ? () => onDenied(row, row.permissions.status.reason ?? STATUS_DENIED_REASON) : undefined
        }
      />
      {tap ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={onOpen ? 'Otvara panel zadatka' : 'Otvara radnje zadatka'}
          {...a11y}
          delayLongPress={LONG_PRESS_MS}
          onPress={() => {
            haptics.tap();
            tap(row);
          }}
          onLongPress={
            onLongPress
              ? () => {
                  haptics.select();
                  onLongPress(row);
                }
              : undefined
          }
          style={({ pressed }) => [styles.body, pressed && { backgroundColor: colors.muted }]}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.body} accessible accessibilityLabel={label} {...a11y}>
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

  if (!onSchedule) return content;
  return (
    <SwipeRow rightAction={rightAction} leftAction={leftAction}>
      {content}
    </SwipeRow>
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
