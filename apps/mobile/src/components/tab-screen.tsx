import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight } from '@/theme/tokens';

export type TabScreenProps = {
  title: string;
  /** Akcije desno od naslova (ikonice/dugmad). */
  actions?: React.ReactNode;
  children: React.ReactNode;
};

/** Doslednи okvir taba: puna pozadina, naslov ekrana i prostor za sadržaj. */
export function TabScreen({ title, actions, children }: TabScreenProps) {
  const colors = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    minHeight: 44,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  body: {
    flex: 1,
  },
});
