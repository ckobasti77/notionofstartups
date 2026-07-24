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
import { useMutation } from "convex/react";
import { Lightbulb, MousePointer2, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ThoughtEdge } from "@/components/workspace/thoughts/thought-edge";
import {
  IdeaFlowNodeCard,
  IdeaNodeActionsProvider,
  type IdeaCanvasColor,
  type IdeaFlowNode,
} from "@/components/workspace/canvases/idea-flow-node";
import styles from "@/components/workspace/canvases/connected-canvas.module.css";
import { useCanvasColorMode } from "@/components/workspace/canvases/use-canvas-color-mode";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type IdeaNode = {
  _id: Id<"ideaNodes">;
  authorProfileId: Id<"profiles">;
  title: string | null;
  text: string;
  x: number;
  y: number;
  color: IdeaCanvasColor;
  isParent?: boolean;
  convertedPageId: Id<"pages"> | null;
  convertedAt: number | null;
  createdAt: number;
  upvotes: number;
  downvotes: number;
  userVote: "up" | "down" | null;
  isApproved: boolean;
  netVotes: number;
  author: {
    _id: Id<"profiles">;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  } | null;
};

type IdeaEdge = {
  _id: Id<"ideaEdges">;
  nodeAId: Id<"ideaNodes">;
  nodeBId: Id<"ideaNodes">;
  label: string | null;
};

type IdeasCanvasViewProps = {
  startupId: Id<"startups">;
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  canvasState: { x: number; y: number; zoom: number };
  searchActive?: boolean;
  onConvertIdea: (idea: IdeaNode) => void;
  onCreateIdea: (
    parentIdeaId?: Id<"ideaNodes">,
    position?: { x: number; y: number },
  ) => void;
};

type IdeaFlowEdge = Edge<Record<string, never>, "default">;

