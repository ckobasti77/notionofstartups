import { ChevronDown, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Pill } from '@/components/ui/pill';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text } from '@/theme/tokens';

export type SectionHeaderProps = {
  title: string;
  /** Brojač desno (npr. broj stavki) — prikazuje se kao pilula. */
  count?: number;
  /** `danger` tinta naslov i brojač (npr. „prekoračeno"). */
  tone?: 'default' | 'danger';
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Opciona akcija skroz desno (npr. malo dugme ili link). */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Naslov sekcije — uppercase `meta` labela, opcioni brojač-pilula i opciono
 * sklapanje. Konsoliduje ručne „section header"-e i countPill-ove po ekranima.
 * `accent`/boja se NE koristi ovde (chrome je sivo-skala); `danger` ton je jedini
 * izuzetak jer nosi status.
 */
export function SectionHeader({
  title,
  count,
  tone = 'default',
  collapsible = false,
  collapsed = false,
  onToggle,
  action,
  style,
}: SectionHeaderProps) {
  const colors = useThemeColors();
  const labelColor = tone === 'danger' ? colors.danger : colors.mutedForeground;

  const left = (
    <View style={styles.left}>
      {collapsible ? (
        collapsed ? (
          <ChevronRight size={20} color={colors.mutedForeground} />
        ) : (
          <ChevronDown size={20} color={colors.mutedForeground} />
        )
      ) : null}
      <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>
        {title}
      </Text>
      {count != null ? (
        <Pill label={String(count)} tone={tone === 'danger' ? 'danger' : 'neutral'} />
      ) : null}
    </View>
  );

  if (collapsible && onToggle) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={count != null ? `${title}, ${count}` : title}
        onPress={onToggle}
        style={({ pressed }) => [styles.container, pressed && styles.pressed, style]}>
        {left}
        {action ?? null}
      </Pressable>
    );
  }

  return (
    <View accessibilityRole="header" style={[styles.container, style]}>
      {left}
      {action ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    gap: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
});
