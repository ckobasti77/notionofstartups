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
import {
  Lightbulb,
  MousePointer2,
  Plus,
  Redo2,
  SearchX,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ThoughtEdge,
  ThoughtEdgeActionsProvider,
} from "@/components/workspace/thoughts/thought-edge";
import { EdgeEditorDialog } from "@/components/workspace/thoughts/thought-editor-dialog";
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
import { useWorkspaceHistory } from "@/components/workspace/workspace-history";

type IdeaNode = {
  _id: Id<"ideaNodes">;
  authorProfileId: Id<"profiles">;
  title: string | null;
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentIdeaId?: Id<"ideaNodes">;
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
  pendingDeletionRequest: { _id: Id<"deletionRequests"> } | null;
  canEdit: boolean;
  canMove: boolean;
  canResize: boolean;
  canDeleteDirectly: boolean;
  canRequestDeletion: boolean;
  canDetach: boolean;
};

type IdeaEdge = {
  _id: Id<"ideaEdges">;
  nodeAId: Id<"ideaNodes">;
  nodeBId: Id<"ideaNodes">;
  label: string | null;
  canEdit: boolean;
  canDeleteDirectly: boolean;
  canRequestDeletion: boolean;
};

type IdeasCanvasViewProps = {
  startupId: Id<"startups">;
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  canvasState: { x: number; y: number; zoom: number };
  searchActive?: boolean;
  onConvertIdea: (idea: IdeaNode) => void;
  onEditIdea: (idea: IdeaNode) => void;
  onNestIdea: (idea: IdeaNode) => void;
  onCreateIdea: (
    parentIdeaId?: Id<"ideaNodes">,
    position?: { x: number; y: number },
  ) => void;
};

type IdeaFlowEdge = Edge<Record<string, never>, "default">;

const NODE_TYPES = { idea: IdeaFlowNodeCard };
const EDGE_TYPES = { default: ThoughtEdge };
const DEFAULT_IDEA_WIDTH = 288;
const DEFAULT_IDEA_HEIGHT = 196;
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
  const size = {
    width: node.width ?? DEFAULT_IDEA_WIDTH,
    height: node.height ?? DEFAULT_IDEA_HEIGHT,
  };
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
      pendingDeletion: node.pendingDeletionRequest !== null,
      canEdit: node.canEdit,
      canResize: node.canResize,
      canDeleteDirectly: node.canDeleteDirectly,
      canRequestDeletion: node.canRequestDeletion,
      canDetach: node.canDetach,
    },
    parentId: node.parentIdeaId,
    expandParent: node.parentIdeaId !== undefined,
    width: size.width,
    height: size.height,
    style: size,
    deletable: false,
    draggable: node.canMove,
    ariaLabel: `Ideja: ${node.title ?? node.text}`,
  };
}

function parentsBeforeChildren(nodeDocs: IdeaNode[]) {
  const byId = new Map(nodeDocs.map((node) => [node._id, node]));
  const ordered: IdeaNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (node: IdeaNode) => {
    if (visited.has(node._id) || visiting.has(node._id)) return;
    visiting.add(node._id);
    const parent =
      node.parentIdeaId === undefined ? undefined : byId.get(node.parentIdeaId);
    if (parent) visit(parent);
    visiting.delete(node._id);
    visited.add(node._id);
    ordered.push(node);
  };
  nodeDocs.forEach(visit);
  return ordered;
}

