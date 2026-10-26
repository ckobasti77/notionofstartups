import type { Id } from "@/convex/_generated/dataModel";

import type { MeRoute, PageTab, TrashSegment, WorkspaceRoute, WorkspaceScope } from "./types";

/** Prikazi ličnog nivoa „Ja" (P1). */
export const ME_ROUTE_KINDS = [
  "me-today",
  "me-tasks",
  "me-inbox",
  "me-chat",
] as const satisfies ReadonlyArray<MeRoute["kind"]>;

export function isMeRoute(route: { kind: string }): route is MeRoute {
  return (ME_ROUTE_KINDS as ReadonlyArray<string>).includes(route.kind);
}

export function routeScope(route: WorkspaceRoute): WorkspaceScope {
  return isMeRoute(route) ? "me" : "startup";
}

export type AreasRouteCandidate =
  | { kind: "area"; areaId: string }
  | { kind: "page"; pageId: string; tab?: PageTab };

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
  // Bez izričitog prikaza otvara se Moj dan (O1, P1): prvi ekran odgovara na
  // „šta me danas čeka" kroz sve startupe, a ne na pozdrav.
  if (view === null) return { kind: "me-today" };
  if (view === "me-today") return { kind: "me-today" };
  if (view === "me-tasks") return { kind: "me-tasks" };
  if (view === "me-inbox") return { kind: "me-inbox" };
  if (view === "me-chat") {
    const channelId = params.get("channelId")?.trim();
    return channelId
      ? { kind: "me-chat", channelId: channelId as Id<"chatChannels"> }
      : { kind: "me-chat" };
  }
  // PROSTOR P11 (K08): stari prikazi žive samo kao preusmerenja — linkovi,
  // obaveštenja i service worker (`public/sw.js`) i dalje šalju ova imena.
  if (view === "home") return { kind: "today" };
  if (view === "my-tasks") return { kind: "tasks", filter: "moji" };
  if (view === "approvals") return { kind: "trash" };
  if (view === "thoughts") return { kind: "thoughts" };
  if (view === "ideas") return { kind: "ideas" };
  if (view === "today") return { kind: "today" };
  if (view === "activity") return { kind: "activity" };
  if (view === "tasks") {
    // `osoba` ima prednost nad `filter`; nepoznat filter = „Svi".
    const profileId = params.get("osoba")?.trim();
    if (profileId) return { kind: "tasks", profileId: profileId as Id<"profiles"> };
    return params.get("filter") === "moji" ? { kind: "tasks", filter: "moji" } : { kind: "tasks" };
  }
  if (view === "trash") {
    const segment = params.get("vrsta");
    return isTrashSegment(segment) ? { kind: "trash", segment } : { kind: "trash" };
  }
  if (view === "chat") {
    // `channelId` je opcion — bez njega chat se otvara na listi razgovora.
    // Nevalidan id prikaz gracefully svede na listu (kao `puls` sa `week`).
    const channelId = params.get("channelId")?.trim();
    return channelId
      ? { kind: "chat", channelId: channelId as Id<"chatChannels"> }
      : { kind: "chat" };
  }
  if (view === "puls") {
    // `week` nosi bilo koji trenutak iz željene nedelje; prikaz ga normalizuje
    // na svoj lokalni ponedeljak.
    const week = Number(params.get("week"));
    return Number.isFinite(week) && week > 0
      ? { kind: "puls", weekStart: week }
      : { kind: "puls" };
  }
  if (view === "area") {
    const areaId = params.get("areaId")?.trim();
    return areaId ? { kind: "area", areaId } : null;
  }
  if (view === "page") {
    const pageId = params.get("pageId")?.trim();
    if (!pageId) return null;
    // Nepoznata kartica = dokument (K07 E13).
    return params.get("tab") === "mapa" ? { kind: "page", pageId, tab: "mapa" } : { kind: "page", pageId };
  }
  return null;
}

const TRASH_SEGMENT_KEYS: ReadonlyArray<TrashSegment> = ["page", "idea", "file", "recovered"];

