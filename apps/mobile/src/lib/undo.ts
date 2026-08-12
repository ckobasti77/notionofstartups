import { useSyncExternalStore } from 'react';

import type { Id } from '@/convex/_generated/dataModel';
import type { CheckpointEndpoint } from '@/lib/canvas-endpoints';

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
   *
   * K4: isti potez može da nosi i korake zadatka (`checkpoints`). Jedna stavka, jer je
   * i potez bio jedan — `canvasRootPageId` za `saveCanvasPlacement` je isti `rootPageId`
   * koji `movePages` već nosi (canvas root je jedan).
   */
  | {
      kind: 'pageMove';
      startupId: Id<'startups'>;
      areaId: Id<'startupAreas'>;
      rootPageId: Id<'pages'> | null;
      updates: Array<{ pageId: Id<'pages'>; x: number; y: number }>;
      checkpoints?: Array<{ checkpointId: Id<'taskCheckpoints'>; x: number; y: number }>;
    }
  /**
   * Promena veličine kartice na kanvasu oblasti/stranice (K2). Kao i `pageMove`, ovo
   * je inverzan potez a ne vraćanje arhiviranog: polja nose stanje od PRE radnje, pa
   * je poništavanje isti `resizePage` poziv sa starim dimenzijama — što je i tačan
   * inverz za `resetPageSize` (desktop radi identično, `area-canvas-view.tsx`).
   * `x`/`y` postoje samo kad je potez pomerio i rub kartice (ugaona ručka) i šalju se
   * ISKLJUČIVO zajedno — server odbija jedno bez drugog.
   */
  | {
      kind: 'pageResize';
      startupId: Id<'startups'>;
      areaId: Id<'startupAreas'>;
      rootPageId: Id<'pages'> | null;
      pageId: Id<'pages'>;
      width: number;
      height: number;
      x?: number;
      y?: number;
    }
  /**
   * Napravljena veza između dve kartice na kanvasu (K3). Inverz je `disconnectPages`
   * nad ivicom koju je server upravo vratio — zato nosi `edgeId`, ne par.
   */
  | {
      kind: 'pageEdgeConnect';
      startupId: Id<'startups'>;
      areaId: Id<'startupAreas'>;
      rootPageId: Id<'pages'> | null;
      edgeId: Id<'pageCanvasEdgesV2'>;
    }
  /**
   * Raskinuta veza (K3). Nosi PAR, a ne `edgeId`, jer `connectPages` — za razliku od
   * `ideas.connect` — arhiviranu ivicu NE oživljava (traži aktivnu, pa pravi novu).
   * Poništavanje zato pravi novu vezu i mora da ponese `label` da se naziv ne izgubi;
   * isto radi desktop redo (`area-canvas-view.tsx`).
   */
  | {
      kind: 'pageEdgeDisconnect';
      startupId: Id<'startups'>;
      areaId: Id<'startupAreas'>;
      rootPageId: Id<'pages'> | null;
      sourcePageId: Id<'pages'>;
      targetPageId: Id<'pages'>;
      label?: string;
    }
  /**
   * Promena veličine checkpoint oblačića iz sheet-a (K4). Inverz je USLOVAN i to je
   * cela poenta ovog člana: ako korak PRE radnje nije imao ručnu veličinu
   * (`manuallySized: false`), vraćanje samo dimenzija bi ga zauvek ostavilo ručno
   * dimenzionisanim — treba i `resetCanvasSize`. Desktop radi identično
   * (`area-canvas-view.tsx` `persistCheckpointResize`).
   */
  | {
      kind: 'checkpointResize';
      checkpointId: Id<'taskCheckpoints'>;
      canvasRootPageId: Id<'pages'> | null;
      x: number;
      y: number;
      width: number;
      height: number;
      manuallySized: boolean;
    }
  /**
   * Napravljena checkpoint veza (K4). Inverz je `disconnect` nad ivicom koju je server
   * upravo vratio — zato nosi `edgeId`, ne par (isto kao `pageEdgeConnect`).
   */
  | {
      kind: 'checkpointEdgeConnect';
      startupId: Id<'startups'>;
      areaId: Id<'startupAreas'>;
      rootPageId: Id<'pages'> | null;
      edgeId: Id<'taskCheckpointCanvasEdges'>;
    }
  /**
   * Raskinuta checkpoint veza (K4). Nosi PAR endpointa, ne `edgeId`: `connect` traži
   * AKTIVNU ivicu, pa arhiviranu ne oživljava nego pravi NOVU (isto kao `connectPages`).
   */
  | {
      kind: 'checkpointEdgeDisconnect';
      startupId: Id<'startups'>;
      areaId: Id<'startupAreas'>;
      rootPageId: Id<'pages'> | null;
      source: CheckpointEndpoint;
      target: CheckpointEndpoint;
    }
  /**
   * Pomeranje ideja na kanvasu (K5). Kao `pageMove` — inverzan potez, ne vraćanje
   * arhiviranog. `updates` nosi ono što je u BAZI pisalo pre poteza, dakle STORED
   * (relativne) koordinate; embed ih tako i šalje (`lib/canvas-nesting.ts`).
   */
  | {
      kind: 'ideaMove';
      startupId: Id<'startups'>;
      updates: Array<{ id: Id<'ideaNodes'>; x: number; y: number }>;
    }
  /**
   * Promena veličine ideje (K5). Inverz je USLOVAN, kao kod `checkpointResize`: ako
   * kartica PRE poteza nije imala ručnu veličinu, vraćanje samo dimenzija bi je
   * zauvek ostavilo ručno dimenzionisanom — treba `resetLayoutSize`, a pozicija se
   * vraća zasebno (`resetLayoutSize` je ne dira).
   */
  | {
      kind: 'ideaResize';
      startupId: Id<'startups'>;
      ideaId: Id<'ideaNodes'>;
      x: number;
      y: number;
      width: number;
      height: number;
      manuallySized: boolean;
    }
  /**
   * Napravljena veza između dve ideje (K5). Inverz je `ideas.disconnect` nad ivicom
   * koju je server upravo vratio — zato `edgeId`, ne par.
   */
  | { kind: 'ideaEdgeConnect'; startupId: Id<'startups'>; edgeId: Id<'ideaEdges'> }
  /** Pomeranje misli na kanvasu (K5) — blizanac `ideaMove`; `moveNodes` nema startupId. */
  | {
      kind: 'thoughtMove';
      moves: Array<{ nodeId: Id<'thoughtNodes'>; x: number; y: number }>;
    }
  /** Promena veličine misli (K5) — blizanac `ideaResize`. */
  | {
      kind: 'thoughtResize';
      nodeId: Id<'thoughtNodes'>;
      x: number;
      y: number;
      width: number;
      height: number;
      manuallySized: boolean;
    }
  /**
   * Napravljena veza između dve misli (K5). Inverz je `archiveEdges` — a ne
   * `restoreEdges`, koji vraća ono što je arhivirano.
   */
  | { kind: 'thoughtEdgeConnect'; edgeId: Id<'thoughtEdges'> }
  /**
   * Preimenovanje stranice iz `PageActionsSheet` (P1, B2/B3). Inverz je isti
   * `updatePage` poziv sa naslovom OD PRE i revizijom KOJU JE preimenovanje
   * vratilo — ako je neko u međuvremenu opet izmenio stranicu, poziv baca
   * `KONFLIKT_IZMENA` i traka namerno ostaje (isti obrazac kao ostale grane).
   */
  | {
      kind: 'pageRename';
      startupId: Id<'startups'>;
      pageId: Id<'pages'>;
      /** Naslov PRE preimenovanja. */
      title: string;
      /** Revizija koju je preimenovanje VRATILO — inverz kreće od nje. */
      expectedRevision: number;
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