const NODE_TYPES = { idea: IdeaFlowNodeCard };
const EDGE_TYPES = { default: ThoughtEdge };
const MINI_MAP_COLORS: Record<IdeaCanvasColor, string> = {
  neutral: "#94a3b8",
  violet: "#8b5cf6",
  blue: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const SERBIAN_ARIA_LABELS = {
  "node.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš ideju. Strelicama je pomeraš.",
  "node.a11yDescription.keyboardDisabled": "Ova ideja se ne može pomerati tastaturom.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) => `Ideja je pomerena ${direction}. Nova pozicija je ${Math.round(x)}, ${Math.round(y)}.`,
  "edge.a11yDescription.default": "Pritisni Enter ili Space da izabereš vezu.",
  "controls.ariaLabel": "Kontrole kanvasa ideja",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Prikaži sve ideje",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "minimap.ariaLabel": "Minimapa ideja",
  "handle.ariaLabel": "Tačka za povezivanje ideja",
} as const;

function toFlowNode(node: IdeaNode): IdeaFlowNode {
  return {
    id: node._id,
    type: "idea",
    position: { x: node.x, y: node.y },
    data: {
      title: node.title,
      text: node.text,
      color: node.color,
      authorName: node.author?.displayName ?? "Član tima",
      authorAvatarUrl: node.author?.avatarUrl ?? null,
      createdAt: node.createdAt,
      upvotes: node.upvotes,
      downvotes: node.downvotes,
      userVote: node.userVote,
      isApproved: node.isApproved,
      convertedPageId: node.convertedPageId,
    },
    deletable: false,
    ariaLabel: `Ideja: ${node.title ?? node.text}`,
  };
}

function toFlowEdge(edge: IdeaEdge): IdeaFlowEdge {
  return {
    id: edge._id,
    source: edge.nodeAId,
    target: edge.nodeBId,
    type: "default",
    label: edge.label ?? undefined,
    interactionWidth: 22,
    ariaLabel: edge.label ? `Veza: ${edge.label}` : "Veza između dve ideje",
  };
}

function adaptEdgeHandles(
  edge: IdeaFlowEdge,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): IdeaFlowEdge {
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

export function IdeasCanvasView(props: IdeasCanvasViewProps) {
  return (
    <ReactFlowProvider key={props.startupId}>
      <IdeasCanvasBody {...props} />
    </ReactFlowProvider>
  );
}

function IdeasCanvasBody({
  startupId,
  nodes: nodeDocs,
  edges: edgeDocs,
  canvasState,
  searchActive = false,
  onConvertIdea,
  onCreateIdea,
}: IdeasCanvasViewProps) {
  const flowRef = useRef<ReactFlowInstance<IdeaFlowNode, IdeaFlowEdge> | null>(null);
  const [nodes, setNodes] = useState<IdeaFlowNode[]>(() => nodeDocs.map(toFlowNode));
  const [edges, setEdges] = useState<IdeaFlowEdge[]>(() => edgeDocs.map(toFlowEdge));
  const [viewport, setViewport] = useState<Viewport>({
    x: canvasState.x,
    y: canvasState.y,
    zoom: Math.min(Math.max(canvasState.zoom || 1, 0.5), 1.6),
  });
  const colorMode = useCanvasColorMode();

  const voteMutation = useMutation(api.ideas.vote);
  const updatePositionsMutation = useMutation(api.ideas.updatePositions);
  const connectMutation = useMutation(api.ideas.connect);
  const disconnectMutation = useMutation(api.ideas.disconnect);
  const saveViewportMutation = useMutation(api.ideas.saveViewport);

  const docsById = useMemo(
    () => new Map(nodeDocs.map((node) => [node._id, node])),
    [nodeDocs],
  );

  useEffect(() => {
    // Convex is the source of truth; preserve local selection while live vote data changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => {
      const selected = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return nodeDocs.map((doc) => ({ ...toFlowNode(doc), selected: selected.has(doc._id) }));
    });
  }, [nodeDocs]);

  useEffect(() => {
    // Edge selection is local, while the connection list comes from Convex.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => {
      const selected = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return edgeDocs.map((doc) => ({ ...toFlowEdge(doc), selected: selected.has(doc._id) }));
    });
  }, [edgeDocs]);

  useEffect(() => {
    const positions = new Map(nodes.map((node) => [node.id, node.position]));
    // Handle choice follows node movement so curves always use the nearest sides.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => current.map((edge) => adaptEdgeHandles(edge, positions)));
  }, [nodes]);

  const handleNodesChange = useCallback((changes: NodeChange<IdeaFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange<IdeaFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const connectIdeas = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const temporaryId = `pending:${connection.source}:${connection.target}`;
    setEdges((current) =>
      addEdge({ ...connection, id: temporaryId, type: "default" }, current),
    );
    try {
      await connectMutation({
        startupId,
        nodeAId: connection.source as Id<"ideaNodes">,
        nodeBId: connection.target as Id<"ideaNodes">,
      });
      toast.success("Ideje su povezane.");
    } catch (error) {
      setEdges((current) => current.filter((edge) => edge.id !== temporaryId));
      toast.error(error instanceof Error ? error.message : "Veza nije sačuvana.");
    }
  }, [connectMutation, startupId]);

  const vote = useCallback((ideaId: Id<"ideaNodes">, voteType: "up" | "down") => {
    void voteMutation({ startupId, ideaId, voteType }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Glas nije sačuvan.");
    });
  }, [startupId, voteMutation]);

  const convert = useCallback((ideaId: Id<"ideaNodes">) => {
    const idea = docsById.get(ideaId);
    if (idea) onConvertIdea(idea);
  }, [docsById, onConvertIdea]);

  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, next: Viewport) => {
    setViewport(next);
    void saveViewportMutation({
      startupId,
      x: Math.round(next.x),
      y: Math.round(next.y),
      zoom: Number(next.zoom.toFixed(2)),
    });
  }, [saveViewportMutation, startupId]);

  return (
    <IdeaNodeActionsProvider
      actions={{
        vote,
        convert,
        branch: (ideaId) => onCreateIdea(ideaId),
      }}
    >
      <div
        className={cn(styles.canvas, styles.ideasCanvas)}
        onDoubleClick={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.classList.contains("react-flow__pane")) {
            return;
          }
          const position = flowRef.current?.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          onCreateIdea(undefined, position);
        }}
      >
        <ReactFlow<IdeaFlowNode, IdeaFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={(connection) => void connectIdeas(connection)}
          onNodeDragStop={(_event, node) => {
            void updatePositionsMutation({
              startupId,
              updates: [{
                id: node.id as Id<"ideaNodes">,
                x: Math.round(node.position.x),
                y: Math.round(node.position.y),
              }],
            }).catch((error) => {
              toast.error(error instanceof Error ? error.message : "Pozicija nije sačuvana.");
            });
          }}
          onEdgesDelete={(deletedEdges) => {
            deletedEdges.forEach((edge) => {
              if (edge.id.startsWith("pending:")) return;
              void disconnectMutation({
                startupId,
                edgeId: edge.id as Id<"ideaEdges">,
              });
            });
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
          fitViewOptions={{ padding: 0.22, maxZoom: 1.05 }}
          aria-label="Kanvas timskih ideja"
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
            nodeColor={(node) => MINI_MAP_COLORS[node.data.color as IdeaCanvasColor]}
            maskColor="color-mix(in oklab, var(--background) 58%, transparent)"
          />

          <Panel position="top-left" className="m-3 sm:m-5">
            <div className="flex max-w-[calc(100vw-5rem)] flex-wrap items-center gap-2">
              <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-border/80 bg-card/92 px-3.5 shadow-md backdrop-blur-xl">
                <Lightbulb className="size-4 text-amber-500" />
                <span className="text-xs font-bold">Kanvas ideja</span>
                <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.6875rem] font-bold text-amber-700 dark:text-amber-300">
                  {nodes.length}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-10 rounded-2xl px-3.5 shadow-md"
                onClick={() => {
                  const center = flowRef.current?.screenToFlowPosition({
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2,
                  });
                  onCreateIdea(undefined, center);
                }}
              >
                <Plus className="size-4" /> Nova ideja
              </Button>
            </div>
          </Panel>

          <Panel position="top-right" className="m-3 hidden sm:block sm:m-5">
            <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card/92 px-3.5 py-2 text-[0.6875rem] font-medium text-muted-foreground shadow-md backdrop-blur-xl">
              <MousePointer2 className="size-3.5" />
              Prevuci karticu · spoji tačke · dupli klik za novu
              <span className="ml-1 font-mono text-foreground">{Math.round(viewport.zoom * 100)}%</span>
            </div>
          </Panel>
        </ReactFlow>

        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-3xl border border-border/80 bg-card/94 p-7 text-center shadow-xl backdrop-blur-xl">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-300">
                {searchActive ? <SearchX className="size-5" /> : <Lightbulb className="size-5" />}
              </span>
              <h3 className="mt-4 text-base font-bold">
                {searchActive ? "Nema ideja za ovu pretragu" : "Prva ideja počinje ovde"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {searchActive
                  ? "Promeni pojam za pretragu da ponovo vidiš kartice."
                  : "Dodaj ideju, a zatim je poveži sa srodnim predlozima."}
              </p>
              {!searchActive ? (
                <Button className="mt-5 rounded-xl" onClick={() => onCreateIdea()}>
                  <Plus className="size-4" /> Dodaj prvu ideju
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </IdeaNodeActionsProvider>
  );
}
