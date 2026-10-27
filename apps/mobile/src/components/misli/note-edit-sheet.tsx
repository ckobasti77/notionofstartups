import { NOTE_TEXT_MAX, NOTE_TITLE_MAX, noteEditPatch } from '@devotion/shared';
import { useMutation } from 'convex/react';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useRetained } from '@/hooks/use-retained';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

export type NoteEditTarget = {
  _id: Id<'thoughtNodes'>;
  title: string | null;
  text: string;
};

/**
 * Izmena beleške (naslov + tekst) iz detalja. `note` je snimak u trenutku
 * otvaranja — uživo promena ispod ne prepisuje ono što kucaš. Šalju se samo
 * polja koja su se promenila (`noteEditPatch`); prazan naslov i prazan tekst
 * ostaju uz poruku, ne tihu zamenu. Radi i za lične beleške (`updateNode`).
 */
export function NoteEditSheet({ note, onClose }: { note: NoteEditTarget | null; onClose: () => void }) {
  // Telo ostaje tokom izlazne animacije; forma se iznova pravi za svaku belešku.
  const shown = useRetained(note);
  return (
    <Sheet visible={note !== null} onClose={onClose} avoidKeyboard maxHeight="90%" style={styles.sheet}>
      {shown ? <NoteEditForm key={shown._id} note={shown} onClose={onClose} /> : null}
    </Sheet>
  );
}

function NoteEditForm({ note, onClose }: { note: NoteEditTarget; onClose: () => void }) {
  const colors = useThemeColors();
  const updateNode = useMutation(api.thoughts.updateNode);
  const titleRef = useRef<TextInput>(null);
  const bodyRef = useRef<TextInput>(null);
  const [title, setTitle] = useState(note.title ?? '');
  const [body, setBody] = useState(note.text);
  const [error, setError] = useState<{ field: 'title' | 'text' | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    const result = noteEditPatch(note, { title, text: body });
    if (!result.ok) {
      haptics.warning();
      setError({ field: result.field, message: result.reason });
      (result.field === 'title' ? titleRef : bodyRef).current?.focus();
      return;
    }
    if (result.patch === null) {
      // Ništa nije promenjeno: zatvaranje bez poziva servera.
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    haptics.tap();
    try {
      await updateNode({ nodeId: note._id, ...result.patch });
      haptics.success();
      onClose();
    } catch (cause) {
      haptics.error();
      setError({ field: null, message: accessErrorMessage(cause, 'Izmena nije sačuvana. Pokušaj ponovo.') });
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = (field: 'title' | 'text') => [
    styles.input,
    {
      color: colors.foreground,
      backgroundColor: colors.surface,
      borderColor: error?.field === field ? colors.danger : colors.input,
    },
  ];

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
          Izmeni belešku
        </Text>
        <TextInput
          ref={titleRef}
          value={title}
          onChangeText={(next) => {
            setTitle(next);
            setError(null);
          }}
          maxLength={NOTE_TITLE_MAX + 1}
          placeholder="Naslov"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          accessibilityLabel="Naslov beleške"
          editable={!busy}
          returnKeyType="next"
          onSubmitEditing={() => bodyRef.current?.focus()}
          style={inputStyle('title')}
        />
        <TextInput
          ref={bodyRef}
          value={body}
          onChangeText={(next) => {
            setBody(next);
            setError(null);
          }}
          multiline
          maxLength={NOTE_TEXT_MAX + 1}
          placeholder="Tekst"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          accessibilityLabel="Tekst beleške"
          editable={!busy}
          textAlignVertical="top"
          style={[inputStyle('text'), styles.multiline]}
        />
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {error.message}
          </Text>
        ) : null}
      </ScrollView>
      {/* Dugmad izvan skrola: uz tastaturu na malom ekranu ostaju vidljiva. */}
      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button label="Sačuvaj" onPress={() => void save()} loading={busy} style={styles.flexBtn} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20 },
  scroll: { flexGrow: 0 },
  content: { gap: 10, paddingBottom: 4 },
  heading: { ...text.title },
  input: {
    ...text.body,
    minHeight: 48,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: {
    minHeight: 140,
    maxHeight: 260,
  },
  error: { ...text.body },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  flexBtn: { flex: 1 },
});
