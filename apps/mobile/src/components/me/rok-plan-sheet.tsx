import { formatDateShort, matchDueShortcut, type TaskRowModel } from '@devotion/shared';
import { Sun, SunDim } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { useRetained } from '@/hooks/use-retained';
import { useThemeColors } from '@/theme/theme-provider';

import { DueChoiceChips, InlineDatePicker, LockedNotice, SheetTaskHeader, type DueChoice } from './choice-chips';

/** Koji čip roka je izabran za postojeći rok reda. */
export function dueChoiceOf(dueDate: number | null, now: number): DueChoice {
  if (dueDate === null) return 'none';
  return matchDueShortcut(dueDate, now) ?? 'date';
}

/**
 * „Datum…" u sheet-u nad redom: kalendar se prikazuje U sheet-u (ne drugi
 * `Modal`). Svako otvaranje (i drugi red) kreće od glavnog prikaza; pri
 * zatvaranju (`null`) prikaz ostaje kakav jeste do kraja izlazne animacije.
 */
export function useInlineDatePick(targetKey: string | null) {
  const [state, setState] = useState<{ key: string | null; picking: boolean }>({
    key: targetKey,
    picking: false,
  });
  if (state.key !== targetKey) {
    setState(targetKey === null ? { key: null, picking: state.picking } : { key: targetKey, picking: false });
  }
  return {
    picking: state.picking,
    open: () => setState({ key: targetKey, picking: true }),
    close: () => setState({ key: targetKey, picking: false }),
  };
}

export type RokPlanSheetProps = {
  /** Red nad kojim je sheet otvoren; `null` = zatvoren. */
  row: TaskRowModel | null;
  now: number;
  onClose: () => void;
  /** Čip roka, „Bez roka" ili dan iz kalendara (lokalno podne). */
  onSetDue: (row: TaskRowModel, dueDate: number | null) => void;
  onTogglePlan: (row: TaskRowModel) => void;
};

/**
 * „Rok i plan" (swipe levo, plan K07 §6.2): čipovi roka iz shared datuma
 * („Datum…" smenjuje sadržaj kalendarom) i „Dodaj u / Ukloni iz Moj dan" —
 * iste radnje kao web dugmad `CalendarClock` i `Sun` u redu. Rok bez dozvole
 * je zaključan čip sa razlogom (E15); plan je uvek dozvoljen. Izbor zatvara
 * sheet (radnja je jedna, kao meni na webu).
 */
export function RokPlanSheet({ row: target, now, onClose, onSetDue, onTogglePlan }: RokPlanSheetProps) {
  const colors = useThemeColors();
  // Sadržaj ostaje tokom izlazne animacije (red je već `null`).
  const row = useRetained(target);
  const date = useInlineDatePick(target?.key ?? null);

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="90%">
      {row ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {date.picking ? (
            <InlineDatePicker
              value={row.dueDate}
              onBack={date.close}
              onSelect={(value) => onSetDue(row, value)}
            />
          ) : (
            <>
              <SheetTaskHeader overline="Rok i plan" title={row.title} startup={row.startup} areaLabel={row.areaLabel} />
              {row.permissions.due.allowed ? (
                <DueChoiceChips
                  now={now}
                  selected={dueChoiceOf(row.dueDate, now)}
                  dateLabel={row.dueDate === null ? null : formatDateShort(row.dueDate)}
                  onShortcut={(_, value) => onSetDue(row, value)}
                  onPickDate={date.open}
                  onNone={() => onSetDue(row, null)}
                />
              ) : (
                <LockedNotice label="Rok" reason={row.permissions.due.reason ?? ''} />
              )}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              {/* Red do ivice sheet-a: ikonica poravnata sa tekstom (Row ima 16 pt unutra). */}
              <View style={styles.rows}>
                <Row
                  icon={
                    row.planned ? (
                      <SunDim size={20} color={colors.foreground} />
                    ) : (
                      <Sun size={20} color={colors.primaryText} />
                    )
                  }
                  title={row.planned ? 'Ukloni iz Moj dan' : 'Dodaj u Moj dan'}
                  showChevron={false}
                  onPress={() => onTogglePlan(row)}
                  accessibilityLabel={
                    row.planned ? `Ukloni iz Moj dan: ${row.title}` : `Dodaj u Moj dan: ${row.title}`
                  }
                />
              </View>
            </>
          )}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  rows: {
    marginHorizontal: -20,
    paddingHorizontal: 4,
  },
});
