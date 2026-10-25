import { formatDateShort, type TaskPriorityKey, type TaskRowModel } from '@devotion/shared';
import { ArrowDown, ArrowUp, Check, ExternalLink, RotateCcw, Sun, SunDim } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { useRetained } from '@/hooks/use-retained';
import { useThemeColors } from '@/theme/theme-provider';

import { DueChoiceChips, InlineDatePicker, LockedNotice, PriorityChoiceChips, SheetTaskHeader } from './choice-chips';
import { dueChoiceOf, useInlineDatePick } from './rok-plan-sheet';

export type RowActionsTarget = {
  row: TaskRowModel;
  /** Gore/dole u „Planirano"; `null` van te sekcije. */
  movable: { up: boolean; down: boolean } | null;
};

export type RowActionsSheetProps = {
  target: RowActionsTarget | null;
  now: number;
  onClose: () => void;
  /**
   * „Otvori" za zadatak u startupu (njegov ekran u njegovom startupu). Lični
   * zadatak tu stavku nema ni uz rukovaoca — nema ekran do panela (K13).
   */
  onOpen?: (row: TaskRowModel) => void;
  onToggleDone: (row: TaskRowModel, done: boolean) => void;
  onTogglePlan: (row: TaskRowModel) => void;
  onSetDue: (row: TaskRowModel, dueDate: number | null) => void;
  onSetPriority: (row: TaskRowModel, priority: TaskPriorityKey | null) => void;
  onMove: (row: TaskRowModel, direction: -1 | 1) => void;
};

/**
 * Sheet radnji (dugi pritisak 300 ms, plan K07 §6.2) — par web menija „…" u
 * redu: Otvori, Završi / Vrati u otvoreno, Dodaj u / Ukloni iz Moj dan, Rok,
 * Prioritet i (u „Planirano") Pomeri gore / dole. Zabranjena radnja je
 * zaključan red sa razlogom iz shared dozvola (E15), ne sakrivena. Svaki izbor
 * zatvara sheet — radnja je jedna, kao meni na webu.
 */
export function RowActionsSheet({
  target: current,
  now,
  onClose,
  onOpen,
  onToggleDone,
  onTogglePlan,
  onSetDue,
  onSetPriority,
  onMove,
}: RowActionsSheetProps) {
  const colors = useThemeColors();
  const target = useRetained(current);
  const row = target?.row ?? null;
  const { status, due, priority } = row?.permissions ?? {};
  const date = useInlineDatePick(current?.row.key ?? null);

  return (
    <Sheet visible={current !== null} onClose={onClose} maxHeight="90%">
      {row && target && date.picking ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <InlineDatePicker value={row.dueDate} onBack={date.close} onSelect={(value) => onSetDue(row, value)} />
        </ScrollView>
      ) : row && target ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <SheetTaskHeader overline="Radnje" title={row.title} startup={row.startup} areaLabel={row.areaLabel} />

          {/* Redovi do ivice sheet-a: ikonica poravnata sa tekstom (Row ima 16 pt unutra). */}
          <View style={styles.rows}>
            {/* Otvara se samo zadatak u startupu; lični nema ekran do panela (K13). */}
            {onOpen && row.kind === 'task' && row.startup !== null ? (
              <Row
                icon={<ExternalLink size={20} color={colors.foreground} />}
                title="Otvori"
                showChevron={false}
                onPress={() => onOpen(row)}
                accessibilityHint={row.kind === 'task' ? 'Otvara zadatak u njegovom startupu' : undefined}
              />
            ) : null}
            {status?.allowed ? (
              <Row
                icon={
                  row.done ? (
                    <RotateCcw size={20} color={colors.foreground} />
                  ) : (
                    <Check size={20} color={colors.success} />
                  )
                }
                title={row.done ? 'Vrati u otvoreno' : 'Završi'}
                showChevron={false}
                onPress={() => onToggleDone(row, !row.done)}
              />
            ) : (
              <View style={styles.inset}>
                <LockedNotice label="Završi" reason={status?.reason ?? ''} />
              </View>
            )}
            <Row
              icon={row.planned ? <SunDim size={20} color={colors.foreground} /> : <Sun size={20} color={colors.primaryText} />}
              title={row.planned ? 'Ukloni iz Moj dan' : 'Dodaj u Moj dan'}
              showChevron={false}
              onPress={() => onTogglePlan(row)}
            />
            {/* Samo smer koji postoji (prvi red nema „gore", poslednji „dole"). */}
            {target.movable?.up ? (
              <Row
                icon={<ArrowUp size={20} color={colors.foreground} />}
                title="Pomeri gore"
                showChevron={false}
                onPress={() => onMove(row, -1)}
              />
            ) : null}
            {target.movable?.down ? (
              <Row
                icon={<ArrowDown size={20} color={colors.foreground} />}
                title="Pomeri dole"
                showChevron={false}
                onPress={() => onMove(row, 1)}
              />
            ) : null}
          </View>

          {due?.allowed ? (
            <DueChoiceChips
              now={now}
              selected={dueChoiceOf(row.dueDate, now)}
              dateLabel={row.dueDate === null ? null : formatDateShort(row.dueDate)}
              onShortcut={(_, value) => onSetDue(row, value)}
              onPickDate={date.open}
              onNone={() => onSetDue(row, null)}
            />
          ) : (
            <LockedNotice label="Rok" reason={due?.reason ?? ''} />
          )}

          {priority?.allowed ? (
            <PriorityChoiceChips
              value={row.priority}
              allowNone={row.kind === 'personal'}
              onSelect={(value) => onSetPriority(row, value)}
            />
          ) : (
            <LockedNotice label="Prioritet" reason={priority?.reason ?? ''} />
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
    paddingBottom: 8,
    gap: 16,
  },
  rows: {
    marginHorizontal: -20,
    paddingHorizontal: 4,
  },
  inset: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
});
