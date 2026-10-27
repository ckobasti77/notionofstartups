import {
  COMMAND_BLOCK_TEXT,
  rescheduleChange,
  rescheduleOutcome,
  rescheduleSelectionNote,
  RESCHEDULE_TARGETS,
  BULK_RESCHEDULE_MAX,
  selectionForCall,
  undoItemsFrom,
  type RescheduleCandidate,
  type RescheduleTarget,
} from '@devotion/shared';
import { useMutation } from 'convex/react';
import { Square, SquareCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useRetained } from '@/hooks/use-retained';
import { useUndoRunner } from '@/hooks/use-undo-runner';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { dropUndo, pushUndo, type BulkScheduleItem, type UndoAction } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

import { candidateMeta } from './command-blocks-model';

/** Poruka u sheetu posle primene (ili poništavanja); „Poništi" ima samo kad je nešto promenjeno. */
export type RescheduleNotice = {
  message: string;
  undoable: boolean;
  undoBusy: boolean;
};

/**
 * „Sredi rokove" (PROSTOR P10, K19) kao prikaz — bez upita, ide i u Dizajn katalog.
 * Lista prekoračenih zadataka sa kvačicama (podrazumevano svi izabrani), „Izaberi sve" /
 * „Poništi izbor" iznad liste, a ispod nje koliko je izabrano i dugmad
 * Danas · Sutra · Sledeće nedelje · Bez roka · Završi. „Završi" je sekundarna radnja
 * (ne destruktivna: zadatak se samo zatvara).
 */
