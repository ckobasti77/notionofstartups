/**
 * Fixture podaci Inboxa (K14): obaveštenja iz 3 startupa + lične poruke i
 * stavke „Čeka tebe". Vreme je vezano za `IZLOG_NOW` (24.10.2026. 09:30), pa su
 * grupe Danas / Juče / Ranije iste na svakom snimku. Nikad ne idu na server.
 */
import type { InboxCounts, StartupMini } from "@devotion/shared";

import type { InboxItemModel, InboxPendingModel } from "@/components/me/inbox/inbox-view";

import { fakeId } from "./ids";
import { IZLOG_NOW } from "./now";
import { IZLOG_STARTUPS } from "./me";

const mini = (index: number): StartupMini => ({
  _id: IZLOG_STARTUPS[index]._id,
  name: IZLOG_STARTUPS[index].name,
  logoUrl: null,
});

export const IZLOG_INBOX_STARTUPS: StartupMini[] = [mini(0), mini(1), mini(2)];

const [CLUCK, SILLY, BEAUTY] = IZLOG_INBOX_STARTUPS;

const HOUR = 3_600_000;
/** Pre `hours` sati u odnosu na fiksni sat izloga. */
const ago = (hours: number) => IZLOG_NOW - hours * HOUR;

const MILICA = { displayName: "Milica Jovanović", avatarUrl: null };
const NIKOLA = { displayName: "Nikola Petrović", avatarUrl: null };
const ANA = { displayName: "Ana Ilić", avatarUrl: null };

let counter = 0;
function item(
  startup: StartupMini | null,
  type: string,
  title: string,
  hoursAgo: number,
  partial: Partial<InboxItemModel> = {},
): InboxItemModel {
  counter += 1;
  return {
    _id: fakeId("notifications", counter),
    type,
    title,
    targetType: startup === null ? "chat" : "page",
    targetId: startup === null ? fakeId("chatChannels", counter) : fakeId("pages", counter),
    readAt: null,
    createdAt: ago(hoursAgo),
    startupId: startup === null ? null : startup._id,
    startup,
    actor: null,
    ...partial,
  };
}

/** Pročitano pre sat vremena (stavka je starija od toga). */
const READ = ago(1);

export const IZLOG_INBOX_ITEMS: InboxItemModel[] = [
  // Danas
  item(CLUCK, "task_assigned", "Milica Jovanović ti je dodelila „Landing za Q4“", 0.3, { actor: MILICA }),
  item(null, "chat_dm", "Nikola Petrović", 0.8, { actor: NIKOLA, body: "Možeš li da pogledaš ugovor pre podne?" }),
  item(SILLY, "task_due_today", "Rok je danas: Ponuda za renoviranje kupatila", 1.5, { targetType: "page" }),
  item(BEAUTY, "chat_mention", "Ana Ilić te je pomenula u #predavači", 2, {
    actor: ANA,
    body: "@Jovan trebaju mi termini za novembar",
    targetType: "chat",
  }),
  item(CLUCK, "task_status_changed", "Snimi reel za novi meni je završen", 3, { readAt: READ }),
  // Juče
  item(SILLY, "vote_requested", "Ana Ilić traži tvoj glas: brisanje „Stari cenovnik“", 15, {
    actor: ANA,
    targetType: "approvals",
    targetId: null,
  }),
  item(CLUCK, "task_overdue", "Kasni: Ugovor sa dobavljačem piletine", 19, { readAt: READ }),
  item(BEAUTY, "idea_voted", "Nova ocena za ideju „Webinar o brendiranju“", 21, { readAt: READ, targetType: "ideas", targetId: null }),
  // Ranije
  item(null, "chat_message", "Dizajn tim", 74, { actor: NIKOLA, body: "Poslao sam nove ikonice.", readAt: READ }),
  item(CLUCK, "puls_ready", "Puls nedelje je spreman", 80, { readAt: READ, targetType: "puls", targetId: "1760918400000" }),
  item(SILLY, "task_assigned", "Milica Jovanović ti je dodelila „Raspored radnika“", 120, { actor: MILICA, readAt: READ }),
];

export const IZLOG_INBOX_PENDING: InboxPendingModel[] = [
  {
    kind: "deletion_vote",
    ballotId: "ballot_0001",
    title: "Stari cenovnik",
    startup: SILLY,
    createdAt: ago(15),
    targetType: "approvals",
    targetId: fakeId("pages", 900),
  },
  {
    kind: "page_nesting",
    requestId: "request_0001",
    childTitle: "Brošura",
    parentTitle: "Kampanja Q4",
    requesterName: "Milica Jovanović",
    startup: BEAUTY,
    createdAt: ago(27),
    targetType: "approvals",
    targetId: fakeId("pages", 901),
  },
];

/** Brojači iz stavki, kao što ih računa `inbox.unreadCounts`. */
export function izlogInboxCounts(items: ReadonlyArray<InboxItemModel>): InboxCounts {
  const unread = items.filter((entry) => entry.readAt === null);
  const byStartup = IZLOG_INBOX_STARTUPS.map((startup) => ({
    startupId: startup._id as string,
    count: unread.filter((entry) => entry.startupId === startup._id).length,
    capped: false,
  })).filter((entry) => entry.count > 0);
  const personal = unread.filter((entry) => entry.startupId === null).length;
  return {
    total: { count: unread.length, capped: false },
    byStartup,
    personal: { count: personal, capped: false },
  };
}
