import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FullScreenLoader({ label = 'Pripremam radni prostor' }: { label?: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator size="large" color={theme.text} />
      {/* `default` = 16px; bio je `small` (14px), a ovo je jedini tekst koji
          korisnik vidi na svakom hladnom startu. */}
      <ThemedText themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  label: {
    textAlign: 'center',
  },
});
