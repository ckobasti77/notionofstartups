import { Plus } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { radius, SHADOW_COLOR } from '@/theme/tokens';

const SIZE = 56;

/**
 * Plutajuće dugme dole desno za brzo dodavanje (docs/mobile §3, §4). Izgled i
 * pozicija su svuda isti — `label` samo imenuje šta se pravi (a11y).
 */
export function QuickAddFab({
  onPress,
  label = 'Novi zadatak',
}: {
  onPress: () => void;
  label?: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: colors.primary,
          shadowColor: SHADOW_COLOR,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <Plus size={26} color={colors.primaryForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: SIZE,
    height: SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // Blaga senka: iOS preko shadow*, Android preko elevation.
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
