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
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  Archive,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Edit3,
  Expand,
  FileInput,
  Focus,
  History,
  Link2,
  LoaderCircle,
  MousePointer2,
  Plus,
  Redo2,
  Send,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT,
  type ThoughtSidebarDragPointer,
  type ThoughtSidebarDragReleaseDetail,
} from "@/components/workspace/thought-sharing";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { ThoughtConversionDialog } from "./thought-conversion-dialog";
import { EdgeEditorDialog, ThoughtEditorDialog } from "./thought-editor-dialog";
import { ThoughtEdge, ThoughtEdgeActionsProvider } from "./thought-edge";
import { ThoughtNode, ThoughtNodeActionsProvider } from "./thought-node";
import styles from "./thoughts-canvas.module.css";
import type {
  ThoughtDestination,
  ThoughtDestinationRequest,
  ThoughtEditorValue,
  ThoughtFlowNode,
  ThoughtNodeColor,
  ThoughtsCanvasViewProps,
} from "./types";

type ThoughtFlowEdge = Edge<Record<string, never>, "default" | "smoothstep">;
type ThoughtNodeDoc = Doc<"thoughtNodes">;
type ThoughtEdgeDoc = Doc<"thoughtEdges">;

type NodeEditorState =
  | {
      mode: "create";
      position: { x: number; y: number };
      connectFrom?: Id<"thoughtNodes">;
    }
  | { mode: "edit"; nodeId: Id<"thoughtNodes"> }
  | null;

type ContextTarget =
  | { kind: "pane"; position: { x: number; y: number } }
  | { kind: "node"; nodeId: Id<"thoughtNodes"> }
  | { kind: "edge"; edgeId: Id<"thoughtEdges"> };

type ConversionState = {
  nodeIds: Id<"thoughtNodes">[];
  destination: ThoughtDestination;
} | null;

type HistoryEntry = {
  label: string;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
};

const NODE_TYPES = { thought: ThoughtNode };
const EDGE_TYPES = { default: ThoughtEdge };

const MINI_MAP_COLORS: Record<ThoughtNodeColor, string> = {
  neutral: "#94a3b8",
  violet: "#8b5cf6",
  blue: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const SERBIAN_ARIA_LABELS = {
  "node.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš misao. Strelicama je pomeraš.",
  "node.a11yDescription.keyboardDisabled": "Ova misao se ne može pomerati tastaturom.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) => `Misao je pomerena ${direction}. Nova pozicija je ${Math.round(x)}, ${Math.round(y)}.`,
  "edge.a11yDescription.default": "Pritisni Enter ili Space da izabereš vezu.",
  "controls.ariaLabel": "Kontrole kanvasa",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Prikaži sve misli",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "minimap.ariaLabel": "Minimapa misli",
  "handle.ariaLabel": "Tačka za povezivanje misli",
} as const;

function toFlowNode(doc: ThoughtNodeDoc): ThoughtFlowNode {
  return {
    id: doc._id,
    type: "thought",
    position: { x: doc.x, y: doc.y },
    data: {
      title: doc.title,
      text: doc.text,
      color: doc.color,
      isParent: doc.isParent ?? false,
      conversionCount: doc.conversionCount,
      lastConvertedPageId: doc.lastConvertedPageId,
    },
    ariaLabel: `${doc.isParent ? "Roditeljska misao" : "Misao"}: ${doc.title ?? ""}. ${doc.text}`,
  };
}

function toFlowEdge(doc: ThoughtEdgeDoc): ThoughtFlowEdge {
  return {
    id: doc._id,
    type: "default",
    source: doc.nodeAId,
    target: doc.nodeBId,
    label: doc.label ?? undefined,
    ariaLabel: doc.label ? `Veza: ${doc.label}` : "Veza između dve misli",
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 8,
    interactionWidth: 22,
    reconnectable: true,
  };
}

function mergeDocs<T extends { _id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item._id, item]));
  incoming.forEach((item) => merged.set(item._id, item));
  return Array.from(merged.values());
}

function selectedThoughtIds(nodes: ThoughtFlowNode[]) {
  return nodes.filter((node) => node.selected).map((node) => node.id as Id<"thoughtNodes">);
}

function clientPoint(event: MouseEvent | TouchEvent) {
  if ("touches" in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function sidebarDragReleaseDetail(
  event: MouseEvent | TouchEvent,
  sessionId: string,
): ThoughtSidebarDragReleaseDetail | null {
  if ("touches" in event) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch
      ? {
          sessionId,
          x: touch.clientX,
          y: touch.clientY,
          pointerId: null,
          source: "touch",
          touchId: touch.identifier,
        }
      : null;
  }
  const pointer = event as MouseEvent | PointerEvent;
  if ("pointerId" in pointer) {
    return {
      sessionId,
      x: pointer.clientX,
      y: pointer.clientY,
      pointerId: pointer.pointerId,
      source: "pointer",
      touchId: null,
    };
  }
  return {
    sessionId,
    x: pointer.clientX,
    y: pointer.clientY,
    pointerId: null,
    source: "mouse",
    touchId: null,
  };
}

function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"),
  );
}

function useDarkTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function ThoughtsCanvasView(props: ThoughtsCanvasViewProps) {
  return (
    <ReactFlowProvider key={props.startup._id}>
      <ThoughtsCanvasBody {...props} />
    </ReactFlowProvider>
  );
}

