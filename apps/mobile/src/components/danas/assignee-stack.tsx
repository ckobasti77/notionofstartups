import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

const AVATAR = 26;

/**
 * Minimalni oblik izvršioca koji stack koristi. Puni `TaskAssignee`
 * (`taskAssignees.listForTasks`) i sažeti izvršilac iz `puls.getWeekly` su oba
 * strukturno saglasni s ovim — pa stack radi za oba bez kastovanja.
 */
export type StackAssignee = {
  profileId: Id<'profiles'>;
  displayName: string;
  avatarUrl: string | null;
};

/**
 * Preklopljeni avatari izvršilaca (najviše `max`, pa „+N"). Nedodeljeni zadatak
 * pokazuje prazan isečkan krug — da se vidi da mesto čeka nekoga.
 */
export function AssigneeStack({
  assignees,
  max = 3,
}: {
  assignees: StackAssignee[];
  max?: number;
}) {
  const colors = useThemeColors();

  if (assignees.length === 0) {
    return <Avatar empty size={AVATAR} accessibilityLabel="Nedodeljeno" />;
  }

  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Izvršioci: ${assignees.map((a) => a.displayName).join(', ')}`}>
      {shown.map((assignee, index) => (
        <View
          key={assignee.profileId}
          style={[
            styles.avatarWrap,
            { marginLeft: index === 0 ? 0 : -8, zIndex: shown.length - index },
          ]}>
          <Avatar
            name={assignee.displayName}
            uri={assignee.avatarUrl}
            size={AVATAR}
            style={{ borderColor: colors.card, borderWidth: 2 }}
          />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.more,
            { backgroundColor: colors.muted, borderColor: colors.card, marginLeft: -8 },
          ]}>
          <Text style={[styles.moreText, { color: colors.mutedForeground }]}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    borderRadius: radius.full,
  },
  more: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
  },
});
