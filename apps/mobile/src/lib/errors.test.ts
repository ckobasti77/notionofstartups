import { describe, expect, test } from 'vitest';

import { accessErrorMessage } from './errors';

const FALLBACK = 'Proveri vezu i pokušaj ponovo.';

describe('accessErrorMessage', () => {
  test('ConvexError data.message ima prednost', () => {
    const error = Object.assign(new Error('[CONVEX M(x)] Server Error'), {
      data: { code: 'INVITE_REQUIRED', message: 'Pozivni kod nije ispravan.' },
    });
    expect(accessErrorMessage(error, FALLBACK)).toBe('Pozivni kod nije ispravan.');
  });

  test('razvoj: poruka obične greške servera ostaje, bez prefiksa „Error:"', () => {
    const error = new Error(
      '[CONVEX M(tasks:updateMetadata)] [Request ID: 1a2b] Server Error\nUncaught Error: Rok menja samo kreator zadatka.\n    at handler (../convex/tasks.ts:12:3)',
    );
    expect(accessErrorMessage(error, FALLBACK)).toBe('Rok menja samo kreator zadatka.');
  });

  test('razvoj: ConvexError bez data i dalje daje tekst', () => {
    const error = new Error('[CONVEX Q(x)] Uncaught ConvexError: Nemate pristup ovom startupu.');
    expect(accessErrorMessage(error, FALLBACK)).toBe('Nemate pristup ovom startupu.');
  });

  test('produkcija: skriven tekst servera → srpski rezervni tekst', () => {
    const error = new Error('[CONVEX M(tasks:updateMetadata)] [Request ID: 1a2b] Server Error');
    expect(accessErrorMessage(error, FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage(new Error('Called by client'), FALLBACK)).toBe(FALLBACK);
  });

  test('prazno i ne-Error → rezervni tekst', () => {
    expect(accessErrorMessage(new Error(''), FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage('niz', FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});
