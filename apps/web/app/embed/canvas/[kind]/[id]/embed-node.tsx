"use client";

import {
  Handle,
  NodeResizeControl,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useRef,
  type CSSProperties,
} from "react";

import { PAGE_NODE_SIZE } from "@/lib/canvas-node-size";
import { cn } from "@/lib/utils";

/**
 * Čvor embed kanvasa (W4.2, `docs/mobile/00-PLAN.md` §5.2) — jedan oblik za sve četiri
 * vrste (ideje, misli, oblast, stranica); razlika je samo u `data` koji puni mapper.
 *
 * Zašto NE ugrađeni `default` čvor: bez registrovanog `nodeTypes` xyflow crta stock
 * čvor koji nema ni `width` ni `height` u objektu čvora, pa se veličina saznaje tek
 * merenjem (ResizeObserver). Do tog trenutka `getNodesBounds` vidi 0×0 granice i
 * `fitView` nema šta da uklopi. Ovde su dimenzije eksplicitne i na čvoru i na
 * komponenti, pa su granice tačne od prvog frejma.
 *
 * `Handle`-ovi postoje samo da ivice imaju gde da se zakače i **zauvek** ostaju
 * nevidljivi i nepovezivi (`isConnectable={false}`): tačkica je ~8 px i prstom se ne
 * pogađa, a povećanje mete bi pojelo i tap i potez kartice. Povezivanje zato ide tapom
 * — izvor iz native sheet-a („Poveži sa…"), cilj tapom po kanvasu (K3, `faza-k3.md` §5).
 * Van režima „Uredi raspored" je čvor i dalje samo za gledanje; u režimu izabrana
 * SVOJA kartica dobija četiri ugaone ručke za veličinu (K2).
 */
export const EMBED_NODE_TYPE = "embed";

/** Podrazumevana veličina za ideje i misli (stranice nose svoju sa servera). */
export const EMBED_NODE_WIDTH = 240;
export const EMBED_NODE_HEIGHT = 96;

/** Ideje i misli dele isti union boja (`ideaColorValidator`/`thoughtColorValidator`). */
export type EmbedNodeColor = "neutral" | "violet" | "blue" | "green" | "amber" | "rose";

const EMBED_NODE_COLORS: ReadonlySet<string> = new Set<EmbedNodeColor>([
  "neutral",
  "violet",
  "blue",
  "green",
  "amber",
  "rose",
]);

/** Sirova vrednost sa servera → poznata boja; nepoznata (nova boja u šemi) → undefined. */
export function embedNodeColor(value: string | undefined): EmbedNodeColor | undefined {
  return value !== undefined && EMBED_NODE_COLORS.has(value)
    ? (value as EmbedNodeColor)
    : undefined;
}

export type EmbedNodeData = {
  /** Naslov čvora — jedini obavezan sadržaj. */
  label: string;
  /** Druga linija: glasovi (ideje), vrsta stranice, oznaka roditeljske misli. */
  meta?: string;
  /**
   * Boja čvora koju korisnik bira (ideje/misli, P4). Kartice stranica i checkpointi
   * je ne nose (nemaju je ni u podacima). Crta se kao mala tačka pored naslova —
   * ista konvencija koju native lista misli već koristi (`misli.tsx`).
   */
  color?: EmbedNodeColor;
  /** Ideja koja ima više glasova za nego protiv (`isApproved`) — prsten u `--primary`. */
  accent?: boolean;
  /**
   * Stranica koja čeka nesting-odobrenje. Crta se prigušeno (isprekidan okvir,
   * smanjena vidljivost) sa oznakom „Čeka odobrenje" i NE otvara se na dodir —
   * odobrava se kroz ekran „Odobrenja". Bez ovoga se ghost tiho ne prikaže, a
   * tiho nestajanje je najgori ishod (§5.2).
   */
  ghost?: boolean;
  /**
   * Sme li OVAJ korisnik da menja veličinu kartice (`pages[].canResize` sa servera —
   * autor kartice). Bez toga se ručke ne crtaju: backend bi potez ionako odbio
   * („Možete menjati veličinu samo svoje kartice."), a ručka koja ne radi je laž.
   * Ideje i misli ga ne postavljaju — njihova veličina je K5.
   */
  canResize?: boolean;
  /**
   * Checkpoint oblačić (K4) — SAMO CSS razlika (leva ivica u `--primary`); sadržaj je
   * isti (label + meta). Namerno bez dugmeta, polja za tekst, kvačice i brisanja:
   * suština koraka (tekst, završenost, lančanje, glasanje) je native na detalju
   * zadatka i ne duplira se na kanvasu (`faza-k4.md` §5).
   *
   * Ručke za veličinu oblačić NIKAD ne dobija: `showHandles` traži `data.canResize`,
   * koji checkpoint ne postavlja — oblačić je 164 × 110, pa bi četiri mete od 44pt
   * pojele 43% njegove površine i potez koji hoće da POMERI korak skoro uvek bi
   * pogodio ručku. Veličina zato ide iz native sheet-a (preseti + reset).
   */
  variant?: "checkpoint";
};

export type EmbedFlowNode = Node<EmbedNodeData, typeof EMBED_NODE_TYPE>;

/** Pravougaonik čvora (pozicija + dimenzije) — potpis jednog poteza promene veličine. */
export type EmbedResizeBox = { x: number; y: number; width: number; height: number };

