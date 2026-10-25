import {
  groupSuggestions,
  type PlanDayCarryRow,
  type PlanDayModel,
  type PlanDaySuggestionRow,
  type TaskRowModel,
} from '@devotion/shared';
import { CalendarCheck2, Lock, Plus, RefreshCw, Undo2, X } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { exitFade, listLayout, NumberRoll } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

import { DueChip, dueChipText } from './due-chip';
import { StartupChip } from './startup-chip';

export type PlanDayState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; model: PlanDayModel };

export type PlanDaySheetProps = {
  visible: boolean;
  onClose: () => void;
  now: number;
  state: PlanDayState;
  onAdd: (row: TaskRowModel) => void;
  onCarryOver: (refKeys: string[]) => void;
  onDismiss: (refKeys: string[]) => void;
};

/**
 * „Isplaniraj dan" (plan K07 §2) — par web `PlanDayDialog`: „Preneto od
 * ranije" (Vrati / Skloni / Vrati sve u danas) i predlozi po razlogu sa „+".
 * Ništa se ne prenosi samo. Model je iz shared paketa (`buildPlanDay`), pa su
 * predlozi i preneto isti kao na webu. Dodata stavka izlazi iz liste (pretapanje),
 * ostali se razmaknu (layout `snappy`), brojač „U planu" se kotrlja.
 *
 * Pun plan (50): radnje ostaju vidljive, ali dodir samo upozori (haptika i
 * najava čitaču) uz napomenu sa razlogom (E15: bez prozirnosti).
 */