function toFlowNodes(nodeDocs: IdeaNode[]) {
  const ids = new Set(nodeDocs.map((node) => node._id));
  return parentsBeforeChildren(nodeDocs).map((node) =>
    toFlowNode(
      node.parentIdeaId !== undefined && !ids.has(node.parentIdeaId)
        ? { ...node, parentIdeaId: undefined }
        : node,
    ),
  );
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
  onEditIdea,
  onNestIdea,
  onCreateIdea,
}: IdeasCanvasViewProps) {
  const flowRef = useRef<ReactFlowInstance<IdeaFlowNode, IdeaFlowEdge> | null>(null);
  const preDragPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const [nodes, setNodes] = useState<IdeaFlowNode[]>(() =>
    toFlowNodes(nodeDocs),
  );
  const [edges, setEdges] = useState<IdeaFlowEdge[]>(() => edgeDocs.map(toFlowEdge));
  const [viewport, setViewport] = useState<Viewport>({
    x: canvasState.x,
    y: canvasState.y,
    zoom: Math.min(Math.max(canvasState.zoom || 1, 0.5), 1.6),
  });
  const [edgeEditorId, setEdgeEditorId] = useState<Id<"ideaEdges"> | null>(null);
  const [edgeEditorPending, setEdgeEditorPending] = useState(false);
  const colorMode = useCanvasColorMode();

  const voteMutation = useMutation(api.ideas.vote);
  const updatePositionsMutation = useMutation(api.ideas.updatePositions);
  const updateLayoutMutation = useMutation(api.ideas.updateLayout);
  const resetLayoutSizeMutation = useMutation(api.ideas.resetLayoutSize);
  const connectMutation = useMutation(api.ideas.connect);
  const disconnectMutation = useMutation(api.ideas.disconnect);
  const archiveIdeaMutation = useMutation(api.ideas.archive);
  const restoreIdeaMutation = useMutation(api.ideas.restoreOwn);
  const requestDeletionMutation = useMutation(api.collaboration.requestDeletion);
  const detachIdeaMutation = useMutation(api.collaboration.detachIdea);
  const updateEdgeLabelMutation = useMutation(api.ideas.updateEdgeLabel);
  const saveViewportMutation = useMutation(api.ideas.saveViewport);
  const { historyState, pushHistory, runHistory } = useWorkspaceHistory();

  const docsById = useMemo(
    () => new Map(nodeDocs.map((node) => [node._id, node])),
    [nodeDocs],
  );
  const edgeDocsById = useMemo(
    () => new Map(edgeDocs.map((edge) => [edge._id, edge])),
    [edgeDocs],
  );

  useEffect(() => {
    // Convex is the source of truth; preserve local selection while live vote data changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const ids = new Set(nodeDocs.map((node) => node._id));
      return parentsBeforeChildren(nodeDocs).map((rawDoc) => {
        const doc =
          rawDoc.parentIdeaId !== undefined && !ids.has(rawDoc.parentIdeaId)
            ? { ...rawDoc, parentIdeaId: undefined }
            : rawDoc;
        const previous = currentById.get(doc._id);
        const next = toFlowNode(doc);
        return { ...next, selected: previous?.selected ?? false };
      });
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
      const edgeId = await connectMutation({
        startupId,
        nodeAId: connection.source as Id<"ideaNodes">,
        nodeBId: connection.target as Id<"ideaNodes">,
      });
      pushHistory({
        label: "povezivanje ideja",
        undo: () => disconnectMutation({ startupId, edgeId }),
        redo: () => connectMutation({
          startupId,
          nodeAId: connection.source as Id<"ideaNodes">,
          nodeBId: connection.target as Id<"ideaNodes">,
        }),
      });
      toast.success("Ideje su povezane.");
    } catch (error) {
      setEdges((current) => current.filter((edge) => edge.id !== temporaryId));
      toast.error(error instanceof Error ? error.message : "Veza nije sačuvana.");
    }
  }, [connectMutation, disconnectMutation, pushHistory, startupId]);

  const vote = useCallback((ideaId: Id<"ideaNodes">, voteType: "up" | "down") => {
    const previous = docsById.get(ideaId)?.userVote ?? null;
    void voteMutation({ startupId, ideaId, voteType })
      .then(() => {
        pushHistory({
          label: "glasanje za ideju",
          undo: async () => {
            if (previous === voteType) {
              await voteMutation({ startupId, ideaId, voteType });
            } else if (previous === null) {
              await voteMutation({ startupId, ideaId, voteType });
            } else {
              await voteMutation({ startupId, ideaId, voteType: previous });
            }
          },
          redo: () => voteMutation({ startupId, ideaId, voteType }),
        });
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Glas nije sačuvan.");
      });
  }, [docsById, pushHistory, startupId, voteMutation]);

  const convert = useCallback((ideaId: Id<"ideaNodes">) => {
    const idea = docsById.get(ideaId);
    if (idea) onConvertIdea(idea);
  }, [docsById, onConvertIdea]);

  const edit = useCallback((ideaId: Id<"ideaNodes">) => {
    const idea = docsById.get(ideaId);
    if (idea) onEditIdea(idea);
  }, [docsById, onEditIdea]);

  const nest = useCallback((ideaId: Id<"ideaNodes">) => {
    const idea = docsById.get(ideaId);
    if (idea) onNestIdea(idea);
  }, [docsById, onNestIdea]);

  const detach = useCallback((ideaId: Id<"ideaNodes">) => {
    void detachIdeaMutation({ startupId, ideaId })
      .then(() => toast.success("Kartica je izvučena iz grupe."))
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Kartica nije izvučena.",
        ),
      );
  }, [detachIdeaMutation, startupId]);

  const remove = useCallback((ideaId: Id<"ideaNodes">) => {
    const idea = docsById.get(ideaId);
    if (!idea) return;
    if (!idea.canDeleteDirectly) {
      void requestDeletionMutation({
        target: { kind: "idea", id: ideaId },
      })
        .then(() => toast.success("Glasanje o brisanju je pokrenuto."))
        .catch((error) =>
          toast.error(
            error instanceof Error ? error.message : "Zahtev nije poslat.",
          ),
        );
      return;
    }
    void archiveIdeaMutation({ startupId, ideaId })
      .then((result) => {
        if (result.recoveredId) {
          toast.success("Ideja je obrisana, a tuđe izmene su oporavljene.");
          return;
        }
        pushHistory({
          label: "brisanje ideje",
          undo: () => restoreIdeaMutation({ startupId, ideaId }),
          redo: () => archiveIdeaMutation({ startupId, ideaId }),
        });
        toast.success("Ideja je obrisana.", {
          duration: 8_000,
          action: {
            label: "Undo",
            onClick: () =>
              void restoreIdeaMutation({ startupId, ideaId }).catch((error) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Ideja nije vraćena.",
                ),
              ),
          },
        });
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Ideja nije obrisana.",
        ),
      );
  }, [
    archiveIdeaMutation,
    docsById,
    requestDeletionMutation,
    pushHistory,
    restoreIdeaMutation,
    startupId,
  ]);

  const resize = useCallback((
    ideaId: Id<"ideaNodes">,
    layout: { x: number; y: number; width: number; height: number },
  ) => {
    const previous = docsById.get(ideaId);
    if (!previous) return;
    const before = {
      x: previous.x,
      y: previous.y,
      width: previous.width,
      height: previous.height,
    };
    const after = {
      x: Math.round(layout.x),
      y: Math.round(layout.y),
      width: Math.round(layout.width),
      height: Math.round(layout.height),
    };
    void updateLayoutMutation({
      startupId,
      ideaId,
      ...after,
    })
      .then(() => {
        pushHistory({
          label: "promena veličine ideje",
          undo: () =>
            before.width === undefined || before.height === undefined
              ? resetLayoutSizeMutation({ startupId, ideaId })
              : updateLayoutMutation({
                  startupId,
                  ideaId,
                  x: before.x,
                  y: before.y,
                  width: before.width,
                  height: before.height,
                }),
          redo: () => updateLayoutMutation({ startupId, ideaId, ...after }),
        });
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Veličina oblačića nije sačuvana.",
        );
      });
  }, [
    docsById,
    pushHistory,
    resetLayoutSizeMutation,
    startupId,
    updateLayoutMutation,
  ]);

  const resetSize = useCallback((ideaId: Id<"ideaNodes">) => {
    const previous = docsById.get(ideaId);
    if (!previous || (previous.width === undefined && previous.height === undefined)) return;
    void resetLayoutSizeMutation({ startupId, ideaId })
      .then(() => {
        pushHistory({
          label: "vraćanje početne veličine ideje",
          undo: () => updateLayoutMutation({
            startupId,
            ideaId,
            x: previous.x,
            y: previous.y,
            width: previous.width ?? DEFAULT_IDEA_WIDTH,
            height: previous.height ?? DEFAULT_IDEA_HEIGHT,
          }),
          redo: () => resetLayoutSizeMutation({ startupId, ideaId }),
        });
        toast.success("Vraćena je početna veličina ideje.");
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Početna veličina nije vraćena.",
        );
      });
  }, [
    docsById,
    pushHistory,
    resetLayoutSizeMutation,
    startupId,
    updateLayoutMutation,
  ]);

  const archiveEdge = useCallback((edgeId: Id<"ideaEdges">) => {
    const edge = edgeDocsById.get(edgeId);
    if (!edge) return;
    const operation = edge.canDeleteDirectly
      ? disconnectMutation({ startupId, edgeId })
      : requestDeletionMutation({
          target: { kind: "idea_edge", id: edgeId },
        });
    void operation
      .then(() => {
        if (edge.canDeleteDirectly) {
          pushHistory({
            label: "uklanjanje veze ideja",
            undo: () => connectMutation({
              startupId,
              nodeAId: edge.nodeAId,
              nodeBId: edge.nodeBId,
              ...(edge.label ? { label: edge.label } : {}),
            }),
            redo: () => disconnectMutation({ startupId, edgeId }),
          });
        }
        toast.success(
          edge.canDeleteDirectly
            ? "Veza je uklonjena."
            : "Glasanje o brisanju veze je pokrenuto.",
        );
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Veza nije uklonjena.");
      });
  }, [
    connectMutation,
    disconnectMutation,
    edgeDocsById,
    pushHistory,
    requestDeletionMutation,
    startupId,
  ]);

  const edgeActions = useMemo(() => ({
    editLabel: (edgeId: string) => {
      const edge = edgeDocsById.get(edgeId as Id<"ideaEdges">);
      if (!edge?.canEdit) {
        toast.error("Naziv veze može menjati samo njen autor.");
        return;
      }
      setEdgeEditorId(edgeId as Id<"ideaEdges">);
    },
    archiveEdge: (edgeId: string) => archiveEdge(edgeId as Id<"ideaEdges">),
  }), [archiveEdge, edgeDocsById]);

  const editingEdge = edgeEditorId ? edgeDocsById.get(edgeEditorId) : null;

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
    <ThoughtEdgeActionsProvider actions={edgeActions}>
      <IdeaNodeActionsProvider
        actions={{
          vote,
          convert,
          edit,
          nest,
          detach,
          remove,
          resize,
          resetSize,
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
          onNodeDragStart={(_event, node) => {
            preDragPositionsRef.current.set(node.id, {
              x: node.position.x,
              y: node.position.y,
            });
          }}
          onlyRenderVisibleElements
          onNodeClick={(event, node) => {
            const target = event.target as HTMLElement;
            if (
              target.closest(
                "button, a, input, textarea, select, .react-flow__handle, .react-flow__resize-control",
              )
            ) {
              return;
            }
            const idea = docsById.get(node.id as Id<"ideaNodes">);
            if (idea) onEditIdea(idea);
          }}
          onNodeDragStop={(_event, node) => {
            const before = preDragPositionsRef.current.get(node.id);
            const after = {
              id: node.id as Id<"ideaNodes">,
              x: Math.round(node.position.x),
              y: Math.round(node.position.y),
            };
            preDragPositionsRef.current.delete(node.id);
            if (!before || (before.x === after.x && before.y === after.y)) return;
            void updatePositionsMutation({
              startupId,
              updates: [after],
            })
              .then(() => {
                pushHistory({
                  label: "pomeranje ideje",
                  undo: () => updatePositionsMutation({
                    startupId,
                    updates: [{ id: after.id, x: before.x, y: before.y }],
                  }),
                  redo: () => updatePositionsMutation({
                    startupId,
                    updates: [after],
                  }),
                });
              })
              .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Pozicija nije sačuvana.");
              });
          }}
          onEdgesDelete={(deletedEdges) => {
            deletedEdges.forEach((edge) => {
              if (edge.id.startsWith("pending:")) return;
              archiveEdge(edge.id as Id<"ideaEdges">);
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
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-10 rounded-2xl shadow-md"
                aria-label="Poništi poslednju promenu"
                disabled={historyState.undoCount === 0 || historyState.busy}
                onClick={() => void runHistory("undo")}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-10 rounded-2xl shadow-md"
                aria-label="Ponovi promenu"
                disabled={historyState.redoCount === 0 || historyState.busy}
                onClick={() => void runHistory("redo")}
              >
                <Redo2 className="size-4" />
              </Button>
            </div>
          </Panel>

          <Panel position="top-right" className="m-3 hidden sm:block sm:m-5">
            <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card/92 px-3.5 py-2 text-[0.6875rem] font-medium text-muted-foreground shadow-md backdrop-blur-xl">
              <MousePointer2 className="size-3.5" />
              Otvori karticu · izaberi za resize · preimenuj vezu
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
        {edgeEditorId ? (
          <EdgeEditorDialog
            open
            initialLabel={editingEdge?.label ?? ""}
            description="Opciono objasni kako su dve ideje povezane."
            inputId="idea-edge-label"
            pending={edgeEditorPending}
            onOpenChange={(open) => !open && !edgeEditorPending && setEdgeEditorId(null)}
            onSubmit={async (label) => {
              const previousLabel = editingEdge?.label ?? "";
              setEdgeEditorPending(true);
              try {
                await updateEdgeLabelMutation({
                  startupId,
                  edgeId: edgeEditorId,
                  label,
                });
                pushHistory({
                  label: "naziv veze ideja",
                  undo: () => updateEdgeLabelMutation({
                    startupId,
                    edgeId: edgeEditorId,
                    label: previousLabel,
                  }),
                  redo: () => updateEdgeLabelMutation({
                    startupId,
                    edgeId: edgeEditorId,
                    label,
                  }),
                });
                setEdgeEditorId(null);
                toast.success(label ? "Naziv veze je sačuvan." : "Naziv veze je uklonjen.");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Naziv veze nije sačuvan.",
                );
              } finally {
                setEdgeEditorPending(false);
              }
            }}
          />
        ) : null}
      </IdeaNodeActionsProvider>
    </ThoughtEdgeActionsProvider>
  );
}
