import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConvexConnectionState } from 'convex/react';
import { WifiOff } from 'lucide-react-native';

import { useThemeColors } from '@/theme/theme-provider';

/**
 * Pukla veza ka Convexu NE baca grešku — upiti samo večno „učitavaju" (zamka
 * Z8: aplikacija stoji na „Pripremam radni prostor" bez ijedne poruke). Ovaj
 * baner je jedini pošten signal za to stanje; serverske greške idu kroz route
 * ErrorBoundary-je, ne ovuda. Prag guši treptaj pri prvom povezivanju i
 * mikro-prekidima. Web pandan: `apps/web/components/connection-banner.tsx`.
 */
const SHOW_DELAY_MS = 3_000;

export function ConnectionBanner() {
  const connection = useConvexConnectionState();
  const disconnected = !connection.isWebSocketConnected;
  // `armed` se pali tek posle praga; render kapija je `disconnected && armed`,
  // pa povratak veze skida baner bez setState-a u telu efekta (isti obrazac
  // kao web pandan).
  const [armed, setArmed] = useState(false);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  useEffect(() => {
    if (!disconnected) return;
    const id = setTimeout(() => setArmed(true), SHOW_DELAY_MS);
    return () => {
      clearTimeout(id);
      setArmed(false);
    };
  }, [disconnected]);

  if (!disconnected || !armed) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View
        accessibilityRole="alert"
        style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <WifiOff size={14} color={colors.warning} />
        <Text style={[styles.text, { color: colors.foreground }]}>
          Nema veze sa serverom — pokušavam ponovo…
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 80,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Statusna meta — ispod osnovnih 16px po pravilu „16px osim meta".
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});
