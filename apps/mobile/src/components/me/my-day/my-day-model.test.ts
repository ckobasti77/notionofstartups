import { describe, expect, test } from 'vitest';

import {
  applyCompletionOverrides,
  buildMyDay,
  daySummary,
  firstNameOf,
  progressValueText,
  reopenStatus,
  type CompletionHold,
  type MyDayOverviewData,
} from './my-day-model';

const ZONE = 'Europe/Belgrade';
// subota 24.10.2026. 09:30 u Beogradu
const NOW = Date.UTC(2026, 9, 24, 7, 30);
const noon = (day: number) => Date.UTC(2026, 9, day, 10, 0);

function task(id: string, partial: Partial<MyDayOverviewData['tasks'][number]> = {}) {
  return {
    _id: id,
    title: `Zadatak ${id}`,
    taskStatus: 'next' as const,
    taskPriority: null,
    dueDate: null,
    completedAt: null,
    createdAt: noon(1),
    isCreator: false,
    isAssignee: true,
    startup: { _id: 's1', name: 'Cluck Rush' },
    area: { label: 'Sales' },
    ...partial,
  };
}

const OVERVIEW: MyDayOverviewData = {
  tasks: [
    task('t1', { dueDate: noon(22) }),
    task('t2', { dueDate: noon(24), startup: { _id: 's2', name: 'Scan Me' }, area: null }),
    task('t3', { taskStatus: 'in_progress' }),
    task('t4', { taskStatus: 'done', completedAt: Date.UTC(2026, 9, 24, 6, 0), dueDate: noon(24) }),
    // Planiran tuđ zadatak: nisam ni kreator ni izvršilac.
    task('t5', { dueDate: noon(28), isAssignee: false }),
  ],
  personal: [
    {
      _id: 'p1',
      title: 'Faktura',
      status: 'open',
      priority: null,
      dueDate: noon(23),
      completedAt: null,
      createdAt: noon(2),
    },
  ],
  entries: [],
  history: [],
  startups: [
    { _id: 's1', name: 'Cluck Rush', logoUrl: 'https://example.test/cr.png' },
    { _id: 's2', name: 'Scan Me', logoUrl: null },
  ],
  capped: { tasks: false, personal: false, history: false },
};

describe('Moj dan v1 — model (telefon)', () => {
  const model = buildMyDay(OVERVIEW, NOW, ZONE);
  const section = (id: string) => model.sections.find((entry) => entry.id === id);

  test('sekcije iz shared grupisanja, redovi nose startup sa logom ili „Lično"', () => {
    expect(section('overdue')?.rows.map((row) => row.key)).toEqual(['task:t1', 'personal:p1']);
    expect(section('overdue')?.rows[1].startup).toBeNull();
    expect(section('overdue')?.rows[0].startup).toEqual({
      _id: 's1',
      name: 'Cluck Rush',
      logoUrl: 'https://example.test/cr.png',
    });
    expect(section('today')?.rows.map((row) => row.key)).toEqual(['task:t2']);
    expect(section('today')?.rows[0].areaLabel).toBeNull();
    expect(section('inProgress')?.rows.map((row) => row.key)).toEqual(['task:t3']);
    expect(section('soon')?.rows.map((row) => row.key)).toEqual(['task:t5']);
    expect(section('doneToday')?.rows[0]).toMatchObject({ key: 'task:t4', done: true });
  });

  test('dozvola za kvačicu: lično uvek, startup samo kreator ili izvršilac', () => {
    expect(section('overdue')?.rows.map((row) => row.canComplete)).toEqual([true, true]);
    expect(section('soon')?.rows[0].canComplete).toBe(false);
    const creator = buildMyDay(
      { ...OVERVIEW, tasks: [task('t9', { dueDate: noon(24), isAssignee: false, isCreator: true })] },
      NOW,
      ZONE,
    );
    expect(creator.sections.find((entry) => entry.id === 'today')?.rows[0].canComplete).toBe(true);
  });

  test('prsten, brojevi i odsečeno', () => {
    expect(model.progress).toEqual({ done: 1, total: 2 });
    expect(model.capped).toBe(false);
    expect(
      buildMyDay({ ...OVERVIEW, capped: { tasks: false, personal: true, history: false } }, NOW, ZONE)
        .capped,
    ).toBe(true);
  });

  test('startup koga nema u listi dobija ime iz zadatka, bez loga', () => {
    const orphan = buildMyDay(
      { ...OVERVIEW, tasks: [task('t8', { dueDate: noon(24), startup: { _id: 's9', name: 'Nauči AI' } })] },
      NOW,
      ZONE,
    );
    expect(orphan.sections.find((entry) => entry.id === 'today')?.rows[0].startup).toEqual({
      _id: 's9',
      name: 'Nauči AI',
      logoUrl: null,
    });
  });
});

