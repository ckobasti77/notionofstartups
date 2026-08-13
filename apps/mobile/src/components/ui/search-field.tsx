import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text as textStyles } from '@/theme/tokens';

/**
 * Kutija za pretragu — izvučena iz `pretraga.tsx` (muted kutija, `Search` ikona,
 * `TextInput`, ✕ za brisanje sa metom 44×44). Deljena između ekrana koji filtriraju
 * uživo (P4: ideje, misli); `pretraga.tsx` ostaje na svom obrascu (§5 plana P4).
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  autoFocus,
  editable = true,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  editable?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.box, { backgroundColor: colors.muted }]}>
      <Search size={18} color={colors.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChange}
        autoFocus={autoFocus}
        editable={editable}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        returnKeyType="search"
        autoCapitalize="none"
        style={[styles.input, { color: colors.foreground }]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Obriši pretragu"
          onPress={() => onChange('')}
          style={styles.clearBtn}>
          <X size={18} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  input: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    ...textStyles.body,
    paddingVertical: 0,
  },
  clearBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
