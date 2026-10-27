import { describe, expect, test } from 'vitest';

import {
  buildSections,
  chipLabel,
  commentsLabel,
  convertHint,
  emptyCopy,
  filterIdeas,
  ideaAuthorLine,
  ideaDraftError,
  ideaTitle,
  ideasCountLabel,
  IDEA_STAGE_CHIPS,
  newestFirst,
  stageCounts,
  stageLockedReason,
  stageOptions,
  voteMessage,
  type IdeaPermissions,
  type IdeaRowModel,
} from './ideje-model';

const NOW = Date.UTC(2026, 9, 27, 10, 0);
const DAY = 86_400_000;

const none: IdeaPermissions = {
  canEdit: true,
  canVote: true,
  canSetStage: false,
  canConvert: false,
  canArchive: true,
  canComment: true,
};
const responsible: IdeaPermissions = { ...none, canSetStage: true };

function idea(patch: Partial<IdeaRowModel> & { _id: string }): IdeaRowModel {
  return {
    title: 'Referral program',
    text: 'Preporuka za nagradu',
    createdAt: NOW - DAY,
    stage: 'predlog',
    convertedPageId: null,
    upvotes: 0,
    downvotes: 0,
    userVote: null,
    commentCount: 0,
    commentCountCapped: false,
    author: { displayName: 'Ana Petrović' },
    permissions: none,
    ...patch,
  };
}

const sample: IdeaRowModel[] = [
  idea({ _id: 'a', stage: 'predlog', createdAt: NOW - 3 * DAY }),
  idea({ _id: 'b', stage: 'predlog', createdAt: NOW - DAY }),
  idea({ _id: 'c', stage: 'razmatra_se' }),
  idea({ _id: 'd', stage: 'odobreno' }),
  idea({ _id: 'e', stage: 'postalo_zadatak', convertedPageId: 'pg' }),
  idea({ _id: 'f', stage: 'odbijeno' }),
  idea({ _id: 'g', stage: 'odbijeno' }),
];

describe('čipovi faza', () => {
  test('tim redom: Sve · Predlog · Razmatra se · Odobreno · Postalo zadatak · Odbijeno', () => {
    expect(IDEA_STAGE_CHIPS.map((chip) => chip.label)).toEqual([
      'Sve',
      'Predlog',
      'Razmatra se',
      'Odobreno',
      'Postalo zadatak',
      'Odbijeno',
    ]);
  });

  test('broj po fazi i ukupno', () => {
    expect(stageCounts(sample)).toEqual({
      sve: 7,
      predlog: 2,
      razmatra_se: 1,
      odobreno: 1,
      postalo_zadatak: 1,
      odbijeno: 2,
    });
    expect(chipLabel('Razmatra se', 5)).toBe('Razmatra se 5');
  });
});

describe('sekcije liste', () => {
  test('„Sve" grupiše po fazi, najnovije prvo, Odbijeno je skupljeno', () => {
    const sections = buildSections(sample, 'sve', false);
    expect(sections.map((section) => section.title)).toEqual([
      'Predlog',
      'Razmatra se',
      'Odobreno',
      'Postalo zadatak',
      'Odbijeno',
    ]);
    expect(sections[0]?.data.map((item) => item._id)).toEqual(['b', 'a']);
    const rejected = sections[4];
    expect(rejected).toMatchObject({ collapsed: true, count: 2, data: [] });
  });

  test('otvoreno Odbijeno pokazuje redove', () => {
    const rejected = buildSections(sample, 'sve', true).at(-1);
    expect(rejected?.collapsed).toBe(false);
    expect(rejected?.data).toHaveLength(2);
  });

  test('jedna faza je jedna sekcija, a izabrano Odbijeno nije skupljeno', () => {
    const sections = buildSections(sample, 'odbijeno', false);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ collapsed: false, count: 2 });
  });

  test('prazne faze se izostavljaju; pretvorena ideja je uvek „Postalo zadatak"', () => {
    const only = buildSections([idea({ _id: 'x', stage: 'odobreno', convertedPageId: 'pg' })], 'sve', false);
    expect(only).toHaveLength(1);
    expect(only[0]?.title).toBe('Postalo zadatak');
    expect(buildSections([], 'sve', false)).toEqual([]);
  });

  test('isti trenutak zadržava ulazni redosled', () => {
    const same = [idea({ _id: '1' }), idea({ _id: '2' }), idea({ _id: '3' })];
    expect(newestFirst(same).map((item) => item._id)).toEqual(['1', '2', '3']);
  });
});

describe('pretraga', () => {
  test('naslov i tekst, bez kvačica i velikih slova', () => {
    const list = [
      idea({ _id: '1', title: 'Đurđevdan akcija', text: 'popust' }),
      idea({ _id: '2', title: 'Cenovnik', text: 'Nova ŠEMA cena' }),
    ];
    expect(filterIdeas(list, 'djurdjevdan').map((item) => item._id)).toEqual(['1']);
    expect(filterIdeas(list, 'sema').map((item) => item._id)).toEqual(['2']);
    expect(filterIdeas(list, '  ').map((item) => item._id)).toEqual(['1', '2']);
    expect(filterIdeas(list, 'nema ga')).toEqual([]);
  });
});

