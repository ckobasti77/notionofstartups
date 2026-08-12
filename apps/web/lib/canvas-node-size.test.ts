import { describe, expect, test } from "vitest";

import { TASK_CHECKPOINT_SIZE_PRESETS } from "@/components/workspace/canvases/task-checkpoint-layout";
import {
  DEFAULT_CANVAS_NODE_HEIGHT,
  DEFAULT_CANVAS_NODE_WIDTH,
} from "@/convex/canvasPlacement";

import {
  CHECKPOINT_NODE_SIZE as MOBILE_CHECKPOINT_NODE_SIZE,
  PAGE_NODE_SIZE as MOBILE_PAGE_NODE_SIZE,
} from "../../mobile/src/lib/canvas-node-size";
import { PAGE_NODE_SIZE } from "./canvas-node-size";

/**
 * Brana protiv REGRESIJE NA DESKTOPU (lanac 4, faza K6).
 *
 * Jedini dodir lanca u desktop kod je izvlačenje četiri granice veličine kartice iz
 * `components/workspace/canvases/area-flow-node.tsx` u zajednički modul
 * `lib/canvas-node-size.ts` — koji od tada koriste i desktop kanvas i mobilni embed.
 * Zbog toga izmena „za telefon" u tom modulu tiho menja i ponašanje desktop `NodeResizer`-a.
 * Ovi testovi zakivaju brojeve na ono što je desktop imao INLINE pre lanca
 * (`git show 019239d:apps/web/components/workspace/canvases/area-flow-node.tsx:284–287`).
 *
 * Ako neki od ovih testova padne, to NIJE poziv da se test popravi — to je dokaz da se
 * granica razišla i da treba proveriti šta se na desktopu promenilo.
 */
describe("granice veličine kartice na kanvasu", () => {
  test("iste su kao inline vrednosti koje je desktop imao pre lanca 4", () => {
    expect(PAGE_NODE_SIZE.minWidth).toBe(240);
    expect(PAGE_NODE_SIZE.minHeight).toBe(168);
    expect(PAGE_NODE_SIZE.maxWidth).toBe(720);
    expect(PAGE_NODE_SIZE.maxHeight).toBe(1_000);
  });

  /**
   * Server je merodavan i sam klampuje (`areasV2.resizePage`), pa raskorak znači da
   * kartica pod prstom ode dalje nego što će baza prihvatiti i „skoči" nazad.
   * `MIN_WIDTH`/`MAX_HEIGHT` iz `areasV2.ts:85–88` NISU izvezeni, pa se ne mogu uvesti —
   * broj se zato drži ovde, a jedini put da se razmimoiđe je da neko izmeni oba mesta.
   */
  test("prate granice servera iz areasV2.ts:85–88", () => {
    const server = { minWidth: 240, minHeight: 168, maxWidth: 720, maxHeight: 1_000 };
    expect({
      minWidth: PAGE_NODE_SIZE.minWidth,
      minHeight: PAGE_NODE_SIZE.minHeight,
      maxWidth: PAGE_NODE_SIZE.maxWidth,
      maxHeight: PAGE_NODE_SIZE.maxHeight,
    }).toEqual(server);
  });

  /** Podrazumevana veličina JESTE izvezena — pa se poredi sa pravim izvorom. */
  test("podrazumevana veličina je ista kao serverska (resetPageSize)", () => {
    expect(PAGE_NODE_SIZE.defaultWidth).toBe(DEFAULT_CANVAS_NODE_WIDTH);
    expect(PAGE_NODE_SIZE.defaultHeight).toBe(DEFAULT_CANVAS_NODE_HEIGHT);
    expect(PAGE_NODE_SIZE.defaultWidth).toBe(288);
    expect(PAGE_NODE_SIZE.defaultHeight).toBe(196);
  });

  /**
   * Mobilni drži SVOJU kopiju (`apps/mobile/src/lib/canvas-node-size.ts`) jer ne sme da
   * uvozi iz `apps/web` — drugi paket, drugi bundler. Kopija se do sada čuvala samo
   * komentarom; ovo je test koji K2 najavljuje kao T7, a nikad nije napisan.
   */
  test("mobilna kopija se ne razilazi od web modula", () => {
    expect(MOBILE_PAGE_NODE_SIZE).toEqual(PAGE_NODE_SIZE);
  });
});

describe("granice checkpoint oblačića", () => {
  /**
   * Preseti „Kompaktno" / „Prošireno" u native sheet-u moraju da budu isti brojevi koje
   * desktop toolbar oblačića piše kroz `setSizePreset` — inače isti izbor daje dve
   * različite veličine u zavisnosti od klijenta.
   */
  test("preseti sheet-a su isti kao desktop toolbar preseti", () => {
    expect(MOBILE_CHECKPOINT_NODE_SIZE.compact).toEqual(
      TASK_CHECKPOINT_SIZE_PRESETS.compact,
    );
    expect(MOBILE_CHECKPOINT_NODE_SIZE.expanded).toEqual(
      TASK_CHECKPOINT_SIZE_PRESETS.expanded,
    );
  });

  /** `taskCheckpoints.saveCanvasPlacement` klampuje na ove granice. */
  test("granice prate server (taskCheckpoints.saveCanvasPlacement)", () => {
    expect(MOBILE_CHECKPOINT_NODE_SIZE.minWidth).toBe(140);
    expect(MOBILE_CHECKPOINT_NODE_SIZE.minHeight).toBe(92);
    expect(MOBILE_CHECKPOINT_NODE_SIZE.maxWidth).toBe(520);
    expect(MOBILE_CHECKPOINT_NODE_SIZE.maxHeight).toBe(600);
  });
});
