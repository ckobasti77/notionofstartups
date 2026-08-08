"use client";

import { useParams } from "next/navigation";

import { CanvasEmbed, type CanvasKind } from "./canvas-embed";

const KINDS: readonly CanvasKind[] = ["thoughts", "ideas", "area", "page"];

/**
 * Embed ruta za kanvas (W4.2, `docs/mobile/00-PLAN.md` §5.2). Puni ekran, bez
 * sidebara i chrome-a (root layout obavija samo providere). Učitava se u mobilnom
 * `WebView`-u.
 *
 * Auth ne ide kroz URL ni kroz `postMessage` handshake: native injektuje token (i
 * inicijalnu temu) u `window.__DEVOTION_AUTH__` PRE učitavanja stranice, a `CanvasEmbed`
 * ga čita sinhrono na mount-u (§5.2, ZA-POPRAVKU Z2). Zato ovde nema `?theme=` ni
 * `useSearchParams` — pa ni `<Suspense>` (bio je potreban samo zbog `useSearchParams`).
 */
export default function EmbedCanvasPage() {
  const params = useParams<{ kind: string; id: string }>();
  const kind = params.kind;
  const id = params.id;

  if (!KINDS.includes(kind as CanvasKind)) {
    return <Splash label={`Nepoznata vrsta kanvasa: ${kind}`} />;
  }

  return <CanvasEmbed kind={kind as CanvasKind} id={id} />;
}

/** Trajno stanje (nepoznata vrsta kanvasa) — objavljeno kao `alert` čitaču ekrana. */
function Splash({ label }: { label: string }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 grid place-items-center bg-background px-6 text-center text-sm text-muted-foreground"
    >
      {label}
    </div>
  );
}
