import { completionCall, reopenStatus } from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import {
  applyHolds,
  buildMyDay,
  completionLabel,
  completionUndoAction,
  daySummary,
  firstNameOf,
  hasOpenRows,
  INITIAL_COLLAPSED,
  listItems,
  locateRow,
  plannedOrder,
  progressValueText,
  sectionKey,
  sectionsFor,
  type MyDayListSection,
  type MyDayOverviewData,
  type RowHold,
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

const timeSection = (sections: ReadonlyArray<MyDayListSection>, id: string) =>
  sections.find((entry) => entry.key === sectionKey('time', id));

describe('Moj dan — model (telefon)', () => {
  const model = buildMyDay(OVERVIEW, NOW, ZONE);
  const section = (id: string) => timeSection(model.time, id);

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
    // „Prekoračeno" nosi ton opasnosti, „Planirano" je jedina sekcija sa redosledom.
    expect(section('overdue')?.tone).toBe('danger');
    expect(model.time.filter((entry) => entry.reorderable).map((entry) => entry.key)).toEqual(['time:planned']);
  });

  test('dozvola za kvačicu (shared dozvole): lično uvek, startup samo kreator ili izvršilac', () => {
    expect(section('overdue')?.rows.map((row) => row.permissions.status.allowed)).toEqual([true, true]);
    expect(section('soon')?.rows[0].permissions.status.allowed).toBe(false);
    expect(section('soon')?.rows[0].permissions.status.reason).toBe(
      'Status menja kreator zadatka ili osoba kojoj je dodeljen.',
    );
    const creator = buildMyDay(
      { ...OVERVIEW, tasks: [task('t9', { dueDate: noon(24), isAssignee: false, isCreator: true })] },
      NOW,
      ZONE,
    );
    expect(timeSection(creator.time, 'today')?.rows[0].permissions.status.allowed).toBe(true);
  });

  test('prsten, brojevi i odsečeno', () => {
    expect(model.progress).toEqual({ done: 1, total: 2 });
    expect(model.capped).toBe(false);
    expect(model.rowCount).toBe(6);
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
    expect(timeSection(orphan.time, 'today')?.rows[0].startup).toEqual({
      _id: 's9',
      name: 'Nauči AI',
      logoUrl: null,
    });
  });

  test('po startupu: Lično prvo, pa startupi redom iz overview, pa „Završeno danas"', () => {
    const groups = sectionsFor(model, 'startup');
    expect(groups.map((group) => [group.key, group.title, group.rows.map((row) => row.key)])).toEqual([
      ['startup:personal', 'Lično', ['personal:p1']],
      ['startup:s1', 'Cluck Rush', ['task:t1', 'task:t3', 'task:t5']],
      ['startup:s2', 'Scan Me', ['task:t2']],
      ['startup:doneToday', 'Završeno danas', ['task:t4']],
    ]);
    expect(groups[0].startup).toBeNull();
    expect(groups[1].startup?.logoUrl).toBe('https://example.test/cr.png');
    expect(groups.at(-1)?.collapsible).toBe(true);
    expect(sectionsFor(model, 'time')).toBe(model.time);
  });

  test('plan: redosled „Planirano" daje id-jeve za reorder; prazan dan nema otvorenih', () => {
    const planned = buildMyDay(
      {
        ...OVERVIEW,
        tasks: [task('a'), task('b')],
        personal: [],
        entries: [
          { _id: 'e2', dayKey: '2026-10-24', refKey: 'task:b', position: 2048 },
          { _id: 'e1', dayKey: '2026-10-24', refKey: 'task:a', position: 1024 },
        ],
      },
      NOW,
      ZONE,
    );
    expect(plannedOrder(planned)).toEqual(['e1', 'e2']);
    expect(hasOpenRows(planned)).toBe(true);
    const empty = buildMyDay({ ...OVERVIEW, tasks: [task('d', { taskStatus: 'done', completedAt: NOW })], personal: [] }, NOW, ZONE);
    expect(hasOpenRows(empty)).toBe(false);
    expect(empty.counts.doneToday).toBe(1);
  });
});

