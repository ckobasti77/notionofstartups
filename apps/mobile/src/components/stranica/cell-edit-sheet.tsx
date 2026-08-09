import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { haptics } from '@/lib/haptics';
import { MAX_TABLE_CELL_LENGTH, MAX_TABLE_LABEL_LENGTH } from '@/lib/table-limits';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

/**
 * Bottom sheet za izmenu jedne ćelije (spec §9.4: „tap na ćeliju → sheet za
 * izmenu, ne inline"). Vrednost menja svaki član; „Obriši red" se prikazuje samo
 * autoru kartice (`canDeleteRow`), pošto `pageTables.removeRow` traži vlasnika.
 */
export function CellEditSheet({
  open,
  columnLabel,
  value,
  saving,
  canDeleteRow,
  onSave,
  onDeleteRow,
  onClose,
}: {
  open: boolean;
  columnLabel: string;
  value: string;
  saving: boolean;
  canDeleteRow: boolean;
  onSave: (value: string) => void;
  onDeleteRow: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [text, setText] = useState(value);

  // Otvaranje sheet-a (ili promena ćelije) puni polje trenutnom vrednošću.
  useEffect(() => {
    if (open) setText(value);
  }, [open, value]);

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text numberOfLines={1} style={[styles.label, { color: colors.mutedForeground }]}>
        {columnLabel}
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        maxLength={MAX_TABLE_CELL_LENGTH}
        placeholder="Vrednost ćelije"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
        ]}
      />
      <Text style={[styles.counter, { color: colors.mutedForeground }]}>
        {text.length}/{MAX_TABLE_CELL_LENGTH}
      </Text>

      <View style={styles.actions}>
        <Button
          label="Otkaži"
          variant="ghost"
          onPress={onClose}
          style={styles.flexBtn}
          disabled={saving}
        />
        <Button
          label="Sačuvaj"
          onPress={() => {
            haptics.tap();
            onSave(text);
          }}
          loading={saving}
          style={styles.flexBtn}
        />
      </View>

      {canDeleteRow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Obriši red"
          disabled={saving}
          onPress={() => {
            haptics.warning();
            onDeleteRow();
          }}
          style={({ pressed }) => [
            styles.deleteRow,
            pressed && { backgroundColor: colors.muted },
            saving && { opacity: 0.5 },
          ]}>
          <Text style={[styles.deleteLabel, { color: colors.destructive }]}>Obriši red</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

/**
 * Bottom sheet za kolonu — preimenovanje i brisanje (samo autor kartice; obe
 * mutacije prolaze kroz `assertStructureOwner`). Držimo ga uz `CellEditSheet` jer
 * dele isti izgled i ograničenja unosa.
 */
export function ColumnEditSheet({
  open,
  label,
  saving,
  canMoveLeft = false,
  canMoveRight = false,
  onMove,
  onRename,
  onRemove,
  onClose,
}: {
  open: boolean;
  label: string;
  saving: boolean;
  /** Krajnja kolona nema kuda dalje — dugme se onemogućava, ne sakriva. */
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  /** Pandan `pageTables.moveColumn`; web to nudi u meniju kolone. */
  onMove?: (direction: -1 | 1) => void;
  onRename: (label: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [text, setText] = useState(label);

  useEffect(() => {
    if (open) setText(label);
  }, [open, label]);

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Naziv kolone</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        maxLength={MAX_TABLE_LABEL_LENGTH}
        placeholder="Naziv kolone"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        style={[
          styles.inputSingle,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
        ]}
      />
      <View style={styles.actions}>
        <Button
          label="Otkaži"
          variant="ghost"
          onPress={onClose}
          style={styles.flexBtn}
          disabled={saving}
        />
        <Button
          label="Sačuvaj"
          onPress={() => {
            haptics.tap();
            onRename(text);
          }}
          loading={saving}
          style={styles.flexBtn}
        />
      </View>
      {onMove === undefined ? null : (
        <View style={styles.actions}>
          <Button
            label="← Pomeri levo"
            variant="secondary"
            disabled={saving || !canMoveLeft}
            onPress={() => {
              haptics.tap();
              onMove(-1);
            }}
            style={styles.flexBtn}
          />
          <Button
            label="Pomeri desno →"
            variant="secondary"
            disabled={saving || !canMoveRight}
            onPress={() => {
              haptics.tap();
              onMove(1);
            }}
            style={styles.flexBtn}
          />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Obriši kolonu"
        disabled={saving}
        onPress={() => {
          haptics.warning();
          onRemove();
        }}
        style={({ pressed }) => [
          styles.deleteRow,
          pressed && { backgroundColor: colors.muted },
          saving && { opacity: 0.5 },
        ]}>
        <Text style={[styles.deleteLabel, { color: colors.destructive }]}>Obriši kolonu</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 96,
    maxHeight: 220,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
    textAlignVertical: 'top',
  },
  inputSingle: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  counter: {
    fontSize: 13,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  flexBtn: {
    flex: 1,
  },
  deleteRow: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  deleteLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
