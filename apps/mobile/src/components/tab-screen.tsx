import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/app-header';
import { useThemeColors } from '@/theme/theme-provider';

export type TabScreenProps = {
  title: string;
  /** Akcije levo od pretrage i avatara u zaglavlju. */
  actions?: React.ReactNode;
  /** Red ispod naslova, unutar istog zaglavlja (npr. segmentna kontrola). */
  below?: React.ReactNode;
  /** Stack ekran sa istim zaglavljem (npr. „Kanali" iz Prostora): „nazad" levo od naslova. */
  onBack?: () => void;
  children: React.ReactNode;
};

/**
 * Okvir taba: JEDNO zaglavlje (`AppHeader` — kontekst startupa, naslov, akcije)
 * i sadržaj ispod. Donji safe-area pokriva tab bar.
 */
export function TabScreen({ title, actions, below, onBack, children }: TabScreenProps) {
  const colors = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title={title} actions={actions} below={below} onBack={onBack} />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
});
