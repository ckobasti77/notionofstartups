import * as Haptics from 'expo-haptics';
import { Check, Settings2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AssigneeStack } from '@/components/danas/assignee-stack';
import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { PriorityDot } from '@/components/danas/priority-dot';
import type { CommandCenterTask, TaskAssignee } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

const DONE_THRESHOLD = 92; // svajp desno preko ovoga → „gotovo"
const MENU_THRESHOLD = 72; // svajp levo preko ovoga → meni
const MAX_PULL = 120;

/**
 * Kartica zadatka sa svajpom. Desno preko praga → `onDone` (haptika); levo preko
 * praga → `onMenu`. Tap → `onMenu`, long-press → `onQuickStatus` (brzi status).
 * `activeOffsetX`/`failOffsetY` prepuštaju vertikalni skrol listi i ne kradu tap.
 * Kad korisnik nema pravo da menja status, svajp-desno se odbije uz upozorenje.
 */
export function TaskCard({
  task,
  areaLabel,
  assignees,
  now,
  canDone,
  onDone,
  onMenu,
  onQuickStatus,
}: {
  task: CommandCenterTask;
  areaLabel: string;
  assignees: TaskAssignee[];
  now: number;
  canDone: boolean;
  onDone: () => void;
  onMenu: () => void;
  onQuickStatus: () => void;
}) {
  const colors = useThemeColors();
  const translateX = useSharedValue(0);
  const triggered = useSharedValue(0); // -1 = meni, 0 = ništa, 1 = gotovo

  const fireHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const handleEnd = (direction: number) => {
    if (direction === 1) {
      if (canDone) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDone();
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } else if (direction === -1) {
      onMenu();
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      'worklet';
      const x = Math.max(-MAX_PULL, Math.min(event.translationX, MAX_PULL));
      translateX.value = x;
      if (x >= DONE_THRESHOLD && triggered.value !== 1) {
        triggered.value = 1;
        runOnJS(fireHaptic)();
      } else if (x <= -MENU_THRESHOLD && triggered.value !== -1) {
        triggered.value = -1;
        runOnJS(fireHaptic)();
      } else if (x < DONE_THRESHOLD && x > -MENU_THRESHOLD && triggered.value !== 0) {
        triggered.value = 0;
      }
    })
    .onEnd(() => {
      'worklet';
      runOnJS(handleEnd)(triggered.value);
      triggered.value = 0;
      translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
    });

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const doneRevealStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, translateX.value / DONE_THRESHOLD)),
  }));
  const menuRevealStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, -translateX.value / MENU_THRESHOLD)),
  }));

  return (
    <View style={styles.wrapper}>
      <View
        style={styles.underlay}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Animated.View
          style={[styles.reveal, styles.doneReveal, { backgroundColor: colors.success }, doneRevealStyle]}>
          <Check size={20} color={colors.successForeground} />
          <Text style={[styles.revealText, { color: colors.successForeground }]}>Gotovo</Text>
        </Animated.View>
        <Animated.View
          style={[styles.reveal, styles.menuReveal, { backgroundColor: colors.secondary }, menuRevealStyle]}>
          <Text style={[styles.revealText, { color: colors.secondaryForeground }]}>Meni</Text>
          <Settings2 size={20} color={colors.secondaryForeground} />
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={slideStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={task.title}
            accessibilityHint="Dodirni za meni akcija, dugi pritisak za brzi status"
            onPress={onMenu}
            onLongPress={() => {
              void Haptics.selectionAsync();
              onQuickStatus();
            }}
            delayLongPress={300}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.92 : 1,
              },
            ]}>
            <View style={styles.main}>
              <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>
                {task.title}
              </Text>
              <View style={styles.meta}>
                <PriorityDot priority={task.taskPriority} />
                <Text numberOfLines={1} style={[styles.area, { color: colors.mutedForeground }]}>
                  {areaLabel}
                </Text>
                <DeadlineBadge dueDate={task.dueDate} taskStatus={task.taskStatus} now={now} />
              </View>
            </View>
            <AssigneeStack assignees={assignees} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  underlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  reveal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  doneReveal: {
    justifyContent: 'flex-start',
  },
  menuReveal: {
    justifyContent: 'flex-end',
  },
  revealText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  main: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  area: {
    fontSize: 13,
    flexShrink: 1,
  },
});