export function RescheduleSheetView({
  visible,
  onClose,
  candidates,
  hiddenCount = 0,
  selectedIds,
  busyTarget,
  notice,
  onToggle,
  onSelectAll,
  onClearSelection,
  onApply,
  onUndo,
}: {
  visible: boolean;
  onClose: () => void;
  candidates: ReadonlyArray<RescheduleCandidate>;
  /** Kandidata koji se ne prikazuju (iznad 50). */
  hiddenCount?: number;
  selectedIds: ReadonlySet<string>;
  /** Cilj koji se upravo primenjuje (dugme pokazuje rad, ostala dugmad miruju). */
  busyTarget: RescheduleTarget | null;
  notice: RescheduleNotice | null;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApply: (target: RescheduleTarget) => void;
  onUndo: () => void;
}) {
  const colors = useThemeColors();
  const selectedCount = candidates.filter((candidate) => selectedIds.has(candidate.id)).length;
  const working = busyTarget !== null;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="90%">
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
        Sredi rokove
      </Text>
      <View style={styles.selectionBar}>
        <Button
          label="Izaberi sve"
          variant="ghost"
          size="md"
          disabled={selectedCount === candidates.length}
          onPress={onSelectAll}
        />
        <Button
          label="Poništi izbor"
          variant="ghost"
          size="md"
          disabled={selectedCount === 0}
          onPress={onClearSelection}
        />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
        {candidates.map((candidate) => {
          const checked = selectedIds.has(candidate.id);
          const meta = candidateMeta(candidate);
          return (
            <Row
              key={candidate.id}
              icon={
                checked ? (
                  <SquareCheck size={22} color={colors.primaryText} />
                ) : (
                  <Square size={22} color={colors.mutedForeground} />
                )
              }
              title={candidate.title}
              titleNumberOfLines={2}
              subtitle={meta}
              showChevron={false}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${candidate.title}, ${meta}`}
              onPress={() => {
                haptics.select();
                onToggle(candidate.id);
              }}
              style={styles.candidate}
            />
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          {rescheduleSelectionNote(selectedCount)}
          {hiddenCount > 0 ? ` · još ${hiddenCount} čeka` : ''}
        </Text>
        {notice === null ? null : (
          <View style={styles.notice}>
            <Text style={[styles.noticeText, { color: colors.foreground }]}>{notice.message}</Text>
            {notice.undoable ? (
              <Button
                label="Poništi"
                variant="ghost"
                size="md"
                loading={notice.undoBusy}
                accessibilityLabel={`Poništi: ${notice.message}`}
                onPress={onUndo}
              />
            ) : null}
          </View>
        )}
        <View style={styles.targets}>
          {RESCHEDULE_TARGETS.map((target) => (
            <Button
              key={target.key}
              label={target.label}
              variant={target.key === 'done' ? 'ghost' : 'secondary'}
              size="md"
              loading={busyTarget === target.key}
              disabled={selectedCount === 0 || (working && busyTarget !== target.key)}
              accessibilityHint={`Postavlja izabrane zadatke: ${target.label.toLowerCase()}`}
              onPress={() => onApply(target.key)}
              style={target.key === 'nextWeek' ? styles.targetWide : styles.target}
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

/**
 * Kontejner: `tasks.bulkReschedule` nad izabranima (najviše 50 po pozivu), pa
 * `pushUndo` sa vrstom `bulkSchedule` (inverz `tasks.bulkRestoreSchedule`). Ostaje
 * otvoren dok ima kandidata (lista se reaktivno prazni); kad nema više — zatvara se.
 * Traka „Poništi" je ISPOD sheeta (Modal), pa poruka i „Poništi" stoje i u njemu.
 */
export function RescheduleSheet({
  startupId,
  visible,
  onClose,
  candidates,
  now,
}: {
  startupId: Id<'startups'>;
  visible: boolean;
  onClose: () => void;
  candidates: ReadonlyArray<RescheduleCandidate>;
  now: number;
}) {
  const bulkReschedule = useMutation(api.tasks.bulkReschedule);
  const runUndo = useUndoRunner();

  // Lista ostaje kakva je bila dok se sheet zatvara (kandidata više nema).
  const retained = useRetained(candidates.length > 0 ? candidates : null);
  const shown = candidates.length > 0 ? candidates : (retained ?? candidates);

  // Izabrani su svi osim ručno skinutih: zadatak koji naknadno stigne (ili se vrati
  // posle „Poništi") je izabran, a skinuta kvačica ne propada kad se lista promeni.
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());
  const [busyTarget, setBusyTarget] = useState<RescheduleTarget | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    undo: { key: number; action: UndoAction } | null;
    undoBusy: boolean;
  } | null>(null);

  // Svako otvaranje kreće od „svi izabrani” i bez stare poruke.
  useEffect(() => {
    if (visible) {
      setDeselected(new Set());
      setNotice(null);
    }
  }, [visible]);

  // Nema više kandidata: sheet je odradio svoje.
  useEffect(() => {
    if (visible && candidates.length === 0 && busyTarget === null) onClose();
  }, [visible, candidates.length, busyTarget, onClose]);

  // Prikazuje se najviše 50 (koliko server obrađuje po pozivu): lista od 200 starih zadataka
  // ne montira 200 redova; ostali se pojave kad se ovi srede (lista se reaktivno prazni).
  const listed = shown.slice(0, BULK_RESCHEDULE_MAX);
  const hiddenCount = shown.length - listed.length;
  const selectedIds = new Set(listed.filter((candidate) => !deselected.has(candidate.id)).map((c) => c.id));

  const apply = async (target: RescheduleTarget) => {
    if (busyTarget !== null) return;
    const ids = listed.filter((candidate) => selectedIds.has(candidate.id)).map((candidate) => candidate.id);
    if (ids.length === 0) return;
    setBusyTarget(target);
    haptics.tap();
    try {
      const call = selectionForCall(ids);
      const result = await bulkReschedule({
        startupId,
        taskPageIds: call.ids as Id<'pages'>[],
        ...rescheduleChange(target, now),
      });
      const outcome = rescheduleOutcome(target, {
        updated: result.updated.length,
        unchanged: result.unchanged,
        skipped: result.skipped,
      });
      if (outcome.changed) {
        haptics.success();
        const action: UndoAction = {
          kind: 'bulkSchedule',
          startupId,
          items: undoItemsFrom(result.updated) as BulkScheduleItem[],
        };
        const key = pushUndo({ label: outcome.message, action });
        setNotice({ message: outcome.message, undo: { key, action }, undoBusy: false });
      } else {
        haptics.warning();
        setNotice({ message: outcome.message, undo: null, undoBusy: false });
      }
      AccessibilityInfo.announceForAccessibility(outcome.message);
    } catch (error) {
      // Sheet ostaje otvoren sa izborom netaknutim: korisnik može ponovo.
      haptics.error();
      Alert.alert('Rokovi nisu sređeni', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setBusyTarget(null);
    }
  };

  // Traka „Poništi" je za vreme sheeta iza Modal-a i odbrojava svojih 8 s: pri zatvaranju sheeta
  // neiskorišćeno poništavanje se nudi ponovo, sa punim vremenom.
  const handleClose = () => {
    if (notice?.undo) {
      dropUndo(notice.undo.key);
      pushUndo({ label: notice.message, action: notice.undo.action });
    }
    onClose();
  };

  const undo = async () => {
    if (notice === null || notice.undo === null || notice.undoBusy) return;
    const { key, action } = notice.undo;
    setNotice({ ...notice, undoBusy: true });
    haptics.tap();
    try {
      const outcome = await runUndo(action);
      // Stavka je iskorišćena; traka na dnu ne sme da je ponudi drugi put.
      dropUndo(key);
      haptics.success();
      const message = typeof outcome === 'string' ? outcome : 'Vraćeno.';
      setNotice({ message, undo: null, undoBusy: false });
      AccessibilityInfo.announceForAccessibility(message);
    } catch (error) {
      haptics.error();
      setNotice({ ...notice, undoBusy: false });
      Alert.alert('Vraćanje nije uspelo', accessErrorMessage(error, COMMAND_BLOCK_TEXT.rescheduleUndoFailed));
    }
  };

  return (
    <RescheduleSheetView
      visible={visible}
      onClose={handleClose}
      candidates={listed}
      hiddenCount={hiddenCount}
      selectedIds={selectedIds}
      busyTarget={busyTarget}
      notice={
        notice === null
          ? null
          : { message: notice.message, undoable: notice.undo !== null, undoBusy: notice.undoBusy }
      }
      onToggle={(id) =>
        setDeselected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onSelectAll={() => setDeselected(new Set())}
      onClearSelection={() => setDeselected(new Set(listed.map((candidate) => candidate.id)))}
      onApply={(target) => void apply(target)}
      onUndo={() => void undo()}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    ...text.title,
    paddingHorizontal: 20,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 168,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  // Razmak do ivice sheeta nosi lista, pa red ne dodaje svoj.
  candidate: {
    paddingHorizontal: 0,
  },
  footer: {
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  note: {
    ...text.body,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  noticeText: {
    ...text.body,
    flexShrink: 1,
  },
  targets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Širina ne sme da skoči kad dugme pokaže spinner (red se prelama).
  target: {
    minWidth: 96,
  },
  targetWide: {
    minWidth: 156,
  },
});
