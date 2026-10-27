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

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text } from '@/theme/tokens';

export type SectionHeaderProps = {
  title: string;
  /** Brojač uz naslov (npr. broj stavki) — prigušena meta, ne pilula. */
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
 * Naslov sekcije (DIZAJN-SMIRENJE §2): telo 16/22 težine 600, normalna slova,
 * broj odmah uz naslov kao prigušena meta (`tabular-nums`), opciono sklapanje.
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
  const labelColor = tone === 'danger' ? colors.danger : colors.foreground;
  const countColor = tone === 'danger' ? colors.danger : colors.mutedForeground;

  const left = (
    <View style={styles.left}>
      {collapsible ? (
        collapsed ? (
          <ChevronRight size={20} color={colors.mutedForeground} />
        ) : (
          <ChevronDown size={20} color={colors.mutedForeground} />
        )
      ) : null}
      <Text
        // Uloga je na tekstu, ne na redu: `View` bez `accessible` je iOS ne primenjuje,
        // a `accessible` red bi progutao `action`.
        accessibilityRole={collapsible && onToggle ? undefined : 'header'}
        numberOfLines={1}
        style={[styles.label, { color: labelColor }]}>
        {title}
      </Text>
      {count != null ? (
        <Text style={[styles.count, { color: countColor }]}>{count}</Text>
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
    <View style={[styles.container, style]}>
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
    ...text.body,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
  count: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    fontVariant: ['tabular-nums'],
  },
});
