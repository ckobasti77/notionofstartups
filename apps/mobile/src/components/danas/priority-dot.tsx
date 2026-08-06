import { StyleSheet, Text, View } from 'react-native';

import { priorityColor, TASK_PRIORITY_META, type TaskPriority } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight } from '@/theme/tokens';

/**
 * Tačkica prioriteta (obojena po hitnosti). Bez `showLabel` je čisto vizuelna, pa
 * nosi tekstualnu oznaku za čitače ekrana. `null` prioritet se tretira kao srednji.
 */
export function PriorityDot({
  priority,
  showLabel = false,
}: {
  priority: TaskPriority | null;
  showLabel?: boolean;
}) {
  const colors = useThemeColors();
  const label = (priority ? TASK_PRIORITY_META[priority] : TASK_PRIORITY_META.medium).label;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={showLabel ? undefined : `Prioritet: ${label}`}>
      <View style={[styles.dot, { backgroundColor: priorityColor(colors, priority) }]} />
      {showLabel ? (
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
});
