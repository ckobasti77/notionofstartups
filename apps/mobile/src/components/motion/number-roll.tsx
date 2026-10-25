import { formatCount, rollDigits } from '@devotion/shared';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { REDUCED_FADE, SPRINGS, standardTiming } from '@/theme/motion';
import { text } from '@/theme/tokens';

export type NumberRollProps = {
  value: number;
  /** Iznad ovoga piše „99+" (podrazumevano 99). */
  cap?: number;
  /** Stil teksta cifara (veličina, boja, težina); `lineHeight` određuje visinu kotrljanja. */
  style?: StyleProp<TextStyle>;
  /** Šta čitač ekrana čita umesto golih cifara (npr. „3 nepročitana"). */
  accessibilityLabel?: string;
};

/**
 * Broj koji se „kotrlja" (potpisni trenutak 5): cifra koja se menja izlazi u
 * smeru promene (raste → odlazi nagore, nova ulazi odozdo), a ostale stoje.
 * Plan cifara je `rollDigits` iz shared paketa — isti kao web `NumberRoll`.
 * Spring `snappy`.
 *
 * Svaka promena montira NOVE dve oznake (odlazeću i dolazeću) sa `entering`
 * animacijom: početne vrednosti važe od prvog frejma, pa nema treptaja konačne
 * cifre pre kotrljanja. Brza nova promena usred kotrljanja zamenjuje par i
 * kreće iz ivice, ne čeka kraj prethodnog.
 *
 * Smanjen pokret: cifre se samo pretope (120 ms), bez pomeranja.
 */
export function NumberRoll({ value, cap = 99, style, accessibilityLabel }: NumberRollProps) {
  const reduced = useReducedMotion();
  const previous = useRef(value);
  const rolls = rollDigits(previous.current, value, cap);
  useEffect(() => {
    previous.current = value;
  }, [value]);

  const flat = StyleSheet.flatten([styles.text, style]);
  const fontSize = flat.fontSize ?? text.meta.fontSize;
  const lineHeight = flat.lineHeight ?? Math.round(fontSize * 1.3);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? formatCount(value, cap)}
      style={[styles.row, { height: lineHeight }]}>
      {rolls.map((roll) =>
        roll.to === null ? null : (
          <Digit
            key={roll.key}
            char={roll.to}
            direction={roll.direction}
            height={lineHeight}
            textStyle={[styles.text, style, { lineHeight }]}
            reduced={reduced}
          />
        ),
      )}
    </View>
  );
}

type DigitState = { current: string; outgoing: string | null; direction: 1 | -1; tick: number };

/** Dolazeća cifra: iz `direction · height` na mesto (snappy); smanjen pokret — pretapanje. */
function digitIn(direction: 1 | -1, height: number, reduced: boolean): EntryExitAnimationFunction {
  const spring = SPRINGS.snappy;
  const fade = REDUCED_FADE;
  return () => {
    'worklet';
    if (reduced) {
      return { initialValues: { opacity: 0 }, animations: { opacity: withTiming(1, fade) } };
    }
    return {
      initialValues: { transform: [{ translateY: direction * height }] },
      animations: { transform: [{ translateY: withSpring(0, spring) }] },
    };
  };
}

/**
 * Odlazeća cifra: sa mesta u `−direction · height` uz gašenje. Njen statički
 * stil je nevidljiv (opacity 0), pa i posle animacije ostaje skrivena.
 */
function digitOut(direction: 1 | -1, height: number, reduced: boolean): EntryExitAnimationFunction {
  const spring = SPRINGS.snappy;
  const fade = reduced ? REDUCED_FADE : standardTiming('quick');
  return () => {
    'worklet';
    if (reduced) {
      return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, fade) } };
    }
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: {
        opacity: withTiming(0, fade),
        transform: [{ translateY: withSpring(-direction * height, spring) }],
      },
    };
  };
}

function Digit({
  char,
  direction,
  height,
  textStyle,
  reduced,
}: {
  char: string;
  direction: 1 | -1 | 0;
  height: number;
  textStyle: StyleProp<TextStyle>;
  reduced: boolean;
}) {
  const [state, setState] = useState<DigitState>({
    current: char,
    outgoing: null,
    direction: 1,
    tick: 0,
  });
  // Izvedeno stanje iz props-a (bez efekta): nova cifra → stara postaje odlazeća.
  if (state.current !== char) {
    setState({
      current: char,
      outgoing: state.current,
      direction: direction === 0 ? 1 : direction,
      tick: state.tick + 1,
    });
  }
  const rolling = state.tick > 0;

  return (
    <View style={[styles.digit, { height }]} importantForAccessibility="no-hide-descendants">
      {rolling && state.outgoing !== null ? (
        <Animated.Text
          key={`out-${state.tick}`}
          style={[textStyle, styles.outgoing]}
          entering={digitOut(state.direction, height, reduced)}>
          {state.outgoing}
        </Animated.Text>
      ) : null}
      <Animated.Text
        key={`in-${state.tick}`}
        style={textStyle}
        entering={rolling ? digitIn(state.direction, height, reduced) : undefined}>
        {state.current}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
  },
  digit: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  outgoing: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    opacity: 0,
  },
});
