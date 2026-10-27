import { useMutation, useQuery } from 'convex/react';
import {
  Check,
  Circle,
  Link2,
  Link2Off,
  ListChecks,
  Lock,
  MessageSquareText,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { CommentsSheet } from '@/components/collab/comments-sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { MAX_TASK_CHECKPOINTS } from '@/lib/task-meta';
import { pushUndo } from '@/lib/undo';
import type { TaskCheckpoint } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text, type ColorTokens } from '@/theme/tokens';

/**
 * Lista checkpointa zadatka (docs/mobile/02-EKRANI.md §9.2). Ordinali, lanci i
 * zaključavanje **stižu sa servera** u `listForTask` — klijent ih samo prikazuje.
 *
 * Toggle je optimistički (bez „sačuvaj", bez per-red spinnera): mutacija odmah
 * prepravi keširan upit, uz haptiku. Ako server odbije (npr. zaključan lanac),
 * Convex sam vrati optimističku izmenu i prikaže se upozorenje.
 *
 * Ulančavanje koraka (`setChainedToPrevious` / `setAllChained`) je sada i ovde:
 * ikonica lanca po redu i „Poveži sve / Razveži sve" u zaglavlju sekcije. Autor
 * briše korak direktno kad sme (`canDeleteDirectly`, PROSTOR P1/P3) uz traku
 * „Poništi" — glasanja tima o brisanju više nema.
 *
 * Svaki red nosi i Komentare koraka (`CommentsSheet` sa ciljem `task_checkpoint`) —
 * prva ikonica u redu akcija, isti redosled kao web. Akcije su u svom redu ispod
 * naslova, svaka cela 44pt meta (K20) — četiri u istom redu sa tekstom ne
 * stanu na uskom telefonu.
 */
