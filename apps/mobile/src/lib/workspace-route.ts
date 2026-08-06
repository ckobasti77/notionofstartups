/**
 * „Nazad" kroz hijerarhiju Prostora — mobilni port `pageBackRoute` iz
 * `apps/web/components/workspace/workspace-route.ts`. Jedan nivo naviše:
 * roditeljska stranica ako je stavka ugnježdena, inače koren njene oblasti.
 *
 * Ogledalo: `apps/web/components/workspace/workspace-route.ts` (pageBackRoute).
 */
import type { Id } from '@/convex/_generated/dataModel';

export type WorkspaceBackTarget =
  | { kind: 'area'; areaId: Id<'startupAreas'> }
  | { kind: 'page'; pageId: Id<'pages'> };

export function pageBackRoute(page: {
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
}): WorkspaceBackTarget {
  return page.parentPageId === null
    ? { kind: 'area', areaId: page.areaId }
    : { kind: 'page', pageId: page.parentPageId };
}
