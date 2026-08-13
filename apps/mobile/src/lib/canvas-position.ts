export type CanvasPoint = { x: number; y: number; complete: boolean };

/**
 * Apsolutna pozicija čvora = zbir sopstvene i svih roditeljskih (ideje i misli
 * ugnježdene čvorove čuvaju RELATIVNO). `complete: false` znači da lanac nije mogao
 * do kraja — roditelj nije u prosleđenoj listi (paginacija) — pa se rezultat NE
 * sme koristiti kao pozicija (vidi `ZA-POPRAVKU` Z5: pozicija se traži, ne pretpostavlja).
 *
 * Isti obrazac kao server (`packages/backend/convex/ideas.ts:148-164`, `absolutePosition`)
 * i web (`apps/web/components/workspace/ideas-canvas-view.tsx`, `absoluteIdeaPosition`).
 */
export function absoluteNodePosition<T extends { _id: string; x: number; y: number }>(
  nodes: readonly T[],
  id: string,
  parentOf: (node: T) => string | undefined,
): CanvasPoint {
  const byId = new Map(nodes.map((node) => [node._id, node]));
  let node = byId.get(id);
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  for (let depth = 0; node !== undefined && depth < 512; depth += 1) {
    if (seen.has(node._id)) break;
    seen.add(node._id);
    x += node.x;
    y += node.y;
    const parentId = parentOf(node);
    node = parentId === undefined ? undefined : byId.get(parentId);
  }
  if (!seen.has(id)) {
    return { x: 0, y: 0, complete: false };
  }
  const last = [...seen].pop();
  const lastNode = last === undefined ? undefined : byId.get(last);
  const chainEndsAtRoot = lastNode !== undefined && parentOf(lastNode) === undefined;
  return { x, y, complete: chainEndsAtRoot };
}
