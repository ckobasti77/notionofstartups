import { describe, expect, it } from "vitest";

import {
  isMeRoute,
  pageArchiveFallbackRoute,
  pageBackRoute,
  readAreasRouteCandidate,
  readWorkspaceLocation,
  readWorkspaceRouteCandidate,
  readWorkspaceStartupId,
  routeScope,
  workspaceRouteAfterStartupSwitch,
  withPageTab,
  workspaceRouteHref,
} from "./workspace-route";
import type { WorkspaceRoute } from "./types";

describe("workspace URL route contract", () => {
  it("reads Ideas and Thoughts as distinct routes, Home as the command center and bare URLs as Moj dan", () => {
    // P1 (LICNO K08): bez `view` se otvara lični Moj dan, ne komandni centar.
    expect(readWorkspaceRouteCandidate("")).toEqual({ kind: "me-today" });
    // PROSTOR P11 (K08): Početna i Komandni centar su spojeni.
    expect(readWorkspaceRouteCandidate("?view=home")).toEqual({
      kind: "today",
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
      route: { kind: "me-today" },
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

  it("gives the command center, Ideas and Thoughts unique history entries that survive Back and Forward", () => {
    const routes: WorkspaceRoute[] = [
      { kind: "today" },
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
      "/?invite=abc&view=today&startupId=startup-1#workspace",
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
      "today",
      "ideas",
      "thoughts",
    ]);
  });

  it("preserves per-startup screens across startup switches and falls back to the command center", () => {
    for (const route of [
      { kind: "ideas" },
      { kind: "thoughts" },
      { kind: "today" },
      { kind: "trash" },
      { kind: "trash", segment: "idea" },
      { kind: "tasks" },
      { kind: "tasks", filter: "moji" },
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

    expect(workspaceRouteAfterStartupSwitch({ kind: "activity" })).toEqual({
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

  describe("lični nivo Ja (P1, plan K01 §5)", () => {
    it("čita me-* prikaze; me-chat sa i bez channelId", () => {
      expect(readWorkspaceRouteCandidate("?view=me-today")).toEqual({ kind: "me-today" });
      expect(readWorkspaceRouteCandidate("?view=me-tasks")).toEqual({ kind: "me-tasks" });
      expect(readWorkspaceRouteCandidate("?view=me-inbox")).toEqual({ kind: "me-inbox" });
      expect(readWorkspaceRouteCandidate("?view=me-chat")).toEqual({ kind: "me-chat" });
      expect(readWorkspaceRouteCandidate("?view=me-chat&channelId=ch-1")).toEqual({
        kind: "me-chat",
        channelId: "ch-1",
      });
      expect(readWorkspaceRouteCandidate("?view=me-chat&channelId=%20")).toEqual({
        kind: "me-chat",
      });
      expect(readWorkspaceRouteCandidate("?view=me-nesto")).toBeNull();
    });

    it("razlikuje opseg: me-* je lični, sve ostalo startup", () => {
      for (const kind of ["me-today", "me-tasks", "me-inbox", "me-chat"] as const) {
        expect(isMeRoute({ kind })).toBe(true);
        expect(routeScope({ kind })).toBe("me");
      }
      for (const route of [
        { kind: "today" },
        { kind: "tasks" },
        { kind: "chat" },
        { kind: "trash" },
      ] satisfies WorkspaceRoute[]) {
        expect(isMeRoute(route)).toBe(false);
        expect(routeScope(route)).toBe("startup");
      }
    });

    it("me href nikad ne nosi startupId, ni kad je prosleđen", () => {
      expect(
        workspaceRouteHref(
          { kind: "me-today" },
          "https://example.test/?view=today&startupId=startup-1",
          "startup-1" as never,
        ),
      ).toBe("/?view=me-today");
      expect(
        workspaceRouteHref({ kind: "me-tasks" }, "https://example.test/?invite=abc#w"),
      ).toBe("/?invite=abc&view=me-tasks#w");
      expect(
        workspaceRouteHref(
          { kind: "me-chat", channelId: "ch-9" as never },
          "https://example.test/?view=chat&channelId=ch-1&startupId=startup-2",
          "startup-2" as never,
        ),
      ).toBe("/?view=me-chat&channelId=ch-9");
      expect(
        readWorkspaceLocation("?view=me-inbox"),
      ).toEqual({ route: { kind: "me-inbox" }, startupId: null, hasExplicitView: true });
    });

    it("stari linkovi sa startupId rade kao pre", () => {
      expect(readWorkspaceLocation("?view=today&startupId=startup-7")).toEqual({
        route: { kind: "today" },
        startupId: "startup-7",
        hasExplicitView: true,
      });
      expect(
        readWorkspaceLocation("?view=page&pageId=page-3&startupId=startup-7"),
      ).toEqual({
        route: { kind: "page", pageId: "page-3" },
        startupId: "startup-7",
        hasExplicitView: true,
      });
      expect(
        workspaceRouteHref(
          { kind: "today" },
          "https://example.test/?view=me-today",
          "startup-7" as never,
        ),
      ).toBe("/?view=today&startupId=startup-7");
    });

    it("startup → Ja → startup daje tri različita istorijska unosa", () => {
      const steps: Array<{ route: WorkspaceRoute; startupId?: string }> = [
        { route: { kind: "today" }, startupId: "startup-1" },
        { route: { kind: "me-today" }, startupId: "startup-1" },
        { route: { kind: "today" }, startupId: "startup-2" },
      ];
      const history = steps.reduce<string[]>((entries, step) => {
        const current = new URL(entries.at(-1) ?? "/", "https://example.test").href;
        return [
          ...entries,
          workspaceRouteHref(step.route, current, step.startupId as never),
        ];
      }, []);
      expect(history).toEqual([
        "/?view=today&startupId=startup-1",
        "/?view=me-today",
        "/?view=today&startupId=startup-2",
      ]);
      expect(new Set(history).size).toBe(3);
      expect(
        history.map(
          (href) => readWorkspaceLocation(new URL(href, "https://example.test").search).startupId,
        ),
      ).toEqual(["startup-1", null, "startup-2"]);
    });

    it("iz ličnog nivoa se u startup ulazi kroz Komandni centar", () => {
      for (const route of [
        { kind: "me-today" },
        { kind: "me-tasks" },
        { kind: "me-inbox" },
        { kind: "me-chat", channelId: "ch-1" as never },
      ] satisfies WorkspaceRoute[]) {
        expect(workspaceRouteAfterStartupSwitch(route)).toEqual({ kind: "today" });
      }
    });
  });
  describe("meni startupa (PROSTOR P11, K08)", () => {
    it("stari prikazi vode gde P11 kaže: home → Komandni centar, my-tasks → Zadaci (Moji), approvals → Korpa", () => {
      expect(readWorkspaceRouteCandidate("?view=home")).toEqual({ kind: "today" });
      expect(readWorkspaceRouteCandidate("?view=my-tasks")).toEqual({ kind: "tasks", filter: "moji" });
      expect(readWorkspaceRouteCandidate("?view=approvals")).toEqual({ kind: "trash" });
      // Service worker (`public/sw.js`) i stari linkovi nose i startup.
      expect(readWorkspaceLocation("?view=approvals&startupId=startup-3")).toEqual({
        route: { kind: "trash" },
        startupId: "startup-3",
        hasExplicitView: true,
      });
      expect(
        workspaceRouteHref(
          readWorkspaceRouteCandidate("?view=my-tasks") as WorkspaceRoute,
          "https://example.test/?view=my-tasks&startupId=startup-1",
          "startup-1" as never,
        ),
      ).toBe("/?view=tasks&filter=moji&startupId=startup-1");
    });

    it("Zadaci: podrazumevano Svi, filter Moji, osoba ima prednost; nepoznat filter = Svi", () => {
      expect(readWorkspaceRouteCandidate("?view=tasks")).toEqual({ kind: "tasks" });
      expect(readWorkspaceRouteCandidate("?view=tasks&filter=moji")).toEqual({ kind: "tasks", filter: "moji" });
      expect(readWorkspaceRouteCandidate("?view=tasks&filter=nesto")).toEqual({ kind: "tasks" });
      expect(readWorkspaceRouteCandidate("?view=tasks&osoba=profile-4&filter=moji")).toEqual({
        kind: "tasks",
        profileId: "profile-4",
      });
      expect(readWorkspaceRouteCandidate("?view=tasks&osoba=%20")).toEqual({ kind: "tasks" });
    });

    it("Korpa: segment iz `vrsta`, Stranice su podrazumevane i ne pišu se u URL", () => {
      expect(readWorkspaceRouteCandidate("?view=trash")).toEqual({ kind: "trash" });
      expect(readWorkspaceRouteCandidate("?view=trash&vrsta=recovered")).toEqual({ kind: "trash", segment: "recovered" });
      expect(readWorkspaceRouteCandidate("?view=trash&vrsta=nesto")).toEqual({ kind: "trash" });
      expect(
        workspaceRouteHref({ kind: "trash", segment: "page" }, "https://example.test/?view=today", "startup-1" as never),
      ).toBe("/?view=trash&startupId=startup-1");
    });

    it("nove rute se vraćaju iz URL-a, a prelaz na drugi prikaz briše njihove parametre", () => {
      for (const route of [
        { kind: "tasks" },
        { kind: "tasks", filter: "moji" },
        { kind: "tasks", profileId: "profile-4" as never },
        { kind: "trash", segment: "idea" },
        { kind: "trash", segment: "file" },
        { kind: "trash", segment: "recovered" },
      ] satisfies WorkspaceRoute[]) {
        const href = workspaceRouteHref(route, "https://example.test/?invite=abc#w", "startup-1" as never);
        expect(readWorkspaceRouteCandidate(new URL(href, "https://example.test").search)).toEqual(route);
      }
      expect(
        workspaceRouteHref(
          { kind: "ideas" },
          "https://example.test/?view=tasks&osoba=profile-4&filter=moji&vrsta=idea&startupId=startup-1",
          "startup-1" as never,
        ),
      ).toBe("/?view=ideas&startupId=startup-1");
    });

    it("promena startupa čuva Zadatke (bez osobe drugog startupa) i Korpu", () => {
      expect(workspaceRouteAfterStartupSwitch({ kind: "tasks", profileId: "profile-4" as never })).toEqual({ kind: "tasks" });
      expect(workspaceRouteAfterStartupSwitch({ kind: "tasks", filter: "moji" })).toEqual({ kind: "tasks", filter: "moji" });
      expect(workspaceRouteAfterStartupSwitch({ kind: "trash", segment: "file" })).toEqual({ kind: "trash", segment: "file" });
      expect(workspaceRouteAfterStartupSwitch({ kind: "puls" })).toEqual({ kind: "today" });
    });
  });

  describe("stranica kao dokument i Mapa stranice (PROSTOR P13, K10)", () => {
    it("tab=mapa otvara Mapu, nepoznata kartica i bez nje dokument", () => {
      expect(readWorkspaceRouteCandidate("?view=page&pageId=page-1&tab=mapa")).toEqual({ kind: "page", pageId: "page-1", tab: "mapa" });
      expect(readWorkspaceRouteCandidate("?view=page&pageId=page-1&tab=nesto")).toEqual({ kind: "page", pageId: "page-1" });
      expect(readWorkspaceRouteCandidate("?view=page&pageId=page-1")).toEqual({ kind: "page", pageId: "page-1" });
      expect(readAreasRouteCandidate("?view=page&pageId=page-1&tab=mapa")).toEqual({ kind: "page", pageId: "page-1", tab: "mapa" });
    });

    it("href nosi tab samo za Mapu, a svaki drugi prikaz ga briše", () => {
      const mapHref = workspaceRouteHref({ kind: "page", pageId: "page-1" as never, tab: "mapa" }, "https://example.test/", "startup-1" as never);
      expect(mapHref).toBe("/?view=page&pageId=page-1&tab=mapa&startupId=startup-1");
      expect(
        workspaceRouteHref({ kind: "page", pageId: "page-1" as never }, "https://example.test/?view=page&pageId=page-1&tab=mapa", "startup-1" as never),
      ).toBe("/?view=page&pageId=page-1&startupId=startup-1");
      expect(
        workspaceRouteHref({ kind: "trash" }, "https://example.test/?view=page&pageId=page-1&tab=mapa", "startup-1" as never),
      ).toBe("/?view=trash&startupId=startup-1");
    });

    it("razrešena ruta zadržava traženu Mapu samo za istu stranicu", () => {
      const candidate = { kind: "page", pageId: "page-1", tab: "mapa" } as const;
      expect(withPageTab({ kind: "page", pageId: "page-1" as never }, candidate)).toEqual({ kind: "page", pageId: "page-1", tab: "mapa" });
      expect(withPageTab({ kind: "area", areaId: "area-1" as never }, candidate)).toEqual({ kind: "area", areaId: "area-1" });
      expect(withPageTab({ kind: "page", pageId: "page-2" as never }, candidate)).toEqual({ kind: "page", pageId: "page-2" });
      expect(withPageTab(null, candidate)).toBeNull();
      expect(withPageTab({ kind: "page", pageId: "page-1" as never }, { kind: "page", pageId: "page-1" })).toEqual({ kind: "page", pageId: "page-1" });
    });
  });

  describe("oblast sa karticama (PROSTOR P12, K13)", () => {
    it("tab iz URL-a bira karticu; nepoznata ili bez nje ostavlja izbor oblasti", () => {
      for (const tab of ["pregled", "zadaci", "dokumenti", "mapa"] as const) {
        expect(readWorkspaceRouteCandidate(`?view=area&areaId=area-1&tab=${tab}`)).toEqual({ kind: "area", areaId: "area-1", tab });
      }
      expect(readWorkspaceRouteCandidate("?view=area&areaId=area-1&tab=nesto")).toEqual({ kind: "area", areaId: "area-1" });
      expect(readWorkspaceRouteCandidate("?view=area&areaId=area-1")).toEqual({ kind: "area", areaId: "area-1" });
      expect(readWorkspaceRouteCandidate("?view=area&tab=zadaci")).toBeNull();
      expect(readAreasRouteCandidate("?view=area&areaId=area-1&tab=dokumenti")).toEqual({ kind: "area", areaId: "area-1", tab: "dokumenti" });
      // Service worker (`public/sw.js`): komentar na opisu oblasti otvara Pregled.
      expect(readWorkspaceLocation("?startupId=startup-3&view=area&areaId=area-1&tab=pregled")).toEqual({
        route: { kind: "area", areaId: "area-1", tab: "pregled" },
        startupId: "startup-3",
        hasExplicitView: true,
      });
    });

    it("href nosi karticu oblasti, a prelaz na drugi prikaz je briše", () => {
      expect(
        workspaceRouteHref({ kind: "area", areaId: "area-1" as never, tab: "dokumenti" }, "https://example.test/", "startup-1" as never),
      ).toBe("/?view=area&areaId=area-1&tab=dokumenti&startupId=startup-1");
      expect(
        workspaceRouteHref({ kind: "area", areaId: "area-1" as never }, "https://example.test/?view=area&areaId=area-1&tab=mapa", "startup-1" as never),
      ).toBe("/?view=area&areaId=area-1&startupId=startup-1");
      expect(
        workspaceRouteHref({ kind: "page", pageId: "page-1" as never }, "https://example.test/?view=area&areaId=area-1&tab=zadaci", "startup-1" as never),
      ).toBe("/?view=page&pageId=page-1&startupId=startup-1");
    });

    it("razrešena oblast zadržava traženu karticu samo za istu oblast", () => {
      const candidate = { kind: "area", areaId: "area-1", tab: "dokumenti" } as const;
      expect(withPageTab({ kind: "area", areaId: "area-1" as never }, candidate)).toEqual({ kind: "area", areaId: "area-1", tab: "dokumenti" });
      expect(withPageTab({ kind: "area", areaId: "area-2" as never }, candidate)).toEqual({ kind: "area", areaId: "area-2" });
      expect(withPageTab({ kind: "area", areaId: "area-1" as never }, { kind: "area", areaId: "area-1" })).toEqual({ kind: "area", areaId: "area-1" });
    });

    it("promena startupa iz oblasti vodi na Komandni centar", () => {
      expect(workspaceRouteAfterStartupSwitch({ kind: "area", areaId: "area-1" as never, tab: "zadaci" })).toEqual({ kind: "today" });
    });
  });
});