export function PlanDaySheet({ visible, onClose, now, state, onAdd, onCarryOver, onDismiss }: PlanDaySheetProps) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const layout = useMemo(() => listLayout(reduced), [reduced]);
  const full = state.status === 'ready' && state.model.plannedCount >= state.model.max;
  const fullReason = state.status === 'ready' ? `Moj dan može imati najviše ${state.model.max} stavki.` : '';
  const guard = (run: () => void) => () => {
    if (full) {
      haptics.warning();
      AccessibilityInfo.announceForAccessibility(fullReason);
      return;
    }
    haptics.select();
    run();
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="90%">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
          Isplaniraj dan
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Izaberi šta radiš danas. Ništa se ne prenosi samo.
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {state.status === 'loading' ? (
          <View accessible accessibilityLabel="Učitavanje predloga" style={styles.skeletons}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} width="100%" height={56} borderRadius={radius.card} />
            ))}
          </View>
        ) : state.status === 'error' ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>Predlozi se ne mogu učitati.</Text>
            <Button
              label="Pokušaj ponovo"
              variant="secondary"
              size="md"
              icon={<RefreshCw size={16} color={colors.foreground} />}
              onPress={state.retry}
            />
          </View>
        ) : (
          <>
            {full ? (
              <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: colors.muted }]}>
                <Lock size={16} color={colors.mutedForeground} />
                <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>{fullReason}</Text>
              </View>
            ) : null}

            {state.model.carryOver.length > 0 ? (
              <PlanSection
                title="Preneto od ranije"
                action={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint={full ? fullReason : undefined}
                    onPress={guard(() => onCarryOver(state.model.carryOver.map((item) => item.row.key)))}
                    style={({ pressed }) => [styles.linkButton, pressed && { backgroundColor: colors.muted }]}>
                    <Undo2 size={16} color={colors.primaryText} />
                    <Text style={[styles.linkText, { color: colors.primaryText }]}>Vrati sve u danas</Text>
                  </Pressable>
                }>
                {state.model.carryOver.map((item) => (
                  <Animated.View key={item.row.key} layout={layout} exiting={exitFade(reduced)}>
                    <CarryRow
                      item={item}
                      now={now}
                      fullReason={full ? fullReason : null}
                      onReturn={guard(() => onCarryOver([item.row.key]))}
                      onDismiss={() => {
                        haptics.select();
                        onDismiss([item.row.key]);
                      }}
                    />
                  </Animated.View>
                ))}
              </PlanSection>
            ) : null}

            {state.model.suggestions.length > 0 ? (
              groupSuggestions(state.model.suggestions).map((group, index) => (
                <PlanSection key={group.reason} title={index === 0 ? `Predlozi · ${group.label}` : group.label}>
                  {group.rows.map((item) => (
                    <Animated.View key={item.row.key} layout={layout} exiting={exitFade(reduced)}>
                      <SuggestionRow
                        item={item}
                        now={now}
                        fullReason={full ? fullReason : null}
                        onAdd={guard(() => onAdd(item.row))}
                      />
                    </Animated.View>
                  ))}
                </PlanSection>
              ))
            ) : state.model.carryOver.length === 0 ? (
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
                  <CalendarCheck2 size={22} color={colors.accentForeground} />
                </View>
                <Text style={[styles.body, styles.center, { color: colors.mutedForeground }]}>
                  Nema predloga. Sve važno je već u planu.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {state.status === 'ready' ? (
          <View
            accessible
            accessibilityLabel={`U planu: ${state.model.plannedCount} od ${state.model.max}`}
            style={styles.counter}>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>U planu: </Text>
            <NumberRoll
              value={state.model.plannedCount}
              cap={state.model.max}
              style={[styles.body, styles.counterValue, { color: colors.foreground }]}
            />
            <Text style={[styles.body, { color: colors.mutedForeground }]}> od {state.model.max}</Text>
          </View>
        ) : (
          <View />
        )}
        <Button label="Gotovo" size="md" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function PlanSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={[styles.overline, { color: colors.mutedForeground }]}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function RowBody({ row, now, meta }: { row: TaskRowModel; now: number; meta?: string }) {
  const colors = useThemeColors();
  // Jedna labela za čitač ekrana (naslov, mesto, odakle, rok) — delovi su skriveni.
  const due = dueChipText(row.dueDate, now, row.done);
  const label = [
    row.title,
    [row.startup === null ? 'Lično' : row.startup.name, row.areaLabel].filter(Boolean).join(' · '),
    meta ?? null,
    due.tone === 'none' ? null : due.ariaLabel,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View accessible accessibilityLabel={label} style={styles.rowBody}>
      <Text numberOfLines={1} style={[styles.body, { color: colors.foreground }]}>
        {row.title}
      </Text>
      <View style={styles.rowMeta}>
        <StartupChip startup={row.startup} size="sm" showName />
        {row.areaLabel ? (
          <Text numberOfLines={1} style={[styles.meta, { color: colors.mutedForeground }]}>
            · {row.areaLabel}
          </Text>
        ) : null}
        {meta ? (
          <Text numberOfLines={1} style={[styles.meta, { color: colors.mutedForeground }]}>
            · {meta}
          </Text>
        ) : null}
        <View style={styles.grow} />
        <DueChip dueDate={row.dueDate} now={now} accessible={false} />
      </View>
    </View>
  );
}

function CarryRow({
  item,
  now,
  fullReason,
  onReturn,
  onDismiss,
}: {
  item: PlanDayCarryRow;
  now: number;
  fullReason: string | null;
  onReturn: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <RowBody row={item.row} now={now} meta={`iz ${item.fromLabel}`} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Vrati u danas: ${item.row.title}`}
        accessibilityHint={fullReason ?? undefined}
        onPress={onReturn}
        style={({ pressed }) => [
          styles.returnButton,
          { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.secondary },
        ]}>
        <Text style={[styles.returnText, { color: colors.foreground }]}>Vrati</Text>
      </Pressable>
      <IconButton accessibilityLabel={`Skloni: ${item.row.title}`} onPress={onDismiss}>
        <X size={20} color={colors.mutedForeground} />
      </IconButton>
    </View>
  );
}

function SuggestionRow({
  item,
  now,
  fullReason,
  onAdd,
}: {
  item: PlanDaySuggestionRow;
  now: number;
  fullReason: string | null;
  onAdd: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <RowBody row={item.row} now={now} />
      <IconButton
        accessibilityLabel={`Dodaj u Moj dan: ${item.row.title}`}
        accessibilityHint={fullReason ?? undefined}
        onPress={onAdd}
        style={({ pressed }) => [
          styles.addButton,
          { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.secondary },
        ]}>
        <Plus size={20} color={colors.foreground} />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 2,
  },
  title: {
    ...text.title,
  },
  description: {
    ...text.body,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 20,
  },
  skeletons: {
    gap: 8,
  },
  error: {
    alignItems: 'flex-start',
    gap: 12,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  noticeText: {
    ...text.body,
    flex: 1,
  },
  section: {
    gap: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
  },
  overline: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  linkText: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 60,
    paddingVertical: 4,
  },
  rowBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  grow: {
    flexGrow: 1,
  },
  body: {
    ...text.body,
  },
  meta: {
    ...text.meta,
    flexShrink: 1,
  },
  center: {
    textAlign: 'center',
  },
  returnButton: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  returnText: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  addButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterValue: {
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
