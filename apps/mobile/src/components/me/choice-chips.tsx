import {
  DUE_SHORTCUT_LABELS,
  DUE_SHORTCUTS,
  dueShortcutValue,
  formatDateShort,
  formatDayHeading,
  PRIORITY_LABELS,
  STARTUP_TASK_STATUSES,
  STATUS_LABELS,
  type DueShortcut,
  type StartupTaskStatus,
  type TaskPriorityKey,
} from '@devotion/shared';
import { CalendarDays, Check, ChevronLeft, Lock } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { enterFadeUp } from '@/components/motion';
import { MonthCalendar } from '@/components/ui/date-picker-sheet';
import { IconButton } from '@/components/ui/icon-button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { priorityColor, statusColor } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/**
 * Delovi sheet-ova ličnog nivoa (K12): grupa čipova kao `radiogroup`, čip izbora
 * sa opcionim detaljem (datum ispod oznake), zaključana radnja (E15: katanac +
 * razlog, bez prozirnosti) i gotove grupe za rok i prioritet. Isti čipovi su u
 * brzom unosu, „Rok i plan" i sheet-u radnji — kao web (`quick-add-dialog`,
 * meni reda), sa dodirom ≥ 44 pt.
 */

export function ChipGroup({
  label,
  children,
  scroll = false,
}: {
  label: string;
  children: ReactNode;
  /** Jedan red koji se skroluje vodoravno (npr. startupi) umesto prelamanja. */
  scroll?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          // Čipovi idu do ivice sheet-a; prvi i poslednji ostaju poravnati sa sadržajem.
          style={styles.scrollRow}
          contentContainerStyle={styles.scrollChips}>
          {children}
        </ScrollView>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
          {children}
        </View>
      )}
    </View>
  );
}

