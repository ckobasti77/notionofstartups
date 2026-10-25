"use client";

import { useMemo } from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference, FunctionReturnType } from "convex/server";

export type QueryState<T> = { status: "loading" } | { status: "error"; error: Error } | { status: "ready"; data: T };

/**
 * Kao `useQueryTolerant`, ali razlikuje učitavanje od greške: blok desne
 * kolone dok se učitava pokazuje svoje učitavanje, a kad upit padne tiho se
 * skriva (plan K07 §1.2). Ključ je ime funkcije + argumenti (`api.x.y` je
 * Proxy koji na svaki pristup daje novu referencu).
 */
export function useQueryState<Query extends FunctionReference<"query">>(
  query: Query,
  /** `"skip"` = upit se ne šalje (stanje ostaje „učitavanje"). */
  args: Query["_args"] | "skip",
): QueryState<FunctionReturnType<Query>> {
  const argsKey = JSON.stringify(args);
  const queryKey = getFunctionName(query);
  const queries = useMemo(
    () => (args === "skip" ? {} : ({ value: { query, args } } as RequestForQueries)),
    // `queryKey`/`argsKey` vrednosno pokrivaju `query`/`args`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey, argsKey],
  );
  const result = useQueries(queries).value as FunctionReturnType<Query> | Error | undefined;
  if (result === undefined) return { status: "loading" };
  if (result instanceof Error) return { status: "error", error: result };
  return { status: "ready", data: result };
}
