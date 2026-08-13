import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { tasksWord } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { type ColorTokens } from '@/theme/tokens';

export type PulseTone = 'danger' | 'warn' | 'info' | 'muted' | 'success';

export type PulseSegment = {
  key: string;
  label: string;
  count: number;
  tone: PulseTone;
};

function toneColor(colors: ColorTokens, tone: PulseTone): string {
  switch (tone) {
    case 'danger':
      return colors.destructive;
    case 'warn':
      return colors.warning;
    case 'info':
      return colors.info;
    case 'success':
      return colors.success;
    case 'muted':
    default:
      return colors.mutedForeground;
  }
}

/**
 * Sastav posla u jednoj traci od 10pt — pandan `apps/web/components/workspace/pulse-bar.tsx`.
 * Postoji da bi se stanje pročitalo periferno, pre teksta.
 *
 * Pristupačnost: traka je JEDAN čvor sa objedinjenom labelom („Kasni: 3 zadatka ·
 * Završeno: 8 zadataka"), a ne tri prazna `View`-a. Bez toga bi čitač ekrana video
 * dekoraciju bez ijednog broja — a brojevi su ceo sadržaj ovog elementa.
 *
 * NEMA pokreta (pa ni `pulseTone` propa koji web ima): jedini potrošač je ekran
 * „Puls", a web tamo izričito šalje `pulseTone={null}` (`puls-view.tsx:179`).
 * Ako se ikad doda „Sastav dana" na tab „Danas" (web tamo otkucava), otkucaj se
 * dodaje ZAJEDNO sa tim potrošačem — ne unaprd, kao mrtav kod.
 */
export function PulseBar({
  segments,
  label,
  emptyLabel = 'Nema otvorenih zadataka',
  style,
}: {
  segments: readonly PulseSegment[];
  /** Šta traka predstavlja — ulazi u labelu za čitač ekrana. */
  label: string;
  emptyLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const visible = segments.filter((segment) => segment.count > 0);
  const total = visible.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={emptyLabel}
        style={[styles.bar, styles.empty, { backgroundColor: colors.muted }, style]}
      />
    );
  }

  const description = visible
    .map((segment) => `${segment.label}: ${segment.count} ${tasksWord(segment.count)}`)
    .join(' · ');

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}. ${description}`}
      style={[styles.row, style]}>
      {visible.map((segment) => (
        <View
          key={segment.key}
          // `flexGrow: count` daje udeo u širini; `minWidth` čuva segment od 1 u
          // odnosu 1:100 da ne postane linija od pola piksela (praktično nevidljiv).
          style={[
            styles.bar,
            {
              flexGrow: segment.count,
              flexBasis: 0,
              minWidth: 3,
              backgroundColor: toneColor(colors, segment.tone),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: '100%',
  },
  bar: {
    height: 10,
    // 3pt kao web (`rounded-[3px]`); u `radius` skali nema ovako mala vrednost.
    borderRadius: 3,
  },
  empty: {
    width: '100%',
  },
});
