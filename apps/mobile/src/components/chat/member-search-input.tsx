import { StyleSheet, TextInput } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, radius } from '@/theme/tokens';

/**
 * Polje „Pretraži članove…" — isto u sva tri mesta gde se bira član tima
 * (`new-conversation-sheet` × 2 koraka i `channel-members-sheet`). Filtriranje je
 * klijentsko nad već povučenom listom, kao na webu (`chat/new-conversation.tsx`):
 * tim staje u jedan upit od 50 redova, pa serverska pretraga nema šta da doda.
 */
export function MemberSearchInput({
  value,
  onChange,
  editable = true,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  editable?: boolean;
  autoFocus?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      editable={editable}
      autoFocus={autoFocus}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      placeholder="Pretraži članove…"
      placeholderTextColor={colors.mutedForeground}
      selectionColor={colors.primary}
      accessibilityLabel="Pretraži članove"
      style={[
        styles.input,
        { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
});
