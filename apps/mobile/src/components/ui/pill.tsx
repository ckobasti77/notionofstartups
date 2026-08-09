import type { LucideIcon } from 'lucide-react-native';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text, type ColorTokens } from '@/theme/tokens';

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export type PillProps = {
  label: string;
  /** Opciona ikonica levo — Pill je boji tonom (ne caller). */
  icon?: LucideIcon;
  tone?: PillTone;
  /** Kad je zadat, Pill je dodirljiv (hitSlop do ~44pt umesto naduvane visine). */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Osnovna boja tona; neutralni je sivo-skala. */
function toneColor(colors: ColorTokens, tone: PillTone): string {
  switch (tone) {
    case 'accent':
      // Pilula je tekst na 13% tintu iste boje, ne beo tekst na punoj podlozi —
      // zato tekstualni indigo (`primaryText`), ne podlozni `primary`.
      return colors.primaryText;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.danger;
    default:
      return colors.mutedForeground;
  }
}

/**
 * Kompaktna pilula — oznaka statusa ili brojač. Obojeni tonovi imaju blagu
 * podlogu iste boje (`${color}22`); neutralni je puna suptilna siva (`muted`).
 * Uopštava `Badge` dodajući ikonicu, tonove i opcioni dodir.
 */
export function Pill({
  label,
  icon: Icon,
  tone = 'neutral',
  onPress,
  accessibilityLabel,
  style,
}: PillProps) {
  const colors = useThemeColors();
  const color = toneColor(colors, tone);
  const bg = tone === 'neutral' ? colors.muted : `${color}22`;

  const body = (
    <>
      {Icon ? <Icon size={13} color={color} /> : null}
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={onPress}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.pill,
          styles.pressablePill,
          { backgroundColor: bg },
          pressed && styles.pressed,
          style,
        ]}>
        {body}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.pill, { backgroundColor: bg }, style]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pressed: {
    opacity: 0.7,
  },
  // Dodirljiva pilula: garantuj širinu dodirne mete i za kratke labele (uz hitSlop).
  pressablePill: {
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  label: {
    ...text.meta,
  },
});
