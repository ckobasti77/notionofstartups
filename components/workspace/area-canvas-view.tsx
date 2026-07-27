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
  LayoutGrid,
  Link2,
  LoaderCircle,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AreaFlowNodeCard,
  AreaNodeActionsProvider,
  type AreaFlowNode,
} from "@/components/workspace/canvases/area-flow-node";
import styles from "@/components/workspace/canvases/connected-canvas.module.css";
import { useCanvasColorMode } from "@/components/workspace/canvases/use-canvas-color-mode";
import { ThoughtEdge } from "@/components/workspace/thoughts/thought-edge";
import { useWorkspaceHistory } from "@/components/workspace/workspace-history";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type AreaCanvasFilter = "all" | "note" | "task";

export type AreaCanvasViewProps = {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  rootPageId: Id<"pages"> | null;
  canvasLabel: string;
  filter: AreaCanvasFilter;
  onOpenCanvas: (pageId: Id<"pages">) => void;
  onOpenDetails: (pageId: Id<"pages">) => void;
  onCreatePage: (kind: "task" | "note") => void;
};

type AreaFlowEdgeData = {
  backendId: Id<"pageCanvasEdgesV2"> | Id<"pageRelations"> | null;
  kind: "canvas" | "relation";
  canDelete: boolean;
  canRequestDeletion: boolean;
};

type AreaFlowEdge = Edge<AreaFlowEdgeData, "default">;

type DeletedEdgeRecord = {
  edge: AreaFlowEdge;
  source: Id<"pages">;
  target: Id<"pages">;
  label: string | undefined;
  kind: "canvas" | "relation";
  currentId: Id<"pageCanvasEdgesV2"> | Id<"pageRelations">;
};

const NODE_TYPES = { areaPage: AreaFlowNodeCard };
const EDGE_TYPES = { default: ThoughtEdge };
const GHOST_WIDTH = 288;
const GHOST_HEIGHT = 196;

function edgeUiId(
  kind: "canvas" | "relation",
  backendId: Id<"pageCanvasEdgesV2"> | Id<"pageRelations">,
) {
  return `${kind}:${backendId}`;
}

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
    "Pritisni Enter da otvoriš kanvas kartice. Strelicama je pomeraš kada je pomeranje dozvoljeno.",
  "node.a11yDescription.keyboardDisabled":
    "Ova kartica se ne može pomerati tastaturom.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) =>
    `Kartica je pomerena ${direction}. Nova pozicija je ${Math.round(x)}, ${Math.round(y)}.`,
  "edge.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš vezu.",
  "controls.ariaLabel": "Kontrole kanvasa poslovne oblasti",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Prikaži sve kartice",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "minimap.ariaLabel": "Minimapa poslovne oblasti",
  "handle.ariaLabel": "Tačka za povezivanje kartica",
} as const;

export function AreaCanvasView(props: AreaCanvasViewProps) {
  const scopeKey = `${props.areaId}:${props.rootPageId ?? "root"}`;
  return (
    <ReactFlowProvider key={scopeKey}>
      <AreaCanvasBody {...props} />
    </ReactFlowProvider>
  );
}

function AreaCanvasBody({
  startupId,
  areaId,
  rootPageId,
  canvasLabel,
  filter,
  onOpenCanvas,
  onOpenDetails,
  onCreatePage,
}: AreaCanvasViewProps) {
  const canvasData = useQuery(api.areasV2.getCanvas, {
    startupId,
    areaId,
    rootPageId,
  });

  if (canvasData === undefined) {
    return (
      <div className="grid h-[min(72vh,52rem)] min-h-[32rem] place-items-center overflow-hidden rounded-3xl border border-border/70 bg-muted/20">
        <div className="text-center text-sm font-medium text-muted-foreground">
          <LoaderCircle className="mx-auto mb-3 size-5 animate-spin text-primary motion-reduce:animate-none" />
          Otvaram kanvas oblasti…
        </div>
      </div>
    );
  }

  return (
    <AreaCanvasReady
      key={`${areaId}:${rootPageId ?? "root"}`}
      startupId={startupId}
      areaId={areaId}
      rootPageId={rootPageId}
      canvasLabel={canvasLabel}
      filter={filter}
      canvasData={canvasData}
      onOpenCanvas={onOpenCanvas}
      onOpenDetails={onOpenDetails}
      onCreatePage={onCreatePage}
    />
  );
}

