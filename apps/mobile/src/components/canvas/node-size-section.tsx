import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/** Jedan red sekcije „Veličina". `key` je i ključ brave (`busy`) tog reda. */
export type SizeOption = {
  key: string;
  title: string;
  titleNumberOfLines?: number;
  subtitle?: string;
  icon: ReactNode;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * Sekcija „Veličina" u sheet-u čvora — ČIST PRIKAZ, bez ijedne mutacije (K4).
 *
 * Zašto deljeno: K2 je sekciju napisao za karticu stranice (±10% + reset), a K4 je
 * ista stvar za checkpoint oblačić (preseti + reset). Redovi, prazna stanja, brava i
 * dodirne mete su identični — razlikuju se samo tekstovi i mutacije koje pozivalac
 * veže. Kopija bi značila da se sledeća ispravka pristupačnosti radi dvaput.
 *
 * Vlasnik brave (`busy`) je RODITELJ: veličina i veze dele jedan sheet i ne smeju se
 * okinuti jedna preko druge.
 */
export function NodeSizeSection({
  canResize,
  deniedNote,
  options,
  note,
  hint,
  busy,
}: {
  /** Sme li OVAJ korisnik da menja veličinu; inače se umesto redova prikazuje razlog. */
  canResize: boolean;
  /** Razlog kad `canResize` nije tačno — prazna lista bi izgledala kao kvar. */
  deniedNote: string;
  options: SizeOption[];
  /** Napomena ispod redova (npr. „već je u podrazumevanoj veličini"). */
  note?: string;
  /** Objašnjenje ispod cele sekcije (npr. gde još postoji put do veličine). */
  hint?: string;
  /** Ključ reda koji je u toku, ili `null` — jedna brava za ceo sheet. */
  busy: string | null;
}) {
  const colors = useThemeColors();
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Veličina</Text>
      {canResize ? (
        <View style={styles.list}>
          {options.map((option) => (
            <Row
              key={option.key}
              title={option.title}
              titleNumberOfLines={option.titleNumberOfLines}
              subtitle={option.subtitle}
              onPress={option.onPress}
              disabled={busy !== null || option.disabled === true}
              showChevron={false}
              style={styles.row}
              icon={option.icon}
              value={busy === option.key ? <ActivityIndicator color={colors.primary} /> : undefined}
            />
          ))}
          {note ? (
            <Text style={[styles.note, { color: colors.mutedForeground }]}>{note}</Text>
          ) : null}
        </View>
      ) : (
        /* Prazna lista bi izgledala kao kvar — razlog se kaže. */
        <Text style={[styles.note, { color: colors.mutedForeground }]}>{deniedNote}</Text>
      )}

      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...text.meta,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },
  list: {
    gap: 2,
  },
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  note: {
    ...text.body,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  hint: {
    ...text.meta,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
