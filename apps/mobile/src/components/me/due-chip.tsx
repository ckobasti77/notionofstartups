import { describeDue, formatDateShort, type DueTone } from '@devotion/shared';
import { CalendarClock, Flame } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text, type ColorTokens } from '@/theme/tokens';

export type DueChipProps = {
  dueDate: number | null;
  now: number;
  /** Završen zadatak: rok bez tona upozorenja. */
  done?: boolean;
  /** Bez roka: ništa (u gustim redovima) ili „Bez roka". */
  showEmpty?: boolean;
  /**
   * `false` kad je čip deo većeg elementa koji već čita rok u svojoj labeli
   * (telo reda) — da Android ne fokusira čip drugi put.
   */
  accessible?: boolean;
  style?: StyleProp<ViewStyle>;
};

function toneColor(colors: ColorTokens, tone: DueTone): string {
  switch (tone) {
    case 'overdue':
      return colors.danger;
    case 'today':
      return colors.foreground;
    default:
      return colors.mutedForeground;
  }
}

/**
 * Čip roka (plan K07 §5), par web `components/me/due-chip.tsx`: kratka oznaka
 * iz `describeDue` („kasni 2 d", „danas", „sre 28. okt"), puna rečenica za
 * čitač ekrana. Boja prati ton roka, nikad ton startupa; prekoračeno nosi i
 * ikonicu (oblik, ne samo boja).
 */
export function DueChip({
  dueDate,
  now,
  done = false,
  showEmpty = false,
  accessible = true,
  style,
}: DueChipProps) {
  const colors = useThemeColors();
  const due = dueChipText(dueDate, now, done);
  if (due.tone === 'none' && !showEmpty) return null;
  const color = toneColor(colors, due.tone);
  const Icon = due.tone === 'overdue' ? Flame : due.tone === 'today' ? CalendarClock : null;

  return (
    <View
      style={[styles.row, style]}
      accessible={accessible}
      accessibilityLabel={accessible ? due.ariaLabel : undefined}
      importantForAccessibility={accessible ? 'auto' : 'no-hide-descendants'}>
      {Icon ? <Icon size={14} color={color} /> : null}
      <Text
        numberOfLines={1}
        style={[styles.label, { color }, due.tone === 'overdue' && styles.loud]}>
        {due.label}
      </Text>
    </View>
  );
}

/**
 * Oznaka roka: za otvoren zadatak `describeDue`; za završen samo datum bez
 * tona upozorenja — završen zadatak ne „kasni".
 */
export function dueChipText(
  dueDate: number | null,
  now: number,
  done: boolean,
): { label: string; ariaLabel: string; tone: DueTone } {
  const due = describeDue(dueDate, now);
  if (!done || dueDate === null || due.tone === 'none') return due;
  const date = formatDateShort(dueDate);
  return { label: date, ariaLabel: `Rok bio ${date}`, tone: 'later' };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  label: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
  },
  loud: {
    fontWeight: fontWeight.semibold,
  },
});
