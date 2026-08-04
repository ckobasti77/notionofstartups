import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight } from '@/theme/tokens';

export type EmptyStateProps = {
  /** Ikonica iznad naslova (npr. iz `lucide-react-native`). */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Opciono dugme poziva na akciju. */
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Deljeno prazno stanje — nijedan ekran ne sme ostati beo
 * (docs/mobile/02-EKRANI.md, sekcija 10).
 */
export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="md" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  icon: {
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  action: {
    marginTop: 12,
  },
});