describe('tekstovi', () => {
  test('množina ideja i komentara', () => {
    expect([1, 2, 5, 11, 12, 21, 24].map(ideasCountLabel)).toEqual([
      '1 ideja',
      '2 ideje',
      '5 ideja',
      '11 ideja',
      '12 ideja',
      '21 ideja',
      '24 ideje',
    ]);
    expect(commentsLabel(idea({ _id: 'x', commentCount: 1 }))).toBe('1 komentar');
    expect(commentsLabel(idea({ _id: 'x', commentCount: 3 }))).toBe('3 komentara');
    expect(commentsLabel(idea({ _id: 'x', commentCount: 11 }))).toBe('11 komentara');
    expect(commentsLabel(idea({ _id: 'x', commentCount: 20, commentCountCapped: true }))).toBe(
      '20+ komentara',
    );
  });

  test('autor i starost', () => {
    expect(ideaAuthorLine(idea({ _id: 'x', createdAt: NOW - 3 * DAY }), NOW)).toBe('Ana Petrović · pre 3 dana');
    expect(ideaAuthorLine(idea({ _id: 'x', author: null, createdAt: NOW - DAY }), NOW)).toBe(
      'Član tima · juče',
    );
  });

  test('glas: isti glas povlači, drugi čuva', () => {
    expect(voteMessage(null, 'up')).toBe('Glas je sačuvan.');
    expect(voteMessage('down', 'up')).toBe('Glas je sačuvan.');
    expect(voteMessage('up', 'up')).toBe('Glas je povučen.');
  });

  test('prazna stanja', () => {
    expect(emptyCopy({ total: 0, filter: 'sve', searching: false }).title).toBe('Još nema ideja.');
    expect(emptyCopy({ total: 4, filter: 'odobreno', searching: false }).title).toBe(
      'Nema ideja u ovoj fazi.',
    );
    expect(emptyCopy({ total: 4, filter: 'sve', searching: true }).title).toBe(
      'Nijedna ideja ne odgovara pretrazi.',
    );
  });

  test('naslov ideje: naslov, početak teksta, rezerva', () => {
    expect(ideaTitle({ title: ' Naslov ', text: 'x' })).toBe('Naslov');
    expect(ideaTitle({ title: null, text: 'Tekst bez naslova' })).toBe('Tekst bez naslova');
    expect(ideaTitle({ title: '', text: '' })).toBe('Ideja');
  });
});

describe('dozvole za prikaz (server odlučuje)', () => {
  test('faza se menja samo uz canSetStage, u sve druge sačuvane faze', () => {
    expect(stageOptions(idea({ _id: 'x', permissions: none }))).toEqual([]);
    expect(stageOptions(idea({ _id: 'x', stage: 'predlog', permissions: responsible }))).toEqual([
      'razmatra_se',
      'odobreno',
      'odbijeno',
    ]);
    expect(stageOptions(idea({ _id: 'x', stage: 'odbijeno', permissions: responsible }))).toEqual([
      'predlog',
      'razmatra_se',
      'odobreno',
    ]);
  });

  test('pretvorena ideja nema nijednu fazu za izbor', () => {
    expect(
      stageOptions(idea({ _id: 'x', stage: 'postalo_zadatak', convertedPageId: 'pg', permissions: responsible })),
    ).toEqual([]);
  });

  test('„Pretvori": dugme samo uz canConvert, meta za odgovornog van faze, inače ništa', () => {
    expect(
      convertHint(idea({ _id: 'x', stage: 'odobreno', permissions: { ...responsible, canConvert: true } })),
    ).toEqual({ kind: 'button' });
    expect(convertHint(idea({ _id: 'x', stage: 'razmatra_se', permissions: responsible }))).toEqual({
      kind: 'hint',
      text: 'Pretvara se u fazi „Odobreno”.',
    });
    expect(convertHint(idea({ _id: 'x', stage: 'razmatra_se', permissions: none }))).toEqual({ kind: 'none' });
    expect(
      convertHint(
        idea({
          _id: 'x',
          stage: 'postalo_zadatak',
          convertedPageId: 'pg',
          permissions: { ...responsible, canConvert: true },
        }),
      ),
    ).toEqual({ kind: 'none' });
  });

  test('razlog uz zaključan red „Faza"', () => {
    const reasons = { changeStage: 'menja autor', converted: 'već pretvorena' };
    expect(stageLockedReason(idea({ _id: 'x', permissions: responsible }), reasons)).toBeNull();
    expect(stageLockedReason(idea({ _id: 'x', permissions: none }), reasons)).toBe('menja autor');
    expect(
      stageLockedReason(idea({ _id: 'x', convertedPageId: 'pg', permissions: none }), reasons),
    ).toBe('već pretvorena');
  });
});

describe('nacrt izmene', () => {
  test('prazno i predugo se odbija, ostalo prolazi', () => {
    expect(ideaDraftError({ title: ' ', text: 'x' })).toBe('Naslov ne može biti prazan.');
    expect(ideaDraftError({ title: 'x', text: '  ' })).toBe('Tekst ne može biti prazan.');
    expect(ideaDraftError({ title: 'x'.repeat(201), text: 'x' })).toMatch(/Naslov može imati najviše 200/);
    expect(ideaDraftError({ title: 'x', text: 'y'.repeat(12_001) })).toMatch(/Tekst može imati najviše 12000/);
    expect(ideaDraftError({ title: 'Naslov', text: 'Tekst' })).toBeNull();
  });
});
