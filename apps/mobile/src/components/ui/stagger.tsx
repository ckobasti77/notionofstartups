import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { duration, staggerDelay, STAGGER_TRAVEL } from '@/theme/motion';

/**
 * Koliko dugo posle mount-a grupe stavka još sme da uđe animirano. Posle toga je
 * lista „napunjena" i svaka nova stavka se prosto pojavi: `FlatList` montira redove
 * tek kad doskroluješ do njih, a fade na 40. redu usred skrola izgleda kao kvar.
 */
const FIRST_FILL_WINDOW_MS = 450;

const StaggerContext = createContext<{ startedAt: number } | null>(null);

/**
 * Označava „ovo je jedno punjenje liste". Postavi ga TAMO GDE SE SADRŽAJ MONTIRA
 * (unutar grane u kojoj podaci postoje), ne oko celog ekrana — inače sat krene dok
 * se još čeka backend i stagger se preskoči.
 *
 * `resetKey` restartuje punjenje kad se skup zameni (npr. promena segmenta).
 */
export function StaggerGroup({
  children,
  resetKey,
}: {
  children: React.ReactNode;
  resetKey?: string | number;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ startedAt: Date.now() }), [resetKey]);
  return <StaggerContext.Provider value={value}>{children}</StaggerContext.Provider>;
}

export type StaggerItemProps = {
  /** Redni broj u listi — nosi zakašnjenje. */
  index: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Ulaz jedne stavke: fade + 8px naviše, sa zakašnjenjem po redu. Ukupno ≤ 300ms za
 * celu listu (`staggerDelay` staje na 5. stavci).
 *
 * Stavka je dodirljiva od prvog frejma — `opacity`/`transform` ne blokiraju dodir,
 * pa animacija ne odlaže trenutak kad korisnik može da nastavi.
 */
export function StaggerItem({ index, children, style }: StaggerItemProps) {
  const reduced = useReducedMotion();
  const group = useContext(StaggerContext);
  // Odluka se donosi jednom, na mount-u: kasnija promena ne sme da vrati stavku na
  // opacity 0 pod nogama korisniku.
  const [animate] = useState(
    () => !reduced && (group === null || Date.now() - group.startedAt < FIRST_FILL_WINDOW_MS),
  );

  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    progress.value = withDelay(
      staggerDelay(index),
      withTiming(1, { duration: duration.item, easing: Easing.out(Easing.quad) }),
    );
  }, [animate, index, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * STAGGER_TRAVEL }],
  }));

  if (!animate) {
    return <View style={style}>{children}</View>;
  }
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