describe('ravna lista za FlatList', () => {
  const model = buildMyDay(OVERVIEW, NOW, ZONE);

  test('prazne sekcije se preskaču, sklopljena daje samo zaglavlje, ključ reda je refKey', () => {
    const items = listItems(model.time, INITIAL_COLLAPSED);
    expect(items.map((item) => item.key)).toEqual([
      'h:time:overdue',
      'r:task:t1',
      'r:personal:p1',
      'h:time:today',
      'r:task:t2',
      'h:time:inProgress',
      'r:task:t3',
      'h:time:soon',
      'r:task:t5',
      // „Završeno danas" je podrazumevano sklopljeno.
      'h:time:doneToday',
    ]);
    const done = items.find((item) => item.key === 'h:time:doneToday');
    expect(done?.type === 'header' && done.collapsed).toBe(true);
    const expanded = listItems(model.time, new Set());
    expect(expanded.at(-1)?.key).toBe('r:task:t4');
  });

  test('isti red u oba rasporeda ima isti ključ (layout ga pomera, ne pravi iznova)', () => {
    const byTime = listItems(model.time, new Set()).filter((item) => item.type === 'row').map((item) => item.key);
    const byStartup = listItems(model.startup, new Set()).filter((item) => item.type === 'row').map((item) => item.key);
    expect([...byStartup].sort()).toEqual([...byTime].sort());
  });

  test('„Pomeri gore/dole" samo u „Planirano", sa ivicama', () => {
    const planned = buildMyDay(
      {
        ...OVERVIEW,
        tasks: [task('a'), task('b'), task('c')],
        personal: [],
        entries: [
          { _id: 'e1', dayKey: '2026-10-24', refKey: 'task:a', position: 1 },
          { _id: 'e2', dayKey: '2026-10-24', refKey: 'task:b', position: 2 },
          { _id: 'e3', dayKey: '2026-10-24', refKey: 'task:c', position: 3 },
        ],
      },
      NOW,
      ZONE,
    );
    const rows = listItems(planned.time, new Set()).filter((item) => item.type === 'row');
    expect(rows.map((item) => (item.type === 'row' ? item.movable : null))).toEqual([
      { up: false, down: true },
      { up: true, down: true },
      { up: true, down: false },
    ]);
    const byStartup = listItems(planned.startup, new Set()).filter((item) => item.type === 'row');
    expect(byStartup.every((item) => item.type === 'row' && item.movable === null)).toBe(true);
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
    expect(completionLabel('Faktura', true)).toBe('Završeno: Faktura');
    expect(completionLabel('Faktura', false)).toBe('Vraćeno u otvoreno: Faktura');
  });

  test('„Poništi" posle završavanja: startup na status od pre, lični u otvoren', () => {
    const model = buildMyDay(OVERVIEW, NOW, ZONE);
    const startupRow = timeSection(model.time, 'inProgress')!.rows[0];
    const personalRow = timeSection(model.time, 'overdue')!.rows[1];
    expect(completionUndoAction(startupRow, 'in_progress')).toEqual({
      kind: 'taskStatus',
      pageId: 't3',
      status: 'in_progress',
    });
    expect(completionUndoAction(startupRow, undefined)).toMatchObject({ status: 'next' });
    expect(completionUndoAction(personalRow, 'open')).toEqual({
      kind: 'personalTaskStatus',
      personalTaskId: 'p1',
      status: 'open',
    });
  });

  test('vraćanje startup zadatka: prethodni status, inače „Sledeće" (shared, isti poziv kao web)', () => {
    expect(reopenStatus('in_progress')).toBe('in_progress');
    expect(reopenStatus('blocked')).toBe('blocked');
    expect(reopenStatus(undefined)).toBe('next');
    expect(reopenStatus('done')).toBe('next');
    const row = timeSection(buildMyDay(OVERVIEW, NOW, ZONE).time, 'inProgress')!.rows[0];
    expect(completionCall(row, false, 'in_progress')).toEqual({
      fn: 'tasks.updateMetadata',
      pageId: 't3',
      status: 'in_progress',
    });
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
    const original = timeSection(model.time, 'overdue')!.rows[0];
    const holds = new Map<string, RowHold>([
      ['task:t1', { section: 'time:overdue', index: 0, row: original, done: true }],
    ]);
    const result = applyHolds(served.time, holds, new Map());
    const overdue = timeSection(result, 'overdue')!;
    expect(overdue.rows.map((row) => [row.key, row.done])).toEqual([
      ['task:t1', true],
      ['personal:p1', false],
    ]);
    const done = timeSection(result, 'doneToday')!;
    expect(done.rows.some((row) => row.key === 'task:t1')).toBe(false);
  });

  test('posle zadržavanja, dok mutacija čeka, red nosi željeni status gde ga podaci stave', () => {
    const result = applyHolds(model.time, new Map(), new Map([['personal:p1', true]]));
    expect(timeSection(result, 'overdue')!.rows.find((row) => row.key === 'personal:p1')?.done).toBe(true);
  });

  test('bez zadržavanja i čekanja sekcije su isti objekat', () => {
    expect(applyHolds(model.time, new Map(), new Map())).toBe(model.time);
  });

  test('indeks van opsega se seče na kraj sekcije', () => {
    const row = timeSection(model.time, 'today')!.rows[0];
    const result = applyHolds(
      model.time,
      new Map([[row.key, { section: 'time:today', index: 40, row, done: true }]]),
      new Map(),
    );
    expect(timeSection(result, 'today')!.rows.map((entry) => entry.key)).toEqual(['task:t2']);
  });

  test('zadržan red važi samo u rasporedu u kome je kliknut', () => {
    const original = timeSection(model.time, 'overdue')!.rows[0];
    const holds = new Map<string, RowHold>([
      ['task:t1', { section: 'time:overdue', index: 0, row: original, done: true }],
    ]);
    // Po startupu ga vode podaci (ostaje u grupi Cluck Rush, na svom mestu).
    const byStartup = applyHolds(model.startup, holds, new Map());
    const group = byStartup.find((entry) => entry.key === 'startup:s1')!;
    expect(group.rows.map((row) => row.key)).toEqual(['task:t1', 'task:t3', 'task:t5']);
    // A zadržavanje u rasporedu po startupu drži red u njegovoj grupi.
    const startupHold = new Map<string, RowHold>([
      ['task:t3', { section: 'startup:s1', index: 1, row: group.rows[1], done: true }],
    ]);
    expect(locateRow(applyHolds(model.startup, startupHold, new Map()), 'task:t3')).toEqual({
      section: 'startup:s1',
      index: 1,
    });
  });

  test('locateRow traži u listi koja se vidi', () => {
    expect(locateRow(model.time, 'personal:p1')).toEqual({ section: 'time:overdue', index: 1 });
    expect(locateRow(model.startup, 'personal:p1')).toEqual({ section: 'startup:personal', index: 0 });
    expect(locateRow(model.time, 'task:nema')).toBeNull();
  });
});
