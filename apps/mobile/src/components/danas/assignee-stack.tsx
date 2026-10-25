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
  size = AVATAR,
  accessible = true,
}: {
  assignees: StackAssignee[];
  max?: number;
  size?: number;
  /** `false` kad roditelj sam čita izvršioce (npr. telo reda zadatka). */
  accessible?: boolean;
}) {
  const colors = useThemeColors();

  if (assignees.length === 0) {
    const empty = <Avatar empty size={size} accessibilityLabel="Nedodeljeno" />;
    return accessible ? (
      empty
    ) : (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {empty}
      </View>
    );
  }

  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;

  return (
    <View
      style={styles.row}
      accessible={accessible}
      accessibilityElementsHidden={!accessible}
      importantForAccessibility={accessible ? 'auto' : 'no-hide-descendants'}
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
            size={size}
            style={{ borderColor: colors.card, borderWidth: 2 }}
          />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.more,
            {
              width: size,
              height: size,
              backgroundColor: colors.muted,
              borderColor: colors.card,
              marginLeft: -8,
            },
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
