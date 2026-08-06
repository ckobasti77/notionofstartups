import { Redirect } from 'expo-router';

import { FullScreenLoader } from '@/components/full-screen-loader';
import { useAuthGate } from '@/hooks/use-auth-gate';

/**
 * Koren `/` (uključujući hladan start i deep link `devotion:///`). Bez sopstvenog
 * UI-ja — samo preusmerava po auth stanju, pa `/` nikad ne padne na „Unmatched Route".
 * `<Redirect>` radi `replace`, pa ovaj ekran ne ostaje u istoriji (nema back-loop-a).
 * Odredišta su zaštićena u root `_layout.tsx` i dostupna baš u odgovarajućem stanju.
 */
export default function IndexRedirect() {
  const status = useAuthGate();

  if (status === 'unauthenticated') return <Redirect href="/prijava" />;
  if (status === 'onboarding') return <Redirect href="/onboarding" />;
  if (status === 'ready') return <Redirect href="/danas" />;
  return <FullScreenLoader />;
}
