import { useState, type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
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
  /**
   * Objekat/niz stila ili funkcija `({ pressed })` kao kod `Pressable` — stanje
   * pritiska vodi ova komponenta (Reanimated ne prima funkciju uz animiran stil),
   * pa postojeći „pritisnut" izgled (boja, neprozirnost) ostaje isti.
   */
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
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
 * Koriste je dugmad (`Button`, `IconButton`, `FAB`) i kartice (K19).
 *
 * Smanjen pokret: bez skaliranja; odziv nosi „pritisnut" stil (boja ili
 * neprozirnost iz `style` funkcije), haptika i sam ishod radnje.
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
  const [pressed, setPressed] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // `hovered` traži Expo-ov tip za web; na telefonu pokazivača nema.
  const state = { pressed, hovered: false };
  const resolvedStyle = typeof style === 'function' ? style(state) : style;

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        if (!reduced) scale.value = withTiming(scaleTo, standardTiming('press'));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        scale.value = reduced ? 1 : withSpring(1, SPRINGS.snappy);
        onPressOut?.(event);
      }}
      // Bez rukovaoca ostaje bez `onPress` (kao goli `Pressable`) — čitač ekrana
      // ne sme da najavi radnju koja ne postoji.
      onPress={
        onPress || haptic !== null
          ? (event: GestureResponderEvent) => {
              if (haptic !== null) haptics[haptic]();
              onPress?.(event);
            }
          : undefined
      }
      style={[resolvedStyle, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}