describe('tekstovi', () => {
  test('sažetak, ime, vrednost prstena', () => {
    const zero = { overdue: 0, today: 0, planned: 0, inProgress: 0, soon: 0, blocked: 0, doneToday: 0 };
    expect(daySummary(zero)).toBe('Ništa ne gori.');
    expect(daySummary({ ...zero, overdue: 2, today: 3 })).toBe('2 kasni, 3 za danas.');
    expect(daySummary({ ...zero, today: 1 })).toBe('1 za danas.');
    expect(firstNameOf('  Jovan Milojević ')).toBe('Jovan');
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(progressValueText({ done: 3, total: 7 })).toBe('3 od 7 završeno');
    expect(progressValueText({ done: 7, total: 7 })).toBe('Dan je završen.');
    expect(progressValueText({ done: 0, total: 0 })).toBe('0 od 0 završeno');
  });

  test('vraćanje startup zadatka: prethodni status, inače „Sledeće"', () => {
    expect(reopenStatus('in_progress')).toBe('in_progress');
    expect(reopenStatus('blocked')).toBe('blocked');
    expect(reopenStatus(undefined)).toBe('next');
    expect(reopenStatus('done')).toBe('next');
  });
});

describe('zadržavanje reda posle kvačice (E7)', () => {
  const model = buildMyDay(OVERVIEW, NOW, ZONE);

  test('red ostaje na starom mestu kao završen, i kad ga server već preselio', () => {
    // Server je t1 već završio: sad je u „Završeno danas".
    const served = buildMyDay(
      {
        ...OVERVIEW,
        tasks: OVERVIEW.tasks.map((entry) =>
          entry._id === 't1' ? { ...entry, taskStatus: 'done' as const, completedAt: NOW } : entry,
        ),
      },
      NOW,
      ZONE,
    );
    const original = model.sections.find((entry) => entry.id === 'overdue')!.rows[0];
    const holds = new Map<string, CompletionHold>([
      ['task:t1', { section: 'overdue', index: 0, row: original, done: true }],
    ]);
    const result = applyCompletionOverrides(served, holds, new Map());
    const overdue = result.sections.find((entry) => entry.id === 'overdue')!;
    expect(overdue.rows.map((row) => [row.key, row.done])).toEqual([
      ['task:t1', true],
      ['personal:p1', false],
    ]);
    const done = result.sections.find((entry) => entry.id === 'doneToday')!;
    expect(done.rows.some((row) => row.key === 'task:t1')).toBe(false);
  });

  test('posle zadržavanja, dok mutacija čeka, red nosi željeni status gde ga podaci stave', () => {
    const result = applyCompletionOverrides(model, new Map(), new Map([['personal:p1', true]]));
    expect(
      result.sections.find((entry) => entry.id === 'overdue')!.rows.find((row) => row.key === 'personal:p1')
        ?.done,
    ).toBe(true);
  });

  test('bez zadržavanja i čekanja model je isti objekat', () => {
    expect(applyCompletionOverrides(model, new Map(), new Map())).toBe(model);
  });

  test('indeks van opsega se seče na kraj sekcije', () => {
    const row = model.sections.find((entry) => entry.id === 'today')!.rows[0];
    const result = applyCompletionOverrides(
      model,
      new Map([[row.key, { section: 'today' as const, index: 40, row, done: true }]]),
      new Map(),
    );
    expect(result.sections.find((entry) => entry.id === 'today')!.rows.map((entry) => entry.key)).toEqual([
      'task:t2',
    ]);
  });
});
