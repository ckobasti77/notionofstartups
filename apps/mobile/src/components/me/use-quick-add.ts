import { quickAddCall, quickAddSuccessMessage, type QuickAddDraft } from '@devotion/shared';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { openStartupEntity } from '@/lib/navigation/open-startup-entity';
import { rememberDestination } from '@/lib/quick-add-memory';
import { pushUndo } from '@/lib/undo';

import type { QuickAddStartupOption } from './quick-add-sheet';
import { failed, type PlanRef } from './use-row-mutations';

/**
 * Brzi unos (E16) za ekrane ličnog nivoa — isti putevi kao web
 * `QuickAddContainer`: lični zadatak (`personalTasks.create`) ili zadatak u
 * startupu (`pages.create`, pa `myDay.plan` ako je čekirano „Dodaj i u Moj dan").
 * Izdvojeno iz Moj dan (K12) da ga koristi i ekran Moji zadaci (K13).
 */
export function useQuickAdd({
  dayKey,
  profileId,
  planMutation,
}: {
  dayKey: string;
  profileId: Id<'profiles'> | null;
  planMutation: (args: { dayKey: string; ref: PlanRef }) => Promise<unknown>;
}) {
  const router = useRouter();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const createPersonal = useMutation(api.personalTasks.create);
  const createPage = useMutation(api.pages.create);
  const { results } = usePaginatedQuery(api.startups.listForCurrent, {}, { initialNumItems: 50 });
  const startups = useMemo<QuickAddStartupOption[]>(
    () =>
      results.map((startup) => ({
        _id: startup._id,
        name: startup.name,
        logoUrl: startup.logoUrl,
        areas: startup.areas.map((area) => ({ _id: area._id, label: area.label })),
      })),
    [results],
  );

  const submit = async (draft: QuickAddDraft) => {
    if (!profileId) throw new Error('Profil se još učitava. Pokušaj ponovo.');
    const call = quickAddCall(draft, { profileId, dayKey });
    if (call.fn === 'invalid') throw new Error(call.reason ?? 'Unesi naslov zadatka.');
    const message = quickAddSuccessMessage(draft.destination, startups);
    try {
      if (call.fn === 'personalTasks.create') {
        const personalTaskId = await createPersonal(call.args);
        rememberDestination(draft.destination);
        haptics.success();
        // Traka se pojavi dok je sheet brzog unosa još aktivan prozor — njen live
        // region tada možda ne progovori, pa se najavljuje izričito.
        AccessibilityInfo.announceForAccessibility(message);
        pushUndo({ label: message, action: { kind: 'personalTaskCreate', personalTaskId } });
        return;
      }
      // Id-jevi su prošli kroz shared nacrt kao stringovi; potiču iz `startups.listForCurrent`.
      const startupId = call.args.startupId as Id<'startups'>;
      const pageId = await createPage({
        ...call.args,
        startupId,
        areaId: call.args.areaId as Id<'startupAreas'>,
        assigneeProfileIds: [profileId],
      });
      rememberDestination(draft.destination);
      if (call.planDayKey !== null) {
        try {
          await planMutation({ dayKey: call.planDayKey, ref: { kind: 'task', taskPageId: pageId } });
        } catch (error) {
          failed('Plan nije sačuvan', error, 'Zadatak je dodat, ali nije u Moj dan.');
        }
      }
      haptics.success();
      AccessibilityInfo.announceForAccessibility(message);
      pushUndo({
        label: message,
        action: { kind: 'pageCreate', startupId, pageId },
        // „Otvori" kao na webu (toast). Promena aktivnog startupa ionako prazni
        // traku, pa `activeStartupId` ovde ne može biti zastareo dok se traka vidi.
        secondary: {
          label: 'Otvori',
          onPress: () =>
            openStartupEntity(router, setActiveStartupId, {
              startupId,
              href: { pathname: '/zadatak/[id]', params: { id: pageId } },
              currentStartupId: activeStartupId,
            }),
        },
      });
    } catch (error) {
      throw new Error(accessErrorMessage(error, 'Zadatak nije dodat. Pokušaj ponovo.'));
    }
  };

  return { startups, submit };
}
