import { useQueries, type RequestForQueries } from 'convex/react';
import { getFunctionName, type FunctionReference, type FunctionReturnType } from 'convex/server';
import { useMemo } from 'react';

/** Stanje upita sa izdvojenom greškom — par web `use-query-state.ts` (K10). */
export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: Error };

/**
 * `useQuery` koji grešku servera vraća kao stanje umesto da je baci u render.
 * Panel zadatka živi u `Modal`-u: bačena greška bi srušila ceo ekran ispod
 * njega (`ErrorBoundary` rute), a panel mora sam da pokaže „Zadatak se ne može
 * učitati" ili „Zadatak više ne postoji". `'skip'` ostaje u učitavanju.
 *
 * Ključ je IME funkcije (`getFunctionName`), jer `api.x.y` je Proxy koji na
 * svaki pristup daje novu referencu — isti obrazac kao `useQueryTolerant`.
 */
export function useQueryState<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Query['_args'] | 'skip',
): QueryState<FunctionReturnType<Query>> {
  const argsKey = args === 'skip' ? 'skip' : JSON.stringify(args);
  const queryKey = getFunctionName(query);
  const queries = useMemo(() => {
    // Kast: generički `Query["_args"]` TS ne ume da poravna sa `Record<string,
    // Value>` iz `RequestForQueries`; runtime oblik je tačan (Convex validira).
    if (args === 'skip') return {} as RequestForQueries;
    return { value: { query, args } } as RequestForQueries;
    // `queryKey`/`argsKey` vrednosno pokrivaju `query`/`args`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, argsKey]);
  const result = useQueries(queries).value as FunctionReturnType<Query> | Error | undefined;
  if (result === undefined) return { status: 'loading' };
  if (result instanceof Error) return { status: 'error', error: result };
  return { status: 'ready', data: result };
}

/**
 * Greška pristupa (obrisan, arhiviran, tuđi startup) prikazuje se kao „ne
 * postoji"; sve ostalo kao greška sa „Pokušaj ponovo" (isto kao web
 * `isGoneError`). U produkciji Convex skriva poruku obične greške servera, pa
 * se tada ne razlikuje od prekida veze — stanje greške zato kaže oba slučaja.
 */
export function isGoneError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('nije pronađen') ||
    message.includes('pristup') ||
    message.includes('nije task') ||
    message.includes('nije zadatak')
  );
}
