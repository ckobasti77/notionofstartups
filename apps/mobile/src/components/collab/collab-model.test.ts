import { serializeComment } from '@devotion/shared';
import { describe, expect, it } from 'vitest';

import {
  activeEditors,
  commentAuthorName,
  commentExcerpt,
  commentMeta,
  commentToDraft,
  commentsEntryTitle,
  conflictCopy,
  conflictFromError,
  groupRevisionsByDay,
  isEditingNow,
  keptMentions,
  lockedByLabel,
  mentionSuggestions,
  pageMetaLine,
  presenceLabel,
  restoreConfirmTitle,
  restoreOutcomeMessage,
  revisionListEntries,
  shouldSendEagerHeartbeat,
  type PresenceRow,
} from './collab-model';

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const MINUTE = 60_000;

function row(profileId: string, displayName: string, overrides: Partial<PresenceRow> = {}): PresenceRow {
  return { profileId, displayName, avatarUrl: null, editing: true, expiresAt: NOW + 30_000, ...overrides };
}

describe('prisustvo', () => {
  it('istekao otkucaj ispada bez novog upita, a "samo prisutan" se ne računa', () => {
    const rows = [
      row('a', 'Ana Petrović'),
      row('b', 'Marko', { expiresAt: NOW - 1 }),
      row('c', 'Jelena', { editing: false }),
    ];
    expect(activeEditors(rows, NOW).map((r) => r.profileId)).toEqual(['a']);
    // Isti redovi 31 s kasnije: Ana je istekla bez ikakvog novog podatka sa servera.
    expect(activeEditors(rows, NOW + 31_000)).toEqual([]);
    expect(activeEditors(undefined, NOW)).toEqual([]);
  });

  it('isti član se računa jednom, abecedno', () => {
    const rows = [row('b', 'Marko'), row('a', 'Ana'), row('a', 'Ana')];
    expect(activeEditors(rows, NOW).map((r) => r.displayName)).toEqual(['Ana', 'Marko']);
  });

  it('tekst: jedan, dvoje, troje i više', () => {
    expect(presenceLabel([])).toBeNull();
    expect(presenceLabel(['Ana Petrović'])).toBe('Ana uređuje');
    expect(presenceLabel(['Ana Petrović', 'Marko Marković'])).toBe('Ana i Marko uređuju');
    expect(presenceLabel(['Ana', 'Marko', 'Jelena', 'Petar'])).toBe('Ana i još 3 uređuju');
  });

  it('"uređuješ" traje 15 s od poslednjeg unosa i traži pravo izmene', () => {
    expect(isEditingNow({ canEdit: true, lastActivityAt: NOW - 14_000, now: NOW })).toBe(true);
    expect(isEditingNow({ canEdit: true, lastActivityAt: NOW - 15_000, now: NOW })).toBe(false);
    expect(isEditingNow({ canEdit: false, lastActivityAt: NOW, now: NOW })).toBe(false);
  });

  it('prvi unos šalje otkucaj odmah samo ako server još ne zna i nije skoro slato', () => {
    const base = { canEdit: true, reportedEditing: false, lastSentAt: NOW - 4_000, now: NOW };
    expect(shouldSendEagerHeartbeat(base)).toBe(true);
    expect(shouldSendEagerHeartbeat({ ...base, reportedEditing: true })).toBe(false);
    expect(shouldSendEagerHeartbeat({ ...base, lastSentAt: NOW - 2_000 })).toBe(false);
    expect(shouldSendEagerHeartbeat({ ...base, canEdit: false })).toBe(false);
  });
});

describe('istorija izmena', () => {
  const revisions = [
    { _id: 'r3', updatedAt: NOW - 5 * MINUTE },
    { _id: 'r2', updatedAt: NOW - 20 * MINUTE },
    { _id: 'r1', updatedAt: NOW - 30 * 60 * MINUTE },
  ];

  it('grupiše po lokalnom danu, istim redom', () => {
    const groups = groupRevisionsByDay(revisions, NOW, 'UTC');
    expect(groups.map((group) => group.items.map((item) => item._id))).toEqual([['r3', 'r2'], ['r1']]);
    expect(groups[0].label).toBe('Danas');
  });

  it('spljošteno: naslov dana pa njegove revizije', () => {
    const entries = revisionListEntries(revisions, NOW, 'UTC');
    expect(entries.map((entry) => entry.kind)).toEqual(['day', 'revision', 'revision', 'day', 'revision']);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
  });

  it('potvrda i ishod vraćanja', () => {
    expect(restoreConfirmTitle(NOW - 3 * 60 * MINUTE, NOW, 'UTC')).toBe('Vratiti verziju od danas u 09:00?');
    expect(restoreOutcomeMessage(true, NOW - 3 * 60 * MINUTE, NOW, 'UTC')).toBe(
      'Vraćena je verzija od danas u 09:00.',
    );
    expect(restoreOutcomeMessage(false, NOW, NOW, 'UTC')).toBe('Ova verzija je ista kao trenutna.');
  });
});

