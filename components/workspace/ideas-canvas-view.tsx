"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  ArrowRight,
  GitCommit,
  Lightbulb,
  Plus,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
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
  color: "neutral" | "violet" | "blue" | "green" | "amber" | "rose";
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
  onSelectIdea: (idea: IdeaNode) => void;
  onConvertIdea: (idea: IdeaNode) => void;
  onCreateIdea: (parentIdeaId?: Id<"ideaNodes">) => void;
};

const COLOR_CLASSES: Record<IdeaNode["color"], { bg: string; border: string; glow: string; text: string }> = {
  neutral: {
    bg: "bg-slate-900/90 dark:bg-slate-950/90",
    border: "border-slate-700/60",
    glow: "shadow-[0_0_20px_rgba(148,163,184,0.15)]",
    text: "text-slate-200",
  },
  violet: {
    bg: "bg-violet-950/80 dark:bg-violet-950/90",
    border: "border-violet-500/50",
    glow: "shadow-[0_0_25px_rgba(139,92,246,0.25)]",
    text: "text-violet-200",
  },
  blue: {
    bg: "bg-sky-950/80 dark:bg-sky-950/90",
    border: "border-sky-500/50",
    glow: "shadow-[0_0_25px_rgba(56,189,248,0.25)]",
    text: "text-sky-200",
  },
  green: {
    bg: "bg-emerald-950/80 dark:bg-emerald-950/90",
    border: "border-emerald-500/50",
    glow: "shadow-[0_0_25px_rgba(52,211,153,0.25)]",
    text: "text-emerald-200",
  },
  amber: {
    bg: "bg-amber-950/80 dark:bg-amber-950/90",
    border: "border-amber-500/50",
    glow: "shadow-[0_0_25px_rgba(251,191,36,0.25)]",
    text: "text-amber-200",
  },
  rose: {
    bg: "bg-rose-950/80 dark:bg-rose-950/90",
    border: "border-rose-500/50",
    glow: "shadow-[0_0_25px_rgba(251,113,133,0.25)]",
    text: "text-rose-200",
  },
};

