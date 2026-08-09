import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DatePickerSheet, formatDueDate } from '@/components/ui/date-picker-sheet';
import { OptionChip } from '@/components/ui/option-chip';
import { Sheet } from '@/components/ui/sheet';
import {
  AssigneePickerList,
  assigneeCountLabel,
  assigneeLimitHint,
} from '@/components/zadatak/assignee-picker';
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
import type { StartupMember, TaskAssignee } from '@/lib/tasks';

/**
 * Minimalni oblik zadatka koji ovaj sheet stvarno čita. I `CommandCenterTask`
 * (Danas) i rezultat `pages.get` (ekran detalja) ga zadovoljavaju — pa oba ekrana
 * dele isti editor bez cast-a.
 */
export type EditableTask = {
  title: string;
  taskStatus: TaskStatus | null;
  taskPriority: TaskPriority | null;
  dueDate: number | null;
};
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
  task: EditableTask | null;
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

  const assigneeIds = assignees.map((a) => a.profileId);
  const assignedIds = new Set(assigneeIds);
  const isSelfAssigned = currentProfileId !== null && assignedIds.has(currentProfileId);

  const dueDayDiffValue =
    task && task.dueDate !== null ? dueDayDiff(task.dueDate, now) : null;
  const activeDuePreset = (preset: DuePreset): boolean => {
    if (!task) return false;
    if (preset.days === null) return task.dueDate === null;
    return dueDayDiffValue === preset.days;
  };

  const [pickingDate, setPickingDate] = useState(false);
  // „Proizvoljno" je aktivno kad rok postoji ali ga nijedan preset ne pokriva —
  // tada čip nosi sam datum umesto generičke reči.
  const isCustomDue =
    task !== null &&
    task.dueDate !== null &&
    !DUE_PRESETS.some((preset) => preset.days !== null && activeDuePreset(preset));
  const customDueLabel =
    isCustomDue && task?.dueDate != null ? formatDueDate(task.dueDate) : 'Drugi dan…';

  return (
    <>
      <Sheet visible={task !== null} onClose={onClose}>
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
                      />
                    ))}
                    {/* Četiri preseta ne pokrivaju „za tri nedelje" — bez ovog
                        čipa se takav rok mogao uneti samo na webu. */}
                    <OptionChip
                      label={customDueLabel}
                      active={isCustomDue}
                      disabled={!canEditAll}
                      onPress={() => setPickingDate(true)}
                    />
                  </View>
                </Section>

                <Section
                  label={canEditAll ? assigneeCountLabel(assignedIds.size) : 'Izvršioci'}
                  hint={canEditAll ? assigneeLimitHint(assignedIds.size) : undefined}
                  colors={colors}>
                  {canEditAll ? (
                    <AssigneePickerList
                      members={members}
                      selectedIds={assigneeIds}
                      onChange={onSetAssignees}
                    />
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
      </Sheet>
      {/* Sestrinski `Modal`, ne ugnježden: dva ugnježdena `Modal`-a na iOS-u daju
          crn ekran i pojedu gest za zatvaranje. Roditeljski sheet ostaje otvoren
          ispod, pa se posle izbora datuma korisnik vraća na isti meni. */}
      <DatePickerSheet
        visible={pickingDate}
        value={task?.dueDate ?? null}
        onSelect={(dueDate) => {
          setPickingDate(false);
          onDue(dueDate);
        }}
        onClose={() => setPickingDate(false)}
      />
    </>
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

const styles = StyleSheet.create({
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
    // Bilo 12px: ovo je objašnjenje ZAŠTO je opcija onemogućena, ne bedž.
    fontSize: 16,
    lineHeight: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
