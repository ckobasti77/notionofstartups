import type { LucideIcon } from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { radius, SHADOW_COLOR } from '@/theme/tokens';

const SIZE = 56;

export type FABProps = {
  /** Ikonica — FAB je boji `primaryForeground` (kontrast na akcentu). */
  icon: LucideIcon;
  onPress: () => void;
  /** Obavezan opis akcije (ikonica sama nema tekst). */
  accessibilityLabel: string;
  /** Akcija u toku (npr. otpremanje) — spiner umesto ikonice, dodir onemogućen. */
  busy?: boolean;
  /** Doterivanje pozicije/ofseta (difolt je apsolutno dole desno). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Plutajuće akciono dugme. Podloga je akcenat (`primary`); ovo je jedno od dva
 * mesta gde je senka dozvoljena (drugo je sheet). Pozicija je apsolutna po
 * difoltu — prepiši je kroz `style` (npr. u katalogu za prikaz u mestu).
 */
export function FAB({ icon: Icon, onPress, accessibilityLabel, busy = false, style }: FABProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: colors.primary,
          shadowColor: SHADOW_COLOR,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={colors.primaryForeground} />
      ) : (
        <Icon size={26} color={colors.primaryForeground} />
      )}
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
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // Blaga senka: iOS preko shadow*, Android preko elevation.
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
