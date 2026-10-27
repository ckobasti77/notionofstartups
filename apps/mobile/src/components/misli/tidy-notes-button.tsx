import { notesCountLabel } from '@devotion/shared';
import { useMutation, useQuery } from 'convex/react';
import { Wand2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { tidyGridPosition } from '@/lib/thought-layout';
import { useThemeColors } from '@/theme/theme-provider';

import { tidyNoteTargets, type NoteListItem } from './misli-model';

type TidyNote = Pick<NoteListItem, '_id' | 'parentThoughtId'> & { _id: Id<'thoughtNodes'> };

/**
 * „Sredi raspored" za Mapu beleški jednog startupa (PARITET A1). Mobilna zamena
 * za prevlačenje: raspoređuje UČITANE beleške izabranog startupa koje nisu
 * podbeleške (ugnježdene imaju relativne koordinate i putuju sa roditeljem),
 * najviše 50. Menja ručni raspored, pa pita PRE radnje. Prikazuje se samo uz
 * izabran jedan startup (lične beleške nemaju Mapu) i kad ima bar dve beleške.
 */
export function TidyNotesButton({
  startupId,
  notes,
}: {
  startupId: Id<'startups'>;
  notes: ReadonlyArray<TidyNote>;
}) {
  const colors = useThemeColors();
  const moveNodes = useMutation(api.thoughts.moveNodes);
  const saveViewport = useMutation(api.thoughts.saveViewport);
  // Pogled kanvasa — „Sredi raspored" čuva postojeći zoom (dokument nastaje tek uz
  // prvu belešku/pogled, pa može biti `null`).
  const canvas = useQuery(api.thoughts.getCanvas, { startupId });
  const [busy, setBusy] = useState(false);

  if (notes.length < 2) return null;

  const run = async (targets: ReadonlyArray<TidyNote>, truncated: boolean) => {
    setBusy(true);
    haptics.tap();
    try {
      await moveNodes({
        moves: targets.map((note, index) => ({
          nodeId: note._id,
          ...tidyGridPosition(index, targets.length),
        })),
      });
      // Mreža je u pozitivnom kvadrantu, pa pogled (0,0) prikazuje celu mrežu.
      // Pogled je pratilac: njegov pad ne sme da poništi poruku o upisanom rasporedu.
      await saveViewport({ startupId, x: 0, y: 0, zoom: canvas?.zoom ?? 1 }).catch(() => {});
      haptics.success();
      Alert.alert(
        'Raspored je sređen',
        truncated
          ? `Raspoređeno je prvih ${targets.length} beleški; ostale su ostale gde su bile. Već otvorena Mapa prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.`
          : 'Beleške su raspoređene u mrežu. Već otvorena Mapa prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.',
      );
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Raspored nije sređen.'));
    } finally {
      setBusy(false);
    }
  };

  const request = () => {
    if (busy) return;
    const { targets, truncated } = tidyNoteTargets(notes);
    if (targets.length === 0) {
      haptics.warning();
      Alert.alert('Nema šta da se sredi', 'Sve učitane beleške su ugnježdene u druge beleške.');
      return;
    }
    haptics.warning();
    Alert.alert(
      'Srediti raspored?',
      `${notesCountLabel(targets.length)} (bez ugnježdenih) se raspoređuje u urednu mrežu na Mapi. Ručni raspored tih beleški se gubi.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        { text: 'Sredi', onPress: () => void run(targets, truncated) },
      ],
    );
  };

  return (
    <IconButton accessibilityLabel="Sredi raspored beleški u mrežu na Mapi" disabled={busy} onPress={request}>
      {busy ? <ActivityIndicator color={colors.primary} /> : <Wand2 size={22} color={colors.foreground} />}
    </IconButton>
  );
}
