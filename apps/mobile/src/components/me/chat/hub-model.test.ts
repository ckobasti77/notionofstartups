import { hubGroups, PERSONAL_HUB_KEY, type HubChannel, type HubInput } from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import {
  conversationContextLabel,
  HUB_COLLAPSED_MAX,
  hubGroupAccessibilityLabel,
  hubHeaderSubtitle,
  hubRowAccessibilityLabel,
  hubRowActions,
  hubSections,
  hubVisibleRowCount,
  leaveGroupPrompt,
  parseHubCollapsed,
  serializeHubCollapsed,
  toggleHubCollapsed,
} from './hub-model';

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

const cluck = { _id: 's-cluck', name: 'Cluck Rush', logoUrl: null };
const scan = { _id: 's-scan', name: 'Scan Me', logoUrl: null };

const input: HubInput = {
  personal: [
    channel({ _id: 'c-dm', kind: 'dm', lastMessageAt: 50, unreadCount: 2 }),
    channel({ _id: 'c-grupa', name: 'Vikend plan', lastMessageAt: 40 }),
  ],
  startups: [
    {
      startup: cluck,
      unreadCount: 3,
      mentionCount: 0,
      channels: [
        channel({
          _id: 'c-opste',
          kind: 'startup',
          startupId: 's-cluck',
          lastMessageAt: 30,
          unreadCount: 3,
        }),
        channel({
          _id: 'c-mkt',
          kind: 'area',
          name: 'Marketing',
          startupId: 's-cluck',
          lastMessageAt: 20,
        }),
      ],
    },
    {
      startup: scan,
      unreadCount: 0,
      mentionCount: 0,
      channels: [
        channel({ _id: 'c-scan', kind: 'startup', startupId: 's-scan', lastMessageAt: 10 }),
      ],
    },
  ],
};

describe('sklopljene grupe — pamćenje', () => {
  test('pokvaren, prazan ili tuđ zapis daje praznu listu', () => {
    expect([...parseHubCollapsed(null)]).toEqual([]);
    expect([...parseHubCollapsed('')]).toEqual([]);
    expect([...parseHubCollapsed('{nije json')]).toEqual([]);
    expect([...parseHubCollapsed('{"a":1}')]).toEqual([]);
    expect([...parseHubCollapsed('[1, null, "startup:s-1"]')]).toEqual(['startup:s-1']);
  });

  test('„Lično" se nikad ne pamti kao sklopljeno', () => {
    expect([...parseHubCollapsed(JSON.stringify([PERSONAL_HUB_KEY, 'startup:s-1']))]).toEqual([
      'startup:s-1',
    ]);
    expect(serializeHubCollapsed(new Set([PERSONAL_HUB_KEY, 'startup:s-2']))).toBe(
      '["startup:s-2"]',
    );
  });

  test('zapis i čitanje su obostrani; granica čuva najnovije izbore', () => {
    const keys = new Set(['startup:a', 'startup:b']);
    expect(parseHubCollapsed(serializeHubCollapsed(keys))).toEqual(keys);
    const many = new Set(
      Array.from({ length: HUB_COLLAPSED_MAX + 5 }, (_, index) => `startup:${index}`),
    );
    const kept = JSON.parse(serializeHubCollapsed(many)) as string[];
    expect(kept).toHaveLength(HUB_COLLAPSED_MAX);
    expect(kept[0]).toBe('startup:5');
    expect(kept.at(-1)).toBe(`startup:${HUB_COLLAPSED_MAX + 4}`);
    expect(parseHubCollapsed(JSON.stringify([...many])).size).toBe(HUB_COLLAPSED_MAX);
  });

  test('toggle vraća nov skup i ne menja ulaz', () => {
    const start = new Set(['startup:a']);
    const closed = toggleHubCollapsed(start, 'startup:b');
    expect([...closed].sort()).toEqual(['startup:a', 'startup:b']);
    expect([...start]).toEqual(['startup:a']);
    expect([...toggleHubCollapsed(closed, 'startup:a')]).toEqual(['startup:b']);
  });
});

describe('sekcije liste', () => {
  test('sklopljena grupa zadržava zaglavlje bez redova; redosled iz shared grupisanja', () => {
    const groups = hubGroups(input, { collapsed: new Set(['startup:s-cluck']) });
    const sections = hubSections(groups);
    expect(sections.map((section) => section.key)).toEqual([
      'licno',
      'startup:s-cluck',
      'startup:s-scan',
    ]);
    expect(sections[0].data.map((item) => item._id)).toEqual(['c-dm', 'c-grupa']);
    expect(sections[1].data).toEqual([]);
    expect(sections[1].group.channels).toHaveLength(2);
    expect(sections[2].data.map((item) => item._id)).toEqual(['c-scan']);
    expect(hubVisibleRowCount(sections)).toBe(3);
  });

  test('pretraga: ništa nije sklopljeno, prazne grupe nestaju', () => {
    const sections = hubSections(
      hubGroups(input, { query: 'marketing', collapsed: new Set(['startup:s-cluck']) }),
    );
    expect(sections.map((section) => section.key)).toEqual(['startup:s-cluck']);
    expect(sections[0].data.map((item) => item._id)).toEqual(['c-mkt']);
  });
});

