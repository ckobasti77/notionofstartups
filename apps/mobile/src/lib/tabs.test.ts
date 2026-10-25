import { describe, expect, test } from 'vitest';

import {
  badgeLabel,
  chatBadge,
  elsewhereCount,
  inboxBadge,
  TAB_ORDER,
  TAB_SCOPE,
  TAB_TITLES,
  unreadMessagesPhrase,
  unreadPhrase,
} from './tabs';

describe('tabovi (O1, plan K01 §6)', () => {
  test('imena fajlova ostaju, naslovi su lični nivo', () => {
    expect(TAB_ORDER).toEqual(['danas', 'prostor', 'chat', 'obavestenja', 'vise']);
    expect(TAB_ORDER.map((name) => TAB_TITLES[name])).toEqual([
      'Danas',
      'Prostor',
      'Poruke',
      'Inbox',
      'Više',
    ]);
  });

  test('globalni tabovi ne zavise od aktivnog startupa; Prostor je startup', () => {
    expect(TAB_SCOPE.danas).toBe('me');
    expect(TAB_SCOPE.chat).toBe('me');
    expect(TAB_SCOPE.obavestenja).toBe('me');
    expect(TAB_SCOPE.prostor).toBe('startup');
  });
});

describe('bedževi (P14)', () => {
  test('oznaka: nula nema bedž, iznad 99 ili odsečeno je „99+"', () => {
    expect(badgeLabel(0)).toBeUndefined();
    expect(badgeLabel(-2)).toBeUndefined();
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
    expect(badgeLabel(3, true)).toBe('99+');
  });

  test('Inbox broji sve startupe i lično (total), sa srpskom množinom', () => {
    expect(inboxBadge(undefined)).toEqual({ label: undefined, accessibilityLabel: 'Inbox' });
    expect(inboxBadge({ total: { count: 0, capped: false } }).label).toBeUndefined();
    expect(inboxBadge({ total: { count: 1, capped: false } })).toEqual({
      label: '1',
      accessibilityLabel: 'Inbox, 1 nepročitano',
    });
    expect(inboxBadge({ total: { count: 3, capped: false } }).accessibilityLabel).toBe(
      'Inbox, 3 nepročitana',
    );
    expect(inboxBadge({ total: { count: 12, capped: false } }).accessibilityLabel).toBe(
      'Inbox, 12 nepročitanih',
    );
    expect(inboxBadge({ total: { count: 300, capped: true } })).toEqual({
      label: '99+',
      accessibilityLabel: 'Inbox, više od 99 nepročitanih',
    });
  });

  test('Poruke broje total (svi aktivni startupi + lično)', () => {
    expect(chatBadge(null)).toEqual({ label: undefined, accessibilityLabel: 'Poruke' });
    expect(chatBadge({ total: { unreadCount: 1 } })).toEqual({
      label: '1',
      accessibilityLabel: 'Poruke, 1 nepročitana poruka',
    });
    expect(chatBadge({ total: { unreadCount: 22 } }).accessibilityLabel).toBe(
      'Poruke, 22 nepročitane poruke',
    );
    expect(chatBadge({ total: { unreadCount: 140 } }).label).toBe('99+');
  });

  test('množina: 11–14 su „many", 21 je „one"', () => {
    expect(unreadPhrase(11)).toBe('11 nepročitanih');
    expect(unreadPhrase(21)).toBe('21 nepročitano');
    expect(unreadPhrase(14)).toBe('14 nepročitanih');
    expect(unreadMessagesPhrase(5)).toBe('5 nepročitanih poruka');
    expect(unreadMessagesPhrase(12)).toBe('12 nepročitanih poruka');
  });

  test('nepročitano van aktivnog startupa nikad nije negativno', () => {
    expect(elsewhereCount(12, 3)).toBe(9);
    expect(elsewhereCount(2, 5)).toBe(0);
  });
});
