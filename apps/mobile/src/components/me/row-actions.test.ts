import { SWIPE, taskPermissions, type TaskRowModel } from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import { rowSwipeSpec, SCHEDULE_LABEL, swipeCommand } from './row-actions';

function row(partial: Partial<TaskRowModel> & { isCreator?: boolean; isAssignee?: boolean } = {}): TaskRowModel {
  const { isCreator = true, isAssignee = true, ...rest } = partial;
  const kind = rest.kind ?? 'task';
  return {
    key: `${kind}:r1`,
    kind,
    id: 'r1',
    title: 'Ugovor',
    status: 'next',
    priority: null,
    dueDate: null,
    startup: kind === 'task' ? { _id: 's1', name: 'Cluck Rush', logoUrl: null } : null,
    areaLabel: null,
    planned: false,
    planEntryId: null,
    done: false,
    checkpoints: null,
    permissions: taskPermissions({ kind, isCreator, isAssignee }),
    ...rest,
  };
}

describe('swipe reda → radnja (K12, plan K07 §6.2)', () => {
  test('desno završava, levo otvara „Rok i plan"', () => {
    const spec = rowSwipeSpec(row());
    expect(spec.right).toEqual({ command: 'complete', label: 'Završi', allowed: true, reason: null });
    expect(spec.left).toEqual({ command: 'schedule', label: SCHEDULE_LABEL, allowed: true, reason: null });
  });

  test('završen red: desno vraća u otvoreno', () => {
    expect(rowSwipeSpec(row({ done: true, status: 'done' })).right).toMatchObject({
      command: 'reopen',
      label: 'Vrati',
      allowed: true,
    });
  });

  test('tuđ zadatak u planu: završavanje zabranjeno sa razlogom, „Rok i plan" i dalje radi (plan je lični)', () => {
    const spec = rowSwipeSpec(row({ isCreator: false, isAssignee: false }));
    expect(spec.right).toMatchObject({
      allowed: false,
      reason: 'Status menja kreator zadatka ili osoba kojoj je dodeljen.',
    });
    expect(spec.left.allowed).toBe(true);
  });

  test('izvršilac i lični vlasnik smeju da završe', () => {
    expect(rowSwipeSpec(row({ isCreator: false, isAssignee: true })).right.allowed).toBe(true);
    expect(rowSwipeSpec(row({ kind: 'personal', status: 'open' })).right.allowed).toBe(true);
  });

  test('prag u oba smera (96 pt) i smer određuju radnju', () => {
    const target = row();
    expect(swipeCommand({ translationX: SWIPE.commitPx, velocityX: 0 }, target)?.command).toBe('complete');
    expect(swipeCommand({ translationX: -SWIPE.commitPx, velocityX: 0 }, target)?.command).toBe('schedule');
    expect(swipeCommand({ translationX: SWIPE.commitPx - 1, velocityX: 0 }, target)).toBeNull();
    expect(swipeCommand({ translationX: 0, velocityX: 0 }, target)).toBeNull();
  });

  test('trzaj ispod praga potvrđuje samo posle dovoljno puta, u istom smeru', () => {
    const target = row();
    const fast = SWIPE.flickVelocity;
    expect(swipeCommand({ translationX: SWIPE.flickMinPx, velocityX: fast }, target)?.command).toBe('complete');
    expect(swipeCommand({ translationX: -SWIPE.flickMinPx, velocityX: -fast }, target)?.command).toBe('schedule');
    expect(swipeCommand({ translationX: SWIPE.flickMinPx - 1, velocityX: fast }, target)).toBeNull();
    // Trzaj nazad preko praga je predomišljanje, ne potvrda.
    expect(swipeCommand({ translationX: SWIPE.commitPx + 10, velocityX: -fast }, target)).toBeNull();
  });

  test('bez dozvole swipe i dalje bira radnju, ali je zaključanu (red se vraća uz upozorenje)', () => {
    const denied = swipeCommand({ translationX: SWIPE.commitPx, velocityX: 0 }, row({ isCreator: false, isAssignee: false }));
    expect(denied).toMatchObject({ command: 'complete', allowed: false });
  });
});
