import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import type { ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { REDUCED_FADE, SPRINGS, TAB_BOUNCE_FROM } from '@/theme/motion';

export type TabIconProps = {
  icon: LucideIcon;
  focused: boolean;
  color: ColorValue;
  size: number;
};

/**
 * Ikonica taba (potpisni trenutak 7): kad tab postane izabran, ikonica kratko
 * „odskoči" sa 0,9 na 1 springom `bouncy`. Prvo iscrtavanje ne odskače — samo
 * promena izbora. Izabran tab dobija i deblji potez (aktivno stanje, ne boja
 * sama).
 *
 * Smanjen pokret: bez skaliranja; ikonica se samo pretopi (120 ms).
 */
export function TabIcon({ icon: Icon, focused, color, size }: TabIconProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!focused) return;
    if (reduced) {
      opacity.value = 0;
      opacity.value = withTiming(1, REDUCED_FADE);
      return;
    }
    scale.value = TAB_BOUNCE_FROM;
    scale.value = withSpring(1, SPRINGS.bouncy);
  }, [focused, reduced, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Icon color={color} size={size} strokeWidth={focused ? 2.4 : 1.8} />
    </Animated.View>
  );
}
