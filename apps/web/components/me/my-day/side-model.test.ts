import { describe, expect, test } from "vitest";

import { blockCount, chatSummary, pendingSummary, pendingTitle } from "./side-model";

const CR = { _id: "s1", name: "Cluck Rush", logoUrl: null };
const SM = { _id: "s2", name: "Scan Me", logoUrl: null };

describe("desna kolona Moj dan", () => {
  test("poruke: lično i startupi sa imenima; nula i startup van opsega se preskaču", () => {
    expect(
      chatSummary(
        {
          total: { unreadCount: 6 },
          personal: { unreadCount: 3 },
          byStartup: [
            { startupId: "s1", unreadCount: 2 },
            { startupId: "s2", unreadCount: 0 },
            { startupId: "tuđ", unreadCount: 1 },
          ],
        },
        [CR, SM],
      ),
    ).toEqual({ total: 6, personal: 3, byStartup: [{ startup: CR, unread: 2 }] });
  });

  test("„Čeka tebe“: tekst po vrsti, ključ po izvoru", () => {
    expect(pendingTitle({ kind: "deletion_vote", ballotId: "b1", title: "Stari logo", startup: SM })).toBe(
      "Glasanje o brisanju: „Stari logo“",
    );
    const nesting = {
      kind: "page_nesting" as const,
      requestId: "r1",
      childTitle: "Cenovnik",
      parentTitle: "Prodaja",
      requesterName: "Ana Ilić",
      startup: CR,
    };
    expect(pendingTitle(nesting)).toBe("Ana Ilić predlaže da „Cenovnik“ pređe pod „Prodaja“");
    expect(pendingTitle({ ...nesting, kind: "idea_nesting", requesterName: null })).toBe(
      "Neko predlaže da „Cenovnik“ pređe pod „Prodaja“",
    );
    expect(
      pendingSummary({
        items: [{ kind: "deletion_vote", ballotId: "b1", title: "Stari logo", startup: SM }, nesting],
        truncated: true,
      }),
    ).toEqual({
      items: [
        { key: "vote:b1", title: "Glasanje o brisanju: „Stari logo“", startup: SM },
        { key: "page_nesting:r1", title: "Ana Ilić predlaže da „Cenovnik“ pređe pod „Prodaja“", startup: CR },
      ],
      truncated: true,
    });
  });

  test("broj za sažeti čip samo kad je blok spreman", () => {
    expect(blockCount({ status: "ready", data: { n: 4 } }, (data) => data.n)).toBe(4);
    expect(blockCount<{ n: number }>({ status: "loading" }, (data) => data.n)).toBeNull();
    expect(blockCount<{ n: number }>({ status: "hidden" }, (data) => data.n)).toBeNull();
  });
});