/**
 * Ručke moraju da žive UNUTAR komponente čvora (xyflow ih tu očekuje), a odluka „sme
 * li se menjati" i upis su u `canvas-embed.tsx`. Kontekst je most između ta dva mesta
 * koji NE dira `data`: novo polje u `data` bi na svaku promenu režima ili zuma
 * prezidalo sve čvorove.
 */
export type EmbedResizeApi = {
  /** Režim + postoji handler upisa + zum je iznad praga (vidi `HANDLE_MIN_ZOOM`). */
  enabled: boolean;
  onStart: () => void;
  onEnd: (nodeId: string, before: EmbedResizeBox, after: EmbedResizeBox) => void;
};

export const EmbedResizeContext = createContext<EmbedResizeApi | null>(null);

/**
 * Samo uglovi. Bočne ručke (`top`/`right`/`bottom`/`left`) se namerno ne prave: na
 * telefonu se ne pogađaju, a četiri ugla + „±10%" u native sheet-u pokrivaju svaki
 * ishod (`docs/mobile/lanac4/planovi/faza-k2.md` §5).
 */
const HANDLE_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/**
 * Dodirna meta 44×44 (pravilo lanca 4); vidljiva tačka je 16 px i crta je
 * `.embed-resize-dot` iz `EmbedStyles`. Inline, NE CSS klasa: xyflow-ov
 * `.react-flow__resize-control.handle` ima specifičnost 0-2-0 (5×5 px, puna pozadina,
 * beli okvir) i pobedio bi jednu našu klasu. Modul-const da referenca bude stabilna.
 */
const HANDLE_STYLE: CSSProperties = {
  width: 44,
  height: 44,
  background: "transparent",
  border: "none",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  // Pregledač ne sme da uzme ovaj gest za skrol pre nego što ga d3-drag vidi.
  touchAction: "none",
};

function EmbedNodeCard({ id, data, selected }: NodeProps<EmbedFlowNode>) {
  const resize = useContext(EmbedResizeContext);
  // `onResizeEnd` nosi samo KRAJNJE stanje, a „Poništi" traži i početno — pa se
  // početak poteza pamti ovde. Jedan ref za sve četiri ručke: istovremeno se povlači
  // najviše jedna.
  const startRef = useRef<EmbedResizeBox | null>(null);

  const handleResizeStart = useCallback(
    (_event: unknown, params: EmbedResizeBox) => {
      startRef.current = {
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
      };
      resize?.onStart();
    },
    [resize],
  );

  const handleResizeEnd = useCallback(
    (_event: unknown, params: EmbedResizeBox) => {
      const before = startRef.current;
      startRef.current = null;
      if (!before || !resize) return;
      resize.onEnd(id, before, {
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
      });
    },
    [id, resize],
  );

  // Ghost (čeka odobrenje) nema placement u bazi, pa nema ni šta da se menja.
  const showHandles = Boolean(resize?.enabled && data.canResize && selected && !data.ghost);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center gap-1 rounded-xl border px-3 py-2 text-left",
        "border-border bg-card text-card-foreground shadow-sm",
        data.accent && "ring-2 ring-primary",
        selected && "border-primary ring-2 ring-primary/60",
        data.ghost && "border-dashed opacity-60 shadow-none",
        data.variant === "checkpoint" && "embed-checkpoint",
      )}
    >
      {/* Nevidljive tačke za ivice: bez njih xyflow nema geometriju krajeva veze. */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />
      {data.ghost ? (
        <span className="w-fit rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Čeka odobrenje
        </span>
      ) : null}
      <div className="flex min-w-0 items-center gap-1.5">
        {data.color ? (
          <span className="embed-node-dot" data-node-color={data.color} aria-hidden />
        ) : null}
        <p className="line-clamp-3 min-w-0 text-sm font-medium leading-snug">{data.label}</p>
      </div>
      {data.meta ? <p className="text-xs text-muted-foreground">{data.meta}</p> : null}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />
      {/* Ručke idu POSLE sadržaja da u redosledu slaganja budu iznad njega. Klasu
          `nodrag` xyflow stavlja sam (potez čvora ne sme da počne na ručki);
          `nopan`/`nowheel` su pojas i naramenice — isto što desktop kontrola radi
          ručno (`perimeter-resize-control.tsx`). */}
      {showHandles
        ? HANDLE_POSITIONS.map((position) => (
            <NodeResizeControl
              key={position}
              position={position}
              className="nopan nowheel"
              style={HANDLE_STYLE}
              minWidth={PAGE_NODE_SIZE.minWidth}
              minHeight={PAGE_NODE_SIZE.minHeight}
              maxWidth={PAGE_NODE_SIZE.maxWidth}
              maxHeight={PAGE_NODE_SIZE.maxHeight}
              onResizeStart={handleResizeStart}
              onResizeEnd={handleResizeEnd}
            >
              <span className="embed-resize-dot" aria-hidden />
            </NodeResizeControl>
          ))
        : null}
    </div>
  );
}

const EmbedNode = memo(EmbedNodeCard);
EmbedNode.displayName = "EmbedNode";

/**
 * Referenca MORA da bude stabilna (modul-nivo): nov objekat na svaki render tera
 * xyflow da prezida sve tipove čvorova i loguje upozorenje. Isti obrazac kao
 * `NODE_TYPES` u desktop kanvasima (`ideas-canvas-view.tsx`).
 */
export const EMBED_NODE_TYPES = { [EMBED_NODE_TYPE]: EmbedNode };