export function ChoiceChip({
  label,
  detail,
  selected,
  onPress,
  leading,
  accessibilityLabel,
}: {
  label: string;
  /** Sitan red ispod oznake (npr. „ned 25. okt"). */
  detail?: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
  accessibilityLabel?: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        // Neizabran: podloga `surface` (tamnija od sheet-a u tamnoj temi) i ivica
        // `input`; izabran: indigo tint + ivica `primary` + kvačica (oblik, ne
        // samo boja). Ista debljina ivice i rezervisano mesto kvačice: izbor ne
        // menja širinu čipa, pa se red ne preslaže.
        selected
          ? { backgroundColor: colors.accent, borderColor: colors.primary }
          : { backgroundColor: colors.surface, borderColor: colors.input },
        pressed && !selected && { backgroundColor: colors.muted },
      ]}>
      {leading}
      <View>
        <Text
          numberOfLines={1}
          style={[styles.chipLabel, { color: selected ? colors.accentForeground : colors.foreground }]}>
          {label}
        </Text>
        {detail ? (
          <Text
            numberOfLines={1}
            style={[styles.chipDetail, { color: selected ? colors.accentForeground : colors.mutedForeground }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={selected ? null : styles.checkHidden}>
        <Check size={16} color={colors.accentForeground} />
      </View>
    </Pressable>
  );
}

/** Zabranjena radnja (E15): katanac i razlog umesto čipova — tekst, ne prozirnost. */
export function LockedNotice({ label, reason }: { label: string; reason: string }) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${reason}`}
      style={[styles.locked, { backgroundColor: colors.muted }]}>
      <Lock size={16} color={colors.mutedForeground} />
      <Text style={[styles.lockedText, { color: colors.mutedForeground }]}>{reason}</Text>
    </View>
  );
}

export type DueChoice = DueShortcut | 'date' | 'none';

/**
 * Rok: Danas · Sutra · Vikend · Sledeće nedelje (sa datumom ispod), „Datum…" i
 * „Bez roka". Vrednost je uvek lokalno podne (`dueShortcutValue`). Petkom,
 * subotom i nedeljom dve prečice mogu biti isti dan — izabran je ČIP koji
 * pozivalac zna (`selected`), ne samo datum.
 */
export function DueChoiceChips({
  now,
  selected,
  dateLabel,
  onShortcut,
  onPickDate,
  onNone,
  label = 'Rok',
}: {
  now: number;
  selected: DueChoice | null;
  /** Izabran dan iz kalendara („sre 28. okt"); bez njega čip piše „Datum…". */
  dateLabel?: string | null;
  onShortcut: (shortcut: DueShortcut, value: number) => void;
  onPickDate: () => void;
  /** Bez rukovaoca nema čipa „Bez roka". */
  onNone?: () => void;
  label?: string;
}) {
  const colors = useThemeColors();
  return (
    <ChipGroup label={label}>
      {DUE_SHORTCUTS.map((shortcut) => {
        const value = dueShortcutValue(shortcut, now);
        return (
          <ChoiceChip
            key={shortcut}
            label={DUE_SHORTCUT_LABELS[shortcut]}
            detail={formatDateShort(value)}
            accessibilityLabel={`${DUE_SHORTCUT_LABELS[shortcut]}, ${formatDayHeading(value)}`}
            selected={selected === shortcut}
            onPress={() => onShortcut(shortcut, value)}
          />
        );
      })}
      <ChoiceChip
        label={selected === 'date' && dateLabel ? dateLabel : 'Datum…'}
        accessibilityLabel={selected === 'date' && dateLabel ? `Rok: ${dateLabel}` : 'Izaberi datum'}
        leading={<CalendarDays size={16} color={selected === 'date' ? colors.accentForeground : colors.mutedForeground} />}
        selected={selected === 'date'}
        onPress={onPickDate}
      />
      {onNone ? <ChoiceChip label="Bez roka" selected={selected === 'none'} onPress={onNone} /> : null}
    </ChipGroup>
  );
}

/**
 * Kalendar U sheet-u koji je već otvoren (K12): „Nazad" + mreža meseca. iOS ne
 * prikazuje drugi `Modal` dok je prvi otvoren, pa „Datum…" smenjuje sadržaj
 * sheet-a umesto da otvara `DatePickerSheet` preko njega. Ulaz `enterFadeUp`.
 */
export function InlineDatePicker({
  value,
  onSelect,
  onBack,
}: {
  value: number | null;
  onSelect: (dueDate: number) => void;
  onBack: () => void;
}) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={enterFadeUp(0, reduced)} style={styles.inlineDate}>
      <View style={styles.inlineDateHeader}>
        <IconButton
          accessibilityLabel="Nazad"
          onPress={() => {
            haptics.select();
            onBack();
          }}>
          <ChevronLeft size={22} color={colors.foreground} />
        </IconButton>
        <Text accessibilityRole="header" style={[styles.headerTitle, { color: colors.foreground }]}>
          Izaberi rok
        </Text>
      </View>
      <MonthCalendar value={value} onSelect={onSelect} />
    </Animated.View>
  );
}

/** Zaglavlje sheet-a nad jednim zadatkom: mala oznaka, naslov i „startup · oblast". */
export function SheetTaskHeader({
  overline,
  title,
  startup,
  areaLabel,
}: {
  overline: string;
  title: string;
  startup: { name: string; logoUrl?: string | null } | null;
  areaLabel: string | null;
}) {
  const colors = useThemeColors();
  const place = [startup === null ? 'Lično' : startup.name, areaLabel].filter(Boolean).join(' · ');
  return (
    <View style={styles.header}>
      <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{overline}</Text>
      <Text accessibilityRole="header" numberOfLines={2} style={[styles.headerTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={[styles.headerPlace, { color: colors.mutedForeground }]}>
        {place}
      </Text>
    </View>
  );
}

/** Status zadatka u startupu: Backlog · Sledeće · U toku · Blokirano · Gotovo (par web menija „Status"). */
export function StatusChoiceChips({
  value,
  onSelect,
}: {
  value: StartupTaskStatus;
  onSelect: (status: StartupTaskStatus) => void;
}) {
  const colors = useThemeColors();
  return (
    <ChipGroup label="Status">
      {STARTUP_TASK_STATUSES.map((status) => (
        <ChoiceChip
          key={status}
          label={STATUS_LABELS[status]}
          leading={<View style={[styles.dot, { backgroundColor: statusColor(colors, status) }]} />}
          selected={value === status}
          onPress={() => onSelect(status)}
        />
      ))}
    </ChipGroup>
  );
}

const PRIORITIES: ReadonlyArray<TaskPriorityKey> = ['urgent', 'high', 'medium', 'low'];

/** Prioritet: Hitno · Visok · Srednji · Nizak (+ „Bez prioriteta" samo za lični). */
export function PriorityChoiceChips({
  value,
  allowNone,
  onSelect,
}: {
  value: TaskPriorityKey | null;
  allowNone: boolean;
  onSelect: (priority: TaskPriorityKey | null) => void;
}) {
  const colors = useThemeColors();
  return (
    <ChipGroup label="Prioritet">
      {PRIORITIES.map((priority) => (
        <ChoiceChip
          key={priority}
          label={PRIORITY_LABELS[priority]}
          leading={<View style={[styles.dot, { backgroundColor: priorityColor(colors, priority) }]} />}
          selected={value === priority}
          onPress={() => onSelect(priority)}
        />
      ))}
      {allowNone ? (
        <ChoiceChip label="Bez prioriteta" selected={value === null} onPress={() => onSelect(null)} />
      ) : null}
    </ChipGroup>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  groupLabel: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scrollRow: {
    marginHorizontal: -20,
    flexGrow: 0,
  },
  scrollChips: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  checkHidden: {
    opacity: 0,
  },
  chipLabel: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  chipDetail: {
    ...text.meta,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  lockedText: {
    ...text.body,
    flex: 1,
  },
  header: {
    gap: 2,
  },
  inlineDate: {
    gap: 8,
  },
  inlineDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Strelica optički na ivici sadržaja (dodirna meta ostaje 44 pt).
    marginLeft: -10,
  },
  headerTitle: {
    ...text.title,
  },
  headerPlace: {
    ...text.meta,
  },
});
