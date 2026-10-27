import { NOTE_ARCHIVED_MESSAGE, NOTE_SEND_NO_STARTUP, NOTE_SEND_TITLE, noteDisplayTitle } from '@devotion/shared';
import { useMutation } from 'convex/react';
import { Archive, FileText, Send } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useRetained } from '@/hooks/use-retained';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/** Beleška nad kojom se radi: onoliko koliko sheet čita (i lista i pretraga to imaju). */
export type ActionNote = {
  _id: Id<'thoughtNodes'>;
  title: string | null;
  text: string;
  startupId: Id<'startups'> | null;
};

/**
 * Radnje nad jednom beleškom (dugi pritisak na listi, „…" na detalju lične
 * beleške): Otvori · Pošalji u startup · Arhiviraj. Arhiva je bez potvrde —
 * traka „Poništi" (`restoreNodes`) je put nazad (DIZAJN-SMIRENJE §5.6).
 *
 * „Pošalji u startup" ne radi posao sam: roditelj zatvara OVAJ sheet pa (uz
 * pauzu) otvara izbor cilja — dva istovremena RN modala na Androidu gutaju
 * `onRequestClose`. Bez startupa red je onemogućen sa razlogom.
 */
export function NoteActionsSheet({
  open,
  note,
  canSend,
  onClose,
  onOpen,
  onSend,
  onBeforeArchive,
  onArchived,
  onArchiveFailed,
}: {
  open: boolean;
  note: ActionNote | null;
  /** Ima li bar jedan startup u koji se šalje. */
  canSend: boolean;
  onClose: () => void;
  /** Bez rukovaoca nema reda „Otvori" (detalj je već otvoren). */
  onOpen?: (note: ActionNote) => void;
  onSend: (note: ActionNote) => void;
  /** Detalj: prebaci upit na `skip` PRE arhiviranja (trka sa „nije pronađena"). */
  onBeforeArchive?: () => void;
  onArchived?: () => void;
  onArchiveFailed?: () => void;
}) {
  const colors = useThemeColors();
  const archiveNodes = useMutation(api.thoughts.archiveNodes);
  const [busy, setBusy] = useState(false);
  // Telo ostaje tokom izlazne animacije (roditelj odmah postavi `note` na null).
  const shown = useRetained(note);

  const archive = async (target: ActionNote) => {
    if (busy) return;
    setBusy(true);
    haptics.tap();
    onBeforeArchive?.();
    try {
      await archiveNodes({ nodeIds: [target._id] });
      haptics.success();
      // Backend nema upit za arhivu: traka je jedini put nazad.
      pushUndo({
        label: NOTE_ARCHIVED_MESSAGE,
        action: { kind: 'thoughts', nodeIds: [target._id], edgeIds: [] },
      });
      onClose();
      onArchived?.();
    } catch (error) {
      onArchiveFailed?.();
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Arhiviranje nije uspelo. Pokušaj ponovo.'));
    } finally {
      setBusy(false);
    }
  };

  if (shown === null) return null;

  return (
    <Sheet visible={open && note !== null} onClose={onClose} style={styles.sheet}>
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={[styles.heading, { color: colors.foreground }]}>
        {noteDisplayTitle(shown)}
      </Text>
      <View style={styles.list}>
        {onOpen ? (
          <Row
            title="Otvori"
            showChevron={false}
            onPress={() => onOpen(shown)}
            disabled={busy}
            style={styles.row}
            icon={<FileText size={20} color={colors.mutedForeground} />}
          />
        ) : null}
        <Row
          title={NOTE_SEND_TITLE}
          subtitle={canSend ? 'Tim dobija ideju; beleška ostaje privatna' : NOTE_SEND_NO_STARTUP}
          showChevron={false}
          onPress={canSend ? () => onSend(shown) : undefined}
          disabled={busy || !canSend}
          style={styles.row}
          icon={<Send size={20} color={colors.mutedForeground} />}
        />
        <Row
          title="Arhiviraj"
          subtitle={'Sklanja belešku; traka „Poništi” vraća'}
          showChevron={false}
          onPress={() => void archive(shown)}
          disabled={busy}
          style={styles.row}
          icon={<Archive size={20} color={colors.destructive} />}
          value={busy ? <ActivityIndicator color={colors.primary} /> : undefined}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 12 },
  heading: {
    ...text.title,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  list: { gap: 2, paddingBottom: 4 },
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
});
