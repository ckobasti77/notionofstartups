import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import type { ChatMember } from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

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
          <Pressable
            key={member.profile._id}
            accessibilityRole="button"
            accessibilityLabel={`Pomeni ${member.profile.displayName}`}
            onPress={() => onSelect(member)}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Avatar
              name={member.profile.displayName}
              uri={member.profile.avatarUrl ?? null}
              size={28}
            />
            <Text
              numberOfLines={1}
              style={[styles.name, { color: colors.foreground }]}>
              {member.profile.displayName}
            </Text>
          </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  name: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
    flexShrink: 1,
  },
});
