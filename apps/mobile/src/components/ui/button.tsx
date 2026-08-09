import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, type ColorTokens } from '@/theme/tokens';

export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Tekst dugmeta. Za složeniji sadržaj koristi `children`. */
  label?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rasteže dugme na punu širinu roditelja. */
  fullWidth?: boolean;
  /** Ikonica levo od teksta (npr. iz `lucide-react-native`). */
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

function variantColors(colors: ColorTokens, variant: ButtonVariant) {
  switch (variant) {
    case 'secondary':
      return { bg: colors.surfaceRaised, fg: colors.foreground, border: 'transparent' };
    case 'ghost':
      return { bg: 'transparent', fg: colors.foreground, border: 'transparent' };
    case 'destructive':
      return { bg: colors.danger, fg: colors.destructiveForeground, border: 'transparent' };
    default:
      return { bg: colors.primary, fg: colors.primaryForeground, border: 'transparent' };
  }
}

// Sve veličine ≥ 44pt dodirne mete (docs/mobile/02-EKRANI.md, sekcija 11).
// `minHeight`, ne `height`: pri sistemskom uvećanju fonta dugme mora da naraste,
// a ne da odseče labelu elipsom (WCAG 1.4.4 — dva odbojna dugmeta u Odobrenjima
// su najgori slučaj: „Za brisanje" / „Protiv" se ne smeju skratiti u istu reč).
const SIZES: Record<ButtonSize, { minHeight: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { minHeight: 44, paddingHorizontal: 14, fontSize: 14 },
  md: { minHeight: 48, paddingHorizontal: 18, fontSize: 16 },
  lg: { minHeight: 56, paddingHorizontal: 24, fontSize: 18 },
};

export function Button({
  label,
  children,
  variant = 'default',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const colors = useThemeColors();
  const palette = variantColors(colors, variant);
  const dims = SIZES[size];
  const isDisabled = Boolean(disabled) || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: dims.minHeight,
          paddingHorizontal: dims.paddingHorizontal,
          paddingVertical: 6,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        variant === 'ghost' && pressed && !isDisabled && { backgroundColor: colors.muted },
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {icon}
          {children ?? (
            <Text
              numberOfLines={2}
              style={[styles.label, { color: palette.fg, fontSize: dims.fontSize }]}>
              {label}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
});