function ThoughtsCanvasBody({
  startup,
  profile,
  onOpenPage,
  onRequestDestination,
  onBeginSidebarDrag,
}: ThoughtsCanvasViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<ThoughtFlowNode, ThoughtFlowEdge> | null>(null);
  const viewportReadyRef = useRef(false);
  const preDragPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const preDragViewportRef = useRef<Viewport | null>(null);
  const sidebarDragStartedRef = useRef(false);
  const sidebarDragTerminatedRef = useRef(false);
  const sidebarDragSessionIdRef = useRef<string | null>(null);
  const sidebarDragInputRef = useRef<ThoughtSidebarDragReleaseDetail | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const historyBusyRef = useRef(false);

  const dark = useDarkTheme();
  const reducedMotion = useReducedMotion();
  const convex = useConvex();
  const canvas = useQuery(api.thoughts.getCanvas, { startupId: startup._id });
  const nodePagination = usePaginatedQuery(
    api.thoughts.listNodes,
    { startupId: startup._id },
    { initialNumItems: 100 },
  );
  const edgePagination = usePaginatedQuery(
    api.thoughts.listEdges,
    { startupId: startup._id },
    { initialNumItems: 200 },
  );

  const saveViewport = useMutation(api.thoughts.saveViewport);
  const createNode = useMutation(api.thoughts.createNode);
  const updateNode = useMutation(api.thoughts.updateNode);
  const moveNodes = useMutation(api.thoughts.moveNodes);
  const duplicateNodes = useMutation(api.thoughts.duplicateNodes);
  const archiveNodes = useMutation(api.thoughts.archiveNodes);
  const restoreNodes = useMutation(api.thoughts.restoreNodes);
  const createEdge = useMutation(api.thoughts.createEdge);
  const updateEdge = useMutation(api.thoughts.updateEdge);
  const archiveEdges = useMutation(api.thoughts.archiveEdges);
  const restoreEdges = useMutation(api.thoughts.restoreEdges);
  const toggleNodeParent = useMutation(api.thoughts.toggleNodeParent);

  const [nodes, setNodes] = useState<ThoughtFlowNode[]>([]);
  const [edges, setEdges] = useState<ThoughtFlowEdge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    ThoughtFlowNode,
    ThoughtFlowEdge
  > | null>(null);
  const [supplementalNodes, setSupplementalNodes] = useState<ThoughtNodeDoc[]>([]);
  const [supplementalEdges, setSupplementalEdges] = useState<ThoughtEdgeDoc[]>([]);
  const [connectedNodeIds, setConnectedNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [editor, setEditor] = useState<NodeEditorState>(null);
  const [edgeEditorId, setEdgeEditorId] = useState<Id<"thoughtEdges"> | null>(null);
  const [editorPending, setEditorPending] = useState(false);
  const [contextTarget, setContextTarget] = useState<ContextTarget>({
    kind: "pane",
    position: { x: 0, y: 0 },
  });
  const [contextOpen, setContextOpen] = useState(false);
  const [conversion, setConversion] = useState<ConversionState>(null);
  const [historyState, setHistoryState] = useState({
    undoCount: 0,
    redoCount: 0,
    busy: false,
  });
  const [sidebarDragActive, setSidebarDragActive] = useState(false);

  useEffect(() => {
    // A release outside the browser can end the sidebar layer without giving
    // React Flow its drag-stop event. A release listener runs before D3's end
    // handler, so clear only on the next task: D3 first gets a chance to enter
    // the canceled branch and restore the original positions.
    function scheduleTerminatedSidebarDragCleanup(
      event: PointerEvent | MouseEvent | TouchEvent,
    ) {
      const tracked = sidebarDragInputRef.current;
      if (tracked === null) return;
      const matches = tracked.source === "touch"
        ? event instanceof TouchEvent && tracked.touchId !== null &&
          Array.from(event.changedTouches).some((touch) => touch.identifier === tracked.touchId)
        : tracked.source === "pointer"
          ? event instanceof PointerEvent && event.pointerId === tracked.pointerId
          : event instanceof MouseEvent && !(event instanceof PointerEvent);
      if (!matches) return;
      const sessionId = tracked.sessionId;
      window.setTimeout(() => {
        if (
          !sidebarDragStartedRef.current &&
          sidebarDragInputRef.current?.sessionId === sessionId
        ) {
          sidebarDragTerminatedRef.current = false;
          sidebarDragInputRef.current = null;
        }
      }, 0);
    }

    window.addEventListener("pointerup", scheduleTerminatedSidebarDragCleanup, true);
    window.addEventListener("mouseup", scheduleTerminatedSidebarDragCleanup, true);
    window.addEventListener("touchend", scheduleTerminatedSidebarDragCleanup, true);
    window.addEventListener("touchcancel", scheduleTerminatedSidebarDragCleanup, true);
    return () => {
      window.removeEventListener("pointerup", scheduleTerminatedSidebarDragCleanup, true);
      window.removeEventListener("mouseup", scheduleTerminatedSidebarDragCleanup, true);
      window.removeEventListener("touchend", scheduleTerminatedSidebarDragCleanup, true);
      window.removeEventListener("touchcancel", scheduleTerminatedSidebarDragCleanup, true);
    };
  }, []);

  const nodeDocs = useMemo(
    () => mergeDocs(nodePagination.results, supplementalNodes),
    [nodePagination.results, supplementalNodes],
  );
  const edgeDocs = useMemo(
    () => mergeDocs(edgePagination.results, supplementalEdges),
    [edgePagination.results, supplementalEdges],
  );
  const nodeDocsById = useMemo(
    () => new Map(nodeDocs.map((node) => [node._id, node])),
    [nodeDocs],
  );
  const edgeDocsById = useMemo(
    () => new Map(edgeDocs.map((edge) => [edge._id, edge])),
    [edgeDocs],
  );

  useEffect(() => {
    // The Convex subscription is the source of truth; React Flow needs its own
    // mutable selection/drag state, so reconcile the external snapshot here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => {
      const selection = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return nodeDocs.map((doc) => ({ ...toFlowNode(doc), selected: selection.has(doc._id) }));
    });
  }, [nodeDocs]);

  useEffect(() => {
    // See the node reconciliation above. Edge selection remains client-local.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => {
      const selection = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return edgeDocs.map((doc) => ({ ...toFlowEdge(doc), selected: selection.has(doc._id) }));
    });
  }, [edgeDocs]);

  useEffect(() => {
    if (canvas === undefined || !flowInstance || viewportReadyRef.current) return;
    viewportReadyRef.current = true;
    if (canvas) {
      void flowInstance.setViewport(
        { x: canvas.x, y: canvas.y, zoom: canvas.zoom },
        { duration: reducedMotion ? 0 : 240 },
      );
    } else if (nodeDocs.length > 0) {
      void flowInstance.fitView({
        padding: 0.24,
        duration: reducedMotion ? 0 : 320,
        maxZoom: 1.1,
      });
    }
  }, [canvas, flowInstance, nodeDocs.length, reducedMotion]);

  const pushHistory = useCallback((entry: HistoryEntry) => {
    if (historyBusyRef.current) return;
    undoStackRef.current = [...undoStackRef.current.slice(-49), entry];
    redoStackRef.current = [];
    setHistoryState({
      undoCount: undoStackRef.current.length,
      redoCount: 0,
      busy: false,
    });
  }, []);

  const runHistory = useCallback(async (direction: "undo" | "redo") => {
    if (historyBusyRef.current) return;
    const source = direction === "undo" ? undoStackRef : redoStackRef;
    const destination = direction === "undo" ? redoStackRef : undoStackRef;
    const entry = source.current.at(-1);
    if (!entry) return;

    historyBusyRef.current = true;
    setHistoryState((current) => ({ ...current, busy: true }));
    try {
      await (direction === "undo" ? entry.undo() : entry.redo());
      source.current = source.current.slice(0, -1);
      destination.current = [...destination.current, entry];
      setHistoryState({
        undoCount: undoStackRef.current.length,
        redoCount: redoStackRef.current.length,
        busy: false,
      });
      toast.success(direction === "undo" ? `Poništeno: ${entry.label}` : `Ponovljeno: ${entry.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Promena nije mogla da se primeni.");
    } finally {
      historyBusyRef.current = false;
      setHistoryState({
        undoCount: undoStackRef.current.length,
        redoCount: redoStackRef.current.length,
        busy: false,
      });
    }
  }, []);

  const openEditor = useCallback((nodeId: Id<"thoughtNodes">) => {
    setEditor({ mode: "edit", nodeId });
  }, []);

  const makeDestinationRequest = useCallback((nodeIds: Id<"thoughtNodes">[]) => {
    const uniqueIds = Array.from(new Set(nodeIds)).slice(0, 50);
    const first = uniqueIds[0] ? nodeDocsById.get(uniqueIds[0]) : null;
    const label =
      uniqueIds.length === 1
        ? first?.title ?? first?.text.split(/\r?\n/)[0]?.slice(0, 60) ?? "Jedna misao"
        : `${uniqueIds.length} misli`;
    const request: ThoughtDestinationRequest = {
      nodeIds: uniqueIds,
      label,
      complete: (destination) => setConversion({ nodeIds: uniqueIds, destination }),
      cancel: () => undefined,
    };
    return request;
  }, [nodeDocsById]);

  const requestDestination = useCallback((nodeIds: Id<"thoughtNodes">[]) => {
    if (nodeIds.length === 0) return;
    if (nodeIds.length > 50) {
      toast.error("Odaberi najviše 50 misli za jednu kopiju.");
      return;
    }
    onRequestDestination(makeDestinationRequest(nodeIds));
  }, [makeDestinationRequest, onRequestDestination]);

  const duplicateSelection = useCallback(async (nodeIds: Id<"thoughtNodes">[]) => {
    if (nodeIds.length === 0) return;
    if (nodeIds.length > 50) {
      toast.error("Možeš odjednom da dupliraš najviše 50 misli.");
      return;
    }
    try {
      const duplicatedIds = await duplicateNodes({
        nodeIds,
        offsetX: 38,
        offsetY: 38,
      });
      pushHistory({
        label: nodeIds.length === 1 ? "dupliranje misli" : "dupliranje misli",
        undo: () => archiveNodes({ nodeIds: duplicatedIds }),
        redo: () => restoreNodes({ nodeIds: duplicatedIds }),
      });
      toast.success(nodeIds.length === 1 ? "Misao je duplirana." : `${nodeIds.length} misli je duplirano.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Misli nisu duplirane.");
    }
  }, [archiveNodes, duplicateNodes, pushHistory, restoreNodes]);

  const archiveSelection = useCallback(async (
    nodeIds: Id<"thoughtNodes">[],
    edgeIds: Id<"thoughtEdges">[],
  ) => {
    if (nodeIds.length + edgeIds.length === 0) return;
    if (nodeIds.length > 50 || edgeIds.length > 50) {
      toast.error("Arhiviraj najviše 50 misli i 50 veza odjednom.");
      return;
    }
    try {
      if (edgeIds.length) await archiveEdges({ edgeIds });
      if (nodeIds.length) await archiveNodes({ nodeIds });
      setSupplementalNodes((current) => current.filter((node) => !nodeIds.includes(node._id)));
      setSupplementalEdges((current) => current.filter((edge) => !edgeIds.includes(edge._id)));
      pushHistory({
        label: nodeIds.length ? "arhiviranje misli" : "arhiviranje veze",
        undo: async () => {
          if (nodeIds.length) await restoreNodes({ nodeIds });
          if (edgeIds.length) await restoreEdges({ edgeIds });
        },
        redo: async () => {
          if (edgeIds.length) await archiveEdges({ edgeIds });
          if (nodeIds.length) await archiveNodes({ nodeIds });
        },
      });
      toast.success(nodeIds.length ? "Misao je sklonjena u arhivu." : "Veza je arhivirana.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Izbor nije arhiviran.");
    }
  }, [archiveEdges, archiveNodes, pushHistory, restoreEdges, restoreNodes]);

  const selectConnected = useCallback(async (nodeId: Id<"thoughtNodes">) => {
    try {
      const result: {
        nodes: ThoughtNodeDoc[];
        edges: ThoughtEdgeDoc[];
        truncated: boolean;
      } = await convex.query(api.thoughts.getConnectedGroup, {
        startupId: startup._id,
        nodeId,
        limit: 200,
      });
      const ids = new Set<string>(result.nodes.map((node) => node._id));
      setSupplementalNodes((current) => mergeDocs(current, result.nodes));
      setSupplementalEdges((current) => mergeDocs(current, result.edges));
      setConnectedNodeIds(ids);
      setNodes((current) => {
        const merged = new Map(current.map((node) => [node.id, node]));
        result.nodes.forEach((doc) => merged.set(doc._id, toFlowNode(doc)));
        return Array.from(merged.values()).map((node) => ({ ...node, selected: ids.has(node.id) }));
      });
      if (result.truncated) {
        toast.warning("Prikazano je prvih 200 povezanih misli. Ova mreža je veća.");
      } else {
        toast.success(ids.size === 1 ? "Ova misao još nema veze." : `Izabrano je ${ids.size} povezanih misli.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Povezane misli nisu učitane.");
    }
  }, [convex, startup._id]);

  const edgeReconnectSuccessfulRef = useRef(false);

  const toggleParent = useCallback(async (nodeId: Id<"thoughtNodes">) => {
    try {
      const isParent = await toggleNodeParent({ nodeId });
      toast.success(
        isParent
          ? "Misao je postavljena kao glavna (Parent)."
          : "Status glavne misli je uklonjen.",
      );
    } catch {
      toast.error("Glavna misao nije izmenjena.");
    }
  }, [toggleNodeParent]);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessfulRef.current = false;
  }, []);

  const onReconnect = useCallback(async (oldEdge: ThoughtFlowEdge, newConnection: Connection) => {
    edgeReconnectSuccessfulRef.current = true;
    if (!newConnection.source || !newConnection.target || newConnection.source === newConnection.target) return;
    try {
      await updateEdge({
        edgeId: oldEdge.id as Id<"thoughtEdges">,
        nodeAId: newConnection.source as Id<"thoughtNodes">,
        nodeBId: newConnection.target as Id<"thoughtNodes">,
      });
      pushHistory({
        label: "prevezivanje misli",
        undo: () => updateEdge({
          edgeId: oldEdge.id as Id<"thoughtEdges">,
          nodeAId: oldEdge.source as Id<"thoughtNodes">,
          nodeBId: oldEdge.target as Id<"thoughtNodes">,
        }),
        redo: () => updateEdge({
          edgeId: oldEdge.id as Id<"thoughtEdges">,
          nodeAId: newConnection.source as Id<"thoughtNodes">,
          nodeBId: newConnection.target as Id<"thoughtNodes">,
        }),
      });
      toast.success("Veza je premeštena.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veza nije promenjena.");
    }
  }, [pushHistory, updateEdge]);

  const onReconnectEnd = useCallback(async (_event: MouseEvent | TouchEvent, edge: ThoughtFlowEdge) => {
    if (!edgeReconnectSuccessfulRef.current) {
      try {
        await archiveEdges({ edgeIds: [edge.id as Id<"thoughtEdges">] });
        pushHistory({
          label: "prekid veze",
          undo: () => restoreEdges({ edgeIds: [edge.id as Id<"thoughtEdges">] }),
          redo: () => archiveEdges({ edgeIds: [edge.id as Id<"thoughtEdges">] }),
        });
        toast.success("Veza je prekinuta.");
      } catch {
        toast.error("Veza nije mogla da se prekine.");
      }
    }
    edgeReconnectSuccessfulRef.current = false;
  }, [archiveEdges, pushHistory, restoreEdges]);

  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const duplicate = edges.some((edge) =>
      (edge.source === connection.source && edge.target === connection.target) ||
      (edge.source === connection.target && edge.target === connection.source),
    );
    if (duplicate) {
      toast.info("Ove misli su već povezane.");
      return;
    }
    try {
      const edgeId = await createEdge({
        startupId: startup._id,
        nodeAId: connection.source as Id<"thoughtNodes">,
        nodeBId: connection.target as Id<"thoughtNodes">,
      });
      pushHistory({
        label: "povezivanje misli",
        undo: () => archiveEdges({ edgeIds: [edgeId] }),
        redo: () => restoreEdges({ edgeIds: [edgeId] }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veza nije kreirana.");
    }
  }, [archiveEdges, createEdge, edges, pushHistory, restoreEdges, startup._id]);

  const onNodesChange = useCallback((changes: NodeChange<ThoughtFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<ThoughtFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onNodeDragStart = useCallback((
    _event: MouseEvent | TouchEvent,
    _node: ThoughtFlowNode,
    draggedNodes: ThoughtFlowNode[],
  ) => {
    preDragPositionsRef.current = new Map(
      draggedNodes.map((dragged) => [dragged.id, { ...dragged.position }]),
    );
    preDragViewportRef.current = flowRef.current?.getViewport() ?? null;
    sidebarDragStartedRef.current = false;
    sidebarDragTerminatedRef.current = false;
    sidebarDragSessionIdRef.current = null;
    sidebarDragInputRef.current = null;
    setSidebarDragActive(false);
  }, []);

  const restorePreDragPositions = useCallback(() => {
    const positions = preDragPositionsRef.current;
    setNodes((current) => current.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    }));
  }, []);

  const restorePreDragViewport = useCallback(() => {
    const viewport = preDragViewportRef.current;
    if (viewport !== null) {
      void flowRef.current?.setViewport(viewport, { duration: 0 });
    }
  }, []);

  const onNodeDrag = useCallback((
    event: MouseEvent | TouchEvent,
    _node: ThoughtFlowNode,
    draggedNodes: ThoughtFlowNode[],
  ) => {
    if (sidebarDragTerminatedRef.current) {
      restorePreDragPositions();
      restorePreDragViewport();
      return;
    }
    if (sidebarDragStartedRef.current) {
      restorePreDragPositions();
      restorePreDragViewport();
      return;
    }
    if (!onBeginSidebarDrag || !wrapperRef.current) return;
    const point = clientPoint(event);
    if (!point || point.x >= wrapperRef.current.getBoundingClientRect().left) return;

    const nodeIds = draggedNodes.map((node) => node.id as Id<"thoughtNodes">);
    if (nodeIds.length > 50) {
      restorePreDragPositions();
      toast.error("U sidebar možeš odjednom da pošalješ najviše 50 misli.");
      return;
    }
    sidebarDragStartedRef.current = true;
    setSidebarDragActive(true);
    restorePreDragPositions();
    restorePreDragViewport();
    const sessionId = window.crypto.randomUUID();
    sidebarDragSessionIdRef.current = sessionId;
    sidebarDragInputRef.current = sidebarDragReleaseDetail(event, sessionId);
    const destinationRequest = makeDestinationRequest(nodeIds);
    const settleExternalDrag = () => {
      restorePreDragPositions();
      restorePreDragViewport();
      if (sidebarDragSessionIdRef.current !== sessionId) return;
      sidebarDragStartedRef.current = false;
      sidebarDragTerminatedRef.current = true;
      sidebarDragSessionIdRef.current = null;
      setSidebarDragActive(false);
    };
    onBeginSidebarDrag({
      ...destinationRequest,
      sessionId,
      complete: (destination) => {
        settleExternalDrag();
        destinationRequest.complete(destination);
      },
      cancel: () => {
        settleExternalDrag();
        destinationRequest.cancel?.();
      },
      pointerEvent: event as ThoughtSidebarDragPointer,
    });
  }, [
    makeDestinationRequest,
    onBeginSidebarDrag,
    restorePreDragPositions,
    restorePreDragViewport,
  ]);

  const onNodeDragStop = useCallback(async (
    event: MouseEvent | TouchEvent,
    _node: ThoughtFlowNode,
    draggedNodes: ThoughtFlowNode[],
  ) => {
    if (sidebarDragStartedRef.current || sidebarDragTerminatedRef.current) {
      const shouldDispatchRelease =
        sidebarDragStartedRef.current && !sidebarDragTerminatedRef.current;
      const sessionId = sidebarDragSessionIdRef.current;
      const releaseDetail = !shouldDispatchRelease || sessionId === null
        ? null
        : sidebarDragReleaseDetail(event, sessionId);
      restorePreDragPositions();
      restorePreDragViewport();
      sidebarDragStartedRef.current = false;
      sidebarDragTerminatedRef.current = false;
      sidebarDragSessionIdRef.current = null;
      sidebarDragInputRef.current = null;
      setSidebarDragActive(false);
      if (releaseDetail !== null) {
        window.queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent<ThoughtSidebarDragReleaseDetail>(
            THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT,
            { detail: releaseDetail },
          ));
        });
      }
      return;
    }
    if (draggedNodes.length > 50) {
      restorePreDragPositions();
      toast.error("Pomeraj najviše 50 izabranih misli odjednom.");
      return;
    }
    const before = draggedNodes
      .map((node) => {
        const position = preDragPositionsRef.current.get(node.id);
        return position ? { nodeId: node.id as Id<"thoughtNodes">, ...position } : null;
      })
      .filter((move): move is { nodeId: Id<"thoughtNodes">; x: number; y: number } => Boolean(move));
    const after = draggedNodes.map((node) => ({
      nodeId: node.id as Id<"thoughtNodes">,
      x: node.position.x,
      y: node.position.y,
    }));
    const changed = after.some((move, index) =>
      move.x !== before[index]?.x || move.y !== before[index]?.y,
    );
    if (!changed) return;

    try {
      await moveNodes({ moves: after });
      pushHistory({
        label: draggedNodes.length === 1 ? "pomeranje misli" : "pomeranje misli",
        undo: () => moveNodes({ moves: before }),
        redo: () => moveNodes({ moves: after }),
      });
    } catch (error) {
      restorePreDragPositions();
      toast.error(error instanceof Error ? error.message : "Pozicija nije sačuvana.");
    }
  }, [moveNodes, pushHistory, restorePreDragPositions, restorePreDragViewport]);

  const openNewThought = useCallback((position?: { x: number; y: number }) => {
    let nextPosition = position;
    if (!nextPosition && wrapperRef.current && flowRef.current) {
      const bounds = wrapperRef.current.getBoundingClientRect();
      nextPosition = flowRef.current.screenToFlowPosition({
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
    }
    setEditor({ mode: "create", position: nextPosition ?? { x: 0, y: 0 } });
  }, []);

  const openRelatedThought = useCallback((nodeId: Id<"thoughtNodes">) => {
    const node = nodeDocsById.get(nodeId);
    if (!node) return;
    setEditor({
      mode: "create",
      position: { x: node.x + 290, y: node.y + 48 },
      connectFrom: nodeId,
    });
  }, [nodeDocsById]);

  async function submitEditor(value: ThoughtEditorValue) {
    if (!editor) return;
    setEditorPending(true);
    try {
      if (editor.mode === "create") {
        const nodeId = await createNode({
          startupId: startup._id,
          text: value.text,
          x: editor.position.x,
          y: editor.position.y,
          color: value.color,
          ...(value.title ? { title: value.title } : {}),
        });
        let edgeId: Id<"thoughtEdges"> | null = null;
        if (editor.connectFrom) {
          try {
            edgeId = await createEdge({
              startupId: startup._id,
              nodeAId: editor.connectFrom,
              nodeBId: nodeId,
            });
          } catch (error) {
            // Keep the compound UI action atomic even though the backend exposes
            // node and edge creation separately.
            await archiveNodes({ nodeIds: [nodeId] });
            throw error;
          }
        }
        const createdEdgeId = edgeId;
        pushHistory({
          label: editor.connectFrom ? "dodavanje povezane misli" : "dodavanje misli",
          undo: async () => {
            if (createdEdgeId) await archiveEdges({ edgeIds: [createdEdgeId] });
            await archiveNodes({ nodeIds: [nodeId] });
          },
          redo: async () => {
            await restoreNodes({ nodeIds: [nodeId] });
            if (createdEdgeId) await restoreEdges({ edgeIds: [createdEdgeId] });
          },
        });
        toast.success(editor.connectFrom ? "Povezana misao je dodata." : "Misao je dodata.");
      } else {
        const previous = nodeDocsById.get(editor.nodeId);
        if (!previous) throw new Error("Misao više nije dostupna.");
        const next = { title: value.title || null, text: value.text, color: value.color };
        await updateNode({ nodeId: editor.nodeId, ...next });
        pushHistory({
          label: "uređivanje misli",
          undo: () => updateNode({
            nodeId: editor.nodeId,
            title: previous.title,
            text: previous.text,
            color: previous.color,
          }),
          redo: () => updateNode({ nodeId: editor.nodeId, ...next }),
        });
        toast.success("Misao je sačuvana.");
      }
      setEditor(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Misao nije sačuvana.");
    } finally {
      setEditorPending(false);
    }
  }

  async function submitEdgeLabel(label: string) {
    if (!edgeEditorId) return;
    const previous = edgeDocsById.get(edgeEditorId);
    if (!previous) return;
    setEditorPending(true);
    try {
      const nextLabel = label || null;
      await updateEdge({ edgeId: edgeEditorId, label: nextLabel });
      pushHistory({
        label: "naziv veze",
        undo: () => updateEdge({ edgeId: edgeEditorId, label: previous.label }),
        redo: () => updateEdge({ edgeId: edgeEditorId, label: nextLabel }),
      });
      setEdgeEditorId(null);
      toast.success(nextLabel ? "Naziv veze je sačuvan." : "Naziv veze je uklonjen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veza nije izmenjena.");
    } finally {
      setEditorPending(false);
    }
  }

  const invokeKeyboardContextMenu = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const node = nodes.find((item) => item.selected);
    const selector = node ? `.react-flow__node[data-id="${CSS.escape(node.id)}"]` : null;
    const anchor = selector ? wrapper.querySelector<HTMLElement>(selector) : wrapper;
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    anchor.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: bounds.left + Math.min(bounds.width / 2, 120),
      clientY: bounds.top + Math.min(bounds.height / 2, 70),
    }));
  }, [nodes]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEntry(event.target)) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setNodes((current) => current.map((node) => ({ ...node, selected: true })));
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void duplicateSelection(selectedThoughtIds(nodes));
      return;
    }
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      void runHistory(event.shiftKey ? "redo" : "undo");
      return;
    }
    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      void runHistory("redo");
      return;
    }
    if (event.shiftKey && event.key === "F10") {
      event.preventDefault();
      invokeKeyboardContextMenu();
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      void archiveSelection(
        selectedThoughtIds(nodes),
        edges.filter((edge) => edge.selected).map((edge) => edge.id as Id<"thoughtEdges">),
      );
    }
  }, [archiveSelection, duplicateSelection, edges, invokeKeyboardContextMenu, nodes, runHistory]);

  const selectedNodeIds = useMemo(() => selectedThoughtIds(nodes), [nodes]);
  const selectedEdgeIds = useMemo(
    () => edges.filter((edge) => edge.selected).map((edge) => edge.id as Id<"thoughtEdges">),
    [edges],
  );
  const selectedCount = selectedNodeIds.length + selectedEdgeIds.length;
  const editingNode = editor?.mode === "edit" ? nodeDocsById.get(editor.nodeId) : null;
  const editingEdge = edgeEditorId ? edgeDocsById.get(edgeEditorId) : null;
  const conversionNodes = conversion
    ? conversion.nodeIds.flatMap((nodeId) => {
        const node = nodeDocsById.get(nodeId);
        return node ? [node] : [];
      })
    : [];
  const firstName = profile.displayName.trim().split(/\s+/)[0] || profile.displayName;
  const canLoadNodes = nodePagination.status === "CanLoadMore" || nodePagination.status === "LoadingMore";
  const canLoadEdges = edgePagination.status === "CanLoadMore" || edgePagination.status === "LoadingMore";
  const loadingFirstPage = nodePagination.status === "LoadingFirstPage";

  const nodeActions = useMemo(() => ({
    connectedNodeIds,
    edit: openEditor,
    toggleParent,
    send: requestDestination,
    openPage: onOpenPage,
  }), [connectedNodeIds, onOpenPage, openEditor, requestDestination, toggleParent]);

  const edgeActions = useMemo(() => ({
    editLabel: (edgeId: Id<"thoughtEdges">) => setEdgeEditorId(edgeId),
    archiveEdge: (edgeId: Id<"thoughtEdges">) => void archiveSelection([], [edgeId]),
  }), [archiveSelection]);

  return (
    <ThoughtNodeActionsProvider actions={nodeActions}>
      <ThoughtEdgeActionsProvider actions={edgeActions}>
        <ContextMenu.Root open={contextOpen} onOpenChange={setContextOpen}>
        <ContextMenu.Trigger asChild>
          <div
            ref={wrapperRef}
            className={styles.canvas}
            tabIndex={0}
            role="application"
            aria-label={`Moje misli za ${startup.name}`}
            onKeyDownCapture={handleKeyDown}
          >
            <ReactFlow<ThoughtFlowNode, ThoughtFlowEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              reconnectRadius={25}
              onInit={(instance) => {
                flowRef.current = instance;
                setFlowInstance(instance);
              }}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(connection) => void onConnect(connection)}
              onReconnectStart={onReconnectStart}
              onReconnect={(oldEdge, newConnection) => void onReconnect(oldEdge, newConnection)}
              onReconnectEnd={(event, edge) => void onReconnectEnd(event, edge)}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={(event, node, draggedNodes) => void onNodeDragStop(event, node, draggedNodes)}
              onNodeDoubleClick={(_event, node) => openEditor(node.id as Id<"thoughtNodes">)}
              onEdgeDoubleClick={(_event, edge) => setEdgeEditorId(edge.id as Id<"thoughtEdges">)}
              onNodeContextMenu={(_event, node) => {
                setContextTarget({ kind: "node", nodeId: node.id as Id<"thoughtNodes"> });
                if (!node.selected) {
                  setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })));
                  setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
                }
              }}
              onEdgeContextMenu={(_event, edge) => {
                setContextTarget({ kind: "edge", edgeId: edge.id as Id<"thoughtEdges"> });
                if (!edge.selected) {
                  setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id })));
                  setNodes((current) => current.map((node) => ({ ...node, selected: false })));
                }
              }}
              onPaneContextMenu={(event) => {
                const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 };
                setContextTarget({ kind: "pane", position });
              }}
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement;
                if (!target.classList.contains("react-flow__pane")) return;
                const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                if (position) openNewThought(position);
              }}
              onMoveEnd={(_event, viewport: Viewport) => {
                if (!viewportReadyRef.current || sidebarDragStartedRef.current) return;
                void saveViewport({
                  startupId: startup._id,
                  x: viewport.x,
                  y: viewport.y,
                  zoom: viewport.zoom,
                }).catch(() => toast.error("Pozicija kanvasa nije sačuvana."));
              }}
              colorMode={dark ? "dark" : "light"}
              minZoom={0.18}
              maxZoom={2.2}
              panOnScroll
              panOnDrag={[1, 2]}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              selectionKeyCode="Shift"
              multiSelectionKeyCode={["Control", "Meta", "Shift"]}
              deleteKeyCode={null}
              nodeDragThreshold={3}
              connectionDragThreshold={4}
              autoPanOnNodeDrag={!sidebarDragActive}
              elevateNodesOnSelect
              fitViewOptions={{ padding: 0.24, maxZoom: 1.1, duration: reducedMotion ? 0 : 320 }}
              ariaLabelConfig={SERBIAN_ARIA_LABELS}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.15}
                color="color-mix(in oklab, var(--muted-foreground) 30%, transparent)"
              />
              <style>{`
                .canvas :global(.react-flow__edge-path) {
                  stroke: color-mix(in oklab, var(--muted-foreground) 54%, transparent);
                  stroke-width: 2;
                  transition: stroke 140ms ease, stroke-width 140ms ease;
                }
                .canvas :global(.react-flow__edge.selected .react-flow__edge-path),
                .canvas :global(.react-flow__edge:hover .react-flow__edge-path),
                .canvas :global(.react-flow__edge:focus-visible .react-flow__edge-path) {
                  stroke: var(--primary);
                  stroke-width: 2.75;
                }
                .canvas :global(.react-flow__edge-reconnecthandle) {
                  fill: var(--primary);
                  stroke: var(--card);
                  stroke-width: 2.5px;
                  r: 7px;
                  cursor: grab;
                  opacity: 0.6;
                  transition: opacity 140ms ease, r 140ms ease, transform 140ms ease;
                }
                .canvas :global(.react-flow__edge:hover .react-flow__edge-reconnecthandle),
                .canvas :global(.react-flow__edge.selected .react-flow__edge-reconnecthandle) {
                  opacity: 1;
                  r: 9px;
                }
                .canvas :global(.react-flow__edge-reconnecthandle:hover) {
                  cursor: grabbing;
                  transform: scale(1.35);
                  fill: var(--primary);
                }
                .canvas :global(.react-flow__edge-text) {
                  fill: var(--muted-foreground);
                  font-size: 0.6875rem;
                  font-weight: 600;
                }
                .canvas :global(.react-flow__edge-textbg) {
                  fill: var(--card);
                  fill-opacity: 0.94;
                  stroke: var(--border);
                  stroke-width: 0.5;
                }
              `}</style>
              <Controls
                position="bottom-left"
                showInteractive={false}
                aria-label="Kontrole kanvasa"
              />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeStrokeWidth={2}
                nodeColor={(node) => MINI_MAP_COLORS[(node.data?.color as ThoughtNodeColor) ?? "neutral"]}
                maskColor={dark ? "oklch(0.12 0.02 268 / 72%)" : "oklch(0.97 0.006 265 / 72%)"}
                aria-label="Minimapa misli"
              />

              <Panel position="top-left" className="!m-3 sm:!m-4">
                <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-border/75 bg-card/92 p-2 shadow-[var(--shadow-desk)] backdrop-blur-xl">
                  <div className="flex min-w-0 items-center gap-2 px-1.5 pr-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold tracking-[-0.02em]">Moje misli</span>
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">Samo ti · {firstName}</span>
                    </span>
                  </div>
                  <span className="hidden h-7 w-px bg-border sm:block" aria-hidden="true" />
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-0"
                    aria-label="Nova misao"
                    onClick={() => openNewThought()}
                  >
                    <Plus /> <span className="hidden sm:inline">Nova misao</span>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-11 sm:size-8"
                    aria-label="Poništi poslednju promenu"
                    disabled={historyState.undoCount === 0 || historyState.busy}
                    onClick={() => void runHistory("undo")}
                  >
                    <Undo2 className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-11 sm:size-8"
                    aria-label="Ponovi promenu"
                    disabled={historyState.redoCount === 0 || historyState.busy}
                    onClick={() => void runHistory("redo")}
                  >
                    <Redo2 className="size-3.5" />
                  </Button>
                  <span className="sr-only" aria-live="polite">
                    Dostupno je {historyState.undoCount} poništavanja i {historyState.redoCount} ponavljanja.
                  </span>
                </div>
              </Panel>

              {(selectedCount > 0 || canLoadNodes || canLoadEdges) ? (
                <Panel position="top-right" className="!m-3 sm:!m-4">
                  <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-1 rounded-xl border border-border/75 bg-card/92 p-1.5 shadow-[var(--shadow-desk)] backdrop-blur-xl">
                    {selectedCount > 0 ? (
                      <>
                        <Badge variant="outline" className="mx-1">{selectedCount} izabrano</Badge>
                        {selectedNodeIds.length > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-0"
                            aria-label="Pošalji izabrane misli u radni prostor"
                            onClick={() => requestDestination(selectedNodeIds)}
                          >
                            <Send /> <span className="hidden lg:inline">Pošalji</span>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-11 sm:size-8"
                          aria-label="Arhiviraj izbor"
                          onClick={() => void archiveSelection(selectedNodeIds, selectedEdgeIds)}
                        >
                          <Archive className="size-3.5" />
                        </Button>
                      </>
                    ) : null}
                    {canLoadNodes ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-0"
                        aria-label="Učitaj još misli"
                        disabled={nodePagination.status === "LoadingMore"}
                        onClick={() => nodePagination.loadMore(100)}
                      >
                        {nodePagination.status === "LoadingMore" ? <LoaderCircle className="animate-spin" /> : <ChevronDown />}
                        <span className="hidden sm:inline">Još misli</span>
                      </Button>
                    ) : null}
                    {canLoadEdges ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-0"
                        aria-label="Učitaj još veza"
                        disabled={edgePagination.status === "LoadingMore"}
                        onClick={() => edgePagination.loadMore(200)}
                      >
                        {edgePagination.status === "LoadingMore" ? <LoaderCircle className="animate-spin" /> : <Link2 />}
                        <span className="hidden sm:inline">Još veza</span>
                      </Button>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              <Panel position="bottom-center" className="!mb-4 hidden md:block">
                <div className="flex items-center gap-3 rounded-full border border-border/70 bg-card/88 px-3 py-1.5 text-[0.6875rem] text-muted-foreground shadow-sm backdrop-blur-xl">
                  <span className="inline-flex items-center gap-1"><MousePointer2 className="size-3" /> Prevuci za izbor</span>
                  <span aria-hidden="true">·</span>
                  <span>dupli klik dodaje</span>
                  <span aria-hidden="true">·</span>
                  <span>Ctrl/⌘ + D duplira</span>
                </div>
              </Panel>
            </ReactFlow>

            {loadingFirstPage ? (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" role="status">
                <span className="flex items-center gap-2 rounded-xl border border-border/75 bg-card/90 px-4 py-3 text-sm font-medium shadow-lg backdrop-blur">
                  <LoaderCircle className="size-4 animate-spin text-primary" /> Učitavam privatni kanvas…
                </span>
              </div>
            ) : nodes.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6">
                <div className="pointer-events-auto max-w-sm rounded-3xl border border-dashed border-border bg-card/88 px-7 py-8 text-center shadow-[var(--shadow-desk)] backdrop-blur-xl">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="size-5" />
                  </span>
                  <h2 className="mt-4 text-lg font-bold tracking-[-0.03em]">Prazna glava, čist početak</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Zapiši prvu misao. Ovaj kanvas vidiš samo ti u startupu „{startup.name}”.
                  </p>
                  <Button type="button" className="mt-5" onClick={() => openNewThought()}>
                    <Plus /> Dodaj prvu misao
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content className={styles.contextContent} collisionPadding={8}>
            {contextTarget.kind === "node" ? (
              <>
                <ContextMenu.Item className={styles.contextItem} onSelect={() => openEditor(contextTarget.nodeId)}>
                  <Edit3 className="size-4" /> Uredi
                </ContextMenu.Item>
                <ContextMenu.Item className={styles.contextItem} onSelect={() => void toggleParent(contextTarget.nodeId)}>
                  <Crown className="size-4" /> {nodeDocsById.get(contextTarget.nodeId)?.isParent ? "Ukloni status Parent misli" : "Postavi kao Parent misao"}
                </ContextMenu.Item>
                <ContextMenu.Item className={styles.contextItem} onSelect={() => openRelatedThought(contextTarget.nodeId)}>
                  <Link2 className="size-4" /> Nova povezana misao
                </ContextMenu.Item>
                <ContextMenu.Item className={styles.contextItem} onSelect={() => void selectConnected(contextTarget.nodeId)}>
                  <Focus className="size-4" /> Izaberi povezane
                </ContextMenu.Item>
                <ContextMenu.Separator className={styles.contextSeparator} />
                <ContextMenu.Item
                  className={styles.contextItem}
                  onSelect={() => void duplicateSelection(selectedNodeIds.includes(contextTarget.nodeId) ? selectedNodeIds : [contextTarget.nodeId])}
                >
                  <Copy className="size-4" /> Dupliraj
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={styles.contextItem}
                  onSelect={() => requestDestination(selectedNodeIds.includes(contextTarget.nodeId) ? selectedNodeIds : [contextTarget.nodeId])}
                >
                  <FileInput className="size-4" /> Pošalji u radni prostor
                </ContextMenu.Item>
                <ContextMenu.Separator className={styles.contextSeparator} />
                <ContextMenu.Item
                  className={cn(styles.contextItem, styles.contextDanger)}
                  onSelect={() => void archiveSelection(
                    selectedNodeIds.includes(contextTarget.nodeId) ? selectedNodeIds : [contextTarget.nodeId],
                    [],
                  )}
                >
                  <Trash2 className="size-4" /> Arhiviraj
                </ContextMenu.Item>
              </>
            ) : contextTarget.kind === "edge" ? (
              <>
                <ContextMenu.Item className={styles.contextItem} onSelect={() => setEdgeEditorId(contextTarget.edgeId)}>
                  <Edit3 className="size-4" /> Uredi naziv veze
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={cn(styles.contextItem, styles.contextDanger)}
                  onSelect={() => void archiveSelection([], [contextTarget.edgeId])}
                >
                  <Trash2 className="size-4" /> Arhiviraj vezu
                </ContextMenu.Item>
              </>
            ) : (
              <>
                <ContextMenu.Item className={styles.contextItem} onSelect={() => openNewThought(contextTarget.position)}>
                  <Plus className="size-4" /> Nova misao ovde
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={styles.contextItem}
                  disabled={nodes.length === 0}
                  onSelect={() => void flowRef.current?.fitView({ padding: 0.24, duration: reducedMotion ? 0 : 320, maxZoom: 1.1 })}
                >
                  <Expand className="size-4" /> Prikaži sve
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={styles.contextItem}
                  disabled={nodes.length === 0}
                  onSelect={() => setNodes((current) => current.map((node) => ({ ...node, selected: true })))}
                >
                  <Check className="size-4" /> Izaberi sve
                </ContextMenu.Item>
                <ContextMenu.Separator className={styles.contextSeparator} />
                <ContextMenu.Item
                  className={styles.contextItem}
                  disabled={historyState.undoCount === 0}
                  onSelect={() => void runHistory("undo")}
                >
                  <History className="size-4" /> Poništi poslednju promenu
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {editor ? (
        <ThoughtEditorDialog
          open
          mode={editor.mode}
          connected={editor.mode === "create" && Boolean(editor.connectFrom)}
          initialValue={editingNode ? {
            title: editingNode.title ?? "",
            text: editingNode.text,
            color: editingNode.color,
          } : undefined}
          pending={editorPending}
          onOpenChange={(open) => !open && !editorPending && setEditor(null)}
          onSubmit={submitEditor}
        />
      ) : null}
      {edgeEditorId ? (
        <EdgeEditorDialog
          open
          initialLabel={editingEdge?.label ?? ""}
          pending={editorPending}
          onOpenChange={(open) => !open && !editorPending && setEdgeEditorId(null)}
          onSubmit={submitEdgeLabel}
        />
      ) : null}
      {conversion ? (
        <ThoughtConversionDialog
          open
          startup={startup}
          nodes={conversionNodes}
          destination={conversion.destination}
          onOpenChange={(open) => !open && setConversion(null)}
          onConverted={(pageIds) => {
          setConversion(null);
          const firstPageId = pageIds[0];
          toast.success(
            pageIds.length === 1
              ? "Timska kopija je kreirana. Original je ostao privatan."
              : `${pageIds.length} timske kopije su kreirane. Originali su ostali privatni.`,
            firstPageId ? {
              action: { label: "Otvori", onClick: () => onOpenPage(firstPageId) },
            } : undefined,
          );
          }}
        />
      ) : null}
      </ThoughtEdgeActionsProvider>
    </ThoughtNodeActionsProvider>
  );
}
