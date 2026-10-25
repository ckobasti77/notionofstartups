import type { LucideIcon } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { REDUCED_FADE, SWIPE, SPRINGS } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

import {
  armedSide,
  resolveSwipe,
  revealScale,
  startsInEdgeGuard,
  swipeOffset,
  type SwipeSide,
} from './swipe-logic';

export type SwipeTone = 'success' | 'primary' | 'warning';

export type SwipeAction = {
  /** Glagol („Završi", „Rok i plan") — vidi se ispod reda i čita kao radnja. */
  label: string;
  icon: LucideIcon;
  tone: SwipeTone;
  onCommit: () => void;
  /** `false` = radnja se vidi, ali potvrda samo upozori (`warning`) i red se vrati. */
  allowed?: boolean;
  /** Haptika na potvrdi (podrazumevano `success` za `success` ton, inače `select`). */
  commitHaptic?: 'success' | 'select' | 'tap';
};

export type SwipeRowProps = {
  children: ReactNode;
  /** Radnja koju okida prst koji ide ULEVO (otkriva se uz desnu ivicu). */
  leftAction?: SwipeAction;
  /** Radnja koju okida prst koji ide UDESNO (otkriva se uz levu ivicu). */
  rightAction?: SwipeAction;
  thresholdPx?: number;
  enabled?: boolean;
  /** Zaobljenje podloge — isto kao red iznad nje. */
  borderRadius?: number;
  /**
   * Pozadina reda iznad podloge radnje. Podloga se otkriva ISPOD reda, pa red
   * mora biti neproziran — red bez sopstvene pozadine (npr. `TaskRow`) bi
   * inače pozeleneo ispod teksta. Podrazumevano `colors.background`.
   */
  rowBackground?: string;
};

function toneColors(colors: ColorTokens, tone: SwipeTone) {
  switch (tone) {
    case 'success':
      return { bg: colors.success, fg: colors.successForeground };
    case 'warning':
      return { bg: colors.warning, fg: colors.warningForeground };
    default:
      return { bg: colors.primary, fg: colors.primaryForeground };
  }
}

/**
 * Swipe red (potpisni trenutak 6): red prati prst 1:1, radnja se otkriva i
 * ikonica raste ka pragu, na prelazu praga (u oba smera) stiže haptički tik,
 * a posle 120 pt važi gumeni otpor. Pri puštanju odluka ide po putu I brzini
 * (`resolveSwipe`): potvrda šalje radnju ODMAH (mutacija ne čeka animaciju), a
 * red odlazi do ivice springom sa brzinom prsta i vraća se; inače se vraća na
 * nulu istom brzinom — bez šava između gesta i animacije.
 *
 * Vertikalni skrol ima prednost (`failOffsetY`), dodir uz levu ivicu pripada
 * sistemskom „nazad". Gest je nevidljiv čitaču ekrana: iste radnje pozivalac
 * stavlja na red kroz `swipeAccessibilityActions`.
 *
 * Smanjen pokret: prati prst 1:1; pri puštanju povratak bez springa, a sadržaj
 * reda se pretopi (120 ms).
 */
