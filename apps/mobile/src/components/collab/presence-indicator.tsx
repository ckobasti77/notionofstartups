import { StyleSheet, Text, View } from 'react-native';

import { presenceLabel, type PresenceRow } from '@/components/collab/collab-model';
import { Avatar } from '@/components/ui/avatar';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

/**
 * „Ana uređuje" (P23): avatar prvog urednika i tekst. Prikazuje samo `editing`
 * redove koje je `activeEditors` već filtrirao po TTL-u. Prazno = ništa.
 */
export function PresenceIndicator({ editors }: { editors: ReadonlyArray<PresenceRow> }) {
  const colors = useThemeColors();
  const label = presenceLabel(editors.map((editor) => editor.displayName));
  if (label === null) return null;
  const first = editors[0];
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={styles.row}>
      <Avatar name={first.displayName} uri={first.avatarUrl} size={20} />
      <Text numberOfLines={1} style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    ...text.meta,
    flexShrink: 1,
  },
});
