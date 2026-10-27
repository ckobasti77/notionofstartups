import { beforeEach, describe, expect, test } from 'vitest';

import type { Id } from '@/convex/_generated/dataModel';

import {
  clearUndo,
  dropUndo,
  getUndoSnapshotForTest,
  hasUndo,
  hideUndoBar,
  popUndo,
  pushUndo,
  showUndoNotice,
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

  test('K12 — pushUndo vraća ključ; hasUndo pita pre popUndo da ne skloni tuđu traku', () => {
    const done = pushUndo({
      label: 'Završeno: Faktura',
      action: { kind: 'personalTaskStatus', personalTaskId: 'p1' as Id<'personalTasks'>, status: 'open' },
    });
    expect(hasUndo(done)).toBe(true);
    popUndo(done);
    expect(hasUndo(done)).toBe(false);
    push('Druga radnja', 'b');
    // Već skinuta stavka: pozivalac ne zove popUndo, pa traka druge radnje ostaje.
    expect(hasUndo(done)).toBe(false);
    expect(getUndoSnapshotForTest().bar?.label).toBe('Druga radnja');
  });

  test('K12 — dropUndo skida staru stavku, a traka nove radnje ostaje', () => {
    const old = pushUndo({
      label: 'Završeno: Faktura',
      action: { kind: 'personalTaskStatus', personalTaskId: 'p1' as Id<'personalTasks'>, status: 'open' },
    });
    push('Novija radnja', 'n');
    dropUndo(old);
    const { stack, bar } = getUndoSnapshotForTest();
    expect(stack.map((entry) => entry.label)).toEqual(['Novija radnja']);
    expect(bar?.label).toBe('Novija radnja');
    // Stavka na traci: dropUndo sklanja i traku; nepostojeći ključ ne radi ništa.
    const visible = getUndoSnapshotForTest().bar!.key;
    dropUndo(visible);
    expect(getUndoSnapshotForTest().bar).toBeNull();
    dropUndo(9999);
    expect(getUndoSnapshotForTest().stack).toEqual([]);
  });

  test('K12 — druga radnja trake („Otvori") ide uz stavku; bez nje polja nema', () => {
    let opened = 0;
    pushUndo({
      label: 'Dodato u Cluck Rush · Marketing.',
      action: { kind: 'pageCreate', startupId: 's1' as Id<'startups'>, pageId: 'pg1' as Id<'pages'> },
      secondary: { label: 'Otvori', onPress: () => (opened += 1) },
    });
    const bar = getUndoSnapshotForTest().bar;
    expect(bar?.secondary?.label).toBe('Otvori');
    bar?.secondary?.onPress();
    expect(opened).toBe(1);
    push('Bez druge radnje', 'c');
    expect('secondary' in (getUndoSnapshotForTest().bar ?? {})).toBe(false);
  });

  test('K12 — uklonjen komentar nosi serverski rok, a Korpa nema rok; traka prikazuje poslednju', () => {
    const until = Date.now() + 8_000;
    pushUndo({
      label: 'Komentar je uklonjen.',
      action: { kind: 'comment', commentId: 'c1' as Id<'contentContributions'> },
      undoUntil: until,
    });
    expect(getUndoSnapshotForTest().bar?.undoUntil).toBe(until);
    pushUndo({
      label: '„Plan" je u Korpi.',
      action: { kind: 'trashRestore', pageId: 'pg1' as Id<'pages'> },
    });
    const snapshot = getUndoSnapshotForTest();
    expect(snapshot.bar?.action).toEqual({ kind: 'trashRestore', pageId: 'pg1' });
    expect(snapshot.bar?.undoUntil).toBeUndefined();
    // Oba ostaju u „Istoriji radnji" dok ne isteknu.
    expect(snapshot.stack.map((entry) => entry.action.kind)).toEqual(['trashRestore', 'comment']);
  });

  test('K09 — poruka bez „Poništi" (Korpa) smenjuje traku, a stek ostaje netaknut', () => {
    let opened = 0;
    push('Prva', 'a');
    showUndoNotice({
      label: 'Vraćeno: „Plan”.',
      secondary: { label: 'Otvori', onPress: () => (opened += 1) },
    });
    const snapshot = getUndoSnapshotForTest();
    // Traka nudi poruku, ne stavku; stavka i dalje čeka u „Istoriji radnji".
    expect(snapshot.bar).toBeNull();
    expect(snapshot.notice?.label).toBe('Vraćeno: „Plan”.');
    expect(snapshot.stack.map((entry) => entry.label)).toEqual(['Prva']);
    snapshot.notice?.secondary?.onPress();
    expect(opened).toBe(1);
  });

  test('K09 — nova radnja, ✕ i clearUndo sklanjaju poruku; svaki prikaz dobija nov ključ', () => {
    showUndoNotice({ label: 'Vraćeno.' });
    const first = getUndoSnapshotForTest().notice!.key;
    showUndoNotice({ label: 'Vraćeno.' });
    expect(getUndoSnapshotForTest().notice!.key).not.toBe(first);
    expect('secondary' in getUndoSnapshotForTest().notice!).toBe(false);

    push('Radnja', 'r');
    expect(getUndoSnapshotForTest().notice).toBeNull();
    expect(getUndoSnapshotForTest().bar?.label).toBe('Radnja');

    showUndoNotice({ label: 'Uklonjeno iz Oporavljenog.' });
    hideUndoBar();
    expect(getUndoSnapshotForTest().notice).toBeNull();
    expect(getUndoSnapshotForTest().stack.length).toBe(1);

    showUndoNotice({ label: 'Vraćeno.' });
    clearUndo();
    expect(getUndoSnapshotForTest().notice).toBeNull();
    expect(getUndoSnapshotForTest().stack).toEqual([]);
  });
});
