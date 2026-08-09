import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { normalizeNoteLinkHref } from '@/lib/note-link';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

/**
 * Unos adrese za link u belešci — mobilni parnjak `NoteLinkDialog` sa weba.
 * Odvojen sheet (a ne tentap-ov ugrađeni „link bar") jer je ovaj na srpskom,
 * proverava adresu kroz `normalizeNoteLinkHref` i nudi uklanjanje postojećeg
 * linka na istom mestu.
 */
export function NoteLinkSheet({
  open,
  initialHref,
  onSubmit,
  onRemove,
  onClose,
}: {
  open: boolean;
  /** Adresa postojećeg linka; prazno kad se link tek dodaje. */
  initialHref: string;
  onSubmit: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialHref);
  // Pamti se tačan tekst koji nije prošao proveru — greška tako nestaje sama
  // čim se unos promeni (isto ponašanje kao na webu).
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialHref);
      setRejected(null);
    }
  }, [open, initialHref]);

  const invalid = rejected !== null && rejected === value;
  const isEdit = initialHref !== '';

  const submit = () => {
    const href = normalizeNoteLinkHref(value);
    if (href === null) {
      setRejected(value);
      return;
    }
    onSubmit(href);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={onClose}
      />
      <KeyboardAvoidingView
        // `padding` na oba OS-a: Expo SDK 57 edge-to-edge (Android) razbija OS
        // `adjustResize` unutar Modal-a (isto kao `cell-edit-sheet`).
        behavior="padding"
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
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isEdit ? 'Izmeni link' : 'Dodaj link'}
          </Text>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Adresa</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            returnKeyType="done"
            onSubmitEditing={submit}
            placeholder="primer.rs/stranica"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            accessibilityLabel="Adresa linka"
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.card,
                borderColor: invalid ? colors.destructive : colors.input,
              },
            ]}
          />
          <Text
            accessibilityLiveRegion={invalid ? 'polite' : 'none'}
            style={[
              styles.hint,
              { color: invalid ? colors.destructive : colors.mutedForeground },
            ]}>
            {invalid
              ? 'Adresa nije ispravna. Probaj „primer.rs/stranica", „mail@primer.rs" ili celu adresu sa https://.'
              : 'Bez protokola se dodaje https://, a unos sa @ postaje mejl.'}
          </Text>

          <View style={styles.actions}>
            <Button label="Otkaži" variant="ghost" onPress={onClose} style={styles.flexBtn} />
            <Button
              label={isEdit ? 'Sačuvaj' : 'Dodaj link'}
              onPress={submit}
              style={styles.flexBtn}
            />
          </View>

          {isEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ukloni link"
              onPress={onRemove}
              style={({ pressed }) => [
                styles.removeRow,
                pressed && { backgroundColor: colors.muted },
              ]}>
              <Text style={[styles.removeLabel, { color: colors.destructive }]}>
                Ukloni link
              </Text>
            </Pressable>
          ) : null}
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
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  label: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  flexBtn: {
    flex: 1,
  },
  removeRow: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  removeLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
