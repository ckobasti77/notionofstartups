/**
 * Fixture podaci Inboxa za `dizajn-katalog.tsx` (K14, dev) — par web
 * `app/izlog/fixtures/inbox.ts`: obaveštenja iz 3 startupa + lične poruke i
 * stavke „Čeka tebe". Vreme se računa od `now` (katalog daje trenutni sat),
 * pa su grupe Danas / Juče / Ranije uvek popunjene.
 */
import type { InboxCounts, StartupMini } from '@devotion/shared';

import type { InboxItemModel, InboxPendingModel } from './inbox-view';

export const KATALOG_INBOX_STARTUPS: StartupMini[] = [
  { _id: 'katalog-cr', name: 'Cluck Rush', logoUrl: null },
  { _id: 'katalog-sh', name: 'Silly Handyman', logoUrl: null },
  { _id: 'katalog-bm', name: 'Beauty Masterclass', logoUrl: null },
];

const [CLUCK, SILLY, BEAUTY] = KATALOG_INBOX_STARTUPS;
const HOUR = 3_600_000;

const MILICA = { displayName: 'Milica Jovanović', avatarUrl: null };
const NIKOLA = { displayName: 'Nikola Petrović', avatarUrl: null };
const ANA = { displayName: 'Ana Ilić', avatarUrl: null };

/** Obaveštenja: 5 danas, 3 juče, 3 ranije; neka pročitana. */
export function katalogInboxItems(now: number): InboxItemModel[] {
  let counter = 0;
  const make = (
    startup: StartupMini | null,
    type: string,
    title: string,
    hoursAgo: number,
    partial: Partial<InboxItemModel> = {},
  ): InboxItemModel => {
    counter += 1;
    return {
      _id: `katalog-n-${counter}`,
      type,
      title,
      targetType: startup === null ? 'chat' : 'page',
      targetId: `katalog-t-${counter}`,
      readAt: null,
      createdAt: now - hoursAgo * HOUR,
      startupId: startup === null ? null : startup._id,
      startup,
      actor: null,
      ...partial,
    };
  };
  // Granica dana zavisi od sata u kome se katalog otvori, pa „juče" počinje 30 h
  // unazad (sigurno juče) i „ranije" 80 h unazad (sigurno ranije).
  const read = now - HOUR / 2;
  return [
    make(CLUCK, 'task_assigned', 'Milica Jovanović ti je dodelila „Landing za Q4“', 0.1, { actor: MILICA }),
    make(null, 'chat_dm', 'Nikola Petrović', 0.2, { actor: NIKOLA, body: 'Možeš li da pogledaš ugovor pre podne?' }),
    make(SILLY, 'task_due_today', 'Rok je danas: Ponuda za renoviranje kupatila', 0.3),
    make(BEAUTY, 'chat_mention', 'Ana Ilić te je pomenula u #predavači', 0.4, {
      actor: ANA,
      body: '@Jovan trebaju mi termini za novembar',
      targetType: 'chat',
    }),
    make(CLUCK, 'task_status_changed', 'Snimi reel za novi meni je završen', 0.5, { readAt: read }),
    make(SILLY, 'vote_requested', 'Ana Ilić traži tvoj glas: brisanje „Stari cenovnik“', 30, {
      actor: ANA,
      targetType: 'approvals',
      targetId: null,
    }),
    make(CLUCK, 'task_overdue', 'Kasni: Ugovor sa dobavljačem piletine', 31, { readAt: read }),
    make(BEAUTY, 'idea_voted', 'Nova ocena za ideju „Webinar o brendiranju“', 32, {
      readAt: read,
      targetType: 'ideas',
      targetId: null,
    }),
    make(null, 'chat_message', 'Dizajn tim', 80, { actor: NIKOLA, body: 'Poslao sam nove ikonice.', readAt: read }),
    make(CLUCK, 'puls_ready', 'Puls nedelje je spreman', 90, { readAt: read, targetType: 'puls', targetId: null }),
    make(SILLY, 'task_assigned', 'Milica Jovanović ti je dodelila „Raspored radnika“', 120, {
      actor: MILICA,
      readAt: read,
    }),
  ];
}

export function katalogInboxPending(now: number): InboxPendingModel[] {
  // PROSTOR P22: „Čeka tebe" su samo ideje na glasanju (stare vrste ne postoje).
  return [
    {
      kind: 'idea_vote',
      ideaId: 'katalog-i-1',
      title: 'Referral program',
      authorName: 'Ana Ilić',
      upvotes: 3,
      downvotes: 1,
      startup: SILLY,
      createdAt: now - 30 * HOUR,
      targetType: 'ideas',
      targetId: 'katalog-i-1',
    },
    {
      kind: 'idea_vote',
      ideaId: 'katalog-i-2',
      title: 'Novi onboarding za klijente',
      authorName: null,
      upvotes: 0,
      downvotes: 0,
      startup: BEAUTY,
      createdAt: now - 50 * HOUR,
      targetType: 'ideas',
      targetId: 'katalog-i-2',
    },
  ];
}

/** Brojači iz stavki, kao što ih računa `inbox.unreadCounts`. */
export function katalogInboxCounts(items: ReadonlyArray<InboxItemModel>): InboxCounts {
  const unread = items.filter((entry) => entry.readAt === null);
  return {
    total: { count: unread.length, capped: false },
    byStartup: KATALOG_INBOX_STARTUPS.map((startup) => ({
      startupId: startup._id,
      count: unread.filter((entry) => entry.startupId === startup._id).length,
      capped: false,
    })).filter((entry) => entry.count > 0),
    personal: { count: unread.filter((entry) => entry.startupId === null).length, capped: false },
  };
}
