import { useConvexAuth, useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';

export type AuthGateStatus = 'loading' | 'unauthenticated' | 'onboarding' | 'ready';

/**
 * Jedini izvor istine za auth gate — preslikava state-machine iz web [app-root.tsx].
 * Dele ga root `_layout.tsx` (bira zaštićeni segment) i `index.tsx` (preusmerava `/`),
 * pa ne mogu da odlutaju.
 *
 * `isLoading` = token se još čita iz SecureStore-a; `profile === undefined` = profil
 * se tek učitava; `profile === null` = prijavljen ali bez profila → onboarding.
 */
export function useAuthGate(): AuthGateStatus {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getCurrent, isAuthenticated ? {} : 'skip');

  if (isLoading || (isAuthenticated && profile === undefined)) return 'loading';
  if (!isAuthenticated) return 'unauthenticated';
  if (profile === null) return 'onboarding';
  return 'ready';
}
