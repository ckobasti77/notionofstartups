import { ScrollView, StyleSheet } from 'react-native';

import { OptionChip } from '@/components/ui/option-chip';
import { PAGE_KIND_KEYS, PAGE_KIND_META, type PageKind } from '@/lib/page-kinds';

/**
 * Filter po vrsti stranice iznad liste u oblasti (C7) — pandan web
 * `area-view.tsx` filteru „Sve / Beleška / Zadatak / …". `null` je „Sve".
 *
 * Chip-ovi su `OptionChip` (44pt meta, `accessibilityState.selected`), a red je
 * horizontalni `ScrollView` sa `flexGrow: 0` — bez toga se `ScrollView` u koloni
 * rasteže i pojede visinu liste ispod (zamka iz `workload-strip.tsx`).
 *
 * Mobilna labela za `file` je „Fajl" (`lib/page-kinds.ts`), web piše „Prilozi";
 * ostaje mobilna jer je u aplikaciji već svuda tako.
 */
export function KindFilterRow({
  value,
  onChange,
}: {
  value: PageKind | null;
  onChange: (next: PageKind | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}>
      <OptionChip label="Sve" active={value === null} onPress={() => onChange(null)} />
      {PAGE_KIND_KEYS.map((kind) => (
        <OptionChip
          key={kind}
          label={PAGE_KIND_META[kind].label}
          active={value === kind}
          onPress={() => onChange(value === kind ? null : kind)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
