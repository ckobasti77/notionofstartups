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
 * Convex `useQuery` baca serversku grešku upita TOKOM rendera. Bez granice pad
 * jedne stranice (npr. pokvaren `pages.get`) obara ceo workspace do korenskog
 * `app/error.tsx`. Granica zadržava ostatak shell-a živim i prikazuje pravu
 * poruku u mestu — sa tehničkim detaljem i „Pokušaj ponovo" (remount dece, čime
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
        className={`grid min-h-64 place-items-center rounded-2xl border border-dashed border-border/70 bg-card/60 px-5 py-8 ${this.props.className ?? ""}`}
      >
        <div className="w-full max-w-md text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">
            {this.props.title ?? "Greška na serveru"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {accessErrorMessage(error, "Server je prijavio grešku pri učitavanju ovog prikaza.")}
          </p>
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Tehnički detalji
            </summary>
            <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted/50 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
              {error.message}
            </pre>
          </details>
          <Button className="mt-5" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="size-4" />
            Pokušaj ponovo
          </Button>
        </div>
      </div>
    );
  }
}
