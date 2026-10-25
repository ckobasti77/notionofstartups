import { describe, expect, test } from 'vitest';

import type { Id } from '@/convex/_generated/dataModel';

import { OPTIMISTIC_ID_PREFIX, shouldAnimateArrival } from './chat';

const ME = 'p-jovan';
const BASELINE = 1_000;

function message(over: { _id?: string; createdAt: number; authorProfileId?: string | null }) {
  return {
    _id: (over._id ?? 'm-1') as Id<'chatMessages'>,
    createdAt: over.createdAt,
    authorProfileId: (over.authorProfileId === undefined
      ? 'p-milica'
      : over.authorProfileId) as Id<'profiles'> | null,
  };
}

describe('shouldAnimateArrival — ulaz pristigle poruke (K16)', () => {
  test('prvo punjenje (bez osnove) i starije strane ne animiraju', () => {
    expect(shouldAnimateArrival(message({ createdAt: 5_000 }), null, ME)).toBe(false);
    expect(shouldAnimateArrival(message({ createdAt: BASELINE }), BASELINE, ME)).toBe(false);
    expect(shouldAnimateArrival(message({ createdAt: 10 }), BASELINE, ME)).toBe(false);
  });

  test('tuđa nova poruka animira, i sistemska (bez autora)', () => {
    expect(shouldAnimateArrival(message({ createdAt: BASELINE + 1 }), BASELINE, ME)).toBe(true);
    expect(
      shouldAnimateArrival(
        message({ createdAt: BASELINE + 1, authorProfileId: null }),
        BASELINE,
        ME,
      ),
    ).toBe(true);
  });

  test('moja: optimistička animira, pravi red koji je zameni ne (bez dvostrukog ulaza)', () => {
    expect(
      shouldAnimateArrival(
        message({
          _id: `${OPTIMISTIC_ID_PREFIX}1-1`,
          createdAt: BASELINE + 5,
          authorProfileId: ME,
        }),
        BASELINE,
        ME,
      ),
    ).toBe(true);
    expect(
      shouldAnimateArrival(message({ createdAt: BASELINE + 6, authorProfileId: ME }), BASELINE, ME),
    ).toBe(false);
  });
});
