"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import { Code2, LayoutGrid, Plus, Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { MapCard } from "@/components/map/map-card";
import {
  MAP_FRAME_CLASS,
  MapEmptyState,
  MapHistoryButtons,
  MapStatusBar,
} from "@/components/map/map-chrome";
import type { MapCardContent } from "@/components/map/map-model";
import { Button } from "@/components/ui/button";
import { nestedMessage } from "@/components/workspace/area/area-model";
import { CanvasActionRail } from "@/components/workspace/canvases/canvas-action-rail";
import styles from "@/components/workspace/canvases/connected-canvas.module.css";
import { useCanvasColorMode } from "@/components/workspace/canvases/use-canvas-color-mode";
import { useMapActivation } from "@/components/workspace/canvases/use-canvas-navigation";
import { PagePeekDrawer } from "@/components/workspace/page-peek";
import { PAGE_KIND_KEYS, PAGE_KIND_META } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";

import type { IzlogEkranProps } from "../registry";
import { fakeId } from "../fixtures/ids";
import { IZLOG_MAP_CARDS, IZLOG_MAP_EDGES } from "../fixtures/map";

type IzlogCardData = { card: MapCardContent; nestingTarget: boolean };
type IzlogCardNode = Node<IzlogCardData, "kartica">;

const IzlogCardNodeView = memo(function IzlogCardNodeView({
  data,
  selected,
}: NodeProps<IzlogCardNode>) {
  return (
    <div className="relative h-full w-full">
      <MapCard {...data.card} selected={selected} nestingTarget={data.nestingTarget} />
      <Handle type="target" position={Position.Left} isConnectable={false} className="!opacity-0" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="!opacity-0" />
    </div>
  );
});

const NODE_TYPES = { kartica: IzlogCardNodeView };

/** Ugnežđavanje: „Izvoz zadataka u Excel" se prevlači preko „Push obaveštenja…". */
const DRAGGED = 10;
const TARGET = 6;

function buildNodes(varijanta: string): IzlogCardNode[] {
  return IZLOG_MAP_CARDS.map((entry, index) => {
    const dragging = varijanta === "ugnezdavanje" && index === DRAGGED;
    const target = IZLOG_MAP_CARDS[TARGET];
    return {
      id: entry.id,
      type: "kartica",
      position: dragging ? { x: target.x + 96, y: target.y + 64 } : { x: entry.x, y: entry.y },
      width: entry.width,
      height: entry.height,
      style: { width: entry.width, height: entry.height },
      zIndex: dragging ? 10 : undefined,
      selected: dragging,
      data: {
        card: entry.card,
        nestingTarget: varijanta === "ugnezdavanje" && index === TARGET,
      },
    };
  });
}

const EDGES: Edge[] = IZLOG_MAP_EDGES.map(({ source, target }) => ({
  id: `${source}-${target}`,
  source: IZLOG_MAP_CARDS[source].id,
  target: IZLOG_MAP_CARDS[target].id,
}));

/**
 * Mapa (K15): kartice `MapCard` na kanvasu sa stvarnim okvirom, kontrolama,
 * oznakom točkića i praznim stanjem; „ugnezdavanje" pokazuje cilj tokom
 * prevlačenja i toast sa „Poništi", a „pregled-fioka" fioku Pregled.
 */
export default function MapaEkran({ varijanta }: IzlogEkranProps) {
  return (
    <ReactFlowProvider key={varijanta}>
      <MapaPrikaz varijanta={varijanta} />
    </ReactFlowProvider>
  );
}

