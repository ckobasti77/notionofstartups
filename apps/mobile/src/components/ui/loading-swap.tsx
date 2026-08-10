import { useEffect, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { duration } from '@/theme/motion';

export type LoadingSwapProps = {
  /** `true` dok Convex upit vraća `undefined`. */
  loading: boolean;
  /** Skeleton u obliku sadržaja koji stiže. */
  skeleton: React.ReactNode;
  /** Sadržaj — renderuj ga tek kad podaci postoje (dok se čeka, prosledi `null`). */
  children: React.ReactNode;
  /**
   * `true` (podrazumevano) kad zamena zauzima ceo preostali prostor ekrana — lista
   * koja skroluje. Postavi `false` kad stoji USRED skrolujućeg sadržaja, pa mora da
   * bude visoka koliko i sam sadržaj.
   */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Prelaz skeleton → sadržaj kao crossfade, ne kao skok.
 *
 * Dok se čeka, skeleton je U TOKU rasporeda (on daje visinu); čim podaci stignu,
 * sadržaj ulazi u tok, a skeleton prelazi u apsolutni sloj preko njega i gasi se.
 * Zato nema ni frejma praznog ekrana, ni skoka visine u trenutku zamene.
 *
 * Skeleton je `pointerEvents="none"`, pa dodir ide sadržaju čim se on pojavi:
 * crossfade ne odlaže trenutak kad korisnik može da nastavi.
 */
export function LoadingSwap({
  loading,
  skeleton,
  children,
  fill = true,
  style,
}: LoadingSwapProps) {
  const reduced = useReducedMotion();
  const [showSkeleton, setShowSkeleton] = useState(loading);
  // 1 = sadržaj, 0 = skeleton.
  const swap = useSharedValue(loading ? 0 : 1);

  useEffect(() => {
    if (loading) {
      setShowSkeleton(true);
      swap.value = reduced ? 0 : withTiming(0, { duration: duration.exit });
      return;
    }
    if (reduced) {
      swap.value = 1;
      setShowSkeleton(false);
      return;
    }
    swap.value = withTiming(1, { duration: duration.swap }, (finished) => {
      'worklet';
      if (finished) runOnJS(setShowSkeleton)(false);
    });
  }, [loading, reduced, swap]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: swap.value }));
  const skeletonStyle = useAnimatedStyle(() => ({ opacity: 1 - swap.value }));
  const fillStyle = fill ? styles.fill : null;

  return (
    <Animated.View style={[fillStyle, style]}>
      {/* Dok se čeka, omotač sadržaja NE uzima prostor (prazan je) — inače bi u
          `fill` režimu podelio visinu sa skeletonom na pola. */}
      <Animated.View style={[loading ? null : fillStyle, contentStyle]}>{children}</Animated.View>
      {showSkeleton ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          // Dok se čeka, skeleton drži visinu; kad sadržaj stigne, prelazi preko njega.
          style={[loading ? fillStyle : StyleSheet.absoluteFill, skeletonStyle]}>
          {skeleton}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
