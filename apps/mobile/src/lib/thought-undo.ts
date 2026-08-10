import { useSyncExternalStore } from 'react';

import type { Id } from '@/convex/_generated/dataModel';

/**
 * Poništavanje arhiviranja misli/veza — modul-store van React-a (isti obrazac kao
 * `hooks/use-reduced-motion.ts`: Set listenera + `useSyncExternalStore`, bez Node
 * `EventEmitter`-a koga RN nema).
 *
 * Zašto store, a ne state po ekranu: arhivira se sa tri mesta (lista misli, detalj
 * misli, sheet na kanvasu), a detalj posle arhiviranja radi `router.back()` — traka
 * mora da preživi tu navigaciju i da se pojavi na ekranu koji je ostao ispod.
 *
 * Zašto uopšte undo, kad backend nema upit za arhivirane misli: `listNodes` tvrdo
 * filtrira `archivedAt: null`, pa ekran „arhiva" nije moguć bez novog backenda.
 * Web isto radi kroz in-memory undo stack (`workspace-history.tsx`). Id-jevi žive
 * samo ovde — kad traka istekne, put nazad je desktop undo.
 */
export type ThoughtUndoEntry = {
  /** Poruka trake, npr. „Misao je arhivirana." */
  label: string;
  nodeIds: Id<'thoughtNodes'>[];
  edgeIds: Id<'thoughtEdges'>[];
  /** Raste na svaki push — restartuje tajmer trake i za sadržinski istu stavku. */
  key: number;
};

let entry: ThoughtUndoEntry | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function publish(next: ThoughtUndoEntry | null) {
  entry = next;
  listeners.forEach((listener) => listener());
}

/** Nova stavka za poništavanje — pregazi prethodnu (jedna traka, poslednja radnja). */
export function pushThoughtUndo(input: {
  label: string;
  nodeIds?: Id<'thoughtNodes'>[];
  edgeIds?: Id<'thoughtEdges'>[];
}) {
  counter += 1;
  publish({
    label: input.label,
    nodeIds: input.nodeIds ?? [],
    edgeIds: input.edgeIds ?? [],
    key: counter,
  });
}

export function clearThoughtUndo() {
  if (entry !== null) publish(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => entry;

/** Trenutna stavka za poništavanje (ili `null`) — reaktivno za `ThoughtUndoBar`. */
export function useThoughtUndo(): ThoughtUndoEntry | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
