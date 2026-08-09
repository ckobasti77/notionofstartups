import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

const MAX_TITLE = 120;
// Isto ograničenje kao na serveru (`cleanRequiredText(..., 12000)`) i kao u
// `ThoughtCreateSheet` — ranije je 2000 tiho sekao duži unos.
const MAX_TEXT = 12_000;

/**
 * Kreiranje nove ideje iz canvas rail-a (M4.3). Native unos naslova + teksta →
 * `ideas.create`; WebView (koji sluša `ideas.list`) sam pokupi novi čvor realtime.
 */
export function IdeaCreateSheet({
  open,
  startupId,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const create = useMutation(api.ideas.create);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle('');
    setText('');
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    const cleanText = text.trim();
    // `ideas.create` traži OBA polja (`cleanRequiredText` baca na prazan string), pa se
    // ovde proverava isto — ranije je sheet puštao samo naslov i mutacija je pucala.
    if (!cleanTitle || !cleanText) {
      haptics.warning();
      Alert.alert('Nepotpuna ideja', 'Unesi i naslov i opis.');
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      await create({ startupId, title: cleanTitle, text: cleanText });
      haptics.success();
      reset();
      onClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Ideja nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Visina je ograničena i sadržaj skroluje: na niskom ekranu (i u landscape-u,
    // koji canvas ekran podržava) sa otvorenom tastaturom dugmad inače ostanu van
    // vidljivog dela.
    <Sheet visible={open} onClose={onClose} avoidKeyboard maxHeight="85%" style={styles.sheet}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: colors.foreground }]}>Nova ideja</Text>
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
          placeholder="Opis"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          style={[
            styles.input,
            styles.multiline,
            { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
          ]}
        />
        <View style={styles.actions}>
          <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
          <Button label="Dodaj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
        </View>
      </ScrollView>
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
