import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { usePaginatedQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { notificationDestination } from '@/convex/lib/notificationTarget';
import { useActiveStartup } from '@/context/active-startup';
import { usePendingTarget } from '@/context/pending-target';

import { extractPendingTarget } from './deep-link';
import { navigateToNotificationDestination } from './navigate';

/**
 * Hvata tap na obaveštenje i pamti cilj u `pending-target`. Živi u ROOT lejautu
 * (uvek montiran) da radi bez obzira na auth stanje — tako neprijavljen korisnik
 * i „hladan start" ne izgube cilj (docs/mobile/03-NOTIFIKACIJE.md).
 *
 * Dve grane, obe deduplikovane po identifikatoru zahteva:
 *  - `getLastNotificationResponseAsync` — tap koji je POKRENUO aplikaciju iz
 *    potpuno zatvorenog stanja (najčešće promašen slučaj).
 *  - `addNotificationResponseReceivedListener` — tap dok app radi (pozadina/prvi plan).
 */
export function useNotificationTapCapture(): void {
  const { setTarget } = usePendingTarget();

  useEffect(() => {
    // Na webu ne postoje native odgovori na obaveštenja; register.ts isto tako
    // radi samo na telefonu.
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    const handled = new Set<string>();

    function handle(response: Notifications.NotificationResponse | null): void {
      if (response === null) return;
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      handled.add(id);

      const target = extractPendingTarget(response);
      if (target !== null) setTarget(target);
    }

    let cancelled = false;
    // Hladan start: pročitaj odgovor koji je otvorio aplikaciju.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled) handle(response);
    });

    // Topli tap: dok aplikacija radi.
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [setTarget]);
}

/**
 * Otvara zapamćeni cilj kad je korisnik prijavljen i kad su startupi učitani.
 * Živi UNUTAR `(app)` segmenta (posle auth gate-a) — pre toga navigacije nema, a
 * cilj strpljivo čeka u kontekstu. Rešava pristup pre otvaranja: ako korisnik
 * nije član ciljnog startupa, ne vodi na belo nego na „Danas" uz poruku.
 */
export function useNotificationTargetNavigation(): void {
  const router = useRouter();
  const { target, clearTarget } = usePendingTarget();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const { results: startups, status } = usePaginatedQuery(
    api.startups.listForCurrent,
    {},
    { initialNumItems: 50 },
  );

  useEffect(() => {
    if (target === null) return;
    // Sačekaj da lista startupa stigne — bez nje ne možemo proveriti pristup.
    if (status === 'LoadingFirstPage') return;

    const targetStartupId = target.startupId as Id<'startups'> | null;
    const isMember =
      targetStartupId !== null && startups.some((s) => s._id === targetStartupId);

    if (targetStartupId !== null && !isMember) {
      // Uklonjen iz tima ili zastareo link — ne otvaraj ništa, objasni i vrati
      // na komandni centar (ne na belo).
      clearTarget();
      router.navigate('/danas');
      Alert.alert(
        'Nema pristupa',
        'Nemaš pristup startupu iz ovog obaveštenja. Možda si uklonjen iz tima.',
      );
      return;
    }

    if (targetStartupId !== null && targetStartupId !== activeStartupId) {
      // Otvori cilj u njegovom kontekstu — ciljni ekran čita `activeStartupId`.
      setActiveStartupId(targetStartupId);
    }

    navigateToNotificationDestination(
      router,
      notificationDestination(target.targetType, target.targetId),
    );
    clearTarget();
  }, [target, status, startups, activeStartupId, setActiveStartupId, clearTarget, router]);
}
