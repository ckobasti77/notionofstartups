import { TRASH_SEGMENTS, type TrashKind } from '@devotion/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

import { trashCountLabel, type TrashCounts } from './trash-model';

/**
 * Segmenti Korpe (Stranice · Ideje · Prilozi · Oporavljeno) sa brojem.
 * Namerno NIJE `SegmentedControl`: četiri jednake trake na 390 dp ne prime
 * „Oporavljeno" uz broj (labela bi se skratila elipsom), pa se kartice
 * prelamaju u drugi red, isto kao kartice Korpe na webu ispod `sm`.
 */
export function TrashSegments({
  value,
  counts,
  onChange,
}: {
  value: TrashKind;
  /** `undefined` dok brojevi stižu — segmenti rade i bez njih. */
  counts: TrashCounts | undefined;
  onChange: (next: TrashKind) => void;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="tablist" style={styles.row}>
      {TRASH_SEGMENTS.map((segment) => {
        const active = segment.kind === value;
        const count = trashCountLabel(counts?.[segment.kind]);
        return (
          <Pressable
            key={segment.kind}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count ? `${segment.label}, ${count}` : segment.label}
            onPress={() => {
              if (!active) haptics.select();
              onChange(segment.kind);
            }}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: active ? colors.accent : 'transparent',
                borderColor: active ? colors.primary : colors.border,
              },
              pressed && !active && { backgroundColor: colors.muted },
            ]}>
            <Text
              style={[
                styles.label,
                { color: active ? colors.accentForeground : colors.foreground },
              ]}>
              {segment.label}
            </Text>
            {count ? (
              <Text
                style={[
                  styles.count,
                  { color: active ? colors.accentForeground : colors.mutedForeground },
                ]}>
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  count: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    fontVariant: ['tabular-nums'],
  },
});
