import { useEffect } from 'react';
import { StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * JEDAN puls za sve skeletone na ekranu. Zašto deljena vrednost, a ne petlja po
 * komponenti: skeletona u jednoj listi ima i po dvadeset, a kad im se petlje
 * razdvoje po fazi lista počne da svetluca kao novogodišnja lampica. Ovako svi
 * dišu u istom ritmu i UI nit vrti tačno jednu animaciju.
 */
const pulse = makeMutable(1);
let subscribers = 0;

function startPulse() {
  pulse.value = withRepeat(
    withTiming(0.45, { duration: 700, easing: Easing.inOut(Easing.quad) }),
    -1,
    true,
  );
}

function stopPulse() {
  cancelAnimation(pulse);
  pulse.value = 0.7;
}

function useSkeletonPulse(reduced: boolean) {
  useEffect(() => {
    if (reduced) {
      stopPulse();
      return;
    }
    subscribers += 1;
    if (subscribers === 1) startPulse();
    return () => {
      subscribers -= 1;
      if (subscribers === 0) stopPulse();
    };
  }, [reduced]);
}

/**
 * Placeholder dok podaci stižu (Convex `undefined` stanje). Blago pulsira, osim
 * kad je uključeno „smanji pokret" — tada je statičan (docs/mobile/02-EKRANI.md
 * §11).
 *
 * Sam pravougaonik nije skeleton — skeleton je OBLIK sadržaja koji stiže. Gotovi
 * oblici (red, kartica zadatka, mehur poruke…) su u `ui/skeletons.tsx`; ovo je
 * cigla od koje se oni prave.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  useSkeletonPulse(reduced);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: borderRadius ?? radius.md,
          backgroundColor: colors.muted,
        },
        pulseStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
