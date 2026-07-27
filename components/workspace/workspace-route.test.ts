import { describe, expect, it } from "vitest";

import {
  readAreasRouteCandidate,
  readWorkspaceStartupId,
  workspaceRouteHref,
} from "./workspace-route";

describe("Areas URL route contract", () => {
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

  it("reads the startup binding independently from untrusted route ids", () => {
    expect(readWorkspaceStartupId("?startupId=startup-2&view=area")).toBe(
      "startup-2",
    );
    expect(readWorkspaceStartupId("?startupId=%20")).toBeNull();
  });

  it("writes only the Areas route keys and preserves unrelated query state", () => {
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
      workspaceRouteHref(
        { kind: "home" },
        `https://example.test${pageHref}`,
      ),
    ).toBe("/?invite=abc#workspace");
  });
});
