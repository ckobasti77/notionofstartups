import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ColorRow } from '@/components/canvas/thought-node-sheet';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
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
      haptics.warning();
      Alert.alert('Prazna misao', 'Unesi naslov misli.');
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      await create({
        startupId,
        title: cleanTitle,
        text: text.trim(),
        color,
        x: Math.round((Math.random() - 0.5) * SPREAD),
        y: Math.round((Math.random() - 0.5) * SPREAD),
      });
      haptics.success();
      reset();
      onClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Misao nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Visina je ograničena i sadržaj skroluje: na niskom ekranu sa tastaturom sve stane.
    <Sheet visible={open} onClose={onClose} avoidKeyboard maxHeight="85%" style={styles.sheet}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
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
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button label="Dodaj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: 10,
    paddingBottom: 4,
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
    paddingTop: 12,
  },
  flexBtn: {
    flex: 1,
  },
});
