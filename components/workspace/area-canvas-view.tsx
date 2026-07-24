"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CheckSquare2,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ThoughtEdge } from "@/components/workspace/thoughts/thought-edge";
import {
  AreaFlowNodeCard,
  AreaNodeActionsProvider,
  type AreaFlowNode,
} from "@/components/workspace/canvases/area-flow-node";
import styles from "@/components/workspace/canvases/connected-canvas.module.css";
import { useCanvasColorMode } from "@/components/workspace/canvases/use-canvas-color-mode";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type AreaCanvasViewProps = {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  areaLabel: string;
  kind: "task" | "note";
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreatePage: (kind: "task" | "note") => void;
};

type AreaFlowEdge = Edge<Record<string, never>, "default">;

const NODE_TYPES = { areaPage: AreaFlowNodeCard };
const EDGE_TYPES = { default: ThoughtEdge };

function adaptEdgeHandles(
  edge: AreaFlowEdge,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): AreaFlowEdge {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target) return edge;
  const sourceIsLeft = source.x <= target.x;
  return {
    ...edge,
    sourceHandle: sourceIsLeft ? "right" : "left",
    targetHandle: sourceIsLeft ? "left" : "right",
  };
}

const SERBIAN_ARIA_LABELS = {
  "node.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš karticu. Strelicama je pomeraš.",
  "node.a11yDescription.keyboardDisabled": "Ova kartica se ne može pomerati tastaturom.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) => `Kartica je pomerena ${direction}. Nova pozicija je ${Math.round(x)}, ${Math.round(y)}.`,
  "edge.a11yDescription.default": "Pritisni Enter ili Space da izabereš vezu.",
  "controls.ariaLabel": "Kontrole kanvasa poslovne oblasti",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Prikaži sve kartice",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "minimap.ariaLabel": "Minimapa poslovne oblasti",
  "handle.ariaLabel": "Tačka za povezivanje kartica",
} as const;

export function AreaCanvasView(props: AreaCanvasViewProps) {
  return (
    <ReactFlowProvider key={`${props.areaId}:${props.kind}`}>
      <AreaCanvasBody {...props} />
    </ReactFlowProvider>
  );
}

function AreaCanvasBody({
  startupId,
  areaId,
  areaLabel,
  kind,
  onOpenPage,
  onCreatePage,
}: AreaCanvasViewProps) {
  const canvasData = useQuery(api.canvases.getAreaCanvas, {
    startupId,
    areaId,
    kind,
  });

  if (!canvasData) {
    return (
      <div className="grid h-[min(72vh,52rem)] min-h-[32rem] place-items-center overflow-hidden rounded-3xl border border-border/70 bg-muted/20">
        <div className="text-center text-sm font-medium text-muted-foreground">
          <LoaderCircle className="mx-auto mb-3 size-5 animate-spin text-primary" />
          Otvaram kanvas oblasti…
        </div>
      </div>
    );
  }

  return (
    <AreaCanvasReady
      key={`${areaId}:${kind}`}
      startupId={startupId}
      areaId={areaId}
      areaLabel={areaLabel}
      kind={kind}
      canvasData={canvasData}
      onOpenPage={onOpenPage}
      onCreatePage={onCreatePage}
    />
  );
}

type CanvasData = FunctionReturnType<typeof api.canvases.getAreaCanvas>;

type AreaCanvasReadyProps = AreaCanvasViewProps & {
  canvasData: CanvasData;
};

