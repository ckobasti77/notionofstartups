import { ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Row } from '@/components/ui/row';
import type { ChatMember } from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/**
 * Popover sa članovima startupa pri kucanju `@`. Prikazuje se iznad unosa;
 * `candidates` su već filtrirani po tekućem `@` tokenu u composeru.
 */
export function MentionAutocomplete({
  candidates,
  onSelect,
}: {
  candidates: ChatMember[];
  onSelect: (member: ChatMember) => void;
}) {
  const colors = useThemeColors();
  if (candidates.length === 0) return null;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.popover, borderColor: colors.border },
      ]}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
        {candidates.map((member) => (
          <Row
            key={member.profile._id}
            style={styles.row}
            icon={
              <Avatar
                name={member.profile.displayName}
                uri={member.profile.avatarUrl ?? null}
                size={28}
              />
            }
            title={member.profile.displayName}
            onPress={() => onSelect(member)}
            showChevron={false}
            accessibilityLabel={`Pomeni ${member.profile.displayName}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  scroll: {
    maxHeight: 196,
  },
  row: {
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
});
