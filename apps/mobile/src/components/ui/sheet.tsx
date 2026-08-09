import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useThemeColors } from '@/theme/theme-provider';
import { BACKDROP_OPACITY, duration, SHEET_SPRING } from '@/theme/motion';
import { radius } from '@/theme/tokens';

/** Preko ovoliko px prevlačenja nadole sheet se pušta. */
const DISMISS_DISTANCE = 88;
/** …ili brže od ovoga, bez obzira na pređeni put (px/s). */
const DISMISS_VELOCITY = 900;

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Sheet sa poljem za unos — podiže se iznad tastature. `padding` na obe
   * platforme: Expo SDK 57 edge-to-edge (Android) razbija OS `adjustResize`.
   */
  avoidKeyboard?: boolean;
  /**
   * Prevlačenje bilo gde po sheet-u, ne samo po ručki. Uključi SAMO kad sheet
   * nema unutrašnji skrol — inače gest krade skrolovanje liste.
   */
  dragAnywhere?: boolean;
  /** Sakrij ručku (npr. kad sheet ima sopstveno zaglavlje sa akcijom). */
  showHandle?: boolean;
  /** Gornja granica visine; podrazumevano 82% ekrana. */
  maxHeight?: DimensionValue;
  /** Doterivanje panela (padding, gap). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Donji sheet — jedan primitiv za sve modale u aplikaciji.
 *
 * Pokret (zahtev „suzdržano, nikad dekorativno"):
 *  - ulaz: spring odozdo, backdrop tamni zajedno sa njim (nije korak, nego rampa)
 *  - izlaz: kraći `timing` — zatvaranje ne sme da se čeka
 *  - gest: prevlačenje nadole prati prst; backdrop se pri tome razvedrava, pa je
 *    vidljivo koliko je „blizu puštanja"
 *
 * Kad je uključeno „smanji pokret", sheet se pojavljuje i nestaje bez animacije;
 * gest ostaje (to je direktna manipulacija, ne animacija).
 *
 * `Modal` ostaje montiran do kraja izlazne animacije (`mounted` stanje), inače bi
 * RN otkinuo prikaz na prvom frejmu i animacija se ne bi videla.
 *
 * RNGH unutar `Modal`-a traži sopstveni `GestureHandlerRootView` — modal je zaseban
 * view root na Androidu i ne nasleđuje onaj iz `app/_layout.tsx`.
 */
export function Sheet({
  visible,
  onClose,
  children,
  avoidKeyboard = false,
  dragAnywhere = false,
  showHandle = true,
  maxHeight = '82%',
  style,
}: SheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const [mounted, setMounted] = useState(visible);
  // 0 = sklonjen ispod ekrana, 1 = na mestu.
  const progress = useSharedValue(0);
  // Trenutni pomeraj prsta (uvek ≥ 0 — sheet se ne vuče naviše).
  const drag = useSharedValue(0);
  // Realna visina panela; do prvog `onLayout` pretpostavljamo pun ekran, pa je
  // sheet i tada sigurno van vidnog polja (nema bleska).
  const height = useSharedValue(Dimensions.get('window').height);
  // Ulaz se pokreće TEK kad je panel izmeren — inače prvi frejm skoči sa
  // pretpostavljene visine na stvarnu.
  const measured = useRef(false);

  const enter = () => {
    progress.value = reduced ? 1 : withSpring(1, SHEET_SPRING);
  };
  const unmount = () => {
    measured.current = false;
    setMounted(false);
  };

  useEffect(() => {
    if (visible) {
      drag.value = 0;
      setMounted(true);
      // Ponovno otvaranje dok izlazna animacija još traje: panel je izmeren, pa
      // se vraća odmah, bez čekanja na novi `onLayout` (koji ne bi ni stigao).
      if (measured.current) enter();
      return;
    }
    if (reduced) {
      progress.value = 0;
      unmount();
      return;
    }
    progress.value = withTiming(0, { duration: duration.exit }, (finished) => {
      'worklet';
      if (finished) runOnJS(unmount)();
    });
    // `enter`/`unmount` su stabilni po sadržaju (čitaju samo ref i shared value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, progress, drag]);

  const onLayout = (event: LayoutChangeEvent) => {
    height.value = event.nativeEvent.layout.height;
    if (measured.current) return;
    measured.current = true;
    if (visible) enter();
  };

  const settle = () => {
    drag.value = reduced ? 0 : withSpring(0, SHEET_SPRING);
  };

  const pan = Gesture.Pan()
    // Vertikalni prag: tap i horizontalni gestovi u sadržaju ostaju netaknuti.
    .activeOffsetY([-12, 12])
    .onUpdate((event) => {
      'worklet';
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      'worklet';
      if (drag.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
      } else {
        runOnJS(settle)();
      }
    });

  const backdropStyle = useAnimatedStyle(() => {
    const pulled = height.value > 0 ? Math.min(1, drag.value / height.value) : 0;
    return { opacity: progress.value * (1 - pulled) * BACKDROP_OPACITY };
  });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height.value + drag.value }],
  }));

  const panel = (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.panel,
        {
          backgroundColor: colors.popover,
          borderColor: colors.border,
          paddingBottom: insets.bottom + 12,
          maxHeight,
        },
        panelStyle,
        style,
      ]}>
      {showHandle ? (
        <GestureDetector gesture={pan}>
          <View style={styles.handleZone}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
        </GestureDetector>
      ) : null}
      {children}
    </Animated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      // Animaciju vodi Reanimated — OS prelaz bi se sudario sa spring-om.
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zatvori"
            style={styles.root}
            onPress={onClose}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={avoidKeyboard ? 'padding' : undefined}
          style={styles.avoider}
          pointerEvents="box-none">
          {dragAnywhere ? <GestureDetector gesture={pan}>{panel}</GestureDetector> : panel}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: '#000000',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  handleZone: {
    // ≥ 24pt visoka zona hvatanja — ručka je 4px, prst nije.
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
  },
});
