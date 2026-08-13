import { describe, expect, it } from 'vitest';

import { areaIconNameFor } from '@/lib/area-meta';

/**
 * Ključevi koje web zna (`AREA_ICONS` u `workspace-ui.tsx`). Ako web doda peti,
 * T2 pada — a to je i poenta: razlaz sa webom mora da obori kapiju, ne da tiho
 * padne na `Hash`.
 */
const KNOWN_KEYS = ['dev', 'marketing', 'sales', 'other'] as const;

describe('areaIconNameFor', () => {
  it('T1 — sva četiri poznata ključa daju RAZLIČITE ikonice', () => {
    const names = KNOWN_KEYS.map((key) => areaIconNameFor(key));
    expect(new Set(names).size).toBe(KNOWN_KEYS.length);
  });

  it('T2 — nijedan poznat ključ ne pada na `hash` fallback', () => {
    for (const key of KNOWN_KEYS) {
      expect(areaIconNameFor(key)).not.toBe('hash');
    }
  });

  it('T3 — imena su ista kao na webu, po ključu', () => {
    expect(areaIconNameFor('dev')).toBe('code');
    expect(areaIconNameFor('marketing')).toBe('megaphone');
    expect(areaIconNameFor('sales')).toBe('shopping-bag');
    expect(areaIconNameFor('other')).toBe('more');
  });

  it('T4 — nepoznat („custom_…") ključ dobija `hash`', () => {
    expect(areaIconNameFor('custom_ops')).toBe('hash');
    expect(areaIconNameFor('')).toBe('hash');
  });

  it('T5 — ključ se ne normalizuje: „Dev" nije „dev"', () => {
    // Serverski `startupAreas.key` je uvek mala slova; test zakiva da se ovde
    // ne uvodi tiho `toLowerCase()` koje bi sakrilo pogrešan podatak.
    expect(areaIconNameFor('Dev')).toBe('hash');
  });
});
