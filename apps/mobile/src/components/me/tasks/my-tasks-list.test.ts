import {
  buildMyTasks,
  buildTaskRows,
  EMPTY_TASK_FILTERS,
  noonOfDayKey,
  startOfDayKey,
  TASKS_GROUP_PAGE,
  type TaskItemLike,
} from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import { cappedNote, listItemsOf, moreStep, shownOf, showMore } from './my-tasks-list';

const ZONE = 'Europe/Belgrade';
const NOW = startOfDayKey('2026-10-24', ZONE) + 9 * 3_600_000;
const due = (key: string) => noonOfDayKey(key, ZONE);
const CR = { _id: 's1', name: 'Cluck Rush', logoUrl: null };

function item(id: string, title: string, partial: Partial<TaskItemLike> = {}): TaskItemLike {
  return {
    _id: id,
    title,
    taskStatus: 'next',
    taskPriority: 'medium',
    dueDate: null,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    isCreator: true,
    isAssignee: true,
    startup: CR,
    area: { label: 'Sales' },
    createdAt: 1,
    ...partial,
  };
}

function modelOf(count: number, groupBy: 'startup' | 'due' = 'startup') {
  const rows = buildTaskRows({
    tasks: Array.from({ length: count }, (_, index) =>
      item(`t${index}`, `Zadatak ${String(index).padStart(3, '0')}`, { createdAt: index }),
    ),
    personal: [{ _id: 'p1', title: 'Struja', status: 'open', priority: null, dueDate: due('2026-10-22'), createdAt: 5 }],
    entries: [],
    capped: false,
  });
  return buildMyTasks(rows, EMPTY_TASK_FILTERS, groupBy, NOW, { zone: ZONE, startupOrder: ['s1'] });
}

describe('stavke liste Mojih zadataka', () => {
  test('zaglavlje, redovi i čip startupa po grupi (Lično prvo, null čip)', () => {
    const items = listItemsOf(modelOf(2), 'startup', {}, [CR]);
    expect(items.map((entry) => entry.type)).toEqual(['header', 'row', 'header', 'row', 'row']);
    expect(items[0]).toMatchObject({ title: 'Lično', count: 1, startup: null, tone: 'default' });
    expect(items[2]).toMatchObject({ title: 'Cluck Rush', count: 2, startup: CR });
    expect(items[1]).toMatchObject({ key: 'r:personal:p1', groupKey: 'licno' });
  });

  test('nepoznat startup (lista startupa se još učitava) nema čip — ne „Lično“', () => {
    const items = listItemsOf(modelOf(1), 'startup', {}, []);
    const header = items.find((entry) => entry.type === 'header' && entry.title === 'Cluck Rush');
    expect(header).toMatchObject({ startup: undefined });
    expect(items.find((entry) => entry.type === 'header' && entry.title === 'Lično')).toMatchObject({ startup: null });
  });

  test('po roku: bez čipa startupa, „Prekoračeno" je danger ton', () => {
    const items = listItemsOf(modelOf(1, 'due'), 'due', {}, [CR]);
    const overdue = items.find((entry) => entry.type === 'header' && entry.title === 'Prekoračeno');
    expect(overdue).toMatchObject({ tone: 'danger', startup: undefined });
  });

  test('grupa preko 100 redova: prva strana + „Prikaži još", pa sledeća strana', () => {
    const model = modelOf(130);
    const first = listItemsOf(model, 'startup', {}, [CR]);
    const rowsFirst = first.filter((entry) => entry.type === 'row' && entry.groupKey === 's1');
    expect(rowsFirst).toHaveLength(TASKS_GROUP_PAGE);
    const more = first.find((entry) => entry.type === 'more');
    expect(more).toMatchObject({ groupKey: 's1', remaining: 30, key: 'm:s1' });
    expect(moreStep(30)).toBe(30);
    expect(moreStep(250)).toBe(TASKS_GROUP_PAGE);

    const shown = showMore({}, 's1');
    expect(shownOf(shown, 's1')).toBe(2 * TASKS_GROUP_PAGE);
    const second = listItemsOf(model, 'startup', shown, [CR]);
    expect(second.filter((entry) => entry.type === 'row' && entry.groupKey === 's1')).toHaveLength(130);
    expect(second.some((entry) => entry.type === 'more')).toBe(false);
  });

  test('ključ reda je isti u svakom grupisanju (red se pomera, ne pravi iznova)', () => {
    const byStartup = listItemsOf(modelOf(1), 'startup', {}, [CR]).filter((entry) => entry.type === 'row');
    const byDue = listItemsOf(modelOf(1, 'due'), 'due', {}, [CR]).filter((entry) => entry.type === 'row');
    expect(new Set(byStartup.map((entry) => entry.key))).toEqual(new Set(byDue.map((entry) => entry.key)));
  });

  test('prazan model nema stavki; napomena o odsečenju', () => {
    const empty = buildMyTasks([], EMPTY_TASK_FILTERS, 'startup', NOW);
    expect(listItemsOf(empty, 'startup', {}, [])).toEqual([]);
    expect(cappedNote(500)).toBe('Prikazano je prvih 500. Suzi filter za ostatak.');
  });
});
