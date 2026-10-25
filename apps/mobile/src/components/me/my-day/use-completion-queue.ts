import {
  completionCall,
  DURATION,
  SPRING,
  springDurationMs,
  type TaskRowModel,
  type TaskStatusKey,
} from '@devotion/shared';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { announceWithUndoBar } from '@/lib/announce';
import { dropUndo, pushUndo } from '@/lib/undo';

import { completionLabel, completionUndoAction, type RowHold } from './my-day-model';

/** Red ostaje na mestu dok se kvačica ne smiri (plan K07 E7, ≈ 741 ms). */
export const HOLD_DONE_MS = springDurationMs(SPRING.bouncy);
/** Vraćanje u otvoreno: dok se kvačica isprazni. */
export const HOLD_REOPEN_MS = DURATION.base;

export type CompletionQueue = {
  holds: ReadonlyMap<string, RowHold>;
  pending: ReadonlyMap<string, boolean>;
  toggleDone: (row: TaskRowModel, done: boolean) => void;
};

/**
 * Završi / vrati (plan K07 §4.1 trenutak 1 i E7) — par web `use-completion-queue.ts`:
 * mutacija kreće ODMAH; red ostaje na svom mestu kao završen dok se kvačica ne
 * smiri, pa ga layout tranzicija preseli (npr. u „Završeno danas"). Drugi dodir
 * pre toga je „Poništi" u mestu. Do odgovora servera `pending` drži red kao
 * završen; greška vraća red uz `haptics.error` i poruku servera.
 *
 * Traka „Poništi" (8 s, postojeći `UndoBar`) je par web toasta „Završeno: …":
 * njen inverz ide kroz `useUndoRunner` (`taskStatus` / `personalTaskStatus`).
 * Kad korisnik isti red sam vrati dodirom, traka tog završavanja se skida.
 */
export function useCompletionQueue({
  locate,
  commit,
}: {
  /** Gde je red u listi na ekranu (raspored iz trenutka dodira). */
  locate: (key: string) => { section: string; index: number } | null;
  commit: (row: TaskRowModel, done: boolean, previousStatus: TaskStatusKey | undefined) => Promise<unknown>;
}): CompletionQueue {
  const [holds, setHolds] = useState<ReadonlyMap<string, RowHold>>(() => new Map());
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const previousStatus = useRef(new Map<string, TaskStatusKey>());
  // Redni broj poslednjeg slanja po redu: stariji odgovor ne briše noviju nameru.
  const sequence = useRef(new Map<string, number>());
  const undoKeys = useRef(new Map<string, number>());

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  const dropHold = (key: string) =>
    setHolds((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  const setPendingValue = (key: string, value: boolean | null) =>
    setPending((current) => {
      if (value === null && !current.has(key)) return current;
      const next = new Map(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  const clearTimer = (key: string) => {
    const timer = timers.current.get(key);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(key);
  };

  const toggleDone = (row: TaskRowModel, done: boolean) => {
    const previous = previousStatus.current.get(row.key);
    const check = completionCall(row, done, previous);
    if (check.fn === 'denied') {
      haptics.warning();
      return;
    }
    if (done && row.status !== 'done') previousStatus.current.set(row.key, row.status);
    const statusBefore = previousStatus.current.get(row.key);

    // Zadrži red tamo gde se sada vidi; posle smirivanja ga vode podaci.
    const location = locate(row.key);
    clearTimer(row.key);
    if (location) {
      setHolds((current) =>
        new Map(current).set(row.key, { section: location.section, index: location.index, row, done }),
      );
      timers.current.set(
        row.key,
        setTimeout(() => {
          timers.current.delete(row.key);
          dropHold(row.key);
        }, done ? HOLD_DONE_MS : HOLD_REOPEN_MS),
      );
    } else {
      dropHold(row.key);
    }

    // Traka „Poništi": završavanje je nudi; vraćanje dodirom skida staru —
    // `dropUndo` ne dira traku ako ona već nudi neku drugu, noviju radnju.
    const staleUndo = undoKeys.current.get(row.key);
    if (staleUndo !== undefined) {
      undoKeys.current.delete(row.key);
      dropUndo(staleUndo);
    }
    const undoKey = done
      ? pushUndo({ label: completionLabel(row.title, true), action: completionUndoAction(row, statusBefore) })
      : null;
    if (undoKey !== null) {
      undoKeys.current.set(row.key, undoKey);
      announceWithUndoBar(completionLabel(row.title, true));
    }

    // Mutacija kreće ODMAH (E7) — animacija ništa ne čeka.
    const order = (sequence.current.get(row.key) ?? 0) + 1;
    sequence.current.set(row.key, order);
    const latest = () => sequence.current.get(row.key) === order;
    setPendingValue(row.key, done);
    void commit(row, done, statusBefore)
      .then(() => {
        if (!latest()) return;
        setPendingValue(row.key, null);
        // Završavanje je najavila traka; vraćanje nema traku.
        if (!done) AccessibilityInfo.announceForAccessibility(completionLabel(row.title, false));
      })
      .catch((error: unknown) => {
        // Zakasneli neuspeh starije namere ne dira noviju (ni red, ni njenu
        // traku, ni poruku): važi samo poslednja namera za ovaj red.
        if (!latest()) return;
        clearTimer(row.key);
        dropHold(row.key);
        setPendingValue(row.key, null);
        if (undoKey !== null && undoKeys.current.get(row.key) === undoKey) {
          undoKeys.current.delete(row.key);
          dropUndo(undoKey);
        }
        haptics.error();
        Alert.alert(
          done ? 'Zadatak nije završen' : 'Zadatak nije vraćen',
          accessErrorMessage(error, 'Pokušaj ponovo.'),
        );
      });
  };

  return { holds, pending, toggleDone };
}
