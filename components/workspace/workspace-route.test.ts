import { describe, expect, it } from "vitest";

import {
  pageArchiveFallbackRoute,
  pageBackRoute,
  readAreasRouteCandidate,
  readWorkspaceLocation,
  readWorkspaceRouteCandidate,
  readWorkspaceStartupId,
  workspaceRouteAfterStartupSwitch,
  workspaceRouteHref,
} from "./workspace-route";
import type { WorkspaceRoute } from "./types";

describe("workspace URL route contract", () => {
  it("reads Home, Ideas and Thoughts as distinct routes while bare URLs open the command center", () => {
    expect(readWorkspaceRouteCandidate("")).toEqual({ kind: "today" });
    expect(readWorkspaceRouteCandidate("?view=home")).toEqual({
      kind: "home",
    });
    expect(readWorkspaceRouteCandidate("?view=ideas")).toEqual({
      kind: "ideas",
    });
    expect(readWorkspaceRouteCandidate("?view=thoughts")).toEqual({
      kind: "thoughts",
    });
    expect(readWorkspaceRouteCandidate("?view=")).toBeNull();
    expect(readWorkspaceRouteCandidate("?view=unknown")).toBeNull();
  });

  it("reads valid area and page candidates without trusting their ids", () => {
    expect(readAreasRouteCandidate("?view=area&areaId=area-1")).toEqual({
      kind: "area",
      areaId: "area-1",
    });
    expect(readAreasRouteCandidate("?view=page&pageId=page-1")).toEqual({
      kind: "page",
      pageId: "page-1",
    });
  });

  it("rejects incomplete or unrelated candidates", () => {
    expect(readAreasRouteCandidate("?view=area")).toBeNull();
    expect(readAreasRouteCandidate("?view=page&pageId=%20")).toBeNull();
    expect(readAreasRouteCandidate("?view=ideas")).toBeNull();
  });

  it("reads route and startup binding as one history location", () => {
    expect(readWorkspaceStartupId("?startupId=startup-2&view=area")).toBe(
      "startup-2",
    );
    expect(readWorkspaceStartupId("?startupId=%20")).toBeNull();
    expect(
      readWorkspaceLocation("?startupId=startup-2&view=thoughts"),
    ).toEqual({
      route: { kind: "thoughts" },
      startupId: "startup-2",
      hasExplicitView: true,
    });
    expect(readWorkspaceLocation("?invite=abc")).toEqual({
      route: { kind: "today" },
      startupId: null,
      hasExplicitView: false,
    });
  });

  it("round-trips Area and Page routes while preserving unrelated query state", () => {
    const areaHref = workspaceRouteHref(
      { kind: "area", areaId: "area-1" as never },
      "https://example.test/?invite=abc#workspace",
      "startup-1" as never,
    );
    expect(areaHref).toBe(
      "/?invite=abc&view=area&areaId=area-1&startupId=startup-1#workspace",
    );

    const pageHref = workspaceRouteHref(
      { kind: "page", pageId: "page-1" as never },
      `https://example.test${areaHref}`,
      "startup-1" as never,
    );
    expect(pageHref).toBe(
      "/?invite=abc&view=page&pageId=page-1&startupId=startup-1#workspace",
    );

    expect(
      readWorkspaceRouteCandidate(new URL(pageHref, "https://example.test").search),
    ).toEqual({ kind: "page", pageId: "page-1" });
  });

  it("gives Home, Ideas and Thoughts unique history entries that survive Back and Forward", () => {
    const routes: WorkspaceRoute[] = [
      { kind: "home" },
      { kind: "ideas" },
      { kind: "thoughts" },
    ];
    const history = routes.reduce<string[]>((entries, route) => {
      const currentHref =
        entries.at(-1) ?? "https://example.test/?invite=abc#workspace";
      return [
        ...entries,
        workspaceRouteHref(
          route,
          new URL(currentHref, "https://example.test").href,
          "startup-1" as never,
        ),
      ];
    }, []);

    expect(history).toEqual([
      "/?invite=abc&view=home&startupId=startup-1#workspace",
      "/?invite=abc&view=ideas&startupId=startup-1#workspace",
      "/?invite=abc&view=thoughts&startupId=startup-1#workspace",
    ]);
    expect(new Set(history).size).toBe(3);

    const visitedKinds = [2, 1, 0, 1, 2].map((historyIndex) =>
      readWorkspaceLocation(
        new URL(history[historyIndex], "https://example.test").search,
      ).route?.kind,
    );
    expect(visitedKinds).toEqual([
      "thoughts",
      "ideas",
      "home",
      "ideas",
      "thoughts",
    ]);
  });

  it("preserves per-startup screens across startup switches and falls back to the command center", () => {
    for (const route of [
      { kind: "home" },
      { kind: "ideas" },
      { kind: "thoughts" },
      { kind: "today" },
    ] satisfies WorkspaceRoute[]) {
      const switchedRoute = workspaceRouteAfterStartupSwitch(route);
      const switchedHref = workspaceRouteHref(
        switchedRoute,
        "https://example.test/?view=home&startupId=startup-1",
        "startup-2" as never,
      );
      expect(
        readWorkspaceLocation(
          new URL(switchedHref, "https://example.test").search,
        ),
      ).toMatchObject({
        route,
        startupId: "startup-2",
      });
    }

    expect(workspaceRouteAfterStartupSwitch({ kind: "approvals" })).toEqual({
      kind: "today",
    });
    expect(
      workspaceRouteAfterStartupSwitch({
        kind: "page",
        pageId: "page-1" as never,
      }),
    ).toEqual({ kind: "today" });
  });

  it("falls back from an archived page to its parent canvas or Area root", () => {
    expect(
      pageArchiveFallbackRoute({
        areaId: "area-1" as never,
        parentPageId: "parent-1" as never,
      }),
    ).toEqual({ kind: "page", pageId: "parent-1" });
    expect(
      pageArchiveFallbackRoute({
        areaId: "area-1" as never,
        parentPageId: null,
      }),
    ).toEqual({ kind: "area", areaId: "area-1" });
  });

  it("vraća se za jedan nivo hijerarhije: na roditeljski oblačić ili koren oblasti", () => {
    expect(
      pageBackRoute({
        areaId: "area-1" as never,
        parentPageId: "parent-1" as never,
      }),
    ).toEqual({ kind: "page", pageId: "parent-1" });
    expect(
      pageBackRoute({
        areaId: "area-1" as never,
        parentPageId: null,
      }),
    ).toEqual({ kind: "area", areaId: "area-1" });
  });
});
