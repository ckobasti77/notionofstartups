import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IzlogShell } from "./izlog-shell";
import { resolveIzlogParams, type IzlogSearchParams } from "./params";

export const metadata: Metadata = {
  title: "Izlog",
  robots: { index: false, follow: false },
};

/**
 * Izlog prezentacionih komponenti sa fixture podacima — za snimke ekrana iza
 * prijave (PLAN P13). Samo u razvoju: u produkciji je ruta 404.
 */
export default async function IzlogPage({
  searchParams,
}: {
  searchParams: Promise<IzlogSearchParams>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { ekran, tema, varijanta } = resolveIzlogParams(await searchParams);
  return <IzlogShell ekran={ekran} tema={tema} varijanta={varijanta} />;
}
