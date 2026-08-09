import { ChevronDown, ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

export type ScreenHeaderProps = {
  /** Naslov ekrana — `display` (28/34/700), levo. */
  title: string;
  /** Naslov sadržaja (npr. ime stranice) ume da bude dug — 2 reda umesto 1. */
  titleNumberOfLines?: number;
  /**
   * Prigušena `meta` linija IZNAD naslova (npr. ime startupa, oblast, putanja).
   * String se prikazuje kao tekst; čvor (npr. `Skeleton`) se ubacuje kakav jeste.
   */
  eyebrow?: ReactNode;
  /** Kad je zadat, eyebrow je dodirljiv i dobija strelicu nadole. */
  onEyebrowPress?: () => void;
  eyebrowAccessibilityLabel?: string;
  /** Kad je zadat, levo od naslova stoji „nazad". */
  onBack?: () => void;
  /** Akcije desno od naslova (ikonice, avatar, pilula-brojač). */
  actions?: ReactNode;
  /** Red ISPOD naslova unutar istog zaglavlja (segment, breadcrumb, pretraga). */
  below?: ReactNode;
  /** Hairline ivica na dnu — samo kad sadržaj ispod skroluje pod zaglavlje. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * JEDNO zaglavlje ekrana. Ranije su postojale dve trake jedna ispod druge
 * (kontekst startupa + naslov ekrana) i ~8 ručno sklopljenih kopija po stack
 * ekranima; ovo je jedna komponenta: `eyebrow` nosi kontekst kao `meta` linija,
 * naslov je `display` levo, akcije desno.
 *
 * Gornji safe-area je uvek uračunat ovde — ekran koji koristi `ScreenHeader` ne
 * sme da dodaje `insets.top` još jednom.
 */
export function ScreenHeader({
  title,
  titleNumberOfLines = 1,
  eyebrow,
  onEyebrowPress,
  eyebrowAccessibilityLabel,
  onBack,
  actions,
  below,
  divider = false,
  style,
}: ScreenHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const eyebrowBody =
    eyebrow == null ? null : (
      <>
        {typeof eyebrow === 'string' ? (
          <Text numberOfLines={1} style={[styles.eyebrow, { color: colors.mutedForeground }]}>
            {eyebrow}
          </Text>
        ) : (
          eyebrow
        )}
        {onEyebrowPress ? <ChevronDown size={14} color={colors.subtle} /> : null}
      </>
    );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        },
        style,
      ]}>
      {eyebrowBody ? (
        onEyebrowPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              eyebrowAccessibilityLabel ?? (typeof eyebrow === 'string' ? eyebrow : undefined)
            }
            onPress={onEyebrowPress}
            hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}
            style={({ pressed }) => [styles.eyebrowRow, pressed && styles.pressed]}>
            {eyebrowBody}
          </Pressable>
        ) : (
          <View style={styles.eyebrowRow}>{eyebrowBody}</View>
        )
      ) : null}

      <View style={styles.titleRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nazad"
            onPress={onBack}
            style={({ pressed }) => [
              styles.back,
              pressed && { backgroundColor: colors.muted },
            ]}>
            <ChevronLeft size={24} color={colors.foreground} />
          </Pressable>
        ) : null}
        <Text
          numberOfLines={titleNumberOfLines}
          style={[styles.title, { color: colors.foreground }]}>
          {title}
        </Text>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>

      {below ? <View style={styles.below}>{below}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 20,
  },
  eyebrow: {
    ...text.meta,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TOUCH_TARGET,
  },
  // „Nazad" se optički poravnava sa levom ivicom sadržaja (dodirna meta je šira).
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  title: {
    ...text.display,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Ikonice desno idu do ivice ekrana kao dodirna meta, ali optički na 16.
    marginRight: -10,
  },
  below: {
    marginTop: 8,
  },
});
