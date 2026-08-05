import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

export type SegmentOption<T extends string> = {
  id: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (id: T) => void;
};

/**
 * iOS-oliki segmentovani prekidač: utopljena traka sa istaknutim aktivnim
 * segmentom. Dodirna meta svakog segmenta ≥ 44pt (docs/mobile/02-EKRANI.md §11).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: colors.muted }]}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.id)}
            style={[
              styles.segment,
              active && { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? colors.foreground : colors.mutedForeground },
              ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.lg,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: fontWeight.semibold,
  },
});
