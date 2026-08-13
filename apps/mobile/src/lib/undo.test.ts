import { beforeEach, describe, expect, test } from 'vitest';

import type { Id } from '@/convex/_generated/dataModel';

import {
  clearUndo,
  getUndoSnapshotForTest,
  hideUndoBar,
  popUndo,
  pushUndo,
  type UndoAction,
} from './undo';

function checkpointAction(id: string): UndoAction {
  return { kind: 'checkpoint', checkpointId: id as Id<'taskCheckpoints'> };
}

function push(label: string, id: string, undoUntil?: number) {
  pushUndo({ label, action: checkpointAction(id), undoUntil });
}

beforeEach(() => {
  clearUndo();
});

describe('lib/undo — stek poništavanja (PARITET-REVIZIJA C12)', () => {
  test('T1 — tri pushUndo drže sve tri stavke (ne pregazi prethodnu)', () => {
    push('Prva', 'a');
    push('Druga', 'b');
    push('Treća', 'c');
    expect(getUndoSnapshotForTest().stack.length).toBe(3);
  });

  test('T2 — vrh je poslednja gurnuta; useUndoStack (snapshot) redosled je najnovija prva', () => {
    push('Prva', 'a');
    push('Druga', 'b');
    push('Treća', 'c');
    const { stack } = getUndoSnapshotForTest();
    expect(stack.map((entry) => entry.label)).toEqual(['Treća', 'Druga', 'Prva']);
  });

  test('T3 — popUndo(key) briše samo tu stavku, ostale ostaju', () => {
    push('Prva', 'a');
    push('Druga', 'b');
    push('Treća', 'c');
    const middle = getUndoSnapshotForTest().stack.find((entry) => entry.label === 'Druga')!;
    popUndo(middle.key);
    const { stack } = getUndoSnapshotForTest();
    expect(stack.map((entry) => entry.label)).toEqual(['Treća', 'Prva']);
  });

  test('T4 — popUndo(key, { advertiseNext: true }) postavi traku na novi vrh; bez opcije traka je null', () => {
    push('Prva', 'a');
    push('Druga', 'b');
    const top = getUndoSnapshotForTest().stack[0]!; // "Druga"

    popUndo(top.key);
    expect(getUndoSnapshotForTest().bar).toBeNull();

    push('Treća', 'c');
    const newTop = getUndoSnapshotForTest().stack[0]!; // "Treća"
    popUndo(newTop.key, { advertiseNext: true });
    expect(getUndoSnapshotForTest().bar?.label).toBe('Prva');
  });

  test('T5 — 21. pushUndo izbaci najstariju, dužina ostaje 20', () => {
    for (let i = 0; i < 21; i++) push(`Stavka ${i}`, `id-${i}`);
    const { stack } = getUndoSnapshotForTest();
    expect(stack.length).toBe(20);
    expect(stack.some((entry) => entry.label === 'Stavka 0')).toBe(false);
    expect(stack[0]!.label).toBe('Stavka 20');
  });

  test('T6 — stavka sa undoUntil u prošlosti nestane na sledeći pushUndo', () => {
    push('Ističe', 'a', Date.now() - 1000);
    expect(getUndoSnapshotForTest().stack.length).toBe(1);
    push('Sveža', 'b');
    const { stack } = getUndoSnapshotForTest();
    expect(stack.map((entry) => entry.label)).toEqual(['Sveža']);
  });

  test('T7 — clearUndo() prazni i stek i traku', () => {
    push('Prva', 'a');
    push('Druga', 'b');
    expect(getUndoSnapshotForTest().stack.length).toBe(2);
    expect(getUndoSnapshotForTest().bar).not.toBeNull();
    clearUndo();
    expect(getUndoSnapshotForTest().stack.length).toBe(0);
    expect(getUndoSnapshotForTest().bar).toBeNull();
  });

  test('hideUndoBar() sklanja traku bez brisanja steka', () => {
    push('Prva', 'a');
    expect(getUndoSnapshotForTest().bar).not.toBeNull();
    hideUndoBar();
    expect(getUndoSnapshotForTest().bar).toBeNull();
    expect(getUndoSnapshotForTest().stack.length).toBe(1);
  });
});
