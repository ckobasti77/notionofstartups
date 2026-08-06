import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

// Ogledalo `packages/backend/convex/lib/validators.ts` — vrednosti se ovde
// mirror-uju (kao u `lib/task-meta.ts`) da RN bundle ne uvlači server modul.
export const MAX_TABLE_CELL_LENGTH = 2_000;
export const MAX_TABLE_LABEL_LENGTH = 120;

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
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(value);

  // Otvaranje sheet-a (ili promena ćelije) puni polje trenutnom vrednošću.
  useEffect(() => {
    if (open) setText(value);
  }, [open, value]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Zatvori" style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoider}
        pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.popover,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}>
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
              onPress={() => onSave(text)}
              loading={saving}
              style={styles.flexBtn}
            />
          </View>

          {canDeleteRow ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Obriši red"
              disabled={saving}
              onPress={onDeleteRow}
              style={({ pressed }) => [
                styles.deleteRow,
                pressed && { backgroundColor: colors.muted },
                saving && { opacity: 0.5 },
              ]}>
              <Text style={[styles.deleteLabel, { color: colors.destructive }]}>Obriši red</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  onRename,
  onRemove,
  onClose,
}: {
  open: boolean;
  label: string;
  saving: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(label);

  useEffect(() => {
    if (open) setText(label);
  }, [open, label]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Zatvori" style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoider}
        pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.popover,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}>
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
              onPress={() => onRename(text)}
              loading={saving}
              style={styles.flexBtn}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Obriši kolonu"
            disabled={saving}
            onPress={onRemove}
            style={({ pressed }) => [
              styles.deleteRow,
              pressed && { backgroundColor: colors.muted },
              saving && { opacity: 0.5 },
            ]}>
            <Text style={[styles.deleteLabel, { color: colors.destructive }]}>Obriši kolonu</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  label: {
    fontSize: 12,
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
    fontSize: 12,
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
