import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

export type DaySummaryCounts = {
  /** Broj otvorenih zadataka u trenutnom segmentu. */
  open: number;
  /** Koliko njih ima prošao rok. */
  overdue: number;
  /** Koliko njih je označeno kao hitno. */
  urgent: number;
};

/**
 * Pandan web `home-view` zaglavlju (pozdrav + brojači) — na mobilnom NIJE zaseban
 * ekran nego uvod u tab „Danas" (docs/mobile/02-EKRANI.md §1: `home` → Danas →
 * segment „Pregled"). Skroluje se zajedno sa listom, pa ne oduzima stalan prostor.
 *
 * Web kartica „Napredak (%)" se NE prenosi: procenat traži i završene zadatke, a
 * `tasks.commandCenter` vraća samo otvorene. Web ga računa iz prvih 100 zadataka
 * (`tasks.listForStartup`) i sam ga označava zvezdicom kao procenu — takva
 * približna brojka ne opravdava drugu paginiranu pretplatu na telefonu. Zapisano u
 * docs/mobile/ZA-POPRAVKU.md.
 */
export function DaySummary({
  firstName,
  counts,
  segmentLabel,
}: {
  /** Ime za pozdrav; `null` dok profil stiže. */
  firstName: string | null;
  /** Brojači; `null` dok zadaci stižu (prikazuje se skelet). */
  counts: DaySummaryCounts | null;
  /** „Pregled" ili „Moji zadaci" — kaže na šta se brojači odnose. */
  segmentLabel: string;
}) {
  const colors = useThemeColors();

  // Ime startupa namerno NIJE ovde: već stoji u `AppHeader` eyebrow-u (koji je
  // ujedno i prebacivač) — dvaput u 400px je bio bag E4.
  return (
    <Card style={styles.card}>
      {firstName === null ? (
        <Skeleton width="60%" height={26} />
      ) : (
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.greeting, { color: colors.foreground }]}>
          Zdravo, {firstName}.
        </Text>
      )}

      <View style={[styles.stats, { borderTopColor: colors.border }]}>
        <Stat
          value={counts?.open ?? null}
          label="otvoreno"
          tint={colors.foreground}
          hint={segmentLabel}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Stat
          value={counts?.overdue ?? null}
          label="kasni"
          // Boja je signal, ne dekoracija: crveno tek kad stvarno nešto kasni.
          tint={counts && counts.overdue > 0 ? colors.danger : colors.foreground}
          hint={segmentLabel}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Stat
          value={counts?.urgent ?? null}
          label="hitno"
          tint={counts && counts.urgent > 0 ? colors.warning : colors.foreground}
          hint={segmentLabel}
        />
      </View>
    </Card>
  );
}

function Stat({
  value,
  label,
  tint,
  hint,
}: {
  value: number | null;
  label: string;
  tint: string;
  hint: string;
}) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel={value === null ? `${label}, učitavanje` : `${value} ${label} — ${hint}`}
      style={styles.stat}>
      {value === null ? (
        <Skeleton width={32} height={26} />
      ) : (
        <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      )}
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
  },
  greeting: {
    ...text.title,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...text.meta,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
});
