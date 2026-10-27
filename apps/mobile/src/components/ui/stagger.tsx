import { createContext, useContext, useMemo, useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { enterFadeUp, FIRST_FILL_WINDOW_MS } from '@/components/motion/layout';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export { FIRST_FILL_WINDOW_MS };

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
 * Ulaz jedne stavke kroz zajednički preset `enterFadeUp` (PROSTOR K21, plan K07
 * §8 — isto što i `useListEntering`): neprozirnost + 8 px nagore + scale, stagger
 * 24 ms za prvih 6 stavki. Animira samo prvo punjenje grupe; red koji se montira
 * kasnije (skrol, reaktivno osvežavanje) se prosto pojavi. Smanjen pokret: samo
 * pretapanje 120 ms.
 *
 * Stavka je dodirljiva od prvog frejma — `opacity`/`transform` ne blokiraju dodir,
 * pa animacija ne odlaže trenutak kad korisnik može da nastavi.
 */
export function StaggerItem({ index, children, style }: StaggerItemProps) {
  const reduced = useReducedMotion();
  const group = useContext(StaggerContext);
  // Odluka se donosi jednom, na mount-u: kasnija promena ne sme da vrati stavku na
  // opacity 0 pod nogama korisniku.
  // Bez `StaggerGroup` nema „prvog punjenja", pa se ne animira (red montiran
  // skrolom se samo pojavi).
  const [entering] = useState(() =>
    group !== null && Date.now() - group.startedAt < FIRST_FILL_WINDOW_MS
      ? enterFadeUp(index, reduced)
      : undefined,
  );
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
