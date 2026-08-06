import { CalendarClock, CalendarDays, Flame } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  classifyDeadline,
  deadlineAriaLabel,
  deadlineLabel,
  type DeadlineUrgency,
} from '@/lib/deadline';
import type { TaskStatus } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, type ColorTokens } from '@/theme/tokens';

/** Boja hitnosti roka iz semantičkih tokena. */
function urgencyColor(colors: ColorTokens, urgency: DeadlineUrgency): string {
  switch (urgency) {
    case 'overdue':
      return colors.destructive;
    case 'today':
      return colors.warning;
    case 'tomorrow':
    case 'week':
      return colors.info;
    default:
      return colors.mutedForeground;
  }
}

const URGENCY_ICON = {
  overdue: Flame,
  today: CalendarClock,
} as const;

/**
 * Kompaktna pilula roka, obojena po hitnosti (prekoračeno crveno, danas
 * žuto, uskoro plavo). Bez roka i završeni se ne prikazuju.
 */
export function DeadlineBadge({
  dueDate,
  taskStatus,
  now,
}: {
  dueDate: number | null;
  taskStatus: TaskStatus | null;
  now: number;
}) {
  const colors = useThemeColors();
  const classification = classifyDeadline({ dueDate, taskStatus, now });

  if (classification.urgency === 'none' || classification.urgency === 'done') {
    return null;
  }

  const color = urgencyColor(colors, classification.urgency);
  const Icon =
    classification.urgency === 'overdue'
      ? URGENCY_ICON.overdue
      : classification.urgency === 'today'
        ? URGENCY_ICON.today
        : CalendarDays;

  return (
    <View
      accessible
      accessibilityLabel={deadlineAriaLabel(classification, dueDate)}
      // Blaga podloga iste boje (8-cifreni hex sa alfom) za kontrast bez viška šuma.
      style={[styles.pill, { backgroundColor: `${color}22` }]}>
      <Icon size={12} color={color} />
      <Text style={[styles.label, { color }]}>{deadlineLabel(classification, dueDate)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  label: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: fontWeight.semibold,
  },
});
