import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { spacing, text } from '@/theme/tokens';

export function FullScreenLoader({ label = 'Pripremam radni prostor' }: { label?: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.foreground} />
      {/* Ovo je jedini tekst koji korisnik vidi na svakom hladnom startu — 16px minimum. */}
      <Text style={[styles.label, text.body, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  label: {
    textAlign: 'center',
  },
});
