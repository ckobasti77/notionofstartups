import { Check } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { REDUCED_FADE, SPRINGS } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  /** 0..1 (van opsega se seče). */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** „Napredak dana" — čitač ekrana čita i vrednost (`valueText`). */
  accessibilityLabel: string;
  /** „3 od 7 završeno"; bez njega se čita procenat. */
  valueText?: string;
  /** Sadržaj u centru (npr. broj); na 100 % ga zameni kvačica. */
  children?: ReactNode;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Prsten napretka (potpisni trenutak 5): luk se puni od TRENUTNE vrednosti
 * springom `smooth` (bez prebačaja — napredak ne sme da „pređe" 100 %), a na
 * 100 % se u centru pojavi kvačica (`bouncy`, trenutak uspeha). Na nuli je luk
 * sakriven, da zaobljen kraj ne ostavi tačku.
 *
 * Smanjen pokret: vrednost se postavi odmah, kvačica se samo pretopi.
 */
export function ProgressRing({
  progress,
  size = 44,
  strokeWidth = 4,
  accessibilityLabel,
  valueText,
  children,
}: ProgressRingProps) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const target = clamp01(progress);
  const complete = target >= 1;

  const value = useSharedValue(target);
  const done = useSharedValue(complete ? 1 : 0);

  useEffect(() => {
    value.value = reduced ? target : withSpring(target, SPRINGS.smooth);
  }, [target, reduced, value]);

  useEffect(() => {
    const next = complete ? 1 : 0;
    if (reduced) done.value = withTiming(next, REDUCED_FADE);
    else done.value = complete ? withSpring(1, SPRINGS.bouncy) : withTiming(0, REDUCED_FADE);
  }, [complete, reduced, done]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - value.value),
    strokeOpacity: value.value > 0.001 ? 1 : 0,
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, done.value),
    transform: [{ scale: reduced ? 1 : done.value }],
  }));
  const centerStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, done.value) }));

  const percent = Math.round(target * 100);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: valueText ?? `${percent} %` }}
      style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.muted}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primaryText}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={arcProps}
        />
      </Svg>
      <View
        style={styles.center}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {children ? <Animated.View style={centerStyle}>{children}</Animated.View> : null}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, checkStyle]}>
          <Check size={Math.round(size * 0.45)} color={colors.primaryText} strokeWidth={2.6} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Luk kreće od 12 sati (SVG krug počinje od 3 sata).
  svg: {
    transform: [{ rotate: '-90deg' }],
  },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
