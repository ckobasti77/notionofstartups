import { StyleSheet, Text, View, Pressable } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/**
 * Traka preko vrha WebView-a dok se bira cilj veze (K3). Nosi jedinu poruku koja u
 * tom trenutku važi („tapni drugu karticu") i izlaz iz stanja — zato u biranju
 * nestaje pilula „Uređivanje rasporeda" iz embeda: dva sloja iste poruke na istom
 * mestu se ne slažu.
 *
 * Namerno je NISKA (jedan red + dugme): pokriva vrh platna, pa kartica ispod nje
 * mora da bude dohvatljiva pan-om ili preko `[⌖]` u rail-u.
 */
export function ConnectBar({
  sourceTitle,
  onCancel,
}: {
  sourceTitle: string;
  onCancel: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        { backgroundColor: colors.surfaceRaised, borderBottomColor: colors.border },
      ]}>
      <View style={styles.textWrap}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
          Izaberi karticu za vezu
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {`Izvor: ${sourceTitle}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Otkaži povezivanje"
        onPress={() => {
          haptics.select();
          onCancel();
        }}
        style={({ pressed }) => [styles.cancel, pressed && { backgroundColor: colors.muted }]}>
        <Text style={[styles.cancelText, { color: colors.primaryText }]}>Otkaži</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    ...text.meta,
  },
  cancel: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  cancelText: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
});
