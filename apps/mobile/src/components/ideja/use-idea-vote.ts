import { useMutation } from 'convex/react';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { voteMessage, type IdeaVote } from '@/components/ideja/ideje-model';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

/**
 * Glas za/protiv (`ideas.vote`) za listu, detalj i „Čeka tebe". Glasa svaki član
 * (signal, ne odluka); isti glas povlači, drugi menja — to radi server. `busyId`
 * drži jedno dugme zaključano dok traje poziv, a ishod se i izgovara čitaču
 * ekrana (haptika je bila jedini signal uspeha).
 */
export function useIdeaVote(startupId: Id<'startups'> | null) {
  const vote = useMutation(api.ideas.vote);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cast = useCallback(
    async (ideaId: Id<'ideaNodes'>, current: IdeaVote | null, voteType: IdeaVote) => {
      if (startupId === null || busyId !== null) return false;
      setBusyId(ideaId);
      haptics.select();
      try {
        await vote({ startupId, ideaId, voteType });
        haptics.success();
        AccessibilityInfo.announceForAccessibility(voteMessage(current, voteType));
        return true;
      } catch (error) {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Glas nije zabeležen.'));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [busyId, startupId, vote],
  );

  return { cast, busyId };
}
