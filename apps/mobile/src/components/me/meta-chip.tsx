import type { Perm } from '@devotion/shared';
import { ChevronDown, Lock, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

export type MetaChipProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  perm: Perm;
  /** Dozvoljeno: otvara izbor (sub-prikaz panela). */
  onPress: () => void;
  /** Zabranjeno: dodir javlja razlog (telefon nema tooltip), kao toast na webu. */
  onDenied?: (reason: string) => void;
  /** Pun opis za čitač ekrana (npr. rok iz `describeDue`); podrazumevano „{label}: {value}". */
  accessibilityLabel?: string;
  /** Samo vrednost, bez „{label}:" (npr. „Bez roka", „Bez prioriteta" — plan K07 §3). */
  bare?: boolean;
};

/**
 * Metapodatak-čip panela zadatka (plan K07 §1.4, E15), par web `MetaChip`:
 * „Status: U toku ▾". Zabranjen metapodatak je čip sa katancem, isprekidanom
 * ivicom i bojom `mutedForeground` — bez prozirnosti. Nije `disabled` (to bi
 * ga izbacilo iz čitača ekrana i uklonilo razlog): stanje je `disabled` za
 * čitač, a dodir pokazuje razlog; razlog je i `accessibilityHint`.
 * Dodirna meta ≥ 44 pt.
 */
export function MetaChip({
  label,
  value,
  icon: Icon,
  perm,
  onPress,
  onDenied,
  accessibilityLabel,
  bare = false,
}: MetaChipProps) {
  const colors = useThemeColors();
  // Čitač uvek čuje i šta je polje (npr. „Prioritet: Bez prioriteta“), ne samo vrednost.
  const spoken = accessibilityLabel ?? `${label}: ${value}`;

  if (!perm.allowed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={spoken}
        accessibilityHint={perm.reason ?? undefined}
        onPress={() => {
          haptics.warning();
          if (perm.reason) onDenied?.(perm.reason);
        }}
        style={[styles.chip, styles.locked, { borderColor: colors.border }]}>
        <Lock size={14} color={colors.mutedForeground} />
        <Icon size={14} color={colors.mutedForeground} />
        <Text numberOfLines={1} style={[styles.text, { color: colors.mutedForeground }]}>
          {label}: <Text style={styles.value}>{value}</Text>
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Otvara izbor"
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.surface },
      ]}>
      <Icon size={14} color={colors.mutedForeground} />
      <Text numberOfLines={1} style={[styles.text, { color: colors.foreground }]}>
        {bare ? null : <Text style={{ color: colors.mutedForeground }}>{label}: </Text>}
        <Text style={styles.value}>{value}</Text>
      </Text>
      <ChevronDown size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    maxWidth: '100%',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  locked: {
    borderStyle: 'dashed',
  },
  text: {
    ...text.body,
    flexShrink: 1,
  },
  value: {
    fontWeight: fontWeight.medium,
  },
});
