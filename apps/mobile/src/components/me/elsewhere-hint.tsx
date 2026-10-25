import { Info } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { radius, space, text } from '@/theme/tokens';

/**
 * Red iznad liste startupa u globalnom tabu (Poruke, Inbox) dok K14/K16 ne
 * naprave globalne ekrane: bedž taba broji SVE (P14), a lista samo aktivni
 * startup — ovaj red objašnjava razliku i kaže gde je ostatak. Informacija,
 * ne radnja; startup se menja na imenu startupa iznad naslova.
 */
export function ElsewhereHint({ text: message }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${message} Startup menjaš na imenu iznad naslova.`}
      style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Info size={18} color={colors.mutedForeground} style={styles.icon} />
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        {message} Startup menjaš na imenu iznad naslova.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    marginTop: 2,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    marginHorizontal: space[4],
    marginTop: space[1],
    marginBottom: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    ...text.body,
    flex: 1,
  },
});
