import { cleanNoteText, noteCreatedMessage, NOTE_TEXT_MAX, NOTE_TITLE_MAX, type NoteFilter } from '@devotion/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

import { filterStartupId } from './misli-model';
import { NoteScopeChips } from './note-scope-chips';
import { useCreateNote } from './use-create-note';
import type { MyStartup } from './use-note-startups';

/**
 * „Nova beleška" (FAB na ekranu Beleške): naslov (opciono), tekst i odredište —
 * Lično ili jedan od mojih startupa. Prazan naslov server menja prvim redom
 * teksta. Svako otvaranje počinje od praznog nacrta.
 */
export function NoteCreateSheet({
  open,
  startups,
  defaultStartupId,
  onClose,
}: {
  open: boolean;
  startups: ReadonlyArray<MyStartup>;
  /** Startup izabran u filteru (odredište se podrazumeva), inače Lično. */
  defaultStartupId: Id<'startups'> | null;
  onClose: () => void;
}) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((value) => value + 1);
  }
  return (
    <NoteCreateForm
      key={session}
      open={open}
      startups={startups}
      defaultStartupId={defaultStartupId}
      onClose={onClose}
    />
  );
}

function NoteCreateForm({
  open,
  startups,
  defaultStartupId,
  onClose,
}: {
  open: boolean;
  startups: ReadonlyArray<MyStartup>;
  defaultStartupId: Id<'startups'> | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const createNote = useCreateNote();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [destination, setDestination] = useState<NoteFilter<Id<'startups'>>>(
    defaultStartupId === null ? { kind: 'personal' } : { kind: 'startup', startupId: defaultStartupId },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = cleanNoteText(body);
  const canSave = check.ok && !busy;
  const shownError = error ?? (check.ok ? null : check.reason);
  // Napušten startup (nestao iz liste) pada na Lično umesto da pošalje nevažeći id.
  const startupId = filterStartupId(destination);
  const startup = startupId === null ? null : (startups.find((item) => item._id === startupId) ?? null);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await createNote({
        startupId: startup === null ? null : startup._id,
        title,
        text: body,
        message: noteCreatedMessage(startup?.name ?? null),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Beleška nije sačuvana. Pokušaj ponovo.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.input },
  ];

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard maxHeight="90%" style={styles.sheet}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
          Nova beleška
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={NOTE_TITLE_MAX}
          placeholder="Naslov (opciono)"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          accessibilityLabel="Naslov beleške"
          editable={!busy}
          returnKeyType="next"
          style={inputStyle}
        />
        <TextInput
          value={body}
          onChangeText={(next) => {
            setBody(next);
            setError(null);
          }}
          multiline
          autoFocus
          maxLength={NOTE_TEXT_MAX + 1}
          placeholder="Šta ti je na umu?"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          accessibilityLabel="Tekst beleške"
          editable={!busy}
          textAlignVertical="top"
          style={[inputStyle, styles.multiline]}
        />
        {shownError ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {shownError}
          </Text>
        ) : null}
        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>Gde</Text>
          <NoteScopeChips
            value={destination}
            startups={startups}
            includeAll={false}
            bleed={20}
            onChange={setDestination}
          />
        </View>
      </ScrollView>
      {/* Dugmad izvan skrola: uz tastaturu na malom ekranu ostaju vidljiva. */}
      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button
          label="Sačuvaj"
          onPress={() => void save()}
          loading={busy}
          disabled={!canSave}
          style={styles.flexBtn}
        />
      </View>
    </Sheet>
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
    minHeight: 120,
    maxHeight: 220,
  },
  error: { ...text.body },
  group: { gap: 2 },
  groupLabel: { ...text.meta },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  flexBtn: { flex: 1 },
});