describe('konflikt i zaključavanje', () => {
  it('prepoznaje ConvexError sa kodom i podacima, i stari tekstualni oblik', () => {
    const typed = Object.assign(new Error('x'), {
      data: { code: 'KONFLIKT_IZMENA', currentRevision: 7, updatedByProfileId: 'p1', updatedAt: 123 },
    });
    expect(conflictFromError(typed)).toEqual({ currentRevision: 7, updatedByProfileId: 'p1', updatedAt: 123 });
    expect(conflictFromError(new Error('KONFLIKT_IZMENA: stranica je izmenjena'))).toEqual({
      currentRevision: null,
      updatedByProfileId: null,
      updatedAt: null,
    });
    expect(conflictFromError(new Error('nešto drugo'))).toBeNull();
    expect(conflictFromError('KONFLIKT_IZMENA')).not.toBeNull();
  });

  it('tekst konflikta po vrsti i bez poznatog autora', () => {
    const page = conflictCopy({ subject: 'page', updaterName: 'Marko', updatedAt: NOW - 5 * MINUTE, now: NOW });
    expect(page.title).toBe('Neko je u međuvremenu izmenio stranicu');
    expect(page.body).toBe('Marko je sačuvao/la izmenu pre 5 min. Tvoja verzija još nije sačuvana.');
    expect(conflictCopy({ subject: 'task', updaterName: null, updatedAt: null, now: NOW }).body).toBe(
      'Neko iz tima je sačuvao/la izmenu. Tvoja verzija još nije sačuvana.',
    );
    expect(conflictCopy({ subject: 'area', updaterName: 'Ana', updatedAt: null, now: NOW }).title).toContain(
      'opis oblasti',
    );
  });

  it('opis oznake zaključano i meta red', () => {
    expect(lockedByLabel({ lockedByName: 'Ana', lockedAt: NOW - 5 * MINUTE, now: NOW })).toMatch(
      /^Zaključao\/la Ana · (danas|juče) u \d{2}:\d{2}$/,
    );
    expect(lockedByLabel({ lockedByName: null, lockedAt: null, now: NOW })).toBe('Zaključao/la Neko iz tima');
    expect(
      pageMetaLine({ creatorName: 'Ana', updaterName: 'Marko', updatedAt: NOW - 5 * MINUTE, now: NOW, locked: true }),
    ).toBe('Ana · izmenio/la Marko pre 5 min · Zaključano');
    expect(
      pageMetaLine({ creatorName: null, updaterName: null, updatedAt: NOW - 5 * MINUTE, now: NOW, locked: false }),
    ).toBe('izmena pre 5 min');
  });
});

describe('komentari', () => {
  const members = [
    { profileId: 'p1', displayName: 'Ana Petrović' },
    { profileId: 'p2', displayName: 'Marko Marković' },
    { profileId: 'p3', displayName: 'Željko Đorđević' },
  ];

  it('autor i meta', () => {
    expect(commentAuthorName({ origin: 'comment', author: { displayName: 'Ana' } })).toBe('Ana');
    expect(commentAuthorName({ origin: 'legacy_shared', author: { displayName: 'Ana' } })).toBe('Raniji tekst tima');
    expect(commentAuthorName({ origin: 'comment', author: null })).toBe('Raniji tekst tima');
    expect(commentMeta({ createdAt: NOW - 5 * MINUTE, edited: true, moderationStatus: 'rejected' }, NOW)).toBe(
      'pre 5 min · izmenjeno · Odbijeno ranije',
    );
  });

  it('kandidati za @: bez sebe, bez dijakritika, abecedno', () => {
    expect(mentionSuggestions(members, '', 'p1').map((m) => m.profileId)).toEqual(['p2', 'p3']);
    expect(mentionSuggestions(members, 'zel', null).map((m) => m.profileId)).toEqual(['p3']);
    expect(mentionSuggestions(members, 'xyz', null)).toEqual([]);
  });

  it('obrisano "@Ime" ispada iz pominjanja', () => {
    expect(keptMentions('Pogledaj @Ana Petrović', members).map((m) => m.profileId)).toEqual(['p1']);
    expect(keptMentions('Pogledaj Ana', members)).toEqual([]);
  });

  it('izmena u mestu: serijalizacija i nacrt su kružni, stari HTML postaje tekst', () => {
    const { content, mentionProfileIds } = serializeComment('Proveri sa @Marko Marković limit', [members[1]]);
    expect(mentionProfileIds).toEqual(['p2']);
    const draft = commentToDraft(content);
    expect(draft.text).toBe('Proveri sa @Marko Marković limit');
    expect(draft.mentions).toEqual([{ profileId: 'p2', displayName: 'Marko Marković' }]);
    expect(commentToDraft('<p><strong>Staro</strong> mišljenje</p>').text).toBe('Staro mišljenje');
  });

  it('isečak u redu "Komentari": jedan red, bez HTML-a, skraćen', () => {
    const { content } = serializeComment('Prvi red\nDrugi @Ana Petrović', [members[0]]);
    expect(commentExcerpt(content)).toBe('Prvi red Drugi @Ana Petrović');
    expect(commentExcerpt(`<p>${'a'.repeat(200)}</p>`, 20)).toHaveLength(20);
    expect(commentExcerpt(`<p>${'a'.repeat(200)}</p>`, 20).endsWith('…')).toBe(true);
  });

  it('naslov reda "Komentari"', () => {
    expect(commentsEntryTitle(null, false)).toBe('Komentari');
    expect(commentsEntryTitle(4, false)).toBe('Komentari · 4');
    expect(commentsEntryTitle(20, true)).toBe('Komentari · 20+');
  });
});