export function SwipeRow({
  children,
  leftAction,
  rightAction,
  thresholdPx = SWIPE.commitPx,
  enabled = true,
  borderRadius = radius.card,
  rowBackground,
}: SwipeRowProps) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  // Pomeraj u trenutku hvatanja: red uhvaćen usred povratka nastavlja odatle.
  const start = useSharedValue(0);
  const width = useSharedValue(0);
  const armed = useSharedValue<0 | 1 | -1>(0);
  const contentOpacity = useSharedValue(1);

  // Workleti smeju da hvataju samo obične vrednosti — ne radnje sa funkcijama i
  // ikonicama — pa se iz radnji ovde izvlače samo bulovi.
  const allowed = useMemo(
    () => ({ left: leftAction !== undefined, right: rightAction !== undefined }),
    [leftAction, rightAction],
  );
  const leftPermitted = leftAction?.allowed !== false;
  const rightPermitted = rightAction?.allowed !== false;
  // Obična vrednost za worklet (pomoćne funkcije iz `theme/motion` nisu workleti).
  const snappy = SPRINGS.snappy;

  const tick = () => haptics.threshold();
  const commit = (side: SwipeSide) => {
    const action = side === 'right' ? rightAction : leftAction;
    if (!action) return;
    if (action.allowed === false) {
      haptics.warning();
      return;
    }
    const kind = action.commitHaptic ?? (action.tone === 'success' ? 'success' : 'select');
    haptics[kind]();
    action.onCommit();
  };

  const pan = Gesture.Pan()
    .enabled(enabled && (allowed.left || allowed.right))
    .activeOffsetX([-SWIPE.activationPx, SWIPE.activationPx])
    .failOffsetY([-SWIPE.failOffsetYPx, SWIPE.failOffsetYPx])
    .onTouchesDown((event, manager) => {
      'worklet';
      const touch = event.allTouches[0];
      if (touch !== undefined && startsInEdgeGuard(touch.absoluteX)) manager.fail();
    })
    .onStart(() => {
      'worklet';
      // Dodela prekida povratnu animaciju; prst preuzima red od trenutnog mesta.
      start.value = offset.value;
    })
    .onUpdate((event) => {
      'worklet';
      const next = swipeOffset(start.value + event.translationX, allowed);
      offset.value = next;
      const side = armedSide(next, thresholdPx);
      const code = side === 'right' ? 1 : side === 'left' ? -1 : 0;
      if (code !== armed.value) {
        armed.value = code;
        scheduleOnRN(tick);
      }
    })
    .onEnd((event, success) => {
      'worklet';
      armed.value = 0;
      // Gest koji je sistem otkazao (poziv, sistemski gest) nikad ne potvrđuje radnju.
      // Odluka je po putu prsta U OVOM gestu: red uhvaćen usred leta ka ivici (ili
      // povratka) i pušten bez novog pokreta ne okida radnju drugi put.
      const decided = success
        ? resolveSwipe({
            translationX: swipeOffset(event.translationX, allowed),
            velocityX: event.velocityX,
            thresholdPx,
          })
        : null;
      if (decided !== null) scheduleOnRN(commit, decided);

      if (reduced) {
        offset.value = 0;
        // Pretapanje samo kad se nešto desilo — puštanje bez radnje ne trepće.
        if (decided !== null) {
          contentOpacity.value = 0;
          contentOpacity.value = withTiming(1, REDUCED_FADE);
        }
        return;
      }
      const permitted = decided === 'right' ? rightPermitted : leftPermitted;
      if (decided !== null && permitted && width.value > 0) {
        const edge = decided === 'right' ? width.value : -width.value;
        offset.value = withSequence(
          withSpring(edge, { ...snappy, velocity: event.velocityX }),
          withSpring(0, snappy),
        );
        return;
      }
      offset.value = withSpring(0, { ...snappy, velocity: event.velocityX });
    });

  const rowStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View
      style={styles.wrapper}
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width;
      }}>
      <View
        style={[styles.underlay, { borderRadius }]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {rightAction ? (
          <Reveal
            action={rightAction}
            colors={colors}
            side="right"
            offset={offset}
            thresholdPx={thresholdPx}
            reduced={reduced}
          />
        ) : null}
        {leftAction ? (
          <Reveal
            action={leftAction}
            colors={colors}
            side="left"
            offset={offset}
            thresholdPx={thresholdPx}
            reduced={reduced}
          />
        ) : null}
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[{ backgroundColor: rowBackground ?? colors.background, borderRadius }, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Podloga jedne radnje: otkriva se sa putem, ikonica raste ka pragu. */
function Reveal({
  action,
  colors,
  side,
  offset,
  thresholdPx,
  reduced,
}: {
  action: SwipeAction;
  colors: ColorTokens;
  /** `right` = prst ide udesno, podloga je uz levu ivicu. */
  side: SwipeSide;
  offset: SharedValue<number>;
  thresholdPx: number;
  reduced: boolean;
}) {
  const { bg, fg } = toneColors(colors, action.tone);
  const Icon = action.icon;
  const sign = side === 'right' ? 1 : -1;
  const revealStyle = useAnimatedStyle(() => {
    const travel = offset.value * sign;
    return { opacity: travel > 0 ? Math.min(1, travel / thresholdPx) : 0 };
  });
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : revealScale(offset.value, thresholdPx) }],
  }));
  const label = <Text style={[styles.revealText, { color: fg }]}>{action.label}</Text>;
  return (
    <Animated.View
      style={[
        styles.fill,
        styles.reveal,
        { backgroundColor: bg, justifyContent: side === 'right' ? 'flex-start' : 'flex-end' },
        revealStyle,
      ]}>
      {side === 'left' ? label : null}
      <Animated.View style={iconStyle}>
        <Icon size={20} color={fg} />
      </Animated.View>
      {side === 'right' ? label : null}
    </Animated.View>
  );
}

/**
 * Iste radnje za čitač ekrana (VoiceOver/TalkBack presreću vodoravno
 * prevlačenje): raširi na red — `<Pressable {...swipeAccessibilityActions(…)}>`.
 * Zabranjena radnja se ne nudi.
 */
export function swipeAccessibilityActions(
  actions: { left?: SwipeAction; right?: SwipeAction },
  extra: { name: string; label: string; onAction: () => void }[] = [],
) {
  const list = [
    ...(actions.right && actions.right.allowed !== false
      ? [{ name: 'swipe-right', label: actions.right.label, onAction: actions.right.onCommit }]
      : []),
    ...(actions.left && actions.left.allowed !== false
      ? [{ name: 'swipe-left', label: actions.left.label, onAction: actions.left.onCommit }]
      : []),
    ...extra,
  ];
  return {
    accessibilityActions: list.map(({ name, label }) => ({ name, label })),
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      list.find((entry) => entry.name === event.nativeEvent.actionName)?.onAction();
    },
  };
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  underlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  reveal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  revealText: {
    ...text.meta,
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
});
