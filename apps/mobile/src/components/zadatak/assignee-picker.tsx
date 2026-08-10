import { Check } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import { MAX_TASK_ASSIGNEES } from '@/lib/task-meta';
import type { StartupMember } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/**
 * Izbor izvršilaca zadatka — JEDNA implementacija granice `MAX_TASK_ASSIGNEES`
 * za sva mesta. Ranije je logika živela u `TaskActionsSheet`, pa je kreiranje
 * zadatka (canvas / podstranica) ostajalo bez nje; sada oba puta zovu isto.
 *
 * Dva ulaza:
 *  - `AssigneePickerList` — lista u mestu (koristi je `TaskActionsSheet`, koji već
 *    ima svoj sheet i sekcije).
 *  - `AssigneePickerSheet` — samostalan bottom sheet nad tom istom listom (koristi
 *    ga kreiranje stranice i detalj zadatka).
 *
 * Server je i dalje jedini autoritet nad granicom; ovo je klijentska brana da se
 * do server errora uopšte ne dođe.
 */

/** „Izvršioci  2/10" — isti brojač gde god se izbor prikazuje. */
export function assigneeCountLabel(count: number): string {
  return `Izvršioci  ${count}/${MAX_TASK_ASSIGNEES}`;
}

/** Poruka kad je granica dostignuta; `undefined` dok ima mesta. */
export function assigneeLimitHint(count: number): string | undefined {
  return count >= MAX_TASK_ASSIGNEES
    ? `Dostignut maksimum od ${MAX_TASK_ASSIGNEES} izvršilaca.`
    : undefined;
}

export function AssigneePickerList({
  members,
  selectedIds,
  onChange,
  disabled = false,
}: {
  /** `undefined` dok `startups.listMembers` traje. */
  members: StartupMember[] | undefined;
  selectedIds: readonly Id<'profiles'>[];
  onChange: (profileIds: Id<'profiles'>[]) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const selected = new Set(selectedIds);
  const atLimit = selected.size >= MAX_TASK_ASSIGNEES;

  const toggle = (profileId: Id<'profiles'>) => {
    const next = new Set(selected);
    if (next.has(profileId)) next.delete(profileId);
    else {
      if (next.size >= MAX_TASK_ASSIGNEES) {
        haptics.warning(); // odbijeno: granica je dostignuta
        return; // klijentska brana pre server errora
      }
      next.add(profileId);
    }
    haptics.select();
    onChange([...next]);
  };

  if (members === undefined) {
    return (
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>Učitavanje članova…</Text>
    );
  }
  if (members.length === 0) {
    return (
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Nema članova u ovom startupu.
      </Text>
    );
  }

  return (
    <View style={styles.members}>
      {members.map((member) => {
        const active = selected.has(member.profile._id);
        return (
          <Row
            key={member.membershipId}
            style={styles.memberRow}
            icon={
              <Avatar name={member.profile.displayName} uri={member.profile.avatarUrl} size={32} />
            }
            title={member.profile.displayName}
            value={active ? <Check size={18} color={colors.primary} /> : undefined}
            onPress={() => toggle(member.profile._id)}
            disabled={disabled || (!active && atLimit)}
            showChevron={false}
            accessibilityLabel={`${member.profile.displayName}${active ? ', dodeljen' : ''}`}
          />
        );
      })}
    </View>
  );
}

export function AssigneePickerSheet({
  open,
  members,
  selectedIds,
  onChange,
  onClose,
}: {
  open: boolean;
  members: StartupMember[] | undefined;
  selectedIds: readonly Id<'profiles'>[];
  onChange: (profileIds: Id<'profiles'>[]) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const hint = assigneeLimitHint(selectedIds.length);

  return (
    <Sheet visible={open} onClose={onClose} maxHeight="80%" style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        {assigneeCountLabel(selectedIds.length)}
      </Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <AssigneePickerList members={members} selectedIds={selectedIds} onChange={onChange} />
      </ScrollView>
      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      <Button
        label="Gotovo"
        onPress={() => {
          haptics.tap();
          onClose();
        }}
        style={styles.done}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
    gap: 8,
  },
  heading: {
    ...text.title,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  done: {
    marginTop: 4,
  },
  // Prava rečenica (ne badge/vreme) → osnovnih 16px.
  hint: {
    ...text.body,
  },
  members: {
    gap: 2,
  },
  memberRow: {
    gap: 12,
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
});
