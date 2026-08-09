import { Users } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { tasksWord } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Ključ pod kojim se vode zadaci bez ijednog izvršioca. */
export const UNASSIGNED_KEY = 'unassigned';

/** `null` = bez filtera („Svi"). */
export type WorkloadFilter = string | null;

export type WorkloadEntry = {
  key: string;
  name: string;
  /** `null` za „Nedodeljeno" — tada se crta prazan isečkan krug, ne avatar. */
  avatar: { displayName: string; avatarUrl: string | null } | null;
  open: number;
  overdue: number;
  urgent: number;
};

/**
 * „Ko šta nosi" — pandan web `workload-strip.tsx`. Na telefonu je traka
 * horizontalno skrolabilna umesto da se lomi u više redova; sve ostalo je isto:
 * tap bira člana, ponovni tap na aktivnog gasi filter.
 *
 * Član bez zadataka ostaje u traci sa prigušenom nulom — prazna kolona je
 * informacija (ima kapaciteta), ne šum.
 */
export function WorkloadStrip({
  entries,
  totalOpen,
  activeKey,
  onSelect,
  loading = false,
}: {
  entries: WorkloadEntry[];
  totalOpen: number;
  activeKey: WorkloadFilter;
  onSelect: (key: WorkloadFilter) => void;
  /** Dok članovi stižu — skelet umesto prazne trake. */
  loading?: boolean;
}) {
  const colors = useThemeColors();

  if (loading) {
    return (
      <View style={styles.strip} accessibilityLabel="Učitavanje opterećenja tima">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} width={148} height={56} borderRadius={radius.card} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      accessibilityRole="tablist"
      accessibilityLabel="Opterećenje tima">
      <Chip
        active={activeKey === null}
        label="Svi"
        description={`Svi zadaci: ${totalOpen} ${tasksWord(totalOpen)}`}
        onPress={() => onSelect(null)}
        icon={
          <View style={[styles.iconChip, { backgroundColor: colors.muted }]}>
            <Users size={18} color={colors.mutedForeground} />
          </View>
        }
        stats={[{ value: totalOpen, label: 'otvoreno', tone: colors.mutedForeground }]}
      />
      {entries.map((entry) => (
        <Chip
          key={entry.key}
          active={activeKey === entry.key}
          label={entry.name}
          description={`${entry.name}: ${entry.open} ${tasksWord(entry.open)}${
            entry.overdue > 0 ? `, ${entry.overdue} kasni` : ''
          }${entry.urgent > 0 ? `, ${entry.urgent} hitno` : ''}`}
          onPress={() => onSelect(activeKey === entry.key ? null : entry.key)}
          icon={
            entry.avatar === null ? (
              <Avatar empty size={32} accessibilityLabel="Nedodeljeno" />
            ) : (
              <Avatar name={entry.avatar.displayName} uri={entry.avatar.avatarUrl} size={32} />
            )
          }
          stats={[
            { value: entry.open, label: 'otvoreno', tone: colors.mutedForeground },
            ...(entry.overdue > 0
              ? [{ value: entry.overdue, label: 'kasni', tone: colors.danger }]
              : []),
            ...(entry.urgent > 0
              ? [{ value: entry.urgent, label: 'hitno', tone: colors.warning }]
              : []),
          ]}
        />
      ))}
    </ScrollView>
  );
}

type Stat = { value: number; label: string; tone: string };

function Chip({
  active,
  label,
  description,
  onPress,
  icon,
  stats,
}: {
  active: boolean;
  label: string;
  description: string;
  onPress: () => void;
  icon: React.ReactNode;
  stats: Stat[];
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={description}
      accessibilityHint={active ? 'Isključuje filter' : 'Filtrira zadatke na ovog člana'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
        pressed && !active && { backgroundColor: colors.muted },
      ]}>
      {icon}
      <View style={styles.chipBody}>
        <Text
          numberOfLines={1}
          style={[
            styles.chipLabel,
            { color: active ? colors.accentForeground : colors.foreground },
          ]}>
          {label}
        </Text>
        <View style={styles.stats}>
          {stats.map((stat) => (
            <Text
              key={stat.label}
              style={[
                styles.stat,
                { color: stat.tone },
                // Nula ostaje vidljiva, ali prigušena: „ima kapaciteta", ne alarm.
                stat.value === 0 && styles.statZero,
              ]}>
              {stat.value} {stat.label}
            </Text>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: MIN_TOUCH_TARGET + 12,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipBody: {
    flexShrink: 1,
    gap: 2,
  },
  chipLabel: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
  },
  statZero: {
    opacity: 0.55,
  },
});