type CanvasData = FunctionReturnType<typeof api.areasV2.getCanvas>;

type AreaCanvasReadyProps = AreaCanvasViewProps & {
  canvasData: CanvasData;
};

function AreaCanvasReady({
  startupId,
  areaId,
  rootPageId,
  canvasLabel,
  filter,
  canvasData,
  onOpenCanvas,
  onOpenDetails,
  onCreatePage,
}: AreaCanvasReadyProps) {
  const flowRef =
    useRef<ReactFlowInstance<AreaFlowNode, AreaFlowEdge> | null>(null);
  const preDragPositionsRef = useRef(
    new Map<string, { x: number; y: number }>(),
  );
  const viewportInitialized = useRef(false);
  const [pendingTimestamp] = useState(() => Date.now());
  const movePages = useMutation(api.areasV2.movePages);
  const resizePage = useMutation(api.areasV2.resizePage);
  const resetPageSize = useMutation(api.areasV2.resetPageSize);
  const saveViewport = useMutation(api.areasV2.saveViewport);
  const connectPages = useMutation(api.areasV2.connectPages);
  const disconnectPages = useMutation(api.areasV2.disconnectPages);
  const createRelation = useMutation(api.areasV2.createRelation);
  const deleteRelation = useMutation(api.areasV2.deleteRelation);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  const { historyState, pushHistory, runHistory } = useWorkspaceHistory();

  const incomingNodes = useMemo<AreaFlowNode[]>(() => {
    const acceptsKind = (kind: "note" | "task") =>
      filter === "all" || filter === kind;
    const directPageIds = new Set(canvasData.pages.map((page) => page._id));

    const pageNodes = canvasData.pages
      .filter((page) => acceptsKind(page.kind))
      .map<AreaFlowNode>((page) => ({
        id: page._id,
        type: "areaPage",
        position: { x: page.x, y: page.y },
        width: page.width,
        height: page.height,
        style: { width: page.width, height: page.height },
        data: {
          title: page.title,
          text: page.text,
          kind: page.kind,
          taskStatus: page.taskStatus,
          taskPriority: page.taskPriority,
          creatorName: page.creator?.displayName ?? "Član tima",
          creatorAvatarUrl: page.creator?.avatarUrl ?? null,
          updatedAt: page.updatedAt,
          canMove: page.canMove,
          canResize: page.canResize,
          pendingNesting: false,
        },
        draggable: page.canMove,
        connectable: true,
        deletable: false,
        ariaLabel: `${page.kind === "task" ? "Zadatak" : "Beleška"}: ${page.title}`,
      }));

    const ghostNodes = canvasData.ghosts
      .filter(
        (ghost) =>
          !directPageIds.has(ghost.pageId) && acceptsKind(ghost.kind),
      )
      .map<AreaFlowNode>((ghost) => ({
        id: ghost.pageId,
        type: "areaPage",
        position: { x: ghost.x, y: ghost.y },
        width: GHOST_WIDTH,
        height: GHOST_HEIGHT,
        style: { width: GHOST_WIDTH, height: GHOST_HEIGHT },
        data: {
          title: ghost.title,
          text: "Predloženo ugnežđavanje u ovaj kanvas.",
          kind: ghost.kind,
          taskStatus: null,
          taskPriority: null,
          creatorName: ghost.requester?.displayName ?? "Član tima",
          creatorAvatarUrl: ghost.requester?.avatarUrl ?? null,
          updatedAt: pendingTimestamp,
          canMove: false,
          canResize: false,
          pendingNesting: true,
        },
        draggable: false,
        connectable: false,
        deletable: false,
        ariaLabel: `${ghost.kind === "task" ? "Zadatak" : "Beleška"}: ${ghost.title}. Čeka odobrenje za ugnežđavanje.`,
      }));

    return [...pageNodes, ...ghostNodes];
  }, [canvasData.ghosts, canvasData.pages, filter, pendingTimestamp]);

  const incomingEdges = useMemo<AreaFlowEdge[]>(() => {
    const visiblePageIds = new Set(incomingNodes.map((node) => node.id));
    return [...canvasData.edges, ...canvasData.relations]
      .filter(
        (edge) =>
          visiblePageIds.has(edge.source) &&
          visiblePageIds.has(edge.target),
      )
      .map((edge) => ({
        id: edgeUiId(edge.kind, edge._id),
        source: edge.source,
        target: edge.target,
        type: "default",
        label: edge.label ?? undefined,
        interactionWidth: 22,
        deletable: edge.canDelete || edge.canRequestDeletion,
        data: {
          backendId: edge._id,
          kind: edge.kind,
          canDelete: edge.canDelete,
          canRequestDeletion: edge.canRequestDeletion,
        },
        style:
          edge.kind === "relation"
            ? { strokeDasharray: "7 6" }
            : undefined,
        ariaLabel: edge.label
          ? `${edge.kind === "relation" ? "Relacija" : "Veza"}: ${edge.label}`
          : edge.kind === "relation"
            ? "Relacija između beleške i zadatka"
            : "Veza između dve kartice iste vrste",
      }));
  }, [canvasData.edges, canvasData.relations, incomingNodes]);

  const [nodes, setNodes] = useState(incomingNodes);
  const [edges, setEdges] = useState(incomingEdges);
  const [viewport, setViewport] = useState<Viewport>({
    x: canvasData.viewport.x,
    y: canvasData.viewport.y,
    zoom: canvasData.viewport.zoom,
  });
  const colorMode = useCanvasColorMode();

  useEffect(() => {
    // Keep live metadata in sync without discarding local selection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => {
      const selected = new Set(
        current.filter((node) => node.selected).map((node) => node.id),
      );
      return incomingNodes.map((node) => ({
        ...node,
        selected: selected.has(node.id),
      }));
    });
  }, [incomingNodes]);

  useEffect(() => {
    // Keep edge selection local while Convex remains the source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => {
      const selected = new Set(
        current.filter((edge) => edge.selected).map((edge) => edge.id),
      );
      return incomingEdges.map((edge) => ({
        ...edge,
        selected: selected.has(edge.id),
      }));
    });
  }, [incomingEdges]);

  useEffect(() => {
    const positions = new Map(
      nodes.map((node) => [node.id, node.position]),
    );
    // Re-anchor every curve to the nearest card sides while cards move.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) =>
      current.map((edge) => adaptEdgeHandles(edge, positions)),
    );
  }, [nodes]);

  const onInit = useCallback(
    (instance: ReactFlowInstance<AreaFlowNode, AreaFlowEdge>) => {
      flowRef.current = instance;
      if (viewportInitialized.current) return;
      viewportInitialized.current = true;
      if (
        !canvasData.viewport.persisted &&
        canvasData.pages.length + canvasData.ghosts.length > 0
      ) {
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.setTimeout(() => {
          void instance.fitView({
            padding: 0.24,
            maxZoom: 1.05,
            duration: reduceMotion ? 0 : 260,
          });
        }, 0);
      }
    },
    [
      canvasData.ghosts.length,
      canvasData.pages.length,
      canvasData.viewport.persisted,
    ],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<AreaFlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<AreaFlowEdge>[]) => {
      setEdges((current) => {
        const deletableIds = new Set(
          current
            .filter(
              (edge) =>
                edge.deletable &&
                (edge.data?.canDelete ||
                  edge.data?.canRequestDeletion),
            )
            .map((edge) => edge.id),
        );
        const safeChanges = changes.filter(
          (change) =>
            change.type !== "remove" || deletableIds.has(change.id),
        );
        return applyEdgeChanges(safeChanges, current);
      });
    },
    [],
  );

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        connection.source === connection.target
      ) {
        return;
      }

      const sourceNode = nodes.find(
        (node) => node.id === connection.source,
      );
      const targetNode = nodes.find(
        (node) => node.id === connection.target,
      );
      if (
        !sourceNode ||
        !targetNode ||
        sourceNode.data.pendingNesting ||
        targetNode.data.pendingNesting
      ) {
        return;
      }

      const sourcePageId = connection.source as Id<"pages">;
      const targetPageId = connection.target as Id<"pages">;
      const edgeKind =
        sourceNode.data.kind === targetNode.data.kind
          ? "canvas"
          : "relation";
      const alreadyConnected = edges.some(
        (edge) =>
          edge.data?.kind === edgeKind &&
          ((edge.source === sourcePageId &&
            edge.target === targetPageId) ||
            (edge.source === targetPageId &&
              edge.target === sourcePageId)),
      );
      if (alreadyConnected) {
        toast.info(
          edgeKind === "relation"
            ? "Beleška i zadatak su već povezani."
            : "Ove kartice su već povezane.",
        );
        return;
      }
      const temporaryId = `pending:${edgeKind}:${sourcePageId}:${targetPageId}:${Date.now()}`;
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: temporaryId,
            type: "default",
            deletable: false,
            data: {
              backendId: null,
              kind: edgeKind,
              canDelete: false,
              canRequestDeletion: false,
            },
            style:
              edgeKind === "relation"
                ? { strokeDasharray: "7 6" }
                : undefined,
          },
          current,
        ),
      );

      try {
        if (edgeKind === "canvas") {
          let currentEdgeId = await connectPages({
            startupId,
            areaId,
            rootPageId,
            sourcePageId,
            targetPageId,
          });
          setEdges((current) =>
            current.map((edge) =>
              edge.id === temporaryId
                ? {
                    ...edge,
                    id: edgeUiId("canvas", currentEdgeId),
                    // Wait for getCanvas to return the authoritative permission.
                    deletable: false,
                    data: {
                      backendId: currentEdgeId,
                      kind: "canvas",
                      canDelete: false,
                      canRequestDeletion: false,
                    },
                  }
                : edge,
            ),
          );
          pushHistory({
            label: "povezivanje kartica",
            undo: () =>
              disconnectPages({
                startupId,
                areaId,
                rootPageId,
                edgeId: currentEdgeId,
              }),
            redo: async () => {
              currentEdgeId = await connectPages({
                startupId,
                areaId,
                rootPageId,
                sourcePageId,
                targetPageId,
              });
            },
          });
        } else {
          let currentRelationId = await createRelation({
            startupId,
            pageAId: sourcePageId,
            pageBId: targetPageId,
          });
          setEdges((current) =>
            current.map((edge) =>
              edge.id === temporaryId
                ? {
                    ...edge,
                    id: edgeUiId("relation", currentRelationId),
                    // Wait for getCanvas to return the authoritative permission.
                    deletable: false,
                    data: {
                      backendId: currentRelationId,
                      kind: "relation",
                      canDelete: false,
                      canRequestDeletion: false,
                    },
                  }
                : edge,
            ),
          );
          pushHistory({
            label: "povezivanje beleške i zadatka",
            undo: () =>
              deleteRelation({
                startupId,
                relationId: currentRelationId,
              }),
            redo: async () => {
              currentRelationId = await createRelation({
                startupId,
                pageAId: sourcePageId,
                pageBId: targetPageId,
              });
            },
          });
        }
        toast.success(
          edgeKind === "relation"
            ? "Beleška i zadatak su povezani."
            : "Kartice su povezane.",
        );
      } catch (error) {
        setEdges((current) =>
          current.filter((edge) => edge.id !== temporaryId),
        );
        toast.error(
          error instanceof Error
            ? error.message
            : "Veza nije sačuvana.",
        );
      }
    },
    [
      areaId,
      connectPages,
      createRelation,
      deleteRelation,
      disconnectPages,
      edges,
      nodes,
      pushHistory,
      rootPageId,
      startupId,
    ],
  );

  const handleEdgesDelete = useCallback(
    (deletedEdges: AreaFlowEdge[]) => {
      const requestedEdges = deletedEdges.filter((edge) => {
        const backendId = edge.data?.backendId;
        return Boolean(
          backendId &&
            edge.deletable &&
            !edge.data?.canDelete &&
            edge.data?.canRequestDeletion &&
            !edge.id.startsWith("pending:"),
        );
      });
      const records = deletedEdges.flatMap<DeletedEdgeRecord>((edge) => {
        const backendId = edge.data?.backendId;
        if (
          !backendId ||
          !edge.deletable ||
          !edge.data?.canDelete ||
          edge.id.startsWith("pending:")
        ) {
          return [];
        }
        return [
          {
            edge,
            source: edge.source as Id<"pages">,
            target: edge.target as Id<"pages">,
            label:
              typeof edge.label === "string" ? edge.label : undefined,
            kind: edge.data.kind,
            currentId: backendId,
          },
        ];
      });
      if (records.length === 0 && requestedEdges.length === 0) return;

      if (requestedEdges.length > 0) {
        // React Flow invokes onEdgesDelete before its remove change. Restore
        // request-only edges in a microtask so they remain visible while the
        // owner decides about the request.
        queueMicrotask(() => {
          setEdges((current) => {
            const currentIds = new Set(current.map((edge) => edge.id));
            return [
              ...current,
              ...requestedEdges.filter(
                (edge) => !currentIds.has(edge.id),
              ),
            ];
          });
        });
      }

      void (async () => {
        if (requestedEdges.length > 0) {
          const requestResults = await Promise.allSettled(
            requestedEdges.map((edge) => {
              const backendId = edge.data?.backendId;
              if (!backendId) {
                return Promise.reject(new Error("Veza nije pronađena."));
              }
              return requestDeletion({
                target:
                  edge.data?.kind === "canvas"
                    ? {
                        kind: "page_edge" as const,
                        id: backendId as Id<"pageCanvasEdgesV2">,
                      }
                    : {
                        kind: "page_relation" as const,
                        id: backendId as Id<"pageRelations">,
                      },
              });
            }),
          );
          const requestedCount = requestResults.filter(
            (result) => result.status === "fulfilled",
          ).length;
          const failedCount = requestResults.length - requestedCount;
          if (requestedCount > 0) {
            toast.success(
              requestedCount === 1
                ? "Zahtev za uklanjanje veze je poslat na odobravanje."
                : "Zahtevi za uklanjanje veza su poslati na odobravanje.",
            );
          }
          if (failedCount > 0) {
            const firstFailure = requestResults.find(
              (result) => result.status === "rejected",
            );
            toast.error(
              failedCount === 1 &&
                firstFailure?.status === "rejected" &&
                firstFailure.reason instanceof Error
                ? firstFailure.reason.message
                : failedCount === 1
                  ? "Zahtev za uklanjanje veze nije poslat."
                  : "Neki zahtevi za uklanjanje veza nisu poslati.",
            );
          }
        }

        const removed: DeletedEdgeRecord[] = [];
        const failed: AreaFlowEdge[] = [];

        for (const record of records) {
          try {
            if (record.kind === "canvas") {
              await disconnectPages({
                startupId,
                areaId,
                rootPageId,
                edgeId: record.currentId as Id<"pageCanvasEdgesV2">,
              });
            } else {
              await deleteRelation({
                startupId,
                relationId: record.currentId as Id<"pageRelations">,
              });
            }
            removed.push(record);
          } catch {
            failed.push(record.edge);
          }
        }

        if (failed.length > 0) {
          setEdges((current) => {
            const currentIds = new Set(current.map((edge) => edge.id));
            return [
              ...current,
              ...failed.filter((edge) => !currentIds.has(edge.id)),
            ];
          });
          toast.error(
            failed.length === 1
              ? "Veza nije uklonjena."
              : "Neke veze nisu uklonjene.",
          );
        }

        if (removed.length === 0) return;
        pushHistory({
          label:
            removed.length === 1
              ? "uklanjanje veze kartica"
              : "uklanjanje veza kartica",
          undo: async () => {
            for (const record of removed) {
              if (record.kind === "canvas") {
                record.currentId = await connectPages({
                  startupId,
                  areaId,
                  rootPageId,
                  sourcePageId: record.source,
                  targetPageId: record.target,
                  label: record.label,
                });
              } else {
                record.currentId = await createRelation({
                  startupId,
                  pageAId: record.source,
                  pageBId: record.target,
                  label: record.label,
                });
              }
            }
          },
          redo: async () => {
            for (const record of removed) {
              if (record.kind === "canvas") {
                await disconnectPages({
                  startupId,
                  areaId,
                  rootPageId,
                  edgeId:
                    record.currentId as Id<"pageCanvasEdgesV2">,
                });
              } else {
                await deleteRelation({
                  startupId,
                  relationId:
                    record.currentId as Id<"pageRelations">,
                });
              }
            }
          },
        });
      })();
    },
    [
      areaId,
      connectPages,
      createRelation,
      deleteRelation,
      disconnectPages,
      pushHistory,
      requestDeletion,
      rootPageId,
      startupId,
    ],
  );

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, next: Viewport) => {
      setViewport(next);
      void saveViewport({
        startupId,
        areaId,
        rootPageId,
        x: Math.round(next.x),
        y: Math.round(next.y),
        zoom: Number(next.zoom.toFixed(2)),
      }).catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Prikaz kanvasa nije sačuvan.",
        );
      });
    },
    [areaId, rootPageId, saveViewport, startupId],
  );

  const isTaskFilter = filter === "task";
  const isNoteFilter = filter === "note";
  const pendingCount = nodes.filter(
    (node) => node.data.pendingNesting,
  ).length;

  return (
    <AreaNodeActionsProvider
      openCanvas={onOpenCanvas}
      openDetails={onOpenDetails}
      resize={(pageId, layout) => {
        const previous = canvasData.pages.find(
          (page) => page._id === pageId,
        );
        if (!previous || !previous.canResize) return;
        const after = {
          width: Math.round(layout.width),
          height: Math.round(layout.height),
        };
        void resizePage({
          startupId,
          areaId,
          rootPageId,
          pageId,
          ...after,
        })
          .then(() => {
            pushHistory({
              label: `promena veličine ${previous.kind === "task" ? "zadatka" : "beleške"}`,
              undo: () =>
                resizePage({
                  startupId,
                  areaId,
                  rootPageId,
                  pageId,
                  width: previous.width,
                  height: previous.height,
                }),
              redo: () =>
                resizePage({
                  startupId,
                  areaId,
                  rootPageId,
                  pageId,
                  ...after,
                }),
            });
          })
          .catch((error) => {
            setNodes((current) =>
              current.map((node) =>
                node.id === pageId
                  ? {
                      ...node,
                      width: previous.width,
                      height: previous.height,
                      style: {
                        ...node.style,
                        width: previous.width,
                        height: previous.height,
                      },
                    }
                  : node,
              ),
            );
            toast.error(
              error instanceof Error
                ? error.message
                : "Veličina kartice nije sačuvana.",
            );
          });
      }}
      resetSize={(pageId) => {
        const previous = canvasData.pages.find(
          (page) => page._id === pageId,
        );
        if (!previous || !previous.canResize) return;
        void resetPageSize({
          startupId,
          areaId,
          rootPageId,
          pageId,
        })
          .then(() => {
            pushHistory({
              label: `vraćanje početne veličine ${previous.kind === "task" ? "zadatka" : "beleške"}`,
              undo: () =>
                resizePage({
                  startupId,
                  areaId,
                  rootPageId,
                  pageId,
                  width: previous.width,
                  height: previous.height,
                }),
              redo: () =>
                resetPageSize({
                  startupId,
                  areaId,
                  rootPageId,
                  pageId,
                }),
            });
            toast.success("Vraćena je početna veličina kartice.");
          })
          .catch((error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Početna veličina nije vraćena.",
            );
          });
      }}
    >
      <div
        className={cn(
          styles.canvas,
          isTaskFilter
            ? styles.tasksCanvas
            : isNoteFilter
              ? styles.notesCanvas
              : undefined,
          "min-h-[32rem] rounded-3xl border border-border/70 shadow-inner",
        )}
        // AreaView does not provide a fixed-height parent. Keep a definite
        // containing-block height so React Flow's 100% height cannot collapse.
        style={{ height: "min(72vh, 52rem)" }}
        role="application"
        tabIndex={0}
        onKeyDownCapture={(event) => {
          const modifier = event.ctrlKey || event.metaKey;
          if (modifier && event.key.toLowerCase() === "a") {
            event.preventDefault();
            setNodes((current) =>
              current.map((node) => ({ ...node, selected: true })),
            );
          } else if (event.key === "Escape") {
            setNodes((current) =>
              current.map((node) => ({ ...node, selected: false })),
            );
            setEdges((current) =>
              current.map((edge) => ({ ...edge, selected: false })),
            );
          }
        }}
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
          onNodeDragStart={(_event, _node, draggedNodes) => {
            preDragPositionsRef.current = new Map(
              draggedNodes
                .filter(
                  (dragged) =>
                    dragged.data.canMove &&
                    !dragged.data.pendingNesting,
                )
                .map((dragged) => [
                  dragged.id,
                  {
                    x: dragged.position.x,
                    y: dragged.position.y,
                  },
                ]),
            );
          }}
          onNodeDragStop={(_event, _node, draggedNodes) => {
            const movableNodes = draggedNodes.filter(
              (dragged) =>
                dragged.data.canMove && !dragged.data.pendingNesting,
            );
            const before = movableNodes.flatMap((dragged) => {
              const position = preDragPositionsRef.current.get(dragged.id);
              return position
                ? [
                    {
                      pageId: dragged.id as Id<"pages">,
                      x: Math.round(position.x),
                      y: Math.round(position.y),
                    },
                  ]
                : [];
            });
            const beforeByPageId = new Map(
              before.map((move) => [
                move.pageId,
                { x: move.x, y: move.y },
              ]),
            );
            const after = movableNodes.flatMap((dragged) =>
              beforeByPageId.has(dragged.id as Id<"pages">)
                ? [
                    {
                      pageId: dragged.id as Id<"pages">,
                      x: Math.round(dragged.position.x),
                      y: Math.round(dragged.position.y),
                    },
                  ]
                : [],
            );
            preDragPositionsRef.current.clear();
            const changed = after.some((move) => {
              const previous = beforeByPageId.get(move.pageId);
              return (
                previous?.x !== move.x || previous?.y !== move.y
              );
            });
            if (!changed) return;

            void movePages({
              startupId,
              areaId,
              rootPageId,
              updates: after,
            })
              .then(() => {
                pushHistory({
                  label:
                    after.length === 1
                      ? "pomeranje kartice"
                      : "pomeranje grupe kartica",
                  undo: () =>
                    movePages({
                      startupId,
                      areaId,
                      rootPageId,
                      updates: before,
                    }),
                  redo: () =>
                    movePages({
                      startupId,
                      areaId,
                      rootPageId,
                      updates: after,
                    }),
                });
              })
              .catch((error) => {
                setNodes((current) =>
                  current.map((node) => {
                    const previous = beforeByPageId.get(
                      node.id as Id<"pages">,
                    );
                    return previous
                      ? { ...node, position: previous }
                      : node;
                  }),
                );
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Pozicija nije sačuvana.",
                );
              });
          }}
          onEdgesDelete={handleEdgesDelete}
          onMove={(_event, next) => setViewport(next)}
          onMoveEnd={handleMoveEnd}
          defaultViewport={viewport}
          minZoom={0.18}
          maxZoom={2.2}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          panOnScroll
          panOnDrag={[1, 2]}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          selectionKeyCode="Shift"
          multiSelectionKeyCode={["Control", "Meta"]}
          deleteKeyCode={["Backspace", "Delete"]}
          nodeDragThreshold={3}
          connectionDragThreshold={4}
          elevateNodesOnSelect
          nodesConnectable
          nodesFocusable
          edgesFocusable
          fitViewOptions={{ padding: 0.24, maxZoom: 1.05 }}
          aria-label={`Kanvas ${canvasLabel}: ${
            filter === "all"
              ? "beleške i zadaci"
              : filter === "task"
                ? "zadaci"
                : "beleške"
          }`}
          ariaLabelConfig={SERBIAN_ARIA_LABELS}
          colorMode={colorMode}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.15}
            color="color-mix(in oklab, var(--muted-foreground) 30%, transparent)"
          />
          <Controls
            position="bottom-left"
            showInteractive={false}
          />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) =>
              node.data.pendingNesting
                ? "#f59e0b"
                : node.data.kind === "task"
                  ? "#10b981"
                  : "#38bdf8"
            }
            maskColor="color-mix(in oklab, var(--background) 58%, transparent)"
          />

          <Panel position="top-left" className="m-3 sm:m-5">
            <div className="flex max-w-[calc(100vw-5rem)] flex-wrap items-center gap-2">
              <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-border/80 bg-card/92 px-3.5 shadow-md backdrop-blur-xl">
                {filter === "all" ? (
                  <LayoutGrid className="size-4 text-violet-600 dark:text-violet-300" />
                ) : isTaskFilter ? (
                  <CheckSquare2 className="size-4 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <FileText className="size-4 text-sky-600 dark:text-sky-300" />
                )}
                <span className="max-w-36 truncate text-xs font-bold sm:max-w-56">
                  {canvasLabel}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                    filter === "all"
                      ? "bg-violet-500/12 text-violet-700 dark:text-violet-300"
                      : isTaskFilter
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                        : "bg-sky-500/12 text-sky-700 dark:text-sky-300",
                  )}
                >
                  {nodes.length}
                </span>
                {pendingCount > 0 ? (
                  <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.6875rem] font-bold text-amber-800 dark:text-amber-200">
                    {pendingCount} čeka
                  </span>
                ) : null}
              </div>

              {filter !== "note" ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-10 rounded-2xl px-3.5 shadow-md"
                  onClick={() => onCreatePage("task")}
                >
                  <Plus className="size-4" /> Novi zadatak
                </Button>
              ) : null}
              {filter !== "task" ? (
                <Button
                  type="button"
                  size="sm"
                  variant={filter === "all" ? "outline" : "default"}
                  className="h-10 rounded-2xl px-3.5 shadow-md"
                  onClick={() => onCreatePage("note")}
                >
                  <Plus className="size-4" /> Nova beleška
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-10 rounded-2xl shadow-md"
                aria-label="Poništi poslednju promenu"
                disabled={
                  historyState.undoCount === 0 || historyState.busy
                }
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
                disabled={
                  historyState.redoCount === 0 || historyState.busy
                }
                onClick={() => void runHistory("redo")}
              >
                <Redo2 className="size-4" />
              </Button>
            </div>
          </Panel>

          <Panel
            position="top-right"
            className="m-3 hidden sm:block sm:m-5"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card/92 px-3.5 py-2 text-[0.6875rem] font-medium text-muted-foreground shadow-md backdrop-blur-xl">
              <Link2 className="size-3.5" />
              Klik bira · dupli klik ili Enter otvara kanvas · spoji
              tačke
              <span className="ml-1 font-mono text-foreground">
                {Math.round(viewport.zoom * 100)}%
              </span>
            </div>
          </Panel>
        </ReactFlow>

        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-3xl border border-border/80 bg-card/94 p-7 text-center shadow-xl backdrop-blur-xl">
              <span
                className={cn(
                  "mx-auto grid size-12 place-items-center rounded-2xl",
                  filter === "all"
                    ? "bg-violet-500/12 text-violet-600 dark:text-violet-300"
                    : isTaskFilter
                      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                      : "bg-sky-500/12 text-sky-600 dark:text-sky-300",
                )}
              >
                {filter === "all" ? (
                  <LayoutGrid className="size-5" />
                ) : isTaskFilter ? (
                  <CheckSquare2 className="size-5" />
                ) : (
                  <FileText className="size-5" />
                )}
              </span>
              <h3 className="mt-4 text-base font-bold">
                {canvasData.truncated
                  ? "Nema podudaranja među učitanim karticama"
                  : filter === "all"
                    ? "Kanvas je spreman za prvu karticu"
                    : isTaskFilter
                      ? "Nema zadataka na kanvasu"
                      : "Nema beležaka na kanvasu"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {canvasData.truncated
                  ? "Filter važi samo za ograničeni učitani skup. Promeni filter da proveriš druge učitane kartice."
                  : `Kreiraj prvu karticu u kanvasu ${canvasLabel}. Kasnije je prevuci, poveži i otvori njen podkanvas.`}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {filter !== "note" ? (
                  <Button
                    className="rounded-xl"
                    onClick={() => onCreatePage("task")}
                  >
                    <Plus className="size-4" /> Prvi zadatak
                  </Button>
                ) : null}
                {filter !== "task" ? (
                  <Button
                    variant={filter === "all" ? "outline" : "default"}
                    className="rounded-xl"
                    onClick={() => onCreatePage("note")}
                  >
                    <Plus className="size-4" /> Prva beleška
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {canvasData.truncated ? (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-500/30 bg-amber-50/95 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-md dark:bg-amber-950/95 dark:text-amber-100">
            Prikaz je skraćen zbog velikog broja kartica ili veza.
          </div>
        ) : null}
      </div>
    </AreaNodeActionsProvider>
  );
}
