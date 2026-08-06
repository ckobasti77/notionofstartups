"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CanvasEmbed, type CanvasKind } from "./canvas-embed";

const KINDS: readonly CanvasKind[] = ["thoughts", "ideas", "area", "page"];

/**
 * Embed ruta za kanvas (W4.2, `docs/mobile/00-PLAN.md` §5.2). Puni ekran, bez
 * sidebara i chrome-a (root layout obavija samo providere). Učitava se u
 * mobilnom `WebView`-u sa `?token=<convex_jwt>&theme=<light|dark>`.
 *
 * `useSearchParams` mora unutar `<Suspense>` da build ne pukne na prerenderu.
 */
export default function EmbedCanvasPage() {
  return (
    <Suspense fallback={<Splash label="Učitavanje…" />}>
      <EmbedResolver />
    </Suspense>
  );
}

function EmbedResolver() {
  const params = useParams<{ kind: string; id: string }>();
  const search = useSearchParams();

  const kind = params.kind;
  const id = params.id;
  const token = search.get("token") ?? "";
  const theme = search.get("theme") === "dark" ? "dark" : "light";

  if (!KINDS.includes(kind as CanvasKind)) {
    return <Splash label={`Nepoznata vrsta kanvasa: ${kind}`} />;
  }
  if (!token) {
    return <Splash label="Nedostaje token za pristup kanvasu." />;
  }

  return <CanvasEmbed kind={kind as CanvasKind} id={id} token={token} theme={theme} />;
}

function Splash({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background px-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
