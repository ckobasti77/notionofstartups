import type { Id } from "@/convex/_generated/dataModel";

import type { WorkspaceRoute } from "./types";

export type AreasRouteCandidate =
  | { kind: "area"; areaId: string }
  | { kind: "page"; pageId: string };

export function readWorkspaceStartupId(search: string) {
  return new URLSearchParams(search).get("startupId")?.trim() || null;
}

export function readAreasRouteCandidate(search: string): AreasRouteCandidate | null {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === "area") {
    const areaId = params.get("areaId")?.trim();
    return areaId ? { kind: "area", areaId } : null;
  }
  if (view === "page") {
    const pageId = params.get("pageId")?.trim();
    return pageId ? { kind: "page", pageId } : null;
  }
  return null;
}

export function resolvedAreasRoute(
  value:
    | { kind: "area"; areaId: Id<"startupAreas"> }
    | { kind: "page"; pageId: Id<"pages">; areaId: Id<"startupAreas"> }
    | null
    | undefined,
): WorkspaceRoute | null {
  if (!value) return null;
  return value.kind === "page"
    ? { kind: "page", pageId: value.pageId }
    : { kind: "area", areaId: value.areaId };
}

export function workspaceRouteHref(
  route: WorkspaceRoute,
  currentHref: string,
  startupId?: Id<"startups">,
): string {
  const url = new URL(currentHref);
  url.searchParams.delete("view");
  url.searchParams.delete("areaId");
  url.searchParams.delete("pageId");
  url.searchParams.delete("startupId");

  if (route.kind === "area") {
    url.searchParams.set("view", "area");
    url.searchParams.set("areaId", route.areaId);
    if (startupId) url.searchParams.set("startupId", startupId);
  } else if (route.kind === "page") {
    url.searchParams.set("view", "page");
    url.searchParams.set("pageId", route.pageId);
    if (startupId) url.searchParams.set("startupId", startupId);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