export function IdeasCanvasView({
  startupId,
  nodes,
  edges,
  canvasState,
  onSelectIdea,
  onConvertIdea,
  onCreateIdea,
}: IdeasCanvasViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    x: canvasState.x,
    y: canvasState.y,
    zoom: canvasState.zoom || 1,
  });

  const [draggingNodeId, setDraggingNodeId] = useState<Id<"ideaNodes"> | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [connectingFromId, setConnectingFromId] = useState<Id<"ideaNodes"> | null>(null);

  const voteMutation = useMutation(api.ideas.vote);
  const updatePositionsMutation = useMutation(api.ideas.updatePositions);
  const connectMutation = useMutation(api.ideas.connect);
  const saveViewportMutation = useMutation(api.ideas.saveViewport);

  const handleVote = async (e: React.MouseEvent, ideaId: Id<"ideaNodes">, voteType: "up" | "down") => {
    e.stopPropagation();
    try {
      await voteMutation({ startupId, ideaId, voteType });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Greška pri glasanju.");
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: IdeaNode) => {
    if (connectingFromId) {
      if (connectingFromId !== node._id) {
        connectMutation({
          startupId,
          nodeAId: connectingFromId,
          nodeBId: node._id,
        })
          .then(() => toast.success("Ideje su uspešno povezane!"))
          .catch((err) => toast.error(err instanceof Error ? err.message : "Greška pri povezivanju."));
      }
      setConnectingFromId(null);
      return;
    }

    e.stopPropagation();
    setDraggingNodeId(node._id);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (connectingFromId) {
      setConnectingFromId(null);
      return;
    }
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setViewport((prev) => ({
          ...prev,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        }));
        return;
      }

      if (draggingNodeId) {
        setNodePositions((prev) => ({
          ...prev,
          [draggingNodeId]: {
            x: (prev[draggingNodeId]?.x || 0) + e.movementX / viewport.zoom,
            y: (prev[draggingNodeId]?.y || 0) + e.movementY / viewport.zoom,
          },
        }));
      }
    },
    [draggingNodeId, isPanning, panStart, viewport.zoom]
  );

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      saveViewportMutation({
        startupId,
        x: Math.round(viewport.x),
        y: Math.round(viewport.y),
        zoom: Number(viewport.zoom.toFixed(2)),
      }).catch(() => {});
    }

    if (draggingNodeId) {
      const pos = nodePositions[draggingNodeId];
      if (pos) {
        updatePositionsMutation({
          startupId,
          updates: [{ id: draggingNodeId, x: Math.round(pos.x), y: Math.round(pos.y) }],
        }).catch(() => {});
      }
      setDraggingNodeId(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(Math.max(viewport.zoom * zoomFactor, 0.25), 2.5);
    setViewport((prev) => ({ ...prev, zoom: newZoom }));
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="relative h-full w-full select-none overflow-hidden bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)]"
    >
      {/* Top Floating Bar */}
      <div className="absolute left-6 top-6 z-20 flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/80 px-4 py-2 backdrop-blur-xl shadow-lg">
          <Lightbulb className="size-5 text-amber-500 animate-pulse" />
          <span className="font-semibold text-sm">Ideje Canvas (Oblačići)</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-bold">
            {nodes.length} ideja
          </span>
        </div>

        <Button
          onClick={() => onCreateIdea()}
          className="rounded-2xl shadow-lg gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium"
        >
          <Plus className="size-4" /> Nova Ideja
        </Button>
      </div>

      {/* Viewport Zoom Controls */}
      <div className="absolute right-6 top-6 z-20 flex items-center gap-1 rounded-2xl border border-border/60 bg-background/80 p-1.5 backdrop-blur-xl shadow-lg">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-xl"
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(v.zoom + 0.15, 2.5) }))}
        >
          <ZoomIn className="size-4" />
        </Button>
        <span className="px-2 text-xs font-mono font-medium">{Math.round(viewport.zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-xl"
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(v.zoom - 0.15, 0.25) }))}
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-xl"
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Canvas Layer */}
      <div
        className="absolute inset-0 origin-0 transition-transform duration-75 ease-out"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0px) scale(${viewport.zoom})`,
        }}
      >
        {/* SVG Edges Connecting Nodes */}
        <svg className="pointer-events-none absolute inset-0 h-[5000px] w-[5000px] -translate-x-[2500px] -translate-y-[2500px] overflow-visible">
          {edges.map((edge) => {
            const posA = nodePositions[edge.nodeAId];
            const posB = nodePositions[edge.nodeBId];
            if (!posA || !posB) return null;

            const dx = posB.x - posA.x;
            const cx1 = posA.x + dx * 0.5;
            const cy1 = posA.y;
            const cx2 = posA.x + dx * 0.5;
            const cy2 = posB.y;

            return (
              <g key={edge._id}>
                <path
                  d={`M ${posA.x + 120} ${posA.y + 70} C ${cx1 + 120} ${cy1 + 70}, ${cx2 + 120} ${cy2 + 70}, ${posB.x + 120} ${posB.y + 70}`}
                  fill="none"
                  stroke="rgba(139, 92, 246, 0.4)"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes (Oblačići) */}
        {nodes.map((node) => {
          const pos = nodePositions[node._id] || { x: node.x, y: node.y };
          const style = COLOR_CLASSES[node.color];
          const isDragging = draggingNodeId === node._id;

          return (
            <div
              key={node._id}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              className={cn(
                "absolute cursor-grab active:cursor-grabbing rounded-3xl border p-5 backdrop-blur-2xl transition-shadow w-72",
                style.bg,
                style.border,
                style.glow,
                isDragging && "scale-105 z-30 ring-2 ring-primary/80"
              )}
              style={{
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0px)`,
              }}
            >
              {/* Header: Author & Approval Badge */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <ProfileAvatar
                    profile={{
                      displayName: node.author?.displayName || "Autor",
                      avatarUrl: node.author?.avatarUrl || null,
                    }}
                    className="size-7 ring-2 ring-primary/20"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold leading-tight line-clamp-1">
                      {node.author?.displayName || "Član"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(node.createdAt).toLocaleDateString("sr-RS")}
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                {node.isApproved ? (
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    Odobreno
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                    U razmatranju
                  </span>
                )}
              </div>

              {/* Title & Body Text */}
              {node.title ? (
                <h4 className={cn("font-bold text-base mb-1 line-clamp-2", style.text)}>
                  {node.title}
                </h4>
              ) : null}
              <p className="text-sm leading-snug opacity-90 line-clamp-4 font-normal mb-4">
                {node.text}
              </p>

              {/* Footer: Voting Bar & Action Buttons */}
              <div className="flex items-center justify-between border-t border-white/10 pt-3 mt-1">
                {/* Voting Buttons */}
                <div className="flex items-center gap-1 bg-black/20 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={(e) => handleVote(e, node._id, "up")}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                      node.userVote === "up"
                        ? "bg-emerald-500/30 text-emerald-300 font-bold"
                        : "hover:bg-white/10 text-muted-foreground"
                    )}
                  >
                    <ThumbsUp className="size-3.5" />
                    <span>{node.upvotes}</span>
                  </button>

                  <div className="h-3 w-px bg-white/10" />

                  <button
                    type="button"
                    onClick={(e) => handleVote(e, node._id, "down")}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                      node.userVote === "down"
                        ? "bg-rose-500/30 text-rose-300 font-bold"
                        : "hover:bg-white/10 text-muted-foreground"
                    )}
                  >
                    <ThumbsDown className="size-3.5" />
                    <span>{node.downvotes}</span>
                  </button>
                </div>

                {/* Conversion / Action */}
                {node.isApproved ? (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvertIdea(node);
                    }}
                    className="rounded-xl h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1"
                  >
                    <span>Pretvori</span>
                    <ArrowRight className="size-3" />
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnectingFromId(node._id);
                    }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  >
                    <GitCommit className="size-3.5" />
                    <span>Poveži</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
