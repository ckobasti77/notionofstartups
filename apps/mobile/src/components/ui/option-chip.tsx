import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

export type OptionChipProps = {
  label: string;
  /** Tačkica levo (status/prioritet) — boja dolazi iz `statusColor`/`priorityColor`. */
  dotColor?: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * Chip iz reda opcija koje se isključuju (status, prioritet, rok). Aktivan je
 * indigo-tint (`accent`), neaktivan suptilna površina. Dodirna meta ≥ 44pt.
 *
 * Deljen između menija akcija zadatka (`TaskActionsSheet`) i kreiranja zadatka
 * (`PageCreateSheet`) — isti izgled i ista dodirna meta na oba mesta.
 */
export function OptionChip({ label, dotColor, active, disabled, onPress }: OptionChipProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      // Haptika je u primitivu: izbor opcije svuda znači isto (tiši signal od akcije).
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.secondary,
          borderColor: active ? colors.primary : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}>
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[styles.label, { color: active ? colors.accentForeground : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
});
