import { useSyncExternalStore } from 'react';

import type { Id } from '@/convex/_generated/dataModel';

/**
 * Poništavanje arhiviranja — JEDAN obrazac za celu aplikaciju (PARITET A6):
 * misli/veze, ideje, veze ideja, checkpointi i doprinosi idu kroz istu traku.
 * Modul-store van React-a (isti obrazac kao `hooks/use-reduced-motion.ts`:
 * Set listenera + `useSyncExternalStore`, bez Node `EventEmitter`-a koga RN nema).
 *
 * Zašto store, a ne state po ekranu: arhivira se sa mnogo mesta, a detalj posle
 * arhiviranja radi `router.back()` — traka mora da preživi tu navigaciju i da se
 * pojavi na ekranu koji je ostao ispod.
 *
 * Zašto uopšte in-memory undo: backend nema upite za arhivirane redove (liste
 * tvrdo filtriraju `archivedAt: null`), pa ekran „arhiva" nije moguć bez novog
 * backenda. Web isto radi kroz in-memory undo stack (`workspace-history.tsx`).
 * Id-jevi žive samo ovde — kad traka istekne, put nazad je desktop undo.
 */
export type UndoAction =
  | { kind: 'thoughts'; nodeIds: Id<'thoughtNodes'>[]; edgeIds: Id<'thoughtEdges'>[] }
  | { kind: 'idea'; startupId: Id<'startups'>; ideaId: Id<'ideaNodes'> }
  | {
      kind: 'ideaEdge';
      startupId: Id<'startups'>;
      nodeAId: Id<'ideaNodes'>;
      nodeBId: Id<'ideaNodes'>;
    }
  | { kind: 'checkpoint'; checkpointId: Id<'taskCheckpoints'> }
  | { kind: 'contribution'; contributionId: Id<'contentContributions'> }
  /**
   * Pomeranje kartica na kanvasu oblasti/stranice (režim „Uredi raspored", lanac 4).
   * Za razliku od ostalih članova ovo NIJE vraćanje arhiviranog nego inverzan potez:
   * `updates` nosi koordinate od PRE poteza, pa je poništavanje isti `movePages` poziv.
   * Koordinate stižu iz poruke `moved` (memorija), ne iz baze — baza je već prepisana.
   */
  | {
      kind: 'pageMove';
      startupId: Id<'startups'>;
      areaId: Id<'startupAreas'>;
      rootPageId: Id<'pages'> | null;
      updates: Array<{ pageId: Id<'pages'>; x: number; y: number }>;
    };

export type UndoEntry = {
  /** Poruka trake, npr. „Ideja je obrisana." */
  label: string;
  action: UndoAction;
  /**
   * Serverski rok za vraćanje (archive mutacije ga vraćaju kao `now + 8s`).
   * Kad postoji, tajmer trake ga poštuje umesto klijentskih 8s.
   */
  undoUntil?: number;
  /** Raste na svaki push — restartuje tajmer trake i za sadržinski istu stavku. */
  key: number;
};

let entry: UndoEntry | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function publish(next: UndoEntry | null) {
  entry = next;
  listeners.forEach((listener) => listener());
}

/** Nova stavka za poništavanje — pregazi prethodnu (jedna traka, poslednja radnja). */
export function pushUndo(input: { label: string; action: UndoAction; undoUntil?: number }) {
  counter += 1;
  publish({
    label: input.label,
    action: input.action,
    undoUntil: input.undoUntil,
    key: counter,
  });
}

export function clearUndo() {
  if (entry !== null) publish(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => entry;

/** Trenutna stavka za poništavanje (ili `null`) — reaktivno za `UndoBar`. */
export function useUndo(): UndoEntry | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
