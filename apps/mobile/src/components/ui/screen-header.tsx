import { ChevronDown, ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

export type ScreenHeaderProps = {
  /** Naslov ekrana — jedini naslov, levo. */
  title: string;
  /**
   * Veličina naslova (DIZAJN-SMIRENJE §2): `display` (28/34) samo za koren taba,
   * `title` (20/26) za svaki gurnut ekran. Podrazumevano `title`.
   */
  titleSize?: 'display' | 'title';
  /** Naslov sadržaja (npr. ime stranice) ume da bude dug — 2 reda umesto 1. */
  titleNumberOfLines?: number;
  /**
   * Kad je zadat, sam naslov je dugme sa strelicom nadole (npr. birač startupa u
   * Prostoru, gde je naslov ime startupa).
   */
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
  /**
   * Prigušena `meta` linija ISPOD naslova (broj, nedelja, putanja, startup).
   * Nadnaslov iznad naslova više ne postoji (PROSTOR P17, K07 §1.5). String se
   * prikazuje kao tekst; čvor (npr. `Skeleton`, putanja) se ubacuje kakav jeste.
   */
  subtitle?: ReactNode;
  /** Kad je zadat, meta linija je dodirljiva i dobija strelicu nadole. */
  onSubtitlePress?: () => void;
  subtitleAccessibilityLabel?: string;
  /** Kad je zadat, levo od naslova stoji „nazad". */
  onBack?: () => void;
  /** Akcije desno od naslova (ikonice, avatar, pilula-brojač). */
  actions?: ReactNode;
  /** Red ISPOD naslova unutar istog zaglavlja (segment, filteri, pretraga). */
  below?: ReactNode;
  /** Hairline ivica na dnu — samo kad sadržaj ispod skroluje pod zaglavlje. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * JEDNO zaglavlje ekrana: naslov levo, akcije desno, opciona meta linija ispod
 * naslova i opcioni red ispod (segment, filteri). Jedan naslov po ekranu;
 * kontekst (startup, putanja, broj) je meta ISPOD naslova, nikad nadnaslov.
 *
 * Gornji safe-area je uvek uračunat ovde — ekran koji koristi `ScreenHeader` ne
 * sme da dodaje `insets.top` još jednom.
 */
export function ScreenHeader({
  title,
  titleSize = 'title',
  titleNumberOfLines = 1,
  onTitlePress,
  titleAccessibilityLabel,
  subtitle,
  onSubtitlePress,
  subtitleAccessibilityLabel,
  onBack,
  actions,
  below,
  divider = false,
  style,
}: ScreenHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const titleStyle = titleSize === 'display' ? styles.titleDisplay : styles.titleScreen;

  const subtitleBody =
    subtitle == null ? null : (
      <>
        {typeof subtitle === 'string' ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
        {onSubtitlePress ? <ChevronDown size={14} color={colors.subtle} /> : null}
      </>
    );

  const titleText = (
    <Text
      // Naslov-dugme (birač) nosi ulogu dugmeta; inače je ovo naslov ekrana.
      accessibilityRole={onTitlePress ? undefined : 'header'}
      numberOfLines={titleNumberOfLines}
      style={[titleStyle, styles.titleText, { color: colors.foreground }]}>
      {title}
    </Text>
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
      <View style={styles.titleRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nazad"
            // Haptika je u primitivu: „nazad" svuda oseća isto (i kad je gest, i
            // kad je dugme).
            onPress={() => {
              haptics.tap();
              onBack();
            }}
            style={({ pressed }) => [
              styles.back,
              pressed && { backgroundColor: colors.muted },
            ]}>
            <ChevronLeft size={24} color={colors.foreground} />
          </Pressable>
        ) : null}
        {onTitlePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={titleAccessibilityLabel ?? title}
            onPress={onTitlePress}
            style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}>
            {titleText}
            <ChevronDown size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <View style={styles.titleWrap}>{titleText}</View>
        )}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>

      {subtitleBody ? (
        onSubtitlePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              subtitleAccessibilityLabel ?? (typeof subtitle === 'string' ? subtitle : undefined)
            }
            onPress={onSubtitlePress}
            // Red je `minHeight: 32`; slop ga dovodi do 44pt (4 + 32 + 8). Nadole
            // samo 8: ispod može da stoji `below` (razmak 8), pa ne preklapaju;
            // nagore bi prekrio red naslova i oteo tap sa „Nazad".
            hitSlop={{ top: 4, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.subtitleRow,
              styles.subtitlePressable,
              onBack ? styles.subtitleIndent : null,
              pressed && styles.pressed,
            ]}>
            {subtitleBody}
          </Pressable>
        ) : (
          <View style={[styles.subtitleRow, onBack ? styles.subtitleIndent : null]}>
            {subtitleBody}
          </View>
        )
      ) : null}

      {below ? <View style={styles.below}>{below}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 20,
    maxWidth: '100%',
  },
  // Dodirljiva meta linija je viša, da sa `hitSlop` dobije 44pt.
  subtitlePressable: {
    minHeight: 32,
  },
  // Meta stoji poravnata sa naslovom, ne sa strelicom „nazad" (44 - 12 + 4 = 36).
  subtitleIndent: {
    marginLeft: 36,
  },
  subtitle: {
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
  titleWrap: {
    flex: 1,
  },
  titleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TOUCH_TARGET,
  },
  titleText: {
    flexShrink: 1,
  },
  titleDisplay: {
    ...text.display,
  },
  titleScreen: {
    ...text.title,
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
