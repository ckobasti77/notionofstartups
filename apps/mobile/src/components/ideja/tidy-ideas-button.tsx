import { useMutation, useQuery } from 'convex/react';
import { Wand2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';

import { ideasCountLabel } from '@/components/ideja/ideje-model';
import { IconButton } from '@/components/ui/icon-button';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { tidyGridPosition } from '@/lib/thought-layout';
import { useThemeColors } from '@/theme/theme-provider';

/** Backend `MAX_BULK_ITEMS` posredno — „Sredi raspored" šalje najviše 50 poteza. */
const MAX_BULK = 50;

/**
 * „Sredi raspored" za Mapu ideja (PARITET A4, K07 §5.9: prelazi sa liste na ekran
 * Mape). Mobilna zamena za drag raspoređivanje: samo kartice na vrhu — ugnježdene
 * imaju relativne koordinate i putuju sa roditeljem, a one sa vidljivim predlogom
 * ugnježdavanja imaju PROJEKTOVAN roditeljski id, pa su isključene. Menja ručni
 * raspored, pa traži potvrdu PRE radnje. Ne crta ništa dok nema bar dve ideje.
 */
export function TidyIdeasButton({ startupId }: { startupId: Id<'startups'> }) {
  const colors = useThemeColors();
  const ideas = useQuery(api.ideas.list, { startupId });
  const updatePositions = useMutation(api.ideas.updatePositions);
  const saveViewport = useMutation(api.ideas.saveViewport);
  const [busy, setBusy] = useState(false);

  if (ideas === undefined || ideas.nodes.length < 2) return null;

  const run = async (targets: typeof ideas.nodes, truncated: boolean) => {
    setBusy(true);
    haptics.tap();
    try {
      await updatePositions({
        startupId,
        updates: targets.map((node, index) => ({
          id: node._id,
          ...tidyGridPosition(index, targets.length),
        })),
      });
      // Mreža je u pozitivnom kvadrantu, pa viewport (0,0) prikazuje celu mrežu.
      // Pogled je pratilac: njegov pad ne sme da poništi poruku o već upisanom rasporedu.
      await saveViewport({ startupId, x: 0, y: 0, zoom: ideas.canvasState.zoom }).catch(() => {});
      haptics.success();
      Alert.alert(
        'Raspored je sređen',
        truncated
          ? `Raspoređeno je prvih ${targets.length} ideja; ostale su ostale gde su bile. Već otvorena Mapa prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.`
          : 'Ideje su raspoređene u mrežu. Već otvorena Mapa prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.',
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
    const topLevel = ideas.nodes.filter((node) => node.parentIdeaId === undefined);
    if (topLevel.length === 0) {
      haptics.warning();
      Alert.alert('Nema šta da se sredi', 'Sve ideje su ugnežđene u druge kartice.');
      return;
    }
    const targets = topLevel.slice(0, MAX_BULK);
    haptics.warning();
    Alert.alert(
      'Srediti raspored?',
      `${ideasCountLabel(targets.length)} (bez ugnežđenih) se raspoređuje u urednu mrežu na Mapi. Ručni raspored tih kartica se gubi.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        { text: 'Sredi', onPress: () => void run(targets, topLevel.length > targets.length) },
      ],
    );
  };

  return (
    <IconButton accessibilityLabel="Sredi raspored ideja u mrežu na Mapi" disabled={busy} onPress={request}>
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Wand2 size={22} color={colors.foreground} />
      )}
    </IconButton>
  );
}