function MapaPrikaz({ varijanta }: IzlogEkranProps) {
  const empty = varijanta === "prazna";
  const nodes = useMemo(() => (empty ? [] : buildNodes(varijanta)), [empty, varijanta]);
  const colorMode = useCanvasColorMode();
  const { ref, active, handlers } = useMapActivation();
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [peekOpen, setPeekOpen] = useState(varijanta === "pregled-fioka");
  // „oblast-12" pokazuje aktivnu mapu (posle klika), „neaktivna" oznaku za točkić.
  const shownActive = varijanta === "oblast-12" || varijanta === "ugnezdavanje" ? true : active;

  useEffect(() => {
    if (varijanta !== "ugnezdavanje") return;
    // Odloženo za jedan tik: StrictMode u razvoju montira efekat dvaput.
    const timer = window.setTimeout(() => {
      toast.success(
        nestedMessage(IZLOG_MAP_CARDS[DRAGGED].card.title, IZLOG_MAP_CARDS[TARGET].card.title),
        { id: "izlog-mapa-ugnezdavanje", duration: Infinity, action: { label: "Poništi", onClick: () => {} } },
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
      toast.dismiss("izlog-mapa-ugnezdavanje");
    };
  }, [varijanta]);

  const peekEntry = IZLOG_MAP_CARDS[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <h2 className="mb-3 text-sm font-semibold">
        Razvoj · Mapa
      </h2>
      <div
        ref={ref}
        {...handlers}
        data-map-active={shownActive}
        className={cn(styles.canvas, MAP_FRAME_CLASS, "min-h-[32rem]")}
        style={{ height: "min(72vh, 46rem)" }}
      >
        <ReactFlow<IzlogCardNode, Edge>
          defaultNodes={nodes}
          defaultEdges={EDGES}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={
            varijanta === "ugnezdavanje"
              ? {
                  // Prevlačenje se gleda iz blizine: cilj, kartica koja se vuče i susedi.
                  nodes: [5, TARGET, DRAGGED].map((index) => ({ id: IZLOG_MAP_CARDS[index].id })),
                  padding: 0.15,
                  maxZoom: 1,
                }
              : { padding: 0.12, maxZoom: 1 }
          }
          minZoom={0.18}
          maxZoom={2.2}
          zoomOnScroll={false}
          panOnScroll={shownActive}
          preventScrolling={shownActive}
          zoomActivationKeyCode={["Control", "Meta"]}
          panOnDrag={[1, 2]}
          nodesConnectable={false}
          colorMode={colorMode}
          onMove={(_event, next) => setViewport(next)}
          onInit={(instance) => setViewport(instance.getViewport())}
          aria-label="Mapa Razvoj: beleške i zadaci"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.15}
            color="color-mix(in oklab, var(--muted-foreground) 30%, transparent)"
          />
          <Controls position="bottom-left" showInteractive={false} />
          <Panel position="top-left" className="m-3">
            <MapHistoryButtons
              undoCount={varijanta === "ugnezdavanje" ? 1 : 0}
              redoCount={0}
              busy={false}
              onUndo={() => {}}
              onRedo={() => {}}
              undoIcon={<Undo2 className="size-4" aria-hidden="true" />}
              redoIcon={<Redo2 className="size-4" aria-hidden="true" />}
            />
          </Panel>
          <Panel position="top-right" className="m-3">
            <CanvasActionRail
              ariaLabel="Radnje na mapi Razvoj"
              identity={{ label: "Mapa", icon: Code2, count: nodes.length }}
              sections={[
                {
                  id: "Novo",
                  items: PAGE_KIND_KEYS.map((kind) => ({
                    id: `new-${kind}`,
                    label: `Novo: ${PAGE_KIND_META[kind].label}`,
                    icon: PAGE_KIND_META[kind].icon,
                    onSelect: () => {},
                  })),
                },
                {
                  id: "Prikaz",
                  ariaLabel: "Vrste kartica na mapi",
                  variant: "switch",
                  items: [
                    { id: "filter-all", label: "Sve", icon: LayoutGrid, active: true, onSelect: () => {} },
                    ...PAGE_KIND_KEYS.map((kind) => ({
                      id: `filter-${kind}`,
                      label: PAGE_KIND_META[kind].label,
                      icon: PAGE_KIND_META[kind].icon,
                      active: false,
                      onSelect: () => {},
                    })),
                  ],
                },
              ]}
            />
          </Panel>
          <Panel position="bottom-center" className="!mb-3">
            <MapStatusBar zoom={viewport.zoom} active={shownActive} />
          </Panel>
        </ReactFlow>
        {empty ? (
          <MapEmptyState
            icon={LayoutGrid}
            title="Na mapi još nema kartica."
            actions={
              <>
                <Button>
                  <Plus className="size-4" aria-hidden="true" /> Novi zadatak
                </Button>
                <Button variant="outline">
                  <Plus className="size-4" aria-hidden="true" /> Nova beleška
                </Button>
              </>
            }
          />
        ) : null}
      </div>
      <PagePeekDrawer
        open={peekOpen}
        onOpenChange={setPeekOpen}
        page={
          varijanta === "pregled-fioka"
            ? { _id: fakeId("pages", 1), card: peekEntry.card, text: peekEntry.text }
            : null
        }
        comments={{ status: "ready", count: 3, capped: false }}
        onOpen={() => setPeekOpen(false)}
      />
    </div>
  );
}
