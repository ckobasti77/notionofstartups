import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ColorRow } from '@/components/ui/color-row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import type { NodeColor } from '@/lib/thought-colors';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

const MAX_TITLE = 120;
// Isto ograničenje kao na serveru (`cleanRequiredText(..., 12000)`) i kao u
// `ThoughtCreateSheet` — ranije je 2000 tiho sekao duži unos.
const MAX_TEXT = 12_000;

/**
 * Kreiranje nove ideje iz canvas rail-a (M4.3) ili kao „Nova grana ideje…" iz
 * `IdeaActionsSheet` (P4). Native unos naslova + teksta → `ideas.create`; WebView
 * (koji sluša `ideas.list`) sam pokupi novi čvor realtime.
 */
export function IdeaCreateSheet({
  open,
  startupId,
  parent,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  /**
   * Kad je zadat, nova ideja se odmah povezuje sa ovom (`ideas.create.parentIdeaId`
   * pravi IVICU, ne ugnježdenje — `ideas.ts:357-373`).
   * `x`/`y` su APSOLUTNE koordinate roditelja i OPCIONE su: pozivalac ih izostavlja
   * kad `absoluteNodePosition` vrati `complete: false` (roditelj van učitane liste).
   */
  parent?: { id: Id<'ideaNodes'>; title: string; x?: number; y?: number } | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const create = useMutation(api.ideas.create);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  // 'violet' je serverski difolt (`ideas.ts:326`) — ko boju ne dira dobija isto ponašanje kao pre.
  const [color, setColor] = useState<NodeColor>('violet');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle('');
    setText('');
    setColor('violet');
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
      const ideaId = await create({
        startupId,
        title: cleanTitle,
        text: cleanText,
        color,
        ...(parent ? { parentIdeaId: parent.id } : {}),
        // Pozicija grane samo kad je roditeljska POZNATA u oba dela — bez nje
        // server bira poziciju sam (`ideas.ts:324-325`), grana tada nije pored
        // korena ali nije ni preko tuđe kartice.
        ...(parent && parent.x !== undefined && parent.y !== undefined
          ? { x: Math.round(parent.x + 300), y: Math.round(parent.y + 40) }
          : {}),
      });
      haptics.success();
      pushUndo({
        label: parent ? 'Grana ideje je dodata.' : 'Ideja je dodata.',
        action: { kind: 'ideaCreate', startupId, ideaId },
      });
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
        <Text style={[styles.heading, { color: colors.foreground }]}>
          {parent ? 'Nova grana ideje' : 'Nova ideja'}
        </Text>
        {parent ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            Biće povezana sa „{parent.title}".
          </Text>
        ) : null}
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
        <ColorRow value={color} onChange={setColor} disabled={busy} colors={colors} />
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
  meta: {
    fontSize: fontSize.xs,
    marginTop: -4,
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
