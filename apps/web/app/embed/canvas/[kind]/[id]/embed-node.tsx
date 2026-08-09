"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";

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
 * Read-only je namerno (§5.2: mobilni kanvas je pregled/navigacija/dodavanje, ne
 * preuređivanje) — `Handle`-ovi postoje samo da ivice imaju gde da se zakače i nisu
 * povezivi ni vidljivi.
 */
export const EMBED_NODE_TYPE = "embed";

/** Podrazumevana veličina za ideje i misli (stranice nose svoju sa servera). */
export const EMBED_NODE_WIDTH = 240;
export const EMBED_NODE_HEIGHT = 96;

export type EmbedNodeData = {
  /** Naslov čvora — jedini obavezan sadržaj. */
  label: string;
  /** Druga linija: glasovi (ideje), vrsta stranice, oznaka roditeljske misli. */
  meta?: string;
  /** Ideja koja ima više glasova za nego protiv (`isApproved`) — prsten u `--primary`. */
  accent?: boolean;
  /**
   * Stranica koja čeka nesting-odobrenje. Crta se prigušeno (isprekidan okvir,
   * smanjena vidljivost) sa oznakom „Čeka odobrenje" i NE otvara se na dodir —
   * odobrava se kroz ekran „Odobrenja". Bez ovoga se ghost tiho ne prikaže, a
   * tiho nestajanje je najgori ishod (§5.2).
   */
  ghost?: boolean;
};

export type EmbedFlowNode = Node<EmbedNodeData, typeof EMBED_NODE_TYPE>;

function EmbedNodeCard({ data, selected }: NodeProps<EmbedFlowNode>) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center gap-1 rounded-xl border px-3 py-2 text-left",
        "border-border bg-card text-card-foreground shadow-sm",
        data.accent && "ring-2 ring-primary",
        selected && "border-primary ring-2 ring-primary/60",
        data.ghost && "border-dashed opacity-60 shadow-none",
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
      <p className="line-clamp-3 text-sm font-medium leading-snug">{data.label}</p>
      {data.meta ? <p className="text-xs text-muted-foreground">{data.meta}</p> : null}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />
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
