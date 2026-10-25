import type { Href, useRouter } from 'expo-router';

import type { Id } from '@/convex/_generated/dataModel';

/**
 * Otvaranje entiteta startupa iz GLOBALNOG taba (Danas, Poruke, Inbox — plan
 * K01 §6). Ekrani entiteta (`zadatak/[id]`, `stranica/[id]`…) čitaju aktivan
 * startup, pa se on postavlja PRE navigacije; globalni tab sam aktivan startup
 * ne čita za svoje podatke. Par web `openInStartup` u ljusci.
 *
 * Isti startup se ne postavlja ponovo: promena briše traku „Poništi" i piše u
 * skladište (`context/active-startup.tsx`).
 */
export function openStartupEntity(
  router: ReturnType<typeof useRouter>,
  setActiveStartupId: (id: Id<'startups'>) => void,
  target: { startupId: Id<'startups'>; href: Href; currentStartupId?: Id<'startups'> | null },
): void {
  if (target.startupId !== target.currentStartupId) setActiveStartupId(target.startupId);
  router.push(target.href);
}
