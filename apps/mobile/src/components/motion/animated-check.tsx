import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { REDUCED_FADE, SPRINGS, standardTiming } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Kvačica u kutiji 24×24 i njena dužina (dva segmenta), za iscrtavanje potezom. */
const CHECK_PATH = 'M7 12.5l3.2 3.2L17 9';
const CHECK_LENGTH = 14.2;

export type AnimatedCheckProps = {
  checked: boolean;
  /** Novi željeni status; mutaciju šalje pozivalac (odmah, bez čekanja animacije). */
  onToggle: (next: boolean) => void;
  accessibilityLabel: string;
  /**
   * Zabranjena radnja: kvačica se vidi i fokusira, ali dodir samo upozori
   * (haptika `warning`) — razlog ide u `disabledReason` (hint čitača ekrana).
   */
  disabled?: boolean;
  disabledReason?: string;
  size?: 24 | 28;
};

/**
 * Kvačica zadatka (potpisni trenutak 1): krug se puni od centra springom
 * `bouncy`, kvačica se iscrtava (`DURATION.quick`), a haptika `success` stiže u
 * istom frejmu kad se zadatak završi. Poništavanje je kratko (`quick`), bez
 * odskoka — odskok pripada samo uspehu.
 *
 * Vizuelno 24 (ili 28) pt, dodirna meta 44 pt. Spoljna promena `checked`
 * (npr. stiglo sa servera) animira isto; prvo iscrtavanje ne animira.
 *
 * Smanjen pokret: bez skaliranja — krug i kvačica se samo pretope (120 ms).
 */
export function AnimatedCheck({
  checked,
  onToggle,
  accessibilityLabel,
  disabled = false,
  disabledReason,
  size = 24,
}: AnimatedCheckProps) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const fill = useSharedValue(checked ? 1 : 0);
  const draw = useSharedValue(checked ? 1 : 0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = checked ? 1 : 0;
    if (reduced) {
      fill.value = withTiming(target, REDUCED_FADE);
      draw.value = withTiming(target, REDUCED_FADE);
      return;
    }
    if (checked) {
      fill.value = withSpring(1, SPRINGS.bouncy);
      draw.value = withTiming(1, standardTiming('quick'));
    } else {
      fill.value = withTiming(0, standardTiming('quick'));
      draw.value = withTiming(0, standardTiming('quick'));
    }
  }, [checked, reduced, fill, draw]);

  // Smanjen pokret: krug ostaje pune veličine i samo menja neprozirnost.
  const fillStyle = useAnimatedStyle(() => ({
    opacity: reduced ? fill.value : fill.value > 0.001 ? 1 : 0,
    transform: [{ scale: reduced ? 1 : fill.value }],
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: reduced ? 0 : CHECK_LENGTH * (1 - draw.value),
    strokeOpacity: reduced ? draw.value : draw.value > 0.001 ? 1 : 0,
  }));

  const press = () => {
    if (disabled) {
      haptics.warning();
      return;
    }
    if (checked) haptics.select();
    else haptics.success();
    onToggle(!checked);
  };

  const pad = (MIN_TOUCH_TARGET - size) / 2;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      accessibilityHint={disabled ? disabledReason : undefined}
      onPress={press}
      hitSlop={0}
      style={[styles.hit, { padding: pad }]}>
      <View style={{ width: size, height: size }}>
        {/* Ivica ispod punjenja: pun krug je pokrije celu, pa „završeno" nema sivi obod. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.ring,
            { borderRadius: size / 2, borderColor: colors.mutedForeground },
            disabled && styles.ringDisabled,
          ]}
        />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size / 2, backgroundColor: colors.primary },
            fillStyle,
          ]}
        />
        <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
          <AnimatedPath
            d={CHECK_PATH}
            fill="none"
            stroke={colors.primaryForeground}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={CHECK_LENGTH}
            animatedProps={checkProps}
          />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 1.5,
  },
  // Zabranjena radnja: isprekidan obod (oblik, ne boja) — razlog nosi hint.
  ringDisabled: {
    borderStyle: 'dashed',
  },
});