describe('tekst', () => {
  test('podnaslov zaglavlja prati ukupno nepročitano', () => {
    expect(hubHeaderSubtitle(null)).toBeUndefined();
    expect(hubHeaderSubtitle({ unreadCount: 0 })).toBe('Sve je pročitano');
    expect(hubHeaderSubtitle({ unreadCount: 1 })).toBe('1 nepročitana poruka');
    expect(hubHeaderSubtitle({ unreadCount: 3 })).toBe('3 nepročitane poruke');
    expect(hubHeaderSubtitle({ unreadCount: 12 })).toBe('12 nepročitanih poruka');
    expect(hubHeaderSubtitle({ unreadCount: 100 })).toBe('Više od 99 nepročitanih poruka');
  });

  test('labela reda: pominjanje ima prednost, utišan kanal ne broji, prazni delovi otpadaju', () => {
    const parts = { name: 'Milica Jovanović', preview: 'Ti: važi', time: '09:41', place: 'Lično' };
    expect(
      hubRowAccessibilityLabel(
        { unreadCount: 2, mentionCount: 0, notificationLevel: 'all' },
        parts,
      ),
    ).toBe('Milica Jovanović. 2 nepročitane poruke. Ti: važi. Lično. 09:41');
    expect(
      hubRowAccessibilityLabel(
        { unreadCount: 2, mentionCount: 1, notificationLevel: 'all' },
        parts,
      ),
    ).toBe('Milica Jovanović. 1 pominjanje. Ti: važi. Lično. 09:41');
    expect(
      hubRowAccessibilityLabel(
        { unreadCount: 4, mentionCount: 0, notificationLevel: 'mentions' },
        parts,
      ),
    ).toBe('Milica Jovanović. Ima novih poruka. Ti: važi. Lično. 09:41');
    expect(
      hubRowAccessibilityLabel(
        { unreadCount: 0, mentionCount: 0, notificationLevel: 'all' },
        { name: '#opšte', preview: 'Bez poruka', time: '', place: null },
      ),
    ).toBe('#opšte. Bez poruka');
  });

  test('zaglavlje grupe i potvrda napuštanja', () => {
    expect(hubGroupAccessibilityLabel({ title: 'Cluck Rush', unreadCount: 5 })).toBe(
      'Cluck Rush, 5 nepročitanih poruka',
    );
    expect(hubGroupAccessibilityLabel({ title: 'Lično', unreadCount: 0 })).toBe('Lično');
    expect(leaveGroupPrompt('Vikend plan')).toEqual({
      title: 'Napustiti grupu „Vikend plan“?',
      message: 'Više nećeš videti nove poruke.',
    });
  });
});

describe('radnje dugog pritiska', () => {
  test('lična grupa: otvori, (pročitano), podešavanja, napusti', () => {
    expect(
      hubRowActions({ startupId: null, kind: 'custom', unreadCount: 0, mentionCount: 0 }),
    ).toEqual(['open', 'groupSettings', 'leaveGroup']);
    expect(
      hubRowActions({ startupId: null, kind: 'custom', unreadCount: 1, mentionCount: 0 }),
    ).toEqual(['open', 'markRead', 'groupSettings', 'leaveGroup']);
  });

  test('lični DM i kanali startupa: bez podešavanja i napuštanja', () => {
    expect(hubRowActions({ startupId: null, kind: 'dm', unreadCount: 0, mentionCount: 2 })).toEqual(
      ['open', 'markRead'],
    );
    expect(
      hubRowActions({ startupId: 's-1', kind: 'custom', unreadCount: 0, mentionCount: 0 }),
    ).toEqual(['open']);
    expect(
      hubRowActions({ startupId: 's-1', kind: 'area', unreadCount: 5, mentionCount: 0 }),
    ).toEqual(['open', 'markRead']);
  });
});

describe('kontekst razgovora', () => {
  test('ime startupa samo za kanal drugog startupa', () => {
    expect(conversationContextLabel('s-1', 's-2', 'Cluck Rush')).toBe('Cluck Rush');
    expect(conversationContextLabel('s-1', null, 'Cluck Rush')).toBe('Cluck Rush');
    expect(conversationContextLabel('s-1', 's-1', 'Cluck Rush')).toBeNull();
    expect(conversationContextLabel(null, 's-1', 'Cluck Rush')).toBeNull();
    expect(conversationContextLabel('s-1', 's-2', '   ')).toBeNull();
    expect(conversationContextLabel('s-1', 's-2', undefined)).toBeNull();
  });
});
