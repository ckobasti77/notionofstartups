import type { NoteFilter } from '@devotion/shared';
import { sameNoteFilter } from '@devotion/shared';
import { ScrollView, StyleSheet } from 'react-native';

import { StartupChip } from '@/components/me/startup-chip';
import { OptionChip } from '@/components/ui/option-chip';

import type { NoteStartup } from './misli-model';

/**
 * Čipovi opsega Beleški: Sve · Lično · svaki moj startup. Isti red služi kao
 * filter liste (`includeAll`) i kao izbor odredišta nove beleške (bez „Sve").
 * Klizi vodoravno do ivice ekrana (`bleed` poništava horizontalni padding
 * roditelja); izabran čip nosi `selected` stanje (OptionChip). Dodir ≥ 44 pt.
 */
export function NoteScopeChips<Id extends string>({
  value,
  startups,
  includeAll = true,
  bleed = 16,
  onChange,
}: {
  value: NoteFilter<Id>;
  startups: ReadonlyArray<NoteStartup & { _id: Id }>;
  includeAll?: boolean;
  /** Koliko roditelj uvlači sadržaj sa strane (čipovi idu do ivice). */
  bleed?: number;
  onChange: (next: NoteFilter<Id>) => void;
}) {
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, { marginHorizontal: -bleed }]}
      contentContainerStyle={[styles.chips, { paddingHorizontal: bleed }]}>
      {includeAll ? (
        <OptionChip
          label="Sve"
          active={sameNoteFilter(value, { kind: 'all' })}
          onPress={() => onChange({ kind: 'all' })}
        />
      ) : null}
      <OptionChip
        label="Lično"
        leading={<StartupChip startup={null} size="sm" />}
        active={sameNoteFilter(value, { kind: 'personal' })}
        onPress={() => onChange({ kind: 'personal' })}
      />
      {startups.map((startup) => (
        <OptionChip
          key={startup._id}
          label={startup.name}
          leading={<StartupChip startup={startup} size="sm" />}
          active={sameNoteFilter(value, { kind: 'startup', startupId: startup._id })}
          onPress={() => onChange({ kind: 'startup', startupId: startup._id })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // `flexGrow: 0`: vodoravni ScrollView u koloni se inače razvuče i pojede visinu liste.
  scroll: { flexGrow: 0 },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
});
