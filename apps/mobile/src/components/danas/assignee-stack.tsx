import { UserRound } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import type { TaskAssignee } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

const AVATAR = 26;

/**
 * Preklopljeni avatari izvršilaca (najviše `max`, pa „+N"). Nedodeljeni zadatak
 * pokazuje tihu ikonicu — da se vidi da čeka nekoga.
 */
export function AssigneeStack({
  assignees,
  max = 3,
}: {
  assignees: TaskAssignee[];
  max?: number;
}) {
  const colors = useThemeColors();

  if (assignees.length === 0) {
    return (
      <View
        accessible
        accessibilityLabel="Nedodeljeno"
        style={[styles.placeholder, { borderColor: colors.border }]}>
        <UserRound size={14} color={colors.mutedForeground} />
      </View>
    );
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
  placeholder: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
