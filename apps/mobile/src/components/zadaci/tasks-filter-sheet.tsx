import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { OptionChip } from '@/components/ui/option-chip';
import { Sheet } from '@/components/ui/sheet';
import type { Id } from '@/convex/_generated/dataModel';
import {
  priorityColor,
  statusColor,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/task-meta';
import type { StartupMember } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, type ColorTokens } from '@/theme/tokens';

export type StatusFilter = 'all' | TaskStatus;
export type PriorityFilter = 'all' | TaskPriority;
export type AssigneeFilter = 'all' | 'unassigned' | Id<'profiles'>;
export type DueFilter = 'all' | 'today' | 'overdue' | 'upcoming';

const DUE_OPTIONS: readonly { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Svi' },
  { value: 'today', label: 'Danas' },
  { value: 'overdue', label: 'Mimo roka' },
  { value: 'upcoming', label: 'Predstojeći' },
];

/**
 * Filteri za „Svi zadaci" (status/prioritet/izvršilac/rok) — primena je ODMAH po
 * tapu, bez „Primeni" dugmeta (isti obrazac kao `WorkloadStrip` filter u Danas).
 * Čipovi, ne `Row` primitivi — ovo je selekciona kontrola, ne red liste.
 */
export function TasksFilterSheet({
  open,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  assignee,
  onAssigneeChange,
  due,
  onDueChange,
  members,
  onClear,
  onClose,
}: {
  open: boolean;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  priority: PriorityFilter;
  onPriorityChange: (value: PriorityFilter) => void;
  assignee: AssigneeFilter;
  onAssigneeChange: (value: AssigneeFilter) => void;
  due: DueFilter;
  onDueChange: (value: DueFilter) => void;
  members: StartupMember[] | undefined;
  onClear: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const hasActive = status !== 'all' || priority !== 'all' || assignee !== 'all' || due !== 'all';

  return (
    <Sheet visible={open} onClose={onClose} maxHeight="85%" style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Filteri
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Section label="Status" colors={colors}>
          <View style={styles.chips}>
            <OptionChip label="Svi" active={status === 'all'} onPress={() => onStatusChange('all')} />
            {TASK_STATUS_ORDER.map((value) => (
              <OptionChip
                key={value}
                label={TASK_STATUS_META[value].label}
                dotColor={statusColor(colors, value)}
                active={status === value}
                onPress={() => onStatusChange(value)}
              />
            ))}
          </View>
        </Section>

        <Section label="Prioritet" colors={colors}>
          <View style={styles.chips}>
            <OptionChip label="Svi" active={priority === 'all'} onPress={() => onPriorityChange('all')} />
            {TASK_PRIORITY_ORDER.map((value) => (
              <OptionChip
                key={value}
                label={TASK_PRIORITY_META[value].label}
                dotColor={priorityColor(colors, value)}
                active={priority === value}
                onPress={() => onPriorityChange(value)}
              />
            ))}
          </View>
        </Section>

        <Section label="Izvršilac" colors={colors}>
          <View style={styles.chips}>
            <OptionChip label="Svi" active={assignee === 'all'} onPress={() => onAssigneeChange('all')} />
            <OptionChip
              label="Nedodeljeno"
              active={assignee === 'unassigned'}
              onPress={() => onAssigneeChange('unassigned')}
            />
            {(members ?? []).map((member) => (
              <OptionChip
                key={member.membershipId}
                label={member.profile.displayName}
                active={assignee === member.profile._id}
                onPress={() => onAssigneeChange(member.profile._id)}
              />
            ))}
          </View>
        </Section>

        <Section label="Rok" colors={colors}>
          <View style={styles.chips}>
            {DUE_OPTIONS.map((option) => (
              <OptionChip
                key={option.value}
                label={option.label}
                active={due === option.value}
                onPress={() => onDueChange(option.value)}
              />
            ))}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.actions}>
        {hasActive ? (
          <Button label="Očisti filtere" variant="ghost" onPress={onClear} style={styles.flexBtn} />
        ) : null}
        <Button label="Zatvori" onPress={onClose} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

function Section({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ColorTokens;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: 14,
    paddingBottom: 4,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
  },
  flexBtn: {
    flex: 1,
  },
});
