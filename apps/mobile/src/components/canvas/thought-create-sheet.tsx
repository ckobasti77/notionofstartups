import { useMutation } from 'convex/react';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorRow } from '@/components/canvas/thought-node-sheet';
import { Button } from '@/components/ui/button';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { type ThoughtColor } from '@/lib/thought-colors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

/** Backend limiti (`thoughts.ts`): naslov ≤200, tekst ≤12000. */
const MAX_TITLE = 200;
const MAX_TEXT = 12_000;

/**
 * Nasumičan raspon oko koordinatnog početka: `createNode` traži x/y (za razliku od
 * `ideas.create`), a native ne zna centar WebView viewporta. Precizan raspored je na
 * desktopu (§5.2 — mobilni canvas je pregled/navigacija/dodavanje, ne layout).
 */
const SPREAD = 240;

/**
 * Kreiranje nove misli iz canvas rail-a (M4.4). Native unos naslov (obavezan) +
 * tekst + boja → `thoughts.createNode`; WebView (koji sluša `thoughts.listNodes`)
 * sam pokupi novi čvor realtime.
 */
export function ThoughtCreateSheet({
  open,
  startupId,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const create = useMutation(api.thoughts.createNode);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [color, setColor] = useState<ThoughtColor>('neutral');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle('');
    setText('');
    setColor('neutral');
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Prazna misao', 'Unesi naslov misli.');
      return;
    }
    setBusy(true);
    try {
      await create({
        startupId,
        title: cleanTitle,
        text: text.trim(),
        color,
        x: Math.round((Math.random() - 0.5) * SPREAD),
        y: Math.round((Math.random() - 0.5) * SPREAD),
      });
      reset();
      onClose();
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, 'Misao nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={onClose}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.popover, borderColor: colors.border, paddingBottom: insets.bottom + 12 },
          ]}>
          <Text style={[styles.heading, { color: colors.foreground }]}>Nova misao</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            maxLength={MAX_TITLE}
            placeholder="Naslov"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]}
          />
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MAX_TEXT}
            placeholder="Tekst (opciono)"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            style={[
              styles.input,
              styles.multiline,
              { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
            ]}
          />
          <ColorRow value={color} onChange={setColor} disabled={busy} colors={colors} />
          <View style={styles.actions}>
            <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
            <Button label="Dodaj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
          </View>
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
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  multiline: {
    minHeight: 96,
    maxHeight: 180,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  flexBtn: {
    flex: 1,
  },
});
