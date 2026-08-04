import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

export type IconButtonProps = Omit<PressableProps, 'children'> & {
  /** Obavezan opis za čitače ekrana (ikonica sama ne govori šta radi). */
  accessibilityLabel: string;
  children: React.ReactNode;
};

/** Kvadratno dugme-ikonica sa dodirnom metom ≥ 44pt. */
export function IconButton({ children, style, ...rest }: IconButtonProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => [
        styles.button,
        state.pressed && { backgroundColor: colors.muted },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
});
