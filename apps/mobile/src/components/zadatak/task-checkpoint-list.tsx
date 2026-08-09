import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { Check, Circle, ListChecks, Lock, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
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
 * Ulančavanje koraka (`setChained`) i diskusija po checkpointu su za sada web-only
 * (00-PLAN §2, parity izuzetak) — mobilni poštuje `locked`, ali ne izlaže kontrole.
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

  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Id<'taskCheckpoints'> | null>(null);
  const [editingText, setEditingText] = useState('');

  const notifyError = (error: unknown) =>
    Alert.alert('Nešto nije prošlo', error instanceof Error ? error.message : 'Pokušaj ponovo.');

  const toggle = (item: TaskCheckpoint) => {
    void Haptics.selectionAsync();
    void setCompleted({ checkpointId: item._id, completed: !item.completed }).catch(notifyError);
  };

  const add = async () => {
    const text = draft.trim();
    if (!text || creating || (checkpoints && checkpoints.length >= MAX_TASK_CHECKPOINTS)) return;
    setCreating(true);
    try {
      await create({ taskPageId, text });
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
    void updateText({ checkpointId: item._id, text }).catch(notifyError);
    setEditingId(null);
  };

  const remove = (item: TaskCheckpoint) => {
    Alert.alert('Obriši checkpoint', `„${item.text}"`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: () => void archiveOwn({ checkpointId: item._id }).catch(notifyError),
      },
    ]);
  };

  if (checkpoints === undefined) {
    return (
      <View style={styles.section}>
        <SectionHeader completed={0} total={0} colors={colors} />
        <View style={[styles.loadingRow, { backgroundColor: colors.muted }]} />
      </View>
    );
  }

  const total = checkpoints.length;
  const completed = checkpoints.filter((item) => item.completed).length;
  const atLimit = total >= MAX_TASK_CHECKPOINTS;

  return (
    <View style={styles.section}>
      <SectionHeader completed={completed} total={total} colors={colors} />

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

                {item.canDeleteDirectly ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Obriši: ${item.text}`}
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
  loadingRow: {
    height: 44,
    borderRadius: radius.lg,
    opacity: 0.6,
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
