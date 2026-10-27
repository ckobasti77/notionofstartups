import { describe, expect, it } from 'vitest';

import {
  AREA_DESCRIPTION_MAX,
  AREA_TABS,
  areaMetaLine,
  canSaveDescription,
  countLabel,
  DEFAULT_AREA_TAB,
  descriptionCounter,
  descriptionMeta,
  isAreaTab,
  overwriteRevision,
  pagesPhrase,
  pluralSr,
  recentMeta,
  taskCountFromPage,
  tasksPhrase,
} from './area-model';

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('kartice oblasti', () => {
  it('su tačno Pregled · Zadaci · Dokumenti, a podrazumevano je Pregled', () => {
    expect(AREA_TABS.map((tab) => tab.label)).toEqual(['Pregled', 'Zadaci', 'Dokumenti']);
    expect(DEFAULT_AREA_TAB).toBe('pregled');
  });

  it('prepoznaje samo poznate kartice (Mapa je dugme, ne kartica)', () => {
    expect(isAreaTab('zadaci')).toBe(true);
    expect(isAreaTab('mapa')).toBe(false);
    expect(isAreaTab(undefined)).toBe(false);
  });
});

describe('brojevi u meta redu', () => {
  it('piše srpsku množinu: 1 · 2–4 · 5+ · 11–14 · 21', () => {
    const pages = (count: number) => pagesPhrase({ count, capped: false });
    expect(pages(1)).toBe('1 stranica');
    expect(pages(3)).toBe('3 stranice');
    expect(pages(5)).toBe('5 stranica');
    expect(pages(12)).toBe('12 stranica');
    expect(pages(21)).toBe('21 stranica');
    expect(pages(22)).toBe('22 stranice');
    expect(pages(0)).toBe('0 stranica');
    expect(tasksPhrase({ count: 1, capped: false })).toBe('1 zadatak');
    expect(tasksPhrase({ count: 4, capped: false })).toBe('4 zadatka');
    expect(tasksPhrase({ count: 8, capped: false })).toBe('8 zadataka');
    expect(pluralSr(14, 'a', 'b', 'c')).toBe('c');
  });

  it('ograničen broj dobija „+"', () => {
    expect(countLabel({ count: 99, capped: true })).toBe('99+');
    expect(pagesPhrase({ count: 99, capped: true })).toBe('99+ stranica');
    expect(tasksPhrase({ count: 50, capped: true })).toBe('50+ zadataka');
  });

  it('sklapa „12 stranica · 8 zadataka" i izostavlja deo koji još stiže', () => {
    expect(areaMetaLine({ count: 12, capped: false }, { count: 8, capped: false })).toBe(
      '12 stranica · 8 zadataka',
    );
    expect(areaMetaLine({ count: 12, capped: false }, null)).toBe('12 stranica');
    expect(areaMetaLine(null, { count: 2, capped: false })).toBe('2 zadatka');
    expect(areaMetaLine(null, null)).toBeNull();
  });

  it('broj zadataka iz prve strane: ima još = ograničen', () => {
    expect(taskCountFromPage({ page: [1, 2, 3], isDone: true })).toEqual({ count: 3, capped: false });
    expect(taskCountFromPage({ page: new Array(50).fill(0), isDone: false })).toEqual({
      count: 50,
      capped: true,
    });
  });
});

describe('opis oblasti', () => {
  it('meta kaže ko i kad: „Marko · pre 2 dana"', () => {
    const meta = descriptionMeta({
      hasContent: true,
      lastEditorName: 'Marko',
      updatedAt: NOW - 2 * DAY,
      now: NOW,
    });
    expect(meta?.startsWith('Marko · ')).toBe(true);
  });

  it('bez imena ostaje samo vreme, a bez opisa nema mete', () => {
    expect(
      descriptionMeta({ hasContent: true, lastEditorName: null, updatedAt: NOW - 5 * MINUTE, now: NOW }),
    ).toBe('pre 5 min');
    expect(
      descriptionMeta({ hasContent: false, lastEditorName: 'Ana', updatedAt: NOW, now: NOW }),
    ).toBeNull();
    expect(
      descriptionMeta({ hasContent: true, lastEditorName: 'Ana', updatedAt: null, now: NOW }),
    ).toBeNull();
  });

  it('„Sačuvaj" sme samo uz izmenu, u granici i kad ništa ne radi', () => {
    expect(canSaveDescription({ draft: 'novo', original: 'staro', busy: false })).toBe(true);
    expect(canSaveDescription({ draft: 'staro', original: 'staro', busy: false })).toBe(false);
    expect(canSaveDescription({ draft: 'novo', original: 'staro', busy: true })).toBe(false);
    expect(
      canSaveDescription({ draft: 'x'.repeat(AREA_DESCRIPTION_MAX + 1), original: '', busy: false }),
    ).toBe(false);
  });

  it('brisanje celog opisa je dozvoljena izmena', () => {
    expect(canSaveDescription({ draft: '', original: 'staro', busy: false })).toBe(true);
  });

  it('„Prepiši" koristi reviziju iz greške, a bez nje poslednju poznatu', () => {
    expect(overwriteRevision(7, 5)).toBe(7);
    expect(overwriteRevision(null, 5)).toBe(5);
    // Treća osoba je sačuvala posle greške: važi novija revizija sa ekrana.
    expect(overwriteRevision(3, 5)).toBe(5);
  });

  it('brojač znakova prati granicu', () => {
    expect(descriptionCounter(0)).toMatch(/^0\/20[.   ,]?000$/);
  });
});

describe('nedavne izmene', () => {
  it('red nosi ime i vreme, a bez imena samo vreme', () => {
    expect(recentMeta('Ana', NOW - 5 * MINUTE, NOW)).toBe('Ana · pre 5 min');
    expect(recentMeta(null, NOW - 5 * MINUTE, NOW)).toBe('pre 5 min');
    expect(recentMeta('  ', NOW - 5 * MINUTE, NOW)).toBe('pre 5 min');
  });
});
