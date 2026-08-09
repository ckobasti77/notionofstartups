import type { useRouter } from 'expo-router';

import type { NotificationDestination } from '@/convex/lib/notificationTarget';

/**
 * Klijent-neutralnu destinaciju iz `convex/lib/notificationTarget.ts` prevodi u
 * expo-router navigaciju. JEDNO mesto za oba pozivaoca — tap na push obaveštenje
 * (`use-notification-target.ts`) i tap na red u tabu „Obaveštenja"
 * (`(tabs)/obavestenja.tsx`) — da se ista vrsta obaveštenja iz oba puta otvori
 * isto (docs/mobile/03-NOTIFIKACIJE.md).
 *
 * Svaki `screen` iz `NotificationDestination` sada ima mobilni ekran; ranija
 * privremena grana „sve osim chata pada na Danas" (faze 2–4 nisu bile gotove)
 * više ne postoji. `today` ostaje jedini fallback i to samo kad ga sam backend
 * vrati — za nepoznat ili nedosledan cilj.
 *
 * Obrazac je `navigate` na tab + `push` na detalj: tako `stranica`/`razgovor`
 * dobiju dugme „nazad" koje vodi na svoj tab, a ne na ekran sa kog je korisnik
 * tapnuo obaveštenje.
 */
export function navigateToNotificationDestination(
  router: ReturnType<typeof useRouter>,
  dest: NotificationDestination,
): void {
  switch (dest.screen) {
    case 'chat':
      router.navigate('/chat');
      if (dest.entityId) {
        router.push({ pathname: '/razgovor/[id]', params: { id: dest.entityId } });
      }
      return;
    case 'page':
      // `notificationDestination` već garantuje `entityId` za `page`; drugi
      // uslov je samo pojas za slučaj da payload dođe izobličen.
      if (dest.entityId) {
        router.push({ pathname: '/stranica/[id]', params: { id: dest.entityId } });
        return;
      }
      router.navigate('/danas');
      return;
    case 'ideas':
      router.push('/ideje');
      return;
    case 'approvals':
      router.push('/odobrenja');
      return;
    case 'puls':
      // Bez `weekStart` Puls sam otvara tekuću nedelju.
      router.push(
        dest.weekStart === null
          ? '/puls'
          : { pathname: '/puls', params: { weekStart: String(dest.weekStart) } },
      );
      return;
    default:
      router.navigate('/danas');
  }
}
