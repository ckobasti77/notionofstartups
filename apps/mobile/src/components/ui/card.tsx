import { StyleSheet, Text, View, type ViewProps, type TextProps } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

export type CardProps = ViewProps;

/** Osnovna kartica — površina `card` sa suptilnom ivicom, po uzoru na web `Card`. */
export function Card({ style, ...rest }: CardProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
      {...rest}
    />
  );
}

export function CardHeader({ style, ...rest }: ViewProps) {
  return <View style={[styles.header, style]} {...rest} />;
}

export function CardTitle({ style, ...rest }: TextProps) {
  const colors = useThemeColors();
  return <Text style={[styles.title, { color: colors.foreground }, style]} {...rest} />;
}

export function CardDescription({ style, ...rest }: TextProps) {
  const colors = useThemeColors();
  return (
    <Text style={[styles.description, { color: colors.mutedForeground }, style]} {...rest} />
  );
}

export function CardContent({ style, ...rest }: ViewProps) {
  return <View style={[styles.content, style]} {...rest} />;
}

export function CardFooter({ style, ...rest }: ViewProps) {
  return <View style={[styles.footer, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    ...text.title,
  },
  description: {
    ...text.body,
  },
  content: {
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
