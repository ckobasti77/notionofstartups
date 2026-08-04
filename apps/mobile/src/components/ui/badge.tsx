import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, type ColorTokens } from '@/theme/tokens';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'success'
  | 'outline';

export type BadgeProps = ViewProps & {
  label: string;
  variant?: BadgeVariant;
};

function badgeColors(colors: ColorTokens, variant: BadgeVariant) {
  switch (variant) {
    case 'secondary':
      return { bg: colors.secondary, fg: colors.secondaryForeground, border: 'transparent' };
    case 'destructive':
      return { bg: colors.destructive, fg: colors.destructiveForeground, border: 'transparent' };
    case 'success':
      return { bg: colors.success, fg: colors.successForeground, border: 'transparent' };
    case 'outline':
      return { bg: 'transparent', fg: colors.foreground, border: colors.border };
    default:
      return { bg: colors.primary, fg: colors.primaryForeground, border: 'transparent' };
  }
}

/** Mala oznaka/pilula, po uzoru na web `Badge`. */
export function Badge({ label, variant = 'default', style, ...rest }: BadgeProps) {
  const colors = useThemeColors();
  const palette = badgeColors(colors, variant);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'outline' ? StyleSheet.hairlineWidth : 0,
        },
        style,
      ]}
      {...rest}>
      <Text numberOfLines={1} style={[styles.text, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
  },
});
