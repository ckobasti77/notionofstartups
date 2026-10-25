import { locateStartupRow, type StartupTaskHold, type StartupTaskLike } from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import {
  ALL_TASKS_LIST,
  buildCommandSections,
  buildFlatSection,
  buildStatusSections,
  COMMAND_CENTER_LIST,
  sectionRowCount,
  startupRow,
  type HoldsContext,
  type StartupRowsContext,
} from './startup-task-model';

// subota 24.10.2026. 09:30 u Beogradu
const NOW = Date.UTC(2026, 9, 24, 7, 30);
const noon = (day: number) => Date.UTC(2026, 9, day, 10, 0);
const STARTUP = { _id: 's1', name: 'Cluck Rush', logoUrl: null };

function task(id: string, partial: Partial<StartupTaskLike & { taskSortAt: number }> = {}) {
  return {
    _id: id,
    areaId: 'a1',
    title: `Zadatak ${id}`,
    taskStatus: 'next' as const,
    taskPriority: 'medium' as const,
    dueDate: null,
    createdByProfileId: 'ana',
    taskSortAt: 0,
    ...partial,
  };
}

const context = (partial: Partial<StartupRowsContext & HoldsContext> = {}): StartupRowsContext & HoldsContext => ({
  profileId: 'me',
  startup: STARTUP,
  areaLabels: new Map([['a1', 'Marketing']]),
  assigneeIdsByTask: new Map<string, string[]>(),
  plannedKeys: new Map<string, string>(),
  holds: new Map<string, StartupTaskHold>(),
  pending: new Map<string, boolean>(),
  ...partial,
});

const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((row) => row.id);

describe('Komandni centar na telefonu — sekcije sa redovima', () => {
  const tasks = [
    task('kasni', { dueDate: noon(20) }),
    task('danas', { dueDate: noon(24) }),
    task('kasnije', { dueDate: noon(30) }),
    task('blok', { taskStatus: 'blocked' }),
    task('gotov', { taskStatus: 'done' }),
  ];

  test('četiri sekcije redom, završeni se ne prikazuju, red je zajednički model', () => {
    const sections = buildCommandSections(tasks, NOW, context());
    expect(sections.map((section) => section.id)).toEqual(['overdue', 'today', 'next', 'blocked']);
    expect(ids(sections[0].rows)).toEqual(['kasni']);
    expect(ids(sections[1].rows)).toEqual(['danas']);
    expect(ids(sections[2].rows)).toEqual(['kasnije']);
    expect(ids(sections[3].rows)).toEqual(['blok']);
    expect(sectionRowCount(sections)).toBe(4);
    expect(sections[0].rows[0]).toMatchObject({
      key: 'task:kasni',
      kind: 'task',
      status: 'next',
      areaLabel: 'Marketing',
      startup: STARTUP,
      planned: false,
    });
  });

  test('dozvole: kreator sve, izvršilac samo status, ostali zaključano sa razlogom', () => {
    const own = startupRow(task('t', { createdByProfileId: 'me' }), context());
    expect(own.permissions.status.allowed).toBe(true);
    expect(own.permissions.due.allowed).toBe(true);

    const assigned = startupRow(
      task('t'),
      context({ assigneeIdsByTask: new Map([['t', ['me']]]) }),
    );
    expect(assigned.permissions.status.allowed).toBe(true);
    expect(assigned.permissions.due.allowed).toBe(false);
    expect(assigned.permissions.due.reason).toBeTruthy();

    const stranger = startupRow(task('t'), context());
    expect(stranger.permissions.status.allowed).toBe(false);
    expect(stranger.permissions.status.reason).toBeTruthy();
  });

  test('dok se izvršioci ne učitaju, ne-kreator nije izvršilac; segment „Moji" ga pretpostavlja', () => {
    const loading = startupRow(task('t'), context({ assigneeIdsByTask: null }));
    expect(loading.permissions.status.allowed).toBe(false);

    const mine = startupRow(task('t'), context({ assigneeIdsByTask: null, assumeAssignee: true }));
    expect(mine.permissions.status.allowed).toBe(true);
  });

  test('plan za danas: red zna da li je u Moj dan i koja je stavka', () => {
    const sections = buildCommandSections(
      [task('t1')],
      NOW,
      context({ plannedKeys: new Map([['task:t1', 'entry1']]) }),
    );
    expect(sections[2].rows[0]).toMatchObject({ planned: true, planEntryId: 'entry1' });
  });

  test('zadržan red (kvačica) ostaje u svojoj sekciji i kad ga server više ne šalje', () => {
    const served = [task('danas', { dueDate: noon(24) }), task('drugi', { dueDate: noon(24) })];
    const row = startupRow(served[0], context());
    const holds = new Map<string, StartupTaskHold>([
      ['task:danas', { section: `${COMMAND_CENTER_LIST}:today`, index: 0, row, done: true }],
    ]);
    // Server je već sklonio završen zadatak iz Komandnog centra.
    const sections = buildCommandSections(served.slice(1), NOW, context({ holds }));
    expect(ids(sections[1].rows)).toEqual(['danas', 'drugi']);
    expect(sections[1].rows[0].done).toBe(true);
    expect(locateStartupRow(COMMAND_CENTER_LIST, sections, 'task:danas')).toEqual({
      section: `${COMMAND_CENTER_LIST}:today`,
      index: 0,
    });
  });

  test('„čeka potvrdu": red se vidi kao završen dok server ne odgovori', () => {
    const sections = buildCommandSections(
      [task('t', { dueDate: noon(24) })],
      NOW,
      context({ pending: new Map([['task:t', true]]) }),
    );
    expect(sections[1].rows[0].done).toBe(true);
  });

  test('prazan startup: četiri prazne sekcije, nula redova', () => {
    const sections = buildCommandSections([], NOW, context());
    expect(sections).toHaveLength(4);
    expect(sectionRowCount(sections)).toBe(0);
  });
});

