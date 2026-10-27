import { describe, expect, test } from 'vitest';

import {
  areasLabel,
  hubRowValue,
  ideaVotesLabel,
  PROSTOR_HUB_ROWS,
} from './prostor-hub-model';

describe('Prostor — redovi početne startupa (K09, P18)', () => {
  test('redovi su tačno Zadaci · Dokumenti · Ideje · Kanali · Korpa, tim redom', () => {
    expect(PROSTOR_HUB_ROWS.map((row) => row.title)).toEqual([
      'Zadaci',
      'Dokumenti',
      'Ideje',
      'Kanali',
      'Korpa',
    ]);
    // Dokumenti vode na listu oblasti (do K14 ekran oblasti je u Prostoru).
    expect(PROSTOR_HUB_ROWS.find((row) => row.title === 'Dokumenti')?.id).toBe('oblasti');
  });

  test('broj oblasti sa srpskom množinom', () => {
    expect(areasLabel(1)).toBe('1 oblast');
    expect(areasLabel(4)).toBe('4 oblasti');
    expect(areasLabel(11)).toBe('11 oblasti');
    expect(areasLabel(21)).toBe('21 oblast');
    expect(areasLabel(0)).toBe('0 oblasti');
  });

  test('samo Dokumenti i Ideje imaju tekstualnu vrednost; dok broj stiže je nema', () => {
    expect(hubRowValue('oblasti', 4)).toBe('4 oblasti');
    expect(hubRowValue('oblasti', null)).toBeNull();
    for (const id of ['zadaci', 'kanali', 'korpa'] as const) {
      expect(hubRowValue(id, 4, 3)).toBeNull();
    }
    expect(hubRowValue('ideje', 4)).toBeNull();
  });

  test('K17 — Ideje nose broj ideja koje čekaju tvoj glas (bez ijedne: ništa)', () => {
    expect(hubRowValue('ideje', 4, 2)).toBe('2 čeka');
    expect(hubRowValue('ideje', null, 1)).toBe('1 čeka');
    expect(hubRowValue('ideje', 4, 0)).toBeNull();
    expect(hubRowValue('ideje', 4, null)).toBeNull();
    expect(ideaVotesLabel(7)).toBe('7 čeka');
  });
});
