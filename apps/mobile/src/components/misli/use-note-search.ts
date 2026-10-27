import { NOTE_SEARCH_LIMIT, NOTE_SEARCH_MIN } from '@devotion/shared';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useState } from 'react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

import { isSearchingNotes } from './misli-model';

type SearchHits = FunctionReturnType<typeof api.thoughts.searchMine>;

const DEBOUNCE_MS = 250;

/**
 * Pretraga mojih beleški (`thoughts.searchMine`) sa istim filterom kao lista.
 * Upit ide tek od `NOTE_SEARCH_MIN` znakova i posle kratke pauze u kucanju.
 * Dok stiže odgovor za novi izraz, ostaje prethodni rezultat ISTOG filtera —
 * lista ne treperi u skeleton na svako slovo.
 */
export function useNoteSearch(
  term: string,
  scope: { startupId?: Id<'startups'> | null },
  scopeKey: string,
): { searching: boolean; hits: SearchHits | undefined } {
  const searching = isSearchingNotes(term);
  const trimmed = term.trim();

  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const fresh = useQuery(
    api.thoughts.searchMine,
    searching && debounced.length >= NOTE_SEARCH_MIN ? { query: debounced, limit: NOTE_SEARCH_LIMIT, ...scope } : 'skip',
  );

  const [kept, setKept] = useState<{ key: string; hits: SearchHits } | null>(null);
  if (!searching) {
    if (kept !== null) setKept(null);
  } else if (fresh !== undefined && (kept === null || kept.hits !== fresh || kept.key !== scopeKey)) {
    setKept({ key: scopeKey, hits: fresh });
  }

  const hits = !searching
    ? undefined
    : (fresh ?? (kept !== null && kept.key === scopeKey ? kept.hits : undefined));
  return { searching, hits };
}