function isTrashSegment(value: string | null): value is TrashSegment {
  return value !== null && (TRASH_SEGMENT_KEYS as ReadonlyArray<string>).includes(value);
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
  url.searchParams.delete("channelId");
  url.searchParams.delete("week");
  url.searchParams.delete("filter");
  url.searchParams.delete("osoba");
  url.searchParams.delete("vrsta");
  url.searchParams.delete("tab");
  url.searchParams.delete("startupId");
  url.searchParams.set("view", route.kind);

  if (route.kind === "area") {
    url.searchParams.set("areaId", route.areaId);
  } else if (route.kind === "page") {
    url.searchParams.set("pageId", route.pageId);
    if (route.tab) url.searchParams.set("tab", route.tab);
  } else if (
    (route.kind === "chat" || route.kind === "me-chat") &&
    route.channelId
  ) {
    url.searchParams.set("channelId", route.channelId);
  } else if (route.kind === "puls" && route.weekStart !== undefined) {
    url.searchParams.set("week", String(route.weekStart));
  } else if (route.kind === "tasks") {
    if (route.profileId) url.searchParams.set("osoba", route.profileId);
    else if (route.filter === "moji") url.searchParams.set("filter", "moji");
  } else if (route.kind === "trash" && route.segment && route.segment !== "page") {
    url.searchParams.set("vrsta", route.segment);
  }
  // Lični nivo ne pripada startupu: `startupId` se ne upisuje ni kad je
  // prosleđen (startup „u pozadini" se drži u memoriji ljuske, D10).
  if (startupId && !isMeRoute(route)) {
    url.searchParams.set("startupId", startupId);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Razrešena ruta stranice zadržava traženu karticu (`tab=mapa`): `areasV2.resolveRoute`
 * vraća samo id, a obaveštenja i linkovi vode i na Mapu.
 */
export function withPageTab(
  resolved: WorkspaceRoute | null,
  candidate: WorkspaceRouteCandidate,
): WorkspaceRoute | null {
  if (resolved?.kind !== "page" || candidate.kind !== "page" || !candidate.tab) return resolved;
  return resolved.pageId === candidate.pageId ? { ...resolved, tab: candidate.tab } : resolved;
}

export function workspaceRouteAfterStartupSwitch(
  currentRoute: WorkspaceRoute,
): WorkspaceRoute {
  // Iz ličnog nivoa se u startup ulazi kroz Komandni centar.
  if (isMeRoute(currentRoute)) return { kind: "today" };
  // Kanali su per-startup: ostani u chatu, ali otpusti izabrani kanal.
  if (currentRoute.kind === "chat") return { kind: "chat" };
  // Član drugog startupa nije član ovog: filter osobe se ne prenosi.
  if (currentRoute.kind === "tasks") {
    return currentRoute.filter === "moji" ? { kind: "tasks", filter: "moji" } : { kind: "tasks" };
  }
  return currentRoute.kind === "ideas" ||
    currentRoute.kind === "thoughts" ||
    currentRoute.kind === "today" ||
    currentRoute.kind === "trash"
    ? currentRoute
    : { kind: "today" };
}

export function pageArchiveFallbackRoute(page: {
  areaId: Id<"startupAreas">;
  parentPageId: Id<"pages"> | null;
}): WorkspaceRoute {
  return page.parentPageId === null
    ? { kind: "area", areaId: page.areaId }
    : { kind: "page", pageId: page.parentPageId };
}

/**
 * „Nazad” kroz hijerarhiju oblačića: jedan nivo naviše — roditeljski oblačić
 * ako je stavka ugnežđena, inače koren njene oblasti. Ista putanja kao
 * pageArchiveFallbackRoute, ali pod svojim imenom da izmena jedne semantike
 * ne povuče drugu.
 */
export function pageBackRoute(page: {
  areaId: Id<"startupAreas">;
  parentPageId: Id<"pages"> | null;
}): WorkspaceRoute {
  return pageArchiveFallbackRoute(page);
}
