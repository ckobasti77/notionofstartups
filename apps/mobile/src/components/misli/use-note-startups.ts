import { usePaginatedQuery } from 'convex/react';
import { useEffect, useMemo } from 'react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

export type MyStartup = { _id: Id<'startups'>; name: string; logoUrl: string | null };

const PAGE = 50;

/**
 * Moji aktivni startupi za Beleške (čipovi filtera, odredište, cilj slanja).
 * Isti izvor kao brzi unos (`startups.listForCurrent`); strana može biti kraća
 * jer se arhivirana članstva preskaču, pa se dovlači do kraja.
 */
export function useMyStartups(): { startups: MyStartup[]; ready: boolean } {
  const { results, status, loadMore } = usePaginatedQuery(
    api.startups.listForCurrent,
    {},
    { initialNumItems: PAGE },
  );
  useEffect(() => {
    if (status === 'CanLoadMore') loadMore(PAGE);
  }, [status, loadMore]);
  const startups = useMemo<MyStartup[]>(
    () => results.map((startup) => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl })),
    [results],
  );
  return { startups, ready: status !== 'LoadingFirstPage' };
}