function AreaCanvasReady({
  startupId,
  areaId,
  areaLabel,
  kind,
  canvasData,
  onOpenPage,
  onCreatePage,
}: AreaCanvasReadyProps) {
  const flowRef = useRef<ReactFlowInstance<AreaFlowNode, AreaFlowEdge> | null>(null);
  const viewportInitialized = useRef(false);
  const movePages = useMutation(api.canvases.moveAreaCanvasPages);
  const saveViewport = useMutation(api.canvases.saveAreaCanvasViewport);
  const connectPages = useMutation(api.canvases.connectAreaCanvasPages);
  const disconnectPages = useMutation(api.canvases.disconnectAreaCanvasPages);

  const incomingNodes = useMemo<AreaFlowNode[]>(
    () =>
      canvasData.pages.map((page) => ({
        id: page._id,
        type: "areaPage",
        position: { x: page.x, y: page.y },
        data: {
          title: page.title,
          kind: page.kind,
          taskStatus: page.taskStatus,
          taskPriority: page.taskPriority,
          creatorName: page.creator?.displayName ?? "Član tima",
          creatorAvatarUrl: page.creator?.avatarUrl ?? null,
          updatedAt: page.updatedAt,
        },
        deletable: false,
        ariaLabel: `${page.kind === "task" ? "Zadatak" : "Beleška"}: ${page.title}`,
      })),
    [canvasData.pages],
  );
  const incomingEdges = useMemo<AreaFlowEdge[]>(
    () =>
      canvasData.edges.map((edge) => ({
        id: edge._id,
        source: edge.source,
        target: edge.target,
        type: "default",
        label: edge.label ?? undefined,
        interactionWidth: 22,
        ariaLabel: edge.label ? `Veza: ${edge.label}` : "Veza između dve kartice",
      })),
    [canvasData.edges],
  );

  const [nodes, setNodes] = useState(incomingNodes);
  const [edges, setEdges] = useState(incomingEdges);
  const [viewport, setViewport] = useState<Viewport>({
    x: canvasData.viewport.x,
    y: canvasData.viewport.y,
    zoom: canvasData.viewport.zoom,
  });
  const colorMode = useCanvasColorMode();

  useEffect(() => {
    // Keep live page metadata in sync without discarding the current selection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => {
      const selected = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return incomingNodes.map((node) => ({ ...node, selected: selected.has(node.id) }));
    });
  }, [incomingNodes]);

  useEffect(() => {
    // Keep edge selection local while Convex remains the source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => {
      const selected = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return incomingEdges.map((edge) => ({ ...edge, selected: selected.has(edge.id) }));
    });
  }, [incomingEdges]);

  useEffect(() => {
    const positions = new Map(nodes.map((node) => [node.id, node.position]));
    // Re-anchor every curve to the nearest card sides while cards move.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => current.map((edge) => adaptEdgeHandles(edge, positions)));
  }, [nodes]);

  const onInit = useCallback((instance: ReactFlowInstance<AreaFlowNode, AreaFlowEdge>) => {
    flowRef.current = instance;
    if (viewportInitialized.current) return;
    viewportInitialized.current = true;
    if (!canvasData.viewport.persisted && canvasData.pages.length > 0) {
      window.setTimeout(() => {
        void instance.fitView({ padding: 0.24, maxZoom: 1.05, duration: 260 });
      }, 0);
    }
  }, [canvasData.pages.length, canvasData.viewport.persisted]);

  const handleNodesChange = useCallback((changes: NodeChange<AreaFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange<AreaFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const handleConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const temporaryId = `pending:${connection.source}:${connection.target}`;
    setEdges((current) =>
      addEdge({ ...connection, id: temporaryId, type: "default" }, current),
    );
    try {
      await connectPages({
        startupId,
        areaId,
        source: connection.source as Id<"pages">,
        target: connection.target as Id<"pages">,
      });
      toast.success("Kartice su povezane.");
    } catch (error) {
      setEdges((current) => current.filter((edge) => edge.id !== temporaryId));
      toast.error(error instanceof Error ? error.message : "Veza nije sačuvana.");
    }
  }, [areaId, connectPages, startupId]);

  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, next: Viewport) => {
    setViewport(next);
    void saveViewport({
      startupId,
      areaId,
      kind,
      x: Math.round(next.x),
      y: Math.round(next.y),
      zoom: Number(next.zoom.toFixed(2)),
    });
  }, [areaId, kind, saveViewport, startupId]);

  const isTask = kind === "task";

  return (
    <AreaNodeActionsProvider open={onOpenPage}>
      <div
        className={cn(
          styles.canvas,
          isTask ? styles.tasksCanvas : styles.notesCanvas,
          "h-[min(72vh,52rem)] min-h-[32rem] rounded-3xl border border-border/70 shadow-inner",
        )}
      >
        <ReactFlow<AreaFlowNode, AreaFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onInit={onInit}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={(connection) => void handleConnect(connection)}
          onNodeDragStop={(_event, node) => {
            void movePages({
              startupId,
              areaId,
              updates: [{
                pageId: node.id as Id<"pages">,
                x: Math.round(node.position.x),
                y: Math.round(node.position.y),
              }],
            }).catch((error) => {
              toast.error(error instanceof Error ? error.message : "Pozicija nije sačuvana.");
            });
          }}
          onNodeDoubleClick={(_event, node) => onOpenPage(node.id as Id<"pages">)}
          onEdgesDelete={(deletedEdges) => {
            const edgeIds = deletedEdges
              .filter((edge) => !edge.id.startsWith("pending:"))
              .map((edge) => edge.id as Id<"pageEdges">);
            if (edgeIds.length) {
              void disconnectPages({ startupId, edgeIds }).catch((error) => {
                toast.error(error instanceof Error ? error.message : "Veza nije uklonjena.");
              });
            }
          }}
          onMove={(_event, next) => setViewport(next)}
          onMoveEnd={handleMoveEnd}
          defaultViewport={viewport}
          minZoom={0.5}
          maxZoom={1.6}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          panOnDrag={[0, 1]}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          deleteKeyCode={["Backspace", "Delete"]}
          nodesConnectable
          nodesFocusable
          edgesFocusable
          fitViewOptions={{ padding: 0.24, maxZoom: 1.05 }}
          aria-label={`Kanvas oblasti ${areaLabel}: ${isTask ? "zadaci" : "beleške"}`}
          ariaLabelConfig={SERBIAN_ARIA_LABELS}
          colorMode={colorMode}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="color-mix(in oklab, var(--muted-foreground) 28%, transparent)"
          />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={() => isTask ? "#10b981" : "#38bdf8"}
            maskColor="color-mix(in oklab, var(--background) 58%, transparent)"
          />

          <Panel position="top-left" className="m-3 sm:m-5">
            <div className="flex max-w-[calc(100vw-5rem)] flex-wrap items-center gap-2">
              <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-border/80 bg-card/92 px-3.5 shadow-md backdrop-blur-xl">
                {isTask ? (
                  <CheckSquare2 className="size-4 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <FileText className="size-4 text-sky-600 dark:text-sky-300" />
                )}
                <span className="max-w-36 truncate text-xs font-bold sm:max-w-56">
                  {areaLabel}
                </span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                  isTask
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                    : "bg-sky-500/12 text-sky-700 dark:text-sky-300",
                )}>
                  {nodes.length}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-10 rounded-2xl px-3.5 shadow-md"
                onClick={() => onCreatePage(kind)}
              >
                <Plus className="size-4" /> {isTask ? "Novi zadatak" : "Nova beleška"}
              </Button>
            </div>
          </Panel>

          <Panel position="top-right" className="m-3 hidden sm:block sm:m-5">
            <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card/92 px-3.5 py-2 text-[0.6875rem] font-medium text-muted-foreground shadow-md backdrop-blur-xl">
              <Link2 className="size-3.5" />
              Prevuci karticu · spoji tačke · dupli klik otvara
              <span className="ml-1 font-mono text-foreground">{Math.round(viewport.zoom * 100)}%</span>
            </div>
          </Panel>
        </ReactFlow>

        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-3xl border border-border/80 bg-card/94 p-7 text-center shadow-xl backdrop-blur-xl">
              <span className={cn(
                "mx-auto grid size-12 place-items-center rounded-2xl",
                isTask
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                  : "bg-sky-500/12 text-sky-600 dark:text-sky-300",
              )}>
                {isTask ? <CheckSquare2 className="size-5" /> : <FileText className="size-5" />}
              </span>
              <h3 className="mt-4 text-base font-bold">
                {isTask ? "Nema zadataka na kanvasu" : "Nema beležaka na kanvasu"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Kreiraj prvu karticu u oblasti {areaLabel}. Kasnije je samo prevuci i poveži.
              </p>
              <Button className="mt-5 rounded-xl" onClick={() => onCreatePage(kind)}>
                <Plus className="size-4" /> {isTask ? "Prvi zadatak" : "Prva beleška"}
              </Button>
            </div>
          </div>
        ) : null}

        {canvasData.truncated ? (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-500/30 bg-amber-50/95 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-md dark:bg-amber-950/95 dark:text-amber-100">
            Prikazano je prvih 250 kartica.
          </div>
        ) : null}
      </div>
    </AreaNodeActionsProvider>
  );
}
