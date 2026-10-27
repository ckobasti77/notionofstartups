import { cleanNoteText } from '@devotion/shared';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { AccessibilityInfo } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';

/**
 * Pravljenje beleške — JEDAN tok za sva tri ulaza (polje „Brza beleška…", FAB
 * sheet i režim Beleška u brzom unosu): `thoughts.createNote`, pa haptika,
 * najava čitaču ekrana i traka „Poništi" (inverz je `archiveNodes`) sa radnjom
 * „Otvori". Poruku sklapa pozivalac (`noteCreatedMessage` /
 * `quickAddNoteSuccessMessage`), da svaki ulaz kaže isto što i web.
 *
 * Detalj `/misao/[id]` čita belešku po id-ju (`getNote`), ne zavisi od aktivnog
 * startupa — „Otvori" zato ne menja aktivni startup (promena prazni traku
 * „Poništi" i piše u skladište uređaja bez potrebe).
 *
 * Greška se vraća kao `Error` sa porukom za korisnika (nikad sirov server).
 */
export function useCreateNote() {
  const router = useRouter();
  const createNote = useMutation(api.thoughts.createNote);

  return useCallback(
    async (input: {
      startupId: Id<'startups'> | null;
      title?: string;
      text: string;
      message: string;
    }): Promise<Id<'thoughtNodes'>> => {
      const check = cleanNoteText(input.text);
      if (!check.ok) throw new Error(check.reason ?? 'Unesi tekst beleške.');
      const title = input.title?.trim();
      let nodeId: Id<'thoughtNodes'>;
      try {
        nodeId = await createNote({
          startupId: input.startupId,
          ...(title ? { title } : {}),
          text: check.text,
        });
      } catch (error) {
        throw new Error(accessErrorMessage(error, 'Beleška nije sačuvana. Pokušaj ponovo.'));
      }
      haptics.success();
      // Traka se pojavi dok je sheet još aktivan prozor — njen live region tada
      // možda ne progovori, pa se najavljuje izričito.
      AccessibilityInfo.announceForAccessibility(input.message);
      pushUndo({
        label: input.message,
        action: { kind: 'thoughtCreate', nodeId },
        secondary: {
          label: 'Otvori',
          onPress: () => router.push({ pathname: '/misao/[id]', params: { id: nodeId } }),
        },
      });
      return nodeId;
    },
    [createNote, router],
  );
}