describe('Svi zadaci na telefonu — grupe po statusu', () => {
  const tasks = [
    task('a', { taskStatus: 'in_progress' }),
    task('b', { taskStatus: 'backlog' }),
    task('c', { taskStatus: 'done' }),
    task('d', { taskStatus: 'in_progress' }),
  ];

  test('grupe redom backlog → sledeće → u toku → blokirano → gotovo, redosled sa servera u grupi', () => {
    const sections = buildStatusSections(tasks, context());
    expect(sections.map((section) => section.id)).toEqual(['backlog', 'next', 'in_progress', 'blocked', 'done']);
    expect(ids(sections[2].rows)).toEqual(['a', 'd']);
    expect(ids(sections[0].rows)).toEqual(['b']);
    expect(ids(sections[4].rows)).toEqual(['c']);
    expect(sections[4].rows[0].done).toBe(true);
  });

  test('zadržan red ostaje u grupi gde je bio dok ga podaci presele u „Gotovo"', () => {
    const row = startupRow(tasks[0], context());
    const holds = new Map<string, StartupTaskHold>([
      ['task:a', { section: `${ALL_TASKS_LIST}:in_progress`, index: 0, row, done: true }],
    ]);
    // Podaci su već preselili „a" u „Gotovo".
    const moved = [{ ...tasks[0], taskStatus: 'done' as const }, tasks[1], tasks[2], tasks[3]];
    const sections = buildStatusSections(moved, context({ holds }));
    expect(ids(sections[2].rows)).toEqual(['a', 'd']);
    expect(ids(sections[4].rows)).toEqual(['c']);
  });

  test('ravna lista kad je status filtriran: jedna sekcija, redosled kao sa servera', () => {
    const sections = buildFlatSection([tasks[0], tasks[3]], context(), 'in_progress');
    expect(sections).toHaveLength(1);
    expect(ids(sections[0].rows)).toEqual(['a', 'd']);
  });
});
