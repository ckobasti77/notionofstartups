import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

export type RowVariant = 'navigation' | 'value' | 'toggle';

export type RowProps = {
  /**
   * Krajnji levi slot, PRE ikonice — za afordansu koja ima svoj dodir nezavisan od
   * reda (npr. strelica „razvij podstranice" u stablu Prostora). Ne ulazi u
   * `accessibilityLabel` reda: taj čvor nosi sopstvenu a11y semantiku.
   */
  leading?: ReactNode;
  /**
   * Levi slot — ikonica ili obojeni chip. Caller kontroliše veličinu (smernica:
   * 20px prosta ikonica; veći chip se prosleđuje kao gotov čvor).
   */
  icon?: ReactNode;
  /** Glavni tekst reda (16px — mobilni minimum). */
  title: string;
  /** Broj linija naslova pre skraćivanja (podrazumevano 1). */
  titleNumberOfLines?: number;
  /**
   * Opcioni podnaslov ispod naslova — jedini vertikalni deo reda. String se
   * prikazuje prigušeno; čvor (npr. badge) se ubacuje kakav jeste.
   */
  subtitle?: ReactNode;
  /**
   * Desna vrednost. String se prikazuje prigušenom bojom; čvor (npr. badge,
   * pill, avatar) zadržava sopstvene boje.
   */
  value?: ReactNode;
  variant?: RowVariant;
  /**
   * Strelica ›. Podrazumevano se prikazuje za `navigation`/`value`; nikad kad je
   * red `disabled` ili `toggle`. Postavi na `false` za navigaciju bez strelice.
   */
  showChevron?: boolean;
  /** „Uskoro" i sl. — prigušeno, bez pressed efekta, nedodirljivo. */
  disabled?: boolean;
  onPress?: () => void;
  /** `toggle` varijanta — vrednost prekidača. */
  checked?: boolean;
  onToggle?: (next: boolean) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Doterivanje po kontekstu (padding u kartici, ivica, pozadina kartice). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Deljeni red liste — JEDAN `flexDirection: 'row'`: levo opciona ikonica, pa
 * naslov (sa opcionim podnaslovom ispod — jedini vertikalni deo), fleksibilan
 * razmak, pa opciona vrednost i strelica desno. Zamenjuje ručno sklopljene
 * redove po ekranima da raspored bude dosledan (docs/mobile/02-EKRANI.md §11:
 * dodirna meta ≥ 44pt, tekst ≥ 16px).
 */
export function Row({
  leading,
  icon,
  title,
  titleNumberOfLines = 1,
  subtitle,
  value,
  variant = 'navigation',
  showChevron,
  disabled = false,
  onPress,
  checked,
  onToggle,
  accessibilityLabel,
  accessibilityHint,
  style,
}: RowProps) {
  const colors = useThemeColors();
  const isToggle = variant === 'toggle';
  // Strelica: eksplicitno ako je zadata; inače za navigation/value. Nikad kad je
  // red nedodirljiv (disabled) ili nosi prekidač (toggle).
  const chevron = !disabled && !isToggle && (showChevron ?? true);
  // Kad je `accessibilityLabel` postavljen, RN prestaje da agregira tekst dece —
  // pa vrednost reda ne bude najavljena. Zato podrazumevano sklapamo naslov +
  // string vrednost. Čvor-vrednost (badge/avatar) caller mora sam da opiše.
  const resolvedLabel =
    accessibilityLabel ?? (typeof value === 'string' ? `${title}, ${value}` : title);

  const body = (
    <>
      {leading != null ? leading : null}
      {icon != null ? icon : null}
      <View style={styles.titleWrap}>
        <Text
          numberOfLines={titleNumberOfLines}
          style={[
            styles.title,
            { color: disabled ? colors.mutedForeground : colors.foreground },
          ]}>
          {title}
        </Text>
        {subtitle != null ? (
          typeof subtitle === 'string' ? (
            <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {subtitle}
            </Text>
          ) : (
            <View style={styles.subtitleSlot}>{subtitle}</View>
          )
        ) : null}
      </View>
      {value != null ? (
        <View style={styles.value}>
          {typeof value === 'string' ? (
            <Text numberOfLines={1} style={[styles.valueText, { color: colors.mutedForeground }]}>
              {value}
            </Text>
          ) : (
            value
          )}
        </View>
      ) : null}
      {isToggle ? (
        <Switch
          value={Boolean(checked)}
          onValueChange={onToggle}
          disabled={disabled || onToggle == null}
          trackColor={{ true: colors.primary, false: colors.muted }}
          thumbColor={colors.surface}
          // Semantiku (role „switch" + stanje) nosi omotač reda; unutrašnji Switch
          // se sakriva iz a11y stabla da se stanje ne najavi dvaput.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      {chevron ? <ChevronRight size={20} color={colors.mutedForeground} /> : null}
    </>
  );

  // Nedodirljiv red (npr. „uskoro"): View, ne Pressable — nema pressed efekta.
  if (disabled) {
    return (
      <View
        accessibilityRole={isToggle ? 'switch' : 'text'}
        accessibilityState={isToggle ? { checked: Boolean(checked), disabled: true } : { disabled: true }}
        accessibilityLabel={resolvedLabel}
        style={[styles.base, styles.disabled, style]}>
        {body}
      </View>
    );
  }

  // Toggle bez pritiska na ceo red: interakciju nosi Switch, red je samo okvir.
  if (isToggle && onPress == null) {
    return (
      <View
        accessibilityRole="switch"
        accessibilityState={{ checked: Boolean(checked) }}
        accessibilityLabel={resolvedLabel}
        style={[styles.base, style]}>
        {body}
      </View>
    );
  }

  // Statični red bez akcije (retko) — takođe View.
  if (onPress == null) {
    return (
      <View accessibilityLabel={resolvedLabel} style={[styles.base, style]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.base, pressed && { backgroundColor: colors.muted }, style]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disabled: {
    opacity: 0.4,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  subtitle: {
    ...text.meta,
  },
  subtitleSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueText: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
});
