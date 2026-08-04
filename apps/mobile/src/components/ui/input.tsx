import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, radius } from '@/theme/tokens';

export type InputProps = TextInputProps & {
  /** Crveni obrub kad je vrednost neispravna. */
  invalid?: boolean;
};

/**
 * Tekstualno polje po uzoru na web `Input`. Osnovni tekst je 16px — ispod toga
 * iOS zumira pri fokusu (docs/mobile/02-EKRANI.md, sekcija 11). Visina ≥ 44pt.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { style, invalid = false, onFocus, onBlur, ...rest },
  ref,
) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);

  const borderColor = invalid ? colors.destructive : focused ? colors.ring : colors.input;

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.mutedForeground}
      selectionColor={colors.primary}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        {
          color: colors.foreground,
          backgroundColor: colors.card,
          borderColor,
          borderWidth: focused ? 2 : StyleSheet.hairlineWidth,
        },
        style,
      ]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: 44,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
});
