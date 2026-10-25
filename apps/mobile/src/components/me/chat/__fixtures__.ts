/**
 * Fixture podaci Poruka za `dizajn-katalog.tsx` (K16, dev) — par web
 * `app/izlog/fixtures/chat.ts`: lični DM i grupe, kanali dva startupa, ljudi
 * za „Nova poruka" / „Nova grupa". Vreme se računa od `now` (katalog daje
 * trenutni sat), pa vreme u redovima uvek ima smisla.
 */
import type { HubChannel, HubInput, StartupMini } from '@devotion/shared';

import type { HubPersonModel } from './people-sheets';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const KATALOG_CHAT_ME = 'katalog-p-jovan';

const MILICA = { _id: 'katalog-p-milica', displayName: 'Milica Jovanović', avatarUrl: null };
const NIKOLA = { _id: 'katalog-p-nikola', displayName: 'Nikola Petrović', avatarUrl: null };
const ANA = { _id: 'katalog-p-ana', displayName: 'Ana Ilić', avatarUrl: null };
const JOVAN = { _id: KATALOG_CHAT_ME, displayName: 'Jovan Milojević', avatarUrl: null };

const CLUCK: StartupMini = { _id: 'katalog-cr', name: 'Cluck Rush', logoUrl: null };
const BEAUTY: StartupMini = { _id: 'katalog-bm', name: 'Beauty Masterclass', logoUrl: null };

function channel(over: Partial<HubChannel> & Pick<HubChannel, '_id'>): HubChannel {
  return {
    kind: 'custom',
    name: '',
    startupId: null,
    lastMessageAt: 0,
    lastMessagePreview: '',
    lastMessageAuthor: null,
    unreadCount: 0,
    mentionCount: 0,
    notificationLevel: 'all',
    otherParticipant: null,
    ...over,
  };
}

/** Tri reda za sekciju „Red razgovora": lični DM, lična grupa, kanal startupa. */
export function katalogHubRows(now: number): HubChannel[] {
  return [
    channel({
      _id: 'katalog-c-dm',
      kind: 'dm',
      otherParticipant: MILICA,
      lastMessageAt: now - 12 * MINUTE,
      lastMessagePreview: 'Šaljem ti ponudu do podne.',
      lastMessageAuthor: MILICA,
      unreadCount: 2,
    }),
    channel({
      _id: 'katalog-c-grupa',
      name: 'Vikend plan',
      lastMessageAt: now - 26 * HOUR,
      lastMessagePreview: 'važi, vidimo se u subotu',
      lastMessageAuthor: JOVAN,
    }),
    channel({
      _id: 'katalog-c-mkt',
      kind: 'area',
      name: 'Marketing',
      startupId: CLUCK._id,
      lastMessageAt: now - 3 * HOUR,
      lastMessagePreview: '@Jovan pogledaj novu kampanju',
      lastMessageAuthor: NIKOLA,
      unreadCount: 4,
      mentionCount: 1,
    }),
  ];
}

/** Ceo hub: lično + dva startupa (jedan sa utišanim kanalom). */
export function katalogHubInput(now: number): HubInput & { capped: boolean } {
  const [dm, grupa, mkt] = katalogHubRows(now);
  return {
    personal: [
      dm,
      grupa,
      channel({
        _id: 'katalog-c-dm-ana',
        kind: 'dm',
        otherParticipant: ANA,
        lastMessageAt: now - 4 * 24 * HOUR,
        lastMessagePreview: 'Hvala!',
        lastMessageAuthor: ANA,
      }),
    ],
    startups: [
      {
        startup: CLUCK,
        unreadCount: 7,
        mentionCount: 1,
        channels: [
          channel({
            _id: 'katalog-c-opste',
            kind: 'startup',
            name: 'Opšte',
            startupId: CLUCK._id,
            lastMessageAt: now - 40 * MINUTE,
            lastMessagePreview: 'Sastanak pomeramo na 15h.',
            lastMessageAuthor: ANA,
            unreadCount: 3,
          }),
          mkt,
        ],
      },
      {
        startup: BEAUTY,
        unreadCount: 5,
        mentionCount: 0,
        channels: [
          channel({
            _id: 'katalog-c-prodaja',
            kind: 'area',
            name: 'Prodaja',
            startupId: BEAUTY._id,
            lastMessageAt: now - 2 * 24 * HOUR,
            lastMessagePreview: 'Novi upiti su u tabeli.',
            lastMessageAuthor: MILICA,
            unreadCount: 5,
            notificationLevel: 'mentions',
          }),
        ],
      },
    ],
    capped: false,
  };
}

/** Ljudi za „Nova poruka" / „Nova grupa" (samo ime, avatar, zajednički startupi). */
export const KATALOG_CHAT_PEOPLE: HubPersonModel[] = [
  { ...ANA, sharedStartupNames: ['Cluck Rush'] },
  {
    _id: 'katalog-p-jelena',
    displayName: 'Jelena Nikolić',
    avatarUrl: null,
    sharedStartupNames: [],
  },
  {
    _id: 'katalog-p-luka',
    displayName: 'Luka Đorđević',
    avatarUrl: null,
    sharedStartupNames: ['Beauty Masterclass'],
  },
  { ...MILICA, sharedStartupNames: ['Beauty Masterclass', 'Cluck Rush'] },
  { ...NIKOLA, sharedStartupNames: ['Cluck Rush'] },
  {
    _id: 'katalog-p-stefan',
    displayName: 'Stefan Marković',
    avatarUrl: null,
    sharedStartupNames: [],
  },
];
