import { Pressable, StyleSheet, View } from 'react-native';

import { THOUGHT_COLOR_LABEL, THOUGHT_COLORS, THOUGHT_SWATCH, type NodeColor } from '@/lib/thought-colors';
import { haptics } from '@/lib/haptics';
import type { ColorTokens } from '@/theme/tokens';

/**
 * Red kružića za izbor boje čvora (≥44pt dodirna meta po swatch-u). Deljen između
 * ideja i misli — oba backend union-a (`ideaColorValidator`, `thoughtColorValidator`)
 * su identična (`packages/backend/convex/ideas.ts:27-34`).
 */
export function ColorRow({
  value,
  onChange,
  disabled,
  colors,
}: {
  value: NodeColor;
  onChange: (next: NodeColor) => void;
  disabled: boolean;
  colors: ColorTokens;
}) {
  return (
    <View style={styles.colorRow}>
      {THOUGHT_COLORS.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={`Boja: ${THOUGHT_COLOR_LABEL[option]}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              haptics.select();
              onChange(option);
            }}
            style={styles.swatchHit}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: THOUGHT_SWATCH[option],
                  borderColor: selected ? colors.foreground : 'transparent',
                  opacity: disabled ? 0.5 : 1,
                },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  swatchHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
});
