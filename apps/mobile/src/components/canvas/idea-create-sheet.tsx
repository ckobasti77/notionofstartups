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

import { Button } from '@/components/ui/button';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

const MAX_TITLE = 120;
const MAX_TEXT = 2000;

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
  const insets = useSafeAreaInsets();
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
    if (!cleanTitle && !cleanText) {
      Alert.alert('Prazna ideja', 'Unesi bar naslov ili tekst.');
      return;
    }
    setBusy(true);
    try {
      await create({ startupId, title: cleanTitle, text: cleanText });
      reset();
      onClose();
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, 'Ideja nije kreirana.'));
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
            placeholder="Opis (opciono)"
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