export function TaskCheckpointList({
  taskPageId,
  startupId,
  canCreate,
  onDeleted,
  onInputFocus,
  onOpenComments,
}: {
  taskPageId: Id<'pages'>;
  /** Startup zadatka — za članove koje komentar može da pomene. */
  startupId: Id<'startups'>;
  canCreate: boolean;
  /** Posle direktnog brisanja koraka (traka „Poništi" je nudi) — panel se zatvara da je traka vidljiva. */
  onDeleted?: () => void;
  /** Fokus u polju za korak; dobija red sa poljem da ga panel doskrola iznad tastature. */
  onInputFocus?: (field: View | null) => void;
  /**
   * Panel (već Modal) ne sme da otvara drugi Modal (iOS): umesto sheet-a Komentara koraka
   * poziva ovo, a panel se zatvara i otvara pun ekran zadatka. Bez njega list otvara sheet.
   */
  onOpenComments?: (item: TaskCheckpoint) => void;
}) {
  const colors = useThemeColors();
  const checkpoints = useQuery(api.taskCheckpoints.listForTask, { taskPageId });

  const setCompleted = useMutation(api.taskCheckpoints.setCompleted).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.taskCheckpoints.listForTask, { taskPageId });
      if (!current) return;
      store.setQuery(
        api.taskCheckpoints.listForTask,
        { taskPageId },
        current.map((item) =>
          item._id === args.checkpointId ? { ...item, completed: args.completed } : item,
        ),
      );
    },
  );
  const create = useMutation(api.taskCheckpoints.create);
  const updateText = useMutation(api.taskCheckpoints.updateText);
  const archiveOwn = useMutation(api.taskCheckpoints.archiveOwn);
  const setChained = useMutation(api.taskCheckpoints.setChainedToPrevious);
  const setAllChained = useMutation(api.taskCheckpoints.setAllChained);

  const addRowRef = useRef<View>(null);
  const editRowRef = useRef<View>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Id<'taskCheckpoints'> | null>(null);
  const [editingText, setEditingText] = useState('');
  /** `null` = Komentari su zatvoreni; vrednost je korak čiji se komentari gledaju. */
  const [threadFor, setThreadFor] = useState<TaskCheckpoint | null>(null);
  // Poslednji korak ostaje montiran dok traje izlazna animacija sheet-a.
  const lastThreadRef = useRef<TaskCheckpoint | null>(null);
  if (threadFor !== null) lastThreadRef.current = threadFor;
  const sheetFor = threadFor ?? lastThreadRef.current;

  const notifyError = (error: unknown) => {
    haptics.error();
    Alert.alert('Nešto nije prošlo', accessErrorMessage(error, 'Pokušaj ponovo.'));
  };

  const toggle = (item: TaskCheckpoint) => {
    // Prekidač je optimističan (vidi `withOptimisticUpdate` gore), pa je i haptika
    // odmah — potvrda servera ne dodaje drugi signal, samo greška.
    haptics.select();
    void setCompleted({ checkpointId: item._id, completed: !item.completed }).catch(notifyError);
  };

  const add = async () => {
    const text = draft.trim();
    if (!text || creating || (checkpoints && checkpoints.length >= MAX_TASK_CHECKPOINTS)) return;
    setCreating(true);
    haptics.tap();
    try {
      await create({ taskPageId, text });
      haptics.success();
      setDraft('');
    } catch (error) {
      notifyError(error);
    } finally {
      setCreating(false);
    }
  };

  /** Korak čija je izmena već završena (sačuvana ili odbačena) — Enter i blur ne smeju da je upišu dvaput. */
  const settledEditRef = useRef<Id<'taskCheckpoints'> | null>(null);

  const saveEdit = (item: TaskCheckpoint) => {
    if (settledEditRef.current === item._id) return;
    settledEditRef.current = item._id;
    const text = editingText.trim();
    if (!text) {
      setEditingId(null);
      return;
    }
    void updateText({ checkpointId: item._id, text })
      .then(() => haptics.success())
      .catch(notifyError);
    setEditingId(null);
  };

  const remove = (item: TaskCheckpoint) => {
    haptics.tap();
    // Briše se odmah; „Poništi" (traka) vraća korak do `undoUntil` sa servera.
    void archiveOwn({ checkpointId: item._id })
      .then((result) => {
        haptics.success();
        pushUndo({
          label: 'Korak je obrisan.',
          action: { kind: 'checkpoint', checkpointId: result.checkpointId },
          undoUntil: result.undoUntil,
        });
        // Panel zadatka (K13) se zatvara da traka ispod njega bude vidljiva.
        onDeleted?.();
      })
      .catch(notifyError);
  };

  /**
   * Lanac: korak čeka prethodni. Ordinal 1 nema šta da čeka, pa se kontrola ne
   * prikazuje na prvom redu (server to i odbija).
   */
  const toggleChain = (item: TaskCheckpoint) => {
    haptics.select();
    void setChained({
      checkpointId: item._id,
      chained: !item.chainedToPrevious,
    }).catch(notifyError);
  };

  const chainAll = (chained: boolean) => {
    haptics.tap();
    void setAllChained({ taskPageId, chained })
      .then(() => haptics.success())
      .catch(notifyError);
  };

  if (checkpoints === undefined) {
    // Oblik liste: zaglavlje sa brojačem, pa tri reda sa kvadratićem i tekstom.
    return (
      <View style={styles.section}>
        <SectionHeader completed={0} total={0} colors={colors} />
        <SkeletonList
          count={3}
          gap={8}
          item={(index) => (
            <View style={styles.skeletonRow}>
              <Skeleton width={22} height={22} borderRadius={radius.sm} />
              <Skeleton width={index % 2 === 0 ? '62%' : '48%'} height={15} />
            </View>
          )}
        />
      </View>
    );
  }

  const total = checkpoints.length;
  const completed = checkpoints.filter((item) => item.completed).length;
  const atLimit = total >= MAX_TASK_CHECKPOINTS;

  // Kontrola „sve" ima smisla tek od dva koraka (prvi se ne može ulančati) i samo
  // za onoga ko sme da menja strukturu — isti uslov kao `canCreate`.
  const chainableCount = Math.max(0, total - 1);
  const allChained =
    chainableCount > 0 && checkpoints.slice(1).every((item) => item.chainedToPrevious);

  return (
    <View style={styles.section}>
      <SectionHeader completed={completed} total={total} colors={colors} />

      {canCreate && chainableCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={allChained ? 'Razveži sve korake' : 'Poveži sve korake'}
          accessibilityHint={
            allChained
              ? 'Koraci se posle ovoga mogu završavati bilo kojim redom'
              : 'Svaki korak posle ovoga čeka prethodni'
          }
          onPress={() => chainAll(!allChained)}
          style={({ pressed }) => [
            styles.chainAll,
            { borderColor: colors.border },
            pressed && { backgroundColor: colors.muted },
          ]}
        >
          {allChained ? (
            <Link2Off size={16} color={colors.mutedForeground} />
          ) : (
            <Link2 size={16} color={colors.mutedForeground} />
          )}
          <Text style={[styles.chainAllLabel, { color: colors.mutedForeground }]}>
            {allChained ? 'Razveži sve' : 'Poveži sve'}
          </Text>
        </Pressable>
      ) : null}

      {total > 0 ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Napredak koraka"
          accessibilityValue={{ min: 0, max: total, now: completed }}
          style={[styles.track, { backgroundColor: colors.muted }]}
        >
          <View
            style={[
              styles.fill,
              {
                backgroundColor: colors.success,
                width: `${Math.round((completed / total) * 100)}%`,
              },
            ]}
          />
        </View>
      ) : null}

      {canCreate ? (
        <View ref={addRowRef} style={styles.addRow}>
          <Input
            value={draft}
            onChangeText={setDraft}
            onFocus={() => onInputFocus?.(addRowRef.current)}
            placeholder={atLimit ? 'Dostignut maksimum (100)' : 'Dodaj korak…'}
            editable={!atLimit}
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            style={styles.addInput}
            accessibilityLabel="Novi korak"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dodaj korak"
            disabled={!draft.trim() || atLimit || creating}
            onPress={() => void add()}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colors.secondary,
                opacity: !draft.trim() || atLimit || creating ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Plus size={20} color={colors.secondaryForeground} />
          </Pressable>
        </View>
      ) : null}

      {total === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground, borderColor: colors.border }]}>
          Još nema koraka.
        </Text>
      ) : (
        <View style={styles.rows}>
          {checkpoints.map((item) => {
            const toggleDisabled = !item.canToggle || item.locked;
            const isEditing = editingId === item._id;
            return (
              <View
                key={item._id}
                ref={isEditing ? editRowRef : undefined}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <View style={styles.rowMain}>
                  <View
                    style={[
                      styles.ordinal,
                      { borderColor: colors.border, backgroundColor: colors.card },
                    ]}
                  >
                    <Text style={[styles.ordinalText, { color: colors.mutedForeground }]}>
                      {item.ordinal}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.completed, disabled: toggleDisabled }}
                    accessibilityLabel={
                      item.locked
                        ? `Zaključano dok se ne završi korak ${item.blockedByOrdinal}`
                        : item.completed
                          ? `Ponovo otvori: ${item.text}`
                          : `Završi: ${item.text}`
                    }
                    disabled={toggleDisabled}
                    onPress={() => toggle(item)}
                    hitSlop={8}
                    style={styles.check}
                  >
                    {item.completed ? (
                      <Check size={20} color={colors.success} />
                    ) : item.locked ? (
                      <Lock size={18} color={colors.mutedForeground} />
                    ) : (
                      <Circle size={20} color={colors.warning} />
                    )}
                  </Pressable>

                  {isEditing ? (
                    <Input
                      value={editingText}
                      onChangeText={setEditingText}
                      onFocus={() => onInputFocus?.(editRowRef.current)}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => saveEdit(item)}
                      onBlur={() => saveEdit(item)}
                      style={styles.editInput}
                      accessibilityLabel="Izmeni korak"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.text,
                        {
                          color: item.completed ? colors.mutedForeground : colors.foreground,
                          textDecorationLine: item.completed ? 'line-through' : 'none',
                        },
                      ]}
                    >
                      {item.text}
                    </Text>
                  )}
                </View>

                <View style={styles.rowActions}>
                  {/* Komentari stoje PRE lanca/olovke/kante — isti redosled kao web
                    `task-checkpoint-list.tsx`. Prikazuju se UVEK: svaki član sme
                    da komentariše, za razliku od olovke i kante koje zavise od dozvole. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Komentari: ${item.text}`}
                    onPress={() => {
                      haptics.tap();
                      if (onOpenComments) onOpenComments(item);
                      else setThreadFor(item);
                    }}
                    style={styles.rowAction}
                  >
                    <MessageSquareText size={16} color={colors.mutedForeground} />
                  </Pressable>

                  {item.canEdit && item.ordinal > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.chainedToPrevious }}
                      accessibilityLabel={
                        item.chainedToPrevious
                          ? `Razveži od prethodnog koraka: ${item.text}`
                          : `Veži za prethodni korak: ${item.text}`
                      }
                      onPress={() => toggleChain(item)}
                      style={styles.rowAction}
                    >
                      {item.chainedToPrevious ? (
                        <Link2 size={16} color={colors.primaryText} />
                      ) : (
                        <Link2Off size={16} color={colors.subtle} />
                      )}
                    </Pressable>
                  ) : null}

                  {item.canEdit ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isEditing ? 'Otkaži izmenu' : `Uredi: ${item.text}`}
                      onPress={() => {
                        if (isEditing) {
                          // Otkazivanje odbacuje izmenu: blur koji sledi ne sme da je sačuva.
                          settledEditRef.current = item._id;
                          setEditingId(null);
                          return;
                        }
                        settledEditRef.current = null;
                        setEditingId(item._id);
                        setEditingText(item.text);
                      }}
                      style={styles.rowAction}
                    >
                      {isEditing ? (
                        <X size={16} color={colors.mutedForeground} />
                      ) : (
                        <Pencil size={16} color={colors.mutedForeground} />
                      )}
                    </Pressable>
                  ) : null}

                  {item.canDeleteDirectly ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.canDeleteDirectly
                          ? `Obriši: ${item.text}`
                          : `Zatraži brisanje: ${item.text}`
                      }
                      onPress={() => remove(item)}
                      style={styles.rowAction}
                    >
                      <Trash2 size={16} color={colors.destructive} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {sheetFor === null ? null : (
        <CommentsSheet
          // Nov korak = novo polje: nacrt iz prošlog koraka ne sme da procuri.
          key={sheetFor._id}
          target={{ kind: 'task_checkpoint', id: sheetFor._id }}
          startupId={startupId}
          title={sheetFor.text}
          visible={threadFor !== null}
          onClose={() => setThreadFor(null)}
        />
      )}
    </View>
  );
}

function SectionHeader({
  completed,
  total,
  colors,
}: {
  completed: number;
  total: number;
  colors: ColorTokens;
}) {
  return (
    <View style={styles.header}>
      <ListChecks size={18} color={colors.primary} />
      <Text style={[styles.headerLabel, { color: colors.foreground }]}>Koraci</Text>
      <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
        <Text style={[styles.countText, { color: colors.mutedForeground }]}>
          {completed}/{total}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chainAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chainAllLabel: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  section: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLabel: {
    ...text.body,
    fontWeight: fontWeight.bold,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  countText: {
    ...text.meta,
    fontWeight: fontWeight.bold,
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addInput: {
    flex: 1,
  },
  addButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    ...text.body,
    textAlign: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  rows: {
    gap: 0,
  },
  row: {
    gap: 2,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  ordinal: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordinalText: {
    ...text.meta,
    fontWeight: fontWeight.bold,
  },
  check: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  editInput: {
    flex: 1,
  },
  rowAction: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
