/**
 * Granice veličine kartice STRANICE na kanvasu — mobilni parnjak fajla
 * `apps/web/lib/canvas-node-size.ts`. Brojevi MORAJU biti isti u oba i moraju da
 * prate `packages/backend/convex/areasV2.ts:85–88` (`MIN_WIDTH`, `MIN_HEIGHT`,
 * `MAX_WIDTH`, `MAX_HEIGHT`); server je merodavan i sam klampuje u `resizePage`.
 *
 * Zašto kopija, a ne uvoz: kanvas na telefonu je WebView nad web embedom, pa ručke
 * čita web modul, a native sheet („±10%", „Vrati podrazumevanu") ovaj. Mobilni ne sme
 * da uvozi iz `apps/web` (drugi paket, drugi bundler), a backend konstante nisu
 * izvezene — uvoz `areasV2.ts` bi u Metro bundle uvukao ceo serverski modul.
 * Sinhronizaciju čuva test T7 iz `docs/mobile/lanac4/planovi/faza-k2.md`.
 */
export const PAGE_NODE_SIZE = {
  minWidth: 240,
  minHeight: 168,
  maxWidth: 720,
  maxHeight: 1_000,
  /** `canvasPlacement.ts:4–5` — vrednost na koju vraća `areasV2.resetPageSize`. */
  defaultWidth: 288,
  defaultHeight: 196,
} as const;

/** Klamp u dozvoljen opseg — da se ne šalje poziv koji bi server ionako odsekao. */
export function clampPageNodeSize(width: number, height: number): {
  width: number;
  height: number;
} {
  return {
    width: Math.round(
      Math.min(PAGE_NODE_SIZE.maxWidth, Math.max(PAGE_NODE_SIZE.minWidth, width)),
    ),
    height: Math.round(
      Math.min(PAGE_NODE_SIZE.maxHeight, Math.max(PAGE_NODE_SIZE.minHeight, height)),
    ),
  };
}
