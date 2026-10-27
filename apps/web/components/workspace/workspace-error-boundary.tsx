"use client";

import { Component, useMemo, type ReactNode } from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { accessErrorMessage } from "@/lib/errors";

/**
 * `useQuery` koji serversku grešku PRATEĆEG upita vraća kao `undefined` umesto
 * da baci i sruši ceo render (npr. footer detalj-dijaloga u shell-u — glavni
 * prikaz istu grešku svejedno hvata kroz [WorkspaceErrorBoundary]). Ide preko
 * `useQueries`, koje grešku vraća kao vrednost, pa nema bacanja ni try/catch
 * oko hook-a.
 *
 * `queries` objekat MORA biti memoizovan po sadržaju: `useQueries` na novu
 * referencu pravi novu pretplatu, a nov objekat na svaki render pravi
 * beskonačnu petlju („Too many re-renders" — uhvaćeno pri proveri lanca 7).
 */
export function useQueryTolerant<Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"] | "skip",
): FunctionReturnType<Query> | undefined {
  const argsKey = args === "skip" ? "skip" : JSON.stringify(args);
  // `api.x.y` je Proxy koji na SVAKI pristup daje novu referencu — zato je ključ
  // IME funkcije (`getFunctionName`), a ne identitet objekta.
  const queryKey = getFunctionName(query);
  const queries = useMemo(() => {
    // Kast: generički `Query["_args"]` TS ne ume da poravna sa `Record<string,
    // Value>` iz `RequestForQueries`, a runtime oblik je tačan (convex validira).
    if (args === "skip") return {} as RequestForQueries;
    return { value: { query, args } } as RequestForQueries;
    // `queryKey`/`argsKey` vrednosno pokrivaju `query`/`args`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, argsKey]);
  const result = useQueries(queries).value as
    | FunctionReturnType<Query>
    | Error
    | undefined;
  return result instanceof Error ? undefined : result;
}

/**
 * Isto kao `useQueryTolerant`, ali greška ostaje vidljiva pozivaocu (blok može
 * da prikaže „… nije učitano." umesto večitog učitavanja). PROSTOR K10.
 */
export function useQueryResult<Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"] | "skip",
): { data: FunctionReturnType<Query> | undefined; failed: boolean } {
  const argsKey = args === "skip" ? "skip" : JSON.stringify(args);
  const queryKey = getFunctionName(query);
  const queries = useMemo(() => {
    if (args === "skip") return {} as RequestForQueries;
    return { value: { query, args } } as RequestForQueries;
    // `queryKey`/`argsKey` vrednosno pokrivaju `query`/`args` (vidi `useQueryTolerant`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, argsKey]);
  const result = useQueries(queries).value as FunctionReturnType<Query> | Error | undefined;
  return result instanceof Error
    ? { data: undefined, failed: true }
    : { data: result, failed: false };
}

/**
 * Convex `useQuery` baca serversku grešku upita TOKOM rendera. Bez granice pad
 * jedne stranice (npr. pokvaren `pages.get`) obara ceo workspace do korenskog
 * `app/error.tsx`. Granica zadržava ostatak shell-a živim i prikazuje pravu
 * poruku u mestu (nikad sirov `error.message`) i „Pokušaj ponovo" (remount dece, čime
 * se Convex pretplata pravi iznova). Obrazac: `SearchResultsBoundary`.
 */
export class WorkspaceErrorBoundary extends Component<
  { children: ReactNode; title?: string; className?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div
        role="alert"
        className={`grid min-h-40 place-items-center rounded-xl border border-dashed border-border px-5 py-8 ${this.props.className ?? ""}`}
      >
        <div className="w-full max-w-md text-center">
          <TriangleAlert className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold">{this.props.title ?? "Prikaz nije učitan."}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {accessErrorMessage(error, "Pokušaj ponovo za nekoliko trenutaka.")}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="size-4" />
            Pokušaj ponovo
          </Button>
        </div>
      </div>
    );
  }
}
