import type { ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { PRESS_SCALE, SPRINGS, standardTiming } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticName = keyof typeof haptics;

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Samo objekat/niz stila — funkcija `({ pressed })` ne ide uz animiran stil. */
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Veličina na pritisku (podrazumevano `SCALE.press` = 0,97). */
  scaleTo?: number;
  /** Haptika na dodir, po značenju (`tap`, `select`…); `null` = bez. */
  haptic?: HapticName | null;
};

/**
 * Dugme koje se fizički „utisne": na dodir (touch-down, ne tek na puštanje)
 * skupi se na 0,97 za `DURATION.press`, a pri puštanju se vraća springom
 * `snappy` — od trenutne vrednosti, pa brz ponovni dodir nikad ne skače.
 *
 * Smanjen pokret: bez skaliranja (odziv nosi haptika i sam ishod radnje).
 */
export function PressableScale({
  scaleTo = PRESS_SCALE,
  haptic = null,
  onPressIn,
  onPressOut,
  onPress,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event: GestureResponderEvent) => {
        if (!reduced) scale.value = withTiming(scaleTo, standardTiming('press'));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        scale.value = reduced ? 1 : withSpring(1, SPRINGS.snappy);
        onPressOut?.(event);
      }}
      onPress={(event: GestureResponderEvent) => {
        if (haptic !== null) haptics[haptic]();
        onPress?.(event);
      }}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}
