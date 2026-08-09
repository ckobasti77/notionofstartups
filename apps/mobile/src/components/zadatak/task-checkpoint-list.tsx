import { useMutation, useQuery } from 'convex/react';
import {
  Check,
  Circle,
  Link2,
  Link2Off,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import { MAX_TASK_CHECKPOINTS } from '@/lib/task-meta';
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
 * briše svoj korak direktno, a tuđi kroz glasanje tima (`requestDeletion`) — isti
 * put koji web `task-checkpoint-list` nudi.
 */
export function TaskCheckpointList({
  taskPageId,
  canCreate,
}: {
  taskPageId: Id<'pages'>;
  canCreate: boolean;
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
  const requestDeletion = useMutation(api.collaboration.requestDeletion);

  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Id<'taskCheckpoints'> | null>(null);
  const [editingText, setEditingText] = useState('');

  const notifyError = (error: unknown) => {
    haptics.error();
    Alert.alert('Nešto nije prošlo', error instanceof Error ? error.message : 'Pokušaj ponovo.');
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

  const saveEdit = (item: TaskCheckpoint) => {
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
    haptics.warning();
    // Autor briše direktno; ko nije autor pokreće glasanje tima. Bez druge grane
    // član tima nije imao NIKAKAV put da traži brisanje tuđeg koraka.
    const direct = item.canDeleteDirectly;
    Alert.alert(
      direct ? 'Obriši checkpoint' : 'Zatraži brisanje checkpointa',
      direct
        ? `„${item.text}"`
        : `„${item.text}" — korak nije tvoj, pa se pokreće glasanje tima o brisanju.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: direct ? 'Obriši' : 'Zatraži',
          style: 'destructive',
          onPress: () =>
            void (direct
              ? archiveOwn({ checkpointId: item._id })
              : requestDeletion({ target: { kind: 'task_checkpoint', id: item._id } })
            )
              .then(() => haptics.success())
              .catch(notifyError),
        },
      ],
    );
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
          ]}>
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
          accessibilityLabel="Napredak checkpointa"
          accessibilityValue={{ min: 0, max: total, now: completed }}
          style={[styles.track, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.success, width: `${Math.round((completed / total) * 100)}%` },
            ]}
          />
        </View>
      ) : null}

      {canCreate ? (
        <View style={styles.addRow}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder={atLimit ? 'Dostignut maksimum (100)' : 'Dodaj checkpoint…'}
            editable={!atLimit}
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            style={styles.addInput}
            accessibilityLabel="Novi checkpoint"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dodaj checkpoint"
            disabled={!draft.trim() || atLimit || creating}
            onPress={() => void add()}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colors.secondary,
                opacity: !draft.trim() || atLimit || creating ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}>
            <Plus size={20} color={colors.secondaryForeground} />
          </Pressable>
        </View>
      ) : null}

      {total === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground, borderColor: colors.border }]}>
          Još nema checkpointa.
        </Text>
      ) : (
        <View style={styles.rows}>
          {checkpoints.map((item) => {
            const toggleDisabled = !item.canToggle || item.locked;
            const isEditing = editingId === item._id;
            return (
              <View
                key={item._id}
                style={[
                  styles.row,
                  {
                    borderColor: item.completed
                      ? `${colors.success}55`
                      : item.locked
                        ? colors.border
                        : `${colors.warning}55`,
                    backgroundColor: item.completed
                      ? `${colors.success}14`
                      : item.locked
                        ? colors.muted
                        : `${colors.warning}12`,
                  },
                ]}>
                <View style={[styles.ordinal, { borderColor: colors.border, backgroundColor: colors.card }]}>
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
                  style={styles.check}>
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
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => saveEdit(item)}
                    onBlur={() => saveEdit(item)}
                    style={styles.editInput}
                    accessibilityLabel="Izmeni checkpoint"
                  />
                ) : (
                  <Text
                    style={[
                      styles.text,
                      {
                        color: item.completed ? colors.mutedForeground : colors.foreground,
                        textDecorationLine: item.completed ? 'line-through' : 'none',
                      },
                    ]}>
                    {item.text}
                  </Text>
                )}

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
                    hitSlop={6}
                    style={styles.rowAction}>
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
                    accessibilityLabel={isEditing ? 'Zatvori izmenu' : `Uredi: ${item.text}`}
                    onPress={() => {
                      if (isEditing) {
                        setEditingId(null);
                        return;
                      }
                      setEditingId(item._id);
                      setEditingText(item.text);
                    }}
                    hitSlop={6}
                    style={styles.rowAction}>
                    {isEditing ? (
                      <X size={16} color={colors.mutedForeground} />
                    ) : (
                      <Pencil size={16} color={colors.mutedForeground} />
                    )}
                  </Pressable>
                ) : null}

                {item.canDeleteDirectly || item.canRequestDeletion ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.canDeleteDirectly
                        ? `Obriši: ${item.text}`
                        : `Zatraži brisanje: ${item.text}`
                    }
                    onPress={() => remove(item)}
                    hitSlop={6}
                    style={styles.rowAction}>
                    <Trash2 size={16} color={colors.destructive} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
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
      <Text style={[styles.headerLabel, { color: colors.foreground }]}>Checkpointi</Text>
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
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET,
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
