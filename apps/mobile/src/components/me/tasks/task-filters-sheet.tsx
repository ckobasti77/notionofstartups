import {
  activeFilterCount,
  clearTaskFilters,
  DUE_BUCKET_LABELS,
  hasActiveFilters,
  PERSONAL_FILTER_KEY,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_FILTER_DUE,
  TASK_FILTER_PRIORITIES,
  TASK_FILTER_STATUSES,
  toggleFilterValue,
  type StartupMini,
  type TaskFilters,
} from '@devotion/shared';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { OptionChip } from '@/components/ui/option-chip';
import { Sheet } from '@/components/ui/sheet';
import { haptics } from '@/lib/haptics';
import { StartupChip } from '../startup-chip';
import { priorityColor, statusColor } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, space, text } from '@/theme/tokens';

export type TaskFiltersSheetProps = {
  visible: boolean;
  filters: TaskFilters;
  startups: ReadonlyArray<StartupMini>;
  /** Koliko redova trenutni filteri pokazuju (naslov dugmeta „Prikaži n"). */
  resultCount: number;
  onChange: (filters: TaskFilters) => void;
  onClose: () => void;
};

/** Oznaka za „Filteri" / „Filteri, 2 aktivno" (plan K07 §3) — i dugme u zaglavlju. */
export function filtersLabel(count: number): string {
  return count > 0 ? `Filteri, ${count} aktivno` : 'Filteri';
}

/**
 * Filteri Mojih zadataka (plan K07 §1.3, telefonski par `TaskFilterBar`): Startup
 * (uključujući „Lično"), Status, Prioritet (uključujući „Bez prioriteta") i Rok,
 * svaka kategorija je više izbora (ILI unutar kategorije, I između kategorija) kao
 * na webu. Primena je ODMAH po dodiru, bez „Primeni"; „Prikaži završene" je prekidač
 * sa svojim upitom. Čipovi su iz `OptionChip` (isti kao stari filteri zadataka).
 * Pravila filtera su iz `@devotion/shared` (`task-filters.ts`).
 */
export function TaskFiltersSheet({
  visible,
  filters,
  startups,
  resultCount,
  onChange,
  onClose,
}: TaskFiltersSheetProps) {
  const colors = useThemeColors();
  const count = activeFilterCount(filters);

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="88%" style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        {count > 0 ? `Filteri (${count})` : 'Filteri'}
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Group label="Startup">
          <OptionChip
            label="Lično"
            leading={<StartupChip startup={null} size="sm" />}
            active={filters.startupIds.includes(PERSONAL_FILTER_KEY)}
            onPress={() =>
              onChange({ ...filters, startupIds: toggleFilterValue(filters.startupIds, PERSONAL_FILTER_KEY) })
            }
          />
          {startups.map((startup) => (
            <OptionChip
              key={startup._id}
              label={startup.name}
              leading={<StartupChip startup={startup} size="sm" />}
              active={filters.startupIds.includes(startup._id)}
              onPress={() =>
                onChange({ ...filters, startupIds: toggleFilterValue(filters.startupIds, startup._id) })
              }
            />
          ))}
        </Group>

        <Group label="Status">
          {TASK_FILTER_STATUSES.map((status) => (
            <OptionChip
              key={status}
              label={STATUS_LABELS[status]}
              // „Otvoreno" (lični zadatak) nema svoju boju statusa u startup tokovima.
              dotColor={status === 'open' ? undefined : statusColor(colors, status)}
              active={filters.statuses.includes(status)}
              onPress={() => onChange({ ...filters, statuses: toggleFilterValue(filters.statuses, status) })}
            />
          ))}
        </Group>

        <Group label="Prioritet">
          {TASK_FILTER_PRIORITIES.map((priority) => (
            <OptionChip
              key={priority}
              label={priority === 'none' ? 'Bez prioriteta' : PRIORITY_LABELS[priority]}
              dotColor={priority === 'none' ? undefined : priorityColor(colors, priority)}
              active={filters.priorities.includes(priority)}
              onPress={() => onChange({ ...filters, priorities: toggleFilterValue(filters.priorities, priority) })}
            />
          ))}
        </Group>

        <Group label="Rok">
          {TASK_FILTER_DUE.map((bucket) => (
            <OptionChip
              key={bucket}
              label={DUE_BUCKET_LABELS[bucket]}
              active={filters.due.includes(bucket)}
              onPress={() => onChange({ ...filters, due: toggleFilterValue(filters.due, bucket) })}
            />
          ))}
        </Group>

        {/* Ceo red je dodirljiv (≥ 44 pt); Switch je samo prikaz stanja. */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Prikaži završene"
          accessibilityState={{ checked: filters.showDone }}
          onPress={() => {
            haptics.select();
            onChange({ ...filters, showDone: !filters.showDone });
          }}
          style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: colors.foreground }]}>Prikaži završene</Text>
          <Switch
            value={filters.showDone}
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            trackColor={{ true: colors.primary }}
          />
        </Pressable>
      </ScrollView>

      <View style={styles.actions}>
        {hasActiveFilters(filters) ? (
          <Button
            label="Očisti filtere"
            variant="ghost"
            onPress={() => onChange(clearTaskFilters(filters))}
            style={styles.flexBtn}
          />
        ) : null}
        <Button label={`Prikaži zadatke (${resultCount})`} onPress={onClose} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={[styles.groupLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <View style={styles.chips}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  heading: {
    ...text.title,
    marginBottom: space[1],
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: space[4],
    paddingBottom: space[1],
  },
  group: {
    gap: space[2],
  },
  groupLabel: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
  },
  switchLabel: {
    ...text.body,
  },
  actions: {
    flexDirection: 'row',
    gap: space[2],
    paddingTop: space[3],
  },
  flexBtn: {
    flex: 1,
  },
});
