import { useQueries, type RequestForQueries } from 'convex/react';
import { getFunctionName, type FunctionReference, type FunctionReturnType } from 'convex/server';
import { useMemo } from 'react';

/**
 * `useQuery` koji serversku grešku PRATEĆEG upita vraća kao `undefined` umesto
 * da baci i sruši ceo render — par web `useQueryTolerant`
 * (`workspace-error-boundary.tsx`). Za bedževe tab bara: pad brojača ne sme da
 * obori navigaciju, bedž se samo ne prikaže (plan K01 §6).
 *
 * `queries` objekat MORA biti memoizovan po sadržaju: `useQueries` na novu
 * referencu pravi novu pretplatu. `api.x.y` je Proxy koji na svaki pristup daje
 * novu referencu — zato je ključ IME funkcije (`getFunctionName`).
 */
export function useQueryTolerant<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Query['_args'] | 'skip',
): FunctionReturnType<Query> | undefined {
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
  return result instanceof Error ? undefined : result;
}
