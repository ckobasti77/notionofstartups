import { Plus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { MAX_TASK_CHECKPOINTS } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Nacrt checkpointa pre nego što zadatak postoji (ogledalo `checkpointItemValidator`). */
export type CheckpointDraft = {
  id: string;
  text: string;
  completed: boolean;
};

const MAX_CHECKPOINT_TEXT = 200;

/**
 * Podzadaci koji se šalju uz `pages.create` (`checkpoints` argument) — postoje samo
 * dok se zadatak ne kreira, pa nema mutacija ni optimističkog stanja. Posle kreiranja
 * checkpointe održava `TaskCheckpointList` na ekranu zadatka.
 *
 * `id` je lokalan i mora biti stabilan (koristi se kao React ključ i šalje se serveru
 * kao id stavke), pa ide iz brojača u ref-u — ne iz indeksa, koji se pomera na brisanje.
 */
export function CheckpointDraftList({
  items,
  onChange,
  disabled = false,
}: {
  items: CheckpointDraft[];
  onChange: (items: CheckpointDraft[]) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState('');
  const nextId = useRef(0);
  const atLimit = items.length >= MAX_TASK_CHECKPOINTS;

  const add = () => {
    const text = draft.trim();
    if (!text || atLimit) return;
    nextId.current += 1;
    onChange([...items, { id: `nacrt-${nextId.current}`, text, completed: false }]);
    setDraft('');
  };

  const remove = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <View style={styles.wrap}>
      {items.map((item, index) => (
        <Row
          key={item.id}
          title={item.text}
          titleNumberOfLines={2}
          style={styles.itemRow}
          showChevron={false}
          accessibilityLabel={`Podzadatak ${index + 1}: ${item.text}`}
          icon={
            <View style={[styles.index, { backgroundColor: colors.muted }]}>
              <Text style={[styles.indexText, { color: colors.mutedForeground }]}>{index + 1}</Text>
            </View>
          }
          value={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ukloni podzadatak: ${item.text}`}
              disabled={disabled}
              onPress={() => remove(item.id)}
              hitSlop={8}
              style={({ pressed }) => [styles.removeBtn, pressed && { backgroundColor: colors.muted }]}>
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          }
        />
      ))}

      {atLimit ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Dostignut maksimum od {MAX_TASK_CHECKPOINTS} podzadataka.
        </Text>
      ) : (
        <View style={styles.addWrap}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            editable={!disabled}
            maxLength={MAX_CHECKPOINT_TEXT}
            placeholder="Novi podzadatak"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            returnKeyType="done"
            onSubmitEditing={add}
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dodaj podzadatak"
            accessibilityState={{ disabled: disabled || draft.trim().length === 0 }}
            disabled={disabled || draft.trim().length === 0}
            onPress={add}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: colors.secondary,
                opacity: draft.trim().length === 0 ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}>
            <Plus size={20} color={colors.foreground} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
  },
  itemRow: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  index: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  removeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  addWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: fontSize.base,
  },
  addBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  // Prava rečenica (ne badge/vreme) → osnovnih 16px.
  hint: {
    ...text.body,
  },
});
