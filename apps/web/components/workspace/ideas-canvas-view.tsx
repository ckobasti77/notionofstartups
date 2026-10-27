"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
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
  ArrowUpRight,
  Copy,
  FolderInput,
  GitBranchPlus,
  Lightbulb,
  Link2,
  Maximize2,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  SearchX,
  Trash2,
  Undo2,
  Ungroup,
} from "lucide-react";
import { toast } from "sonner";
import { IDEA_STAGE_LABELS, ideaDisplayStage, type IdeaStage, type IdeaStoredStage } from "@devotion/shared";

import {
  MAP_FRAME_CLASS,
  MapEmptyState,
  MapHistoryButtons,
  MapStatusBar,
} from "@/components/map/map-chrome";
import { mapIdeaCard } from "@/components/map/map-model";
import { selectNestingDropTarget } from "@/components/workspace/canvases/nesting-drop";

import { Button } from "@/components/ui/button";
import { CanvasActionRail } from "@/components/workspace/canvases/canvas-action-rail";
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
import {
  useCanvasNavigation,
  useMapActivation,
} from "@/components/workspace/canvases/use-canvas-navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
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
  /** Sačuvana faza (PROSTOR P6); bez nje „Predlog". */
  stage?: IdeaStage | null;
  canEdit: boolean;
  canMove: boolean;
  canResize: boolean;
  canDeleteDirectly: boolean;
  canDetach: boolean;
};

type IdeaEdge = {
  _id: Id<"ideaEdges">;
  nodeAId: Id<"ideaNodes">;
  nodeBId: Id<"ideaNodes">;
  label: string | null;
  canEdit: boolean;
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
type ContextTarget =
  | { kind: "node"; nodeId: Id<"ideaNodes"> }
  | { kind: "edge"; edgeId: Id<"ideaEdges"> }
  | { kind: "pane"; position: { x: number; y: number } };

const NODE_TYPES = { idea: IdeaFlowNodeCard };
const EDGE_TYPES = { default: ThoughtEdge };
const DEFAULT_IDEA_WIDTH = 288;
const DEFAULT_IDEA_HEIGHT = 196;

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
  "controls.ariaLabel": "Kontrole mape ideja",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Prikaži sve ideje",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "handle.ariaLabel": "Tačka za povezivanje ideja",
} as const;

function ideaStage(node: IdeaNode): IdeaStage {
  if (node.stage === "postalo_zadatak") return "postalo_zadatak";
  return ideaDisplayStage({
    stage: (node.stage ?? null) as IdeaStoredStage | null,
    convertedPageId: node.convertedPageId,
  });
}

