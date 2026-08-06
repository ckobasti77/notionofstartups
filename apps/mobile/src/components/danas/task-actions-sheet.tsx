import { Check } from 'lucide-react-native';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { dueDayDiff } from '@/lib/deadline';
import {
  dueDateInDays,
  priorityColor,
  statusColor,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/task-meta';
import type { CommandCenterTask, StartupMember, TaskAssignee } from '@/lib/tasks';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

type DuePreset = { label: string; days: number | null };

const DUE_PRESETS: readonly DuePreset[] = [
  { label: 'Danas', days: 0 },
  { label: 'Sutra', days: 1 },
  { label: 'Za 7 dana', days: 7 },
  { label: 'Bez roka', days: null },
];

/**
 * Meni akcija nad zadatkom (svajp levo ili tap). Sekcije: status, prioritet, rok,
 * izvršilac. `statusOnly` (long-press) prikazuje samo status. Dozvole gejtuju
 * akcije: status menja kreator ili izvršilac; prioritet/rok/pun spisak izvršilaca
 * samo kreator; priključivanje/napuštanje sme svako.
 */
export function TaskActionsSheet({
  task,
  statusOnly = false,
  now,
  assignees,
  members,
  currentProfileId,
  canChangeStatus,
  canEditAll,
  onStatus,
  onPriority,
  onDue,
  onJoinLeave,
  onSetAssignees,
  onClose,
}: {
  task: CommandCenterTask | null;
  statusOnly?: boolean;
  now: number;
  assignees: TaskAssignee[];
  members: StartupMember[] | undefined;
  currentProfileId: Id<'profiles'> | null;
  canChangeStatus: boolean;
  canEditAll: boolean;
  onStatus: (status: TaskStatus) => void;
  onPriority: (priority: TaskPriority) => void;
  onDue: (dueDate: number | null) => void;
  onJoinLeave: (isSelfAssigned: boolean) => void;
  onSetAssignees: (profileIds: Id<'profiles'>[]) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const assignedIds = new Set(assignees.map((a) => a.profileId));
  const isSelfAssigned = currentProfileId !== null && assignedIds.has(currentProfileId);

  const dueDayDiffValue =
    task && task.dueDate !== null ? dueDayDiff(task.dueDate, now) : null;
  const activeDuePreset = (preset: DuePreset): boolean => {
    if (!task) return false;
    if (preset.days === null) return task.dueDate === null;
    return dueDayDiffValue === preset.days;
  };

  const toggleMember = (profileId: Id<'profiles'>) => {
    const next = new Set(assignedIds);
    if (next.has(profileId)) next.delete(profileId);
    else next.add(profileId);
    onSetAssignees([...next]);
  };

  return (
    <Modal visible={task !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Zatvori" style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.popover,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}>
        {task ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <Text numberOfLines={2} style={[styles.taskTitle, { color: colors.foreground }]}>
              {task.title}
            </Text>

            <Section label="Status" hint={canChangeStatus ? undefined : 'Status menja kreator ili izvršilac.'} colors={colors}>
              <View style={styles.chips}>
                {TASK_STATUS_ORDER.map((status) => (
                  <OptionChip
                    key={status}
                    label={TASK_STATUS_META[status].label}
                    dotColor={statusColor(colors, status)}
                    active={task.taskStatus === status}
                    disabled={!canChangeStatus}
                    onPress={() => onStatus(status)}
                    colors={colors}
                  />
                ))}
              </View>
            </Section>

            {statusOnly ? null : (
              <>
                <Section
                  label="Prioritet"
                  hint={canEditAll ? undefined : 'Prioritet menja samo kreator.'}
                  colors={colors}>
                  <View style={styles.chips}>
                    {TASK_PRIORITY_ORDER.map((priority) => (
                      <OptionChip
                        key={priority}
                        label={TASK_PRIORITY_META[priority].label}
                        dotColor={priorityColor(colors, priority)}
                        active={(task.taskPriority ?? 'medium') === priority}
                        disabled={!canEditAll}
                        onPress={() => onPriority(priority)}
                        colors={colors}
                      />
                    ))}
                  </View>
                </Section>

                <Section
                  label="Rok"
                  hint={canEditAll ? undefined : 'Rok menja samo kreator.'}
                  colors={colors}>
                  <View style={styles.chips}>
                    {DUE_PRESETS.map((preset) => (
                      <OptionChip
                        key={preset.label}
                        label={preset.label}
                        active={activeDuePreset(preset)}
                        disabled={!canEditAll}
                        onPress={() =>
                          onDue(preset.days === null ? null : dueDateInDays(preset.days))
                        }
                        colors={colors}
                      />
                    ))}
                  </View>
                </Section>

                <Section label="Izvršilac" colors={colors}>
                  {canEditAll && members === undefined ? (
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                      Učitavanje članova…
                    </Text>
                  ) : canEditAll && members ? (
                    <View style={styles.members}>
                      {members.map((member) => {
                        const active = assignedIds.has(member.profile._id);
                        return (
                          <Pressable
                            key={member.membershipId}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: active }}
                            accessibilityLabel={member.profile.displayName}
                            onPress={() => toggleMember(member.profile._id)}
                            style={({ pressed }) => [
                              styles.memberRow,
                              pressed && { backgroundColor: colors.muted },
                            ]}>
                            <Avatar
                              name={member.profile.displayName}
                              uri={member.profile.avatarUrl}
                              size={32}
                            />
                            <Text
                              numberOfLines={1}
                              style={[styles.memberName, { color: colors.foreground }]}>
                              {member.profile.displayName}
                            </Text>
                            {active ? <Check size={18} color={colors.primary} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onJoinLeave(isSelfAssigned)}
                      style={({ pressed }) => [
                        styles.selfRow,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.muted },
                      ]}>
                      <Text style={[styles.selfLabel, { color: colors.foreground }]}>
                        {isSelfAssigned ? 'Napusti zadatak' : 'Priključi se zadatku'}
                      </Text>
                    </Pressable>
                  )}
                </Section>
              </>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

function Section({
  label,
  hint,
  colors,
  children,
}: {
  label: string;
  hint?: string;
  colors: ColorTokens;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
    </View>
  );
}

function OptionChip({
  label,
  dotColor,
  active,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  dotColor?: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.secondary,
          borderColor: active ? colors.primary : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}>
      {dotColor ? <View style={[styles.chipDot, { backgroundColor: dotColor }]} /> : null}
      <Text
        style={[
          styles.chipLabel,
          { color: active ? colors.accentForeground : colors.foreground },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 4,
  },
  taskTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeight.bold,
    marginBottom: 8,
  },
  section: {
    marginTop: 12,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipLabel: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  members: {
    gap: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  memberName: {
    flex: 1,
    fontSize: 16,
  },
  selfRow: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selfLabel: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
});
