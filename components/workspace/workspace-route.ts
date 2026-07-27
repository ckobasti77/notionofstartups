import type { Id } from "@/convex/_generated/dataModel";

import type { WorkspaceRoute } from "./types";

export type AreasRouteCandidate =
  | { kind: "area"; areaId: string }
  | { kind: "page"; pageId: string };

export type StaticWorkspaceRoute = Exclude<
  WorkspaceRoute,
  { kind: "area" } | { kind: "page" }
>;

export type WorkspaceRouteCandidate =
  | StaticWorkspaceRoute
  | AreasRouteCandidate;

export type WorkspaceLocation = {
  route: WorkspaceRouteCandidate | null;
  startupId: string | null;
  hasExplicitView: boolean;
};

export function readWorkspaceStartupId(search: string) {
  return new URLSearchParams(search).get("startupId")?.trim() || null;
}

export function readWorkspaceRouteCandidate(
  search: string,
): WorkspaceRouteCandidate | null {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === null || view === "home") return { kind: "home" };
  if (view === "thoughts") return { kind: "thoughts" };
  if (view === "ideas") return { kind: "ideas" };
  if (view === "today") return { kind: "today" };
  if (view === "my-tasks") return { kind: "my-tasks" };
  if (view === "activity") return { kind: "activity" };
  if (view === "approvals") return { kind: "approvals" };
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

export function isAreasRouteCandidate(
  candidate: WorkspaceRouteCandidate,
): candidate is AreasRouteCandidate {
  return candidate.kind === "area" || candidate.kind === "page";
}

export function readAreasRouteCandidate(
  search: string,
): AreasRouteCandidate | null {
  const candidate = readWorkspaceRouteCandidate(search);
  return candidate && isAreasRouteCandidate(candidate) ? candidate : null;
}

export function readWorkspaceLocation(search: string): WorkspaceLocation {
  const params = new URLSearchParams(search);
  return {
    route: readWorkspaceRouteCandidate(search),
    startupId: params.get("startupId")?.trim() || null,
    hasExplicitView: params.has("view"),
  };
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
  url.searchParams.set("view", route.kind);

  if (route.kind === "area") {
    url.searchParams.set("areaId", route.areaId);
  } else if (route.kind === "page") {
    url.searchParams.set("pageId", route.pageId);
  }
  if (startupId) url.searchParams.set("startupId", startupId);

  return `${url.pathname}${url.search}${url.hash}`;
}

export function workspaceRouteAfterStartupSwitch(
  currentRoute: WorkspaceRoute,
): WorkspaceRoute {
  return currentRoute.kind === "home" ||
    currentRoute.kind === "ideas" ||
    currentRoute.kind === "thoughts"
    ? currentRoute
    : { kind: "home" };
}

export function pageArchiveFallbackRoute(page: {
  areaId: Id<"startupAreas">;
  parentPageId: Id<"pages"> | null;
}): WorkspaceRoute {
  return page.parentPageId === null
    ? { kind: "area", areaId: page.areaId }
    : { kind: "page", pageId: page.parentPageId };
}