function toFlowNode(node: IdeaNode, now: number): IdeaFlowNode {
  const size = {
    width: node.width ?? DEFAULT_IDEA_WIDTH,
    height: node.height ?? DEFAULT_IDEA_HEIGHT,
  };
  const stage = ideaStage(node);
  return {
    id: node._id,
    type: "idea",
    position: { x: node.x, y: node.y },
    data: {
      card: mapIdeaCard(
        {
          title: node.title,
          text: node.text,
          color: node.color,
          authorName: node.author?.displayName ?? "Član tima",
          createdAt: node.createdAt,
          stageLabel: IDEA_STAGE_LABELS[stage],
          upvotes: node.upvotes,
          downvotes: node.downvotes,
          userVote: node.userVote,
        },
        now,
      ),
      canEdit: node.canEdit,
      canResize: node.canResize,
      canDetach: node.canDetach,
      canConvert: node.isApproved && !node.convertedPageId,
      nestingTarget: false,
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

function isTextEntry(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

function absoluteIdeaPosition(
  ideaId: Id<"ideaNodes">,
  docsById: ReadonlyMap<Id<"ideaNodes">, IdeaNode>,
) {
  let idea = docsById.get(ideaId);
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  while (idea !== undefined && !seen.has(idea._id)) {
    seen.add(idea._id);
    x += idea.x;
    y += idea.y;
    idea =
      idea.parentIdeaId === undefined
        ? undefined
        : docsById.get(idea.parentIdeaId);
  }
  return { x, y };
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

function toFlowNodes(nodeDocs: IdeaNode[], now: number) {
  const ids = new Set(nodeDocs.map((node) => node._id));
  return parentsBeforeChildren(nodeDocs).map((node) =>
    toFlowNode(
      node.parentIdeaId !== undefined && !ids.has(node.parentIdeaId)
        ? { ...node, parentIdeaId: undefined }
        : node,
      now,
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
  const nestingTargetIdRef = useRef<string | null>(null);
  // Sat za „pre N" na karticama: jednom po otvaranju Mape (kao ranije).
  const [now] = useState(() => Date.now());
  const [nodes, setNodes] = useState<IdeaFlowNode[]>(() =>
    toFlowNodes(nodeDocs, now),
  );
  const [edges, setEdges] = useState<IdeaFlowEdge[]>(() => edgeDocs.map(toFlowEdge));
  const [viewport, setViewport] = useState<Viewport>({
    x: canvasState.x,
    y: canvasState.y,
    zoom: Math.min(Math.max(canvasState.zoom || 1, 0.5), 1.6),
  });
  const [edgeEditorId, setEdgeEditorId] = useState<Id<"ideaEdges"> | null>(null);
  const [edgeEditorPending, setEdgeEditorPending] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextTarget, setContextTarget] = useState<ContextTarget>({
    kind: "pane",
    position: { x: 0, y: 0 },
  });
  const colorMode = useCanvasColorMode();
  const canvasNavigation = useCanvasNavigation();
  const {
    ref: mapRef,
    active: mapActive,
    handlers: mapActivationHandlers,
    deactivate: deactivateMap,
  } = useMapActivation();

  const createIdeaMutation = useMutation(api.ideas.create);
  const voteMutation = useMutation(api.ideas.vote);
  const updatePositionsMutation = useMutation(api.ideas.updatePositions);
  const updateLayoutMutation = useMutation(api.ideas.updateLayout);
  const resetLayoutSizeMutation = useMutation(api.ideas.resetLayoutSize);
  const connectMutation = useMutation(api.ideas.connect);
  const disconnectMutation = useMutation(api.ideas.disconnect);
  const archiveIdeaMutation = useMutation(api.ideas.archive);
  const restoreIdeaMutation = useMutation(api.ideas.restoreOwn);
  const requestNestingMutation = useMutation(api.collaboration.requestNesting);
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
        const next = toFlowNode(doc, now);
        return { ...next, selected: previous?.selected ?? false };
      });
    });
  }, [nodeDocs, now]);

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
      toast.error(accessErrorMessage(error, "Veza nije sačuvana."));
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
        toast.error(accessErrorMessage(error, "Glas nije sačuvan."));
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
      .then(() => toast.success("Ideja je odvojena."))
      .catch((error) =>
        toast.error(
          accessErrorMessage(error, "Ideja nije odvojena."),
        ),
      );
  }, [detachIdeaMutation, startupId]);

  const selectConnected = useCallback((ideaId: Id<"ideaNodes">) => {
    const selected = new Set<string>([ideaId]);
    const queue = [ideaId as string];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of edges) {
        const next =
          edge.source === current
            ? edge.target
            : edge.target === current
              ? edge.source
              : null;
        if (next !== null && !selected.has(next)) {
          selected.add(next);
          queue.push(next);
        }
      }
    }
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: selected.has(node.id) })),
    );
  }, [edges]);

  const duplicateSelection = useCallback(async (requestedIds?: Id<"ideaNodes">[]) => {
    const ids =
      requestedIds ??
      nodes
        .filter((node) => node.selected)
        .map((node) => node.id as Id<"ideaNodes">);
    if (ids.length === 0) return;
    if (ids.length > 20) {
      toast.error("Dupliraj najviše 20 ideja odjednom.");
      return;
    }
    const createdIds: Id<"ideaNodes">[] = [];
    try {
      for (const [index, ideaId] of ids.entries()) {
        const idea = docsById.get(ideaId);
        if (!idea) continue;
        const position = absoluteIdeaPosition(ideaId, docsById);
        createdIds.push(
          await createIdeaMutation({
            startupId,
            title: idea.title?.trim() || "Kopija ideje",
            text: idea.text,
            color: idea.color,
            x: Math.round(position.x + 36 + index * 8),
            y: Math.round(position.y + 36 + index * 8),
          }),
        );
      }
      if (createdIds.length === 0) return;
      pushHistory({
        label: createdIds.length === 1 ? "dupliranje ideje" : "dupliranje ideja",
        undo: async () => {
          for (const ideaId of createdIds) {
            await archiveIdeaMutation({ startupId, ideaId });
          }
        },
        redo: async () => {
          for (const ideaId of createdIds) {
            await restoreIdeaMutation({ startupId, ideaId });
          }
        },
      });
      toast.success(
        createdIds.length === 1
          ? "Ideja je duplirana."
          : `${createdIds.length} ideje su duplirane.`,
      );
    } catch (error) {
      toast.error(
        accessErrorMessage(error, "Ideje nisu duplirane."),
      );
    }
  }, [
    archiveIdeaMutation,
    createIdeaMutation,
    docsById,
    nodes,
    pushHistory,
    restoreIdeaMutation,
    startupId,
  ]);

  const remove = useCallback((ideaId: Id<"ideaNodes">) => {
    const idea = docsById.get(ideaId);
    if (!idea) return;
    // Brisanje je uvek u Korpu (PROSTOR P3); server proverava dozvolu (R7).
    void archiveIdeaMutation({ startupId, ideaId })
      .then(() => {
        // Jedno stanje za toast i istoriju Mape: dvostruko vraćanje je no-op.
        let trashed = true;
        const restoreOnce = async () => {
          if (!trashed) return;
          trashed = false;
          await restoreIdeaMutation({ startupId, ideaId });
        };
        pushHistory({
          label: "brisanje ideje",
          undo: restoreOnce,
          redo: async () => {
            await archiveIdeaMutation({ startupId, ideaId });
            trashed = true;
          },
        });
        toast.success("Ideja je u Korpi.", {
          duration: 8_000,
          action: {
            label: "Poništi",
            onClick: () =>
              void restoreOnce().catch((error) =>
                toast.error(
                  accessErrorMessage(error, "Ideja nije vraćena."),
                ),
              ),
          },
        });
      })
      .catch((error) =>
        toast.error(
          accessErrorMessage(error, "Ideja nije obrisana."),
        ),
      );
  }, [
    archiveIdeaMutation,
    docsById,
    pushHistory,
    restoreIdeaMutation,
    startupId,
  ]);

  const resize = useCallback((
    ideaId: Id<"ideaNodes">,
    layout: { x: number; y: number; width: number; height: number },
  ) => {
    const previous = docsById.get(ideaId);
    const previousNode = nodes.find((node) => node.id === ideaId);
    if (!previous || !previousNode) return;
    const before = {
      x: previous.x,
      y: previous.y,
      width: previous.width,
      height: previous.height,
    };
    const after = {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
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
        setNodes((current) =>
          current.map((node) =>
            node.id === ideaId
              ? {
                  ...node,
                  position: { ...previousNode.position },
                  width: previousNode.width,
                  height: previousNode.height,
                  style: { ...previousNode.style },
                }
              : node,
          ),
        );
        toast.error(
          accessErrorMessage(error, "Veličina ideje nije sačuvana."),
        );
      });
  }, [
    docsById,
    nodes,
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
          accessErrorMessage(error, "Početna veličina nije vraćena."),
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
    // Veze uklanja svaki član (PROSTOR D20) — bez zahteva.
    void disconnectMutation({ startupId, edgeId })
      .then(() => {
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
        toast.success("Veza je uklonjena.");
      })
      .catch((error) => {
        toast.error(accessErrorMessage(error, "Veza nije uklonjena."));
      });
  }, [
    connectMutation,
    disconnectMutation,
    edgeDocsById,
    pushHistory,
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

  /**
   * Cilj ugnežđavanja kao na Mapi oblasti: centar ideje u drugoj ideji, najveće
   * preklapanje (`selectNestingDropTarget`). Ugnežđene ideje imaju relativne
   * pozicije, pa se poredi apsolutni položaj iz xyflow-a.
   */
  const ideaDropTarget = useCallback((node: IdeaFlowNode): string | null => {
    const instance = flowRef.current;
    if (!instance) return null;
    const rectOf = (id: string) => {
      const internal = instance.getInternalNode(id);
      if (!internal) return null;
      return {
        id,
        position: internal.internals.positionAbsolute,
        width: internal.measured.width ?? internal.width,
        height: internal.measured.height ?? internal.height,
      };
    };
    const dragged = rectOf(node.id);
    if (!dragged) return null;
    const candidates = instance
      .getIntersectingNodes(node)
      .flatMap((candidate) => {
        const rect = rectOf(candidate.id);
        return rect ? [rect] : [];
      });
    return selectNestingDropTarget(dragged, candidates)?.id ?? null;
  }, []);

  const updateIdeaNestingTarget = useCallback((targetId: string | null) => {
    if (nestingTargetIdRef.current === targetId) return;
    nestingTargetIdRef.current = targetId;
    setNodes((current) =>
      current.map((node) => {
        const nestingTarget = node.id === targetId;
        return node.data.nestingTarget === nestingTarget
          ? node
          : { ...node, data: { ...node.data, nestingTarget } };
      }),
    );
  }, []);

  /** „Poništi" ugnežđavanja ili odvajanja: stari roditelj i stari položaj. */
  const restoreIdeaParent = useCallback(
    async (
      ideaId: Id<"ideaNodes">,
      previousParentId: Id<"ideaNodes"> | undefined,
      position: { x: number; y: number } | undefined,
    ) => {
      if (previousParentId === undefined) {
        await detachIdeaMutation({ startupId, ideaId });
      } else {
        await requestNestingMutation({
          startupId,
          childIdeaId: ideaId,
          parentIdeaId: previousParentId,
        });
      }
      if (position) {
        await updatePositionsMutation({
          startupId,
          updates: [{ id: ideaId, x: position.x, y: position.y }],
        });
      }
    },
    [detachIdeaMutation, requestNestingMutation, startupId, updatePositionsMutation],
  );

  const invokeKeyboardContextMenu = useCallback(() => {
    const node = nodes.find((item) => item.selected);
    const selector = node
      ? `.react-flow__node[data-id="${CSS.escape(node.id)}"]`
      : ".react-flow";
    const anchor = document.querySelector<HTMLElement>(selector);
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    anchor.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: bounds.left + Math.min(bounds.width / 2, 120),
        clientY: bounds.top + Math.min(bounds.height / 2, 70),
      }),
    );
  }, [nodes]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEntry(event.target)) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: true })),
      );
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void duplicateSelection();
      return;
    }
    if (event.shiftKey && event.key === "F10") {
      event.preventDefault();
      invokeKeyboardContextMenu();
      return;
    }
    if (event.key === "Escape") {
      deactivateMap();
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: false })),
      );
      setEdges((current) =>
        current.map((edge) => ({ ...edge, selected: false })),
      );
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      nodes
        .filter((node) => node.selected)
        .forEach((node) => remove(node.id as Id<"ideaNodes">));
      edges
        .filter((edge) => edge.selected && !edge.id.startsWith("pending:"))
        .forEach((edge) => archiveEdge(edge.id as Id<"ideaEdges">));
    }
  }, [
    archiveEdge,
    deactivateMap,
    duplicateSelection,
    edges,
    invokeKeyboardContextMenu,
    nodes,
    remove,
  ]);

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
        <ContextMenu.Root open={contextOpen} onOpenChange={setContextOpen}>
          <ContextMenu.Trigger asChild>
        <div
          ref={mapRef}
          className={cn(styles.canvas, MAP_FRAME_CLASS)}
          data-canvas-space-pan={canvasNavigation.spacePressed}
          data-canvas-zoom-modifier={canvasNavigation.zoomModifierPressed}
          data-map-active={mapActive}
          role="application"
          aria-roledescription="mapa"
          tabIndex={0}
          {...mapActivationHandlers}
          onKeyDownCapture={handleKeyDown}
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
          onNodeDrag={(_event, node, draggedNodes) => {
            const idea = docsById.get(node.id as Id<"ideaNodes">);
            const target =
              draggedNodes.length === 1 && idea?.canEdit
                ? ideaDropTarget(node)
                : null;
            updateIdeaNestingTarget(
              target !== null && target !== idea?.parentIdeaId ? target : null,
            );
          }}
          onNodeDragStart={(_event, _node, draggedNodes) => {
            updateIdeaNestingTarget(null);
            preDragPositionsRef.current = new Map(
              draggedNodes.map((dragged) => [
                dragged.id,
                { x: dragged.position.x, y: dragged.position.y },
              ]),
            );
          }}
          onlyRenderVisibleElements
          onNodeClick={(event, node) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey) return;
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
          onNodeDragStop={(_event, node, draggedNodes) => {
            const dropTargetId =
              draggedNodes.length === 1 ? ideaDropTarget(node) : null;
            updateIdeaNestingTarget(null);
            if (draggedNodes.length > 50) {
              toast.error("Pomeraj najviše 50 ideja odjednom.");
              return;
            }
            const before = draggedNodes.flatMap((dragged) => {
              const position = preDragPositionsRef.current.get(dragged.id);
              return position
                ? [{
                    id: dragged.id as Id<"ideaNodes">,
                    x: Math.round(position.x),
                    y: Math.round(position.y),
                  }]
                : [];
            });
            const after = draggedNodes.map((dragged) => ({
              id: dragged.id as Id<"ideaNodes">,
              x: Math.round(dragged.position.x),
              y: Math.round(dragged.position.y),
            }));
            preDragPositionsRef.current.clear();
            const changed = after.some((move) => {
              const previous = before.find((item) => item.id === move.id);
              return previous?.x !== move.x || previous?.y !== move.y;
            });
            if (!changed) return;
            void updatePositionsMutation({
              startupId,
              updates: after,
            })
              .then(async () => {
                try {
                  if (draggedNodes.length === 1) {
                    const idea = docsById.get(node.id as Id<"ideaNodes">);
                    const previousParentId = idea?.parentIdeaId;
                    const previousPosition = before.find(
                      (item) => item.id === idea?._id,
                    );
                    const undoAction = (ideaId: Id<"ideaNodes">) => ({
                      label: "Poništi",
                      onClick: () =>
                        void restoreIdeaParent(
                          ideaId,
                          previousParentId,
                          previousPosition,
                        ).catch((error: unknown) =>
                          toast.error(
                            accessErrorMessage(error, "Promena nije poništena."),
                          ),
                        ),
                    });
                    if (
                      idea?.canEdit &&
                      dropTargetId !== null &&
                      previousParentId !== dropTargetId
                    ) {
                      // PROSTOR P4: odmah, bez zahteva; „Poništi" vraća roditelja i mesto.
                      await requestNestingMutation({
                        startupId,
                        childIdeaId: idea._id,
                        parentIdeaId: dropTargetId as Id<"ideaNodes">,
                      });
                      toast.success("Ideja je ugnežđena.", {
                        duration: 8_000,
                        action: undoAction(idea._id),
                      });
                    } else if (
                      idea?.canDetach &&
                      previousParentId !== undefined &&
                      dropTargetId === null
                    ) {
                      await detachIdeaMutation({
                        startupId,
                        ideaId: idea._id,
                      });
                      toast.success("Ideja je odvojena.", {
                        duration: 8_000,
                        action: undoAction(idea._id),
                      });
                    }
                  }
                } catch (error) {
                  toast.error(
                    accessErrorMessage(error, "Ugnežđavanje nije sačuvano."),
                  );
                }
                pushHistory({
                  label:
                    after.length === 1
                      ? "pomeranje ideje"
                      : "pomeranje grupe ideja",
                  undo: () => updatePositionsMutation({
                    startupId,
                    updates: before,
                  }),
                  redo: () => updatePositionsMutation({
                    startupId,
                    updates: after,
                  }),
                });
              })
              .catch((error) => {
                toast.error(accessErrorMessage(error, "Pozicija nije sačuvana."));
              });
          }}
          onNodeContextMenu={(_event, node) => {
            setContextTarget({
              kind: "node",
              nodeId: node.id as Id<"ideaNodes">,
            });
            if (!node.selected) {
              setNodes((current) =>
                current.map((item) => ({
                  ...item,
                  selected: item.id === node.id,
                })),
              );
              setEdges((current) =>
                current.map((edge) => ({ ...edge, selected: false })),
              );
            }
          }}
          onEdgeContextMenu={(_event, edge) => {
            if (edge.id.startsWith("pending:")) return;
            setContextTarget({
              kind: "edge",
              edgeId: edge.id as Id<"ideaEdges">,
            });
          }}
          onPaneContextMenu={(event) => {
            const position = flowRef.current?.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });
            if (position) {
              setContextTarget({ kind: "pane", position });
            }
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
          minZoom={0.18}
          maxZoom={2.2}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          zoomOnScroll={false}
          panOnScroll={mapActive}
          preventScrolling={mapActive}
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          zoomActivationKeyCode={["Control", "Meta"]}
          noPanClassName={canvasNavigation.noPanClassName}
          noWheelClassName={canvasNavigation.noWheelClassName}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          selectionKeyCode="Shift"
          multiSelectionKeyCode={["Control", "Meta"]}
          deleteKeyCode={null}
          nodeDragThreshold={3}
          connectionDragThreshold={4}
          elevateNodesOnSelect
          nodesConnectable
          nodesFocusable
          edgesFocusable
          fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
          aria-label="Mapa ideja"
          ariaLabelConfig={SERBIAN_ARIA_LABELS}
          colorMode={colorMode}
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
              undoCount={historyState.undoCount}
              redoCount={historyState.redoCount}
              busy={historyState.busy}
              onUndo={() => void runHistory("undo")}
              onRedo={() => void runHistory("redo")}
              undoIcon={<Undo2 className="size-4" aria-hidden="true" />}
              redoIcon={<Redo2 className="size-4" aria-hidden="true" />}
            />
          </Panel>

          <Panel position="top-right" className="m-3">
            <CanvasActionRail
              ariaLabel="Radnje na mapi ideja"
              identity={{
                label: "Mapa ideja",
                icon: Lightbulb,
                count: nodes.length,
              }}
              sections={[
                {
                  id: "Novo",
                  items: [
                    {
                      id: "new-idea",
                      label: "Nova ideja",
                      icon: Plus,
                      onSelect: () => {
                        const center =
                          flowRef.current?.screenToFlowPosition({
                            x: window.innerWidth / 2,
                            y: window.innerHeight / 2,
                          });
                        onCreateIdea(undefined, center);
                      },
                    },
                  ],
                },
              ]}
            />
          </Panel>

          <Panel position="bottom-center" className="!mb-3">
            <MapStatusBar zoom={viewport.zoom} active={mapActive} />
          </Panel>
        </ReactFlow>

        {nodes.length === 0 ? (
          <MapEmptyState
            icon={searchActive ? SearchX : Lightbulb}
            title={searchActive ? "Nema ideja za ovu pretragu." : "Još nema ideja."}
            description={searchActive ? "Promeni pojam za pretragu." : undefined}
            actions={
              searchActive ? null : (
                <Button onClick={() => onCreateIdea()}>
                  <Plus className="size-4" aria-hidden="true" /> Nova ideja
                </Button>
              )
            }
          />
        ) : null}
        </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content
              className={styles.contextContent}
              collisionPadding={8}
            >
              {contextTarget.kind === "node" ? (() => {
                const idea = docsById.get(contextTarget.nodeId);
                if (!idea) return null;
                return (
                  <>
                    <ContextMenu.Item
                      className={styles.contextItem}
                      onSelect={() => edit(idea._id)}
                    >
                      <ArrowUpRight className="size-4" />
                      Otvori i uredi
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={styles.contextItem}
                      onSelect={() => onCreateIdea(idea._id)}
                    >
                      <GitBranchPlus className="size-4" /> Nova grana
                    </ContextMenu.Item>
                    {idea.canEdit ? (
                      <ContextMenu.Item
                        className={styles.contextItem}
                        onSelect={() => nest(idea._id)}
                      >
                        <FolderInput className="size-4" /> Ugnezdi u…
                      </ContextMenu.Item>
                    ) : null}
                    {idea.canDetach ? (
                      <ContextMenu.Item
                        className={styles.contextItem}
                        onSelect={() => detach(idea._id)}
                      >
                        <Ungroup className="size-4" /> Odvoji
                      </ContextMenu.Item>
                    ) : null}
                    <ContextMenu.Item
                      className={styles.contextItem}
                      onSelect={() => selectConnected(idea._id)}
                    >
                      <Link2 className="size-4" /> Izaberi povezane
                    </ContextMenu.Item>
                    <ContextMenu.Separator className={styles.contextSeparator} />
                    <ContextMenu.Item
                      className={styles.contextItem}
                      onSelect={() => void duplicateSelection([idea._id])}
                    >
                      <Copy className="size-4" /> Dupliraj
                    </ContextMenu.Item>
                    {idea.isApproved && !idea.convertedPageId ? (
                      <ContextMenu.Item
                        className={styles.contextItem}
                        onSelect={() => convert(idea._id)}
                      >
                        <Maximize2 className="size-4" /> Pretvori
                      </ContextMenu.Item>
                    ) : null}
                    <ContextMenu.Separator className={styles.contextSeparator} />
                    <ContextMenu.Item
                      className={cn(styles.contextItem, styles.contextDanger)}
                      onSelect={() => remove(idea._id)}
                    >
                      <Trash2 className="size-4" /> Obriši
                    </ContextMenu.Item>
                  </>
                );
              })() : null}
              {contextTarget.kind === "edge" ? (() => {
                const edge = edgeDocsById.get(contextTarget.edgeId);
                if (!edge) return null;
                return (
                  <>
                    <ContextMenu.Item
                      className={styles.contextItem}
                      disabled={!edge.canEdit}
                      onSelect={() => setEdgeEditorId(edge._id)}
                    >
                      <Pencil className="size-4" /> Preimenuj vezu
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={cn(styles.contextItem, styles.contextDanger)}
                      onSelect={() => archiveEdge(edge._id)}
                    >
                      <Trash2 className="size-4" /> Ukloni vezu
                    </ContextMenu.Item>
                  </>
                );
              })() : null}
              {contextTarget.kind === "pane" ? (
                <>
                  <ContextMenu.Item
                    className={styles.contextItem}
                    onSelect={() =>
                      onCreateIdea(undefined, contextTarget.position)
                    }
                  >
                    <Plus className="size-4" /> Nova ideja ovde
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={styles.contextItem}
                    onSelect={() =>
                      void flowRef.current?.fitView({
                        padding: 0.24,
                        duration: 260,
                      })
                    }
                  >
                    <Maximize2 className="size-4" /> Prikaži sve
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={styles.contextItem}
                    onSelect={() =>
                      setNodes((current) =>
                        current.map((node) => ({ ...node, selected: true })),
                      )
                    }
                  >
                    <MousePointer2 className="size-4" /> Izaberi sve
                  </ContextMenu.Item>
                  <ContextMenu.Separator className={styles.contextSeparator} />
                  <ContextMenu.Item
                    className={styles.contextItem}
                    disabled={historyState.undoCount === 0 || historyState.busy}
                    onSelect={() => void runHistory("undo")}
                  >
                    <Undo2 className="size-4" /> Poništi
                  </ContextMenu.Item>
                </>
              ) : null}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
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
                  accessErrorMessage(error, "Naziv veze nije sačuvan."),
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
