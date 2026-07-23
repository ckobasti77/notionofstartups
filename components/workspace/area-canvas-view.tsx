"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CheckSquare2,
  FileText,
  GitCommit,
  Plus,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProfileAvatar, TaskPriorityBadge, TaskStatusBadge } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type AreaCanvasViewProps = {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  kind?: "task" | "note";
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreatePage: (kind: "task" | "note") => void;
};

export function AreaCanvasView({
  startupId,
  areaId,
  kind,
  onOpenPage,
  onCreatePage,
}: AreaCanvasViewProps) {
  const canvasData = useQuery(api.pages.listAreaCanvasPages, {
    startupId,
    areaId,
    kind,
  });

  const connectMutation = useMutation(api.pages.connectCanvasPages);

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [draggingPageId, setDraggingPageId] = useState<Id<"pages"> | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [connectingFromId, setConnectingFromId] = useState<Id<"pages"> | null>(null);

  const handleNodeMouseDown = (e: React.MouseEvent, pageId: Id<"pages">) => {
    if (connectingFromId) {
      if (connectingFromId !== pageId) {
        connectMutation({
          startupId,
          areaId,
          nodeAId: connectingFromId,
          nodeBId: pageId,
        })
          .then(() => toast.success("Stavke su povezane!"))
          .catch((err) => toast.error(err instanceof Error ? err.message : "Greška pri povezivanju."));
      }
      setConnectingFromId(null);
      return;
    }
    e.stopPropagation();
    setDraggingPageId(pageId);
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

      if (draggingPageId) {
        setPositions((prev) => ({
          ...prev,
          [draggingPageId]: {
            x: (prev[draggingPageId]?.x || 0) + e.movementX / viewport.zoom,
            y: (prev[draggingPageId]?.y || 0) + e.movementY / viewport.zoom,
          },
        }));
      }
    },
    [draggingPageId, isPanning, panStart, viewport.zoom]
  );

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingPageId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(Math.max(viewport.zoom * zoomFactor, 0.25), 2.5);
    setViewport((prev) => ({ ...prev, zoom: newZoom }));
  };

  if (!canvasData) {
    return <div className="h-96 w-full animate-pulse rounded-2xl bg-muted/30" />;
  }

  const { pages, edges } = canvasData;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="relative min-h-[600px] h-[75vh] w-full select-none overflow-hidden rounded-3xl border border-border/70 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] shadow-inner"
    >
      {/* Top Floating Info & Actions */}
      <div className="absolute left-5 top-5 z-20 flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/80 px-4 py-2 backdrop-blur-xl shadow-md">
          {kind === "task" ? (
            <CheckSquare2 className="size-4.5 text-emerald-400" />
          ) : (
            <FileText className="size-4.5 text-sky-400" />
          )}
          <span className="font-semibold text-xs">
            {kind === "task" ? "Canvas Zadataka" : "Canvas Beleški"} ({pages.length})
          </span>
        </div>

        <Button
          onClick={() => onCreatePage(kind || "task")}
          size="sm"
          className="rounded-2xl shadow-md gap-1.5 text-xs bg-primary text-primary-foreground font-medium"
        >
          <Plus className="size-3.5" /> Novi {kind === "task" ? "Task" : "Note"}
        </Button>
      </div>

      {/* Zoom Toolbar */}
      <div className="absolute right-5 top-5 z-20 flex items-center gap-1 rounded-2xl border border-border/60 bg-background/80 p-1.5 backdrop-blur-xl shadow-md">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-xl"
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(v.zoom + 0.15, 2.5) }))}
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <span className="px-1.5 text-[11px] font-mono font-medium">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-xl"
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(v.zoom - 0.15, 0.25) }))}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-xl"
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* Interactive 2D Canvas Layer */}
      <div
        className="absolute inset-0 origin-0 transition-transform duration-75 ease-out"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0px) scale(${viewport.zoom})`,
        }}
      >
        {/* SVG Edges Connecting Pages */}
        <svg className="pointer-events-none absolute inset-0 h-[5000px] w-[5000px] -translate-x-[2500px] -translate-y-[2500px] overflow-visible">
          {edges.map((edge) => {
            const posA = positions[edge.nodeAId];
            const posB = positions[edge.nodeBId];
            if (!posA || !posB) return null;

            const dx = posB.x - posA.x;
            const cx1 = posA.x + dx * 0.5;
            const cy1 = posA.y;
            const cx2 = posA.x + dx * 0.5;
            const cy2 = posB.y;

            return (
              <g key={edge._id}>
                <path
                  d={`M ${posA.x + 130} ${posA.y + 60} C ${cx1 + 130} ${cy1 + 60}, ${cx2 + 130} ${cy2 + 60}, ${posB.x + 130} ${posB.y + 60}`}
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.45)"
                  strokeWidth="3"
                  strokeDasharray="5 4"
                />
              </g>
            );
          })}
        </svg>

        {/* Render Page Cards */}
        {pages.map((p, idx) => {
          const cols = Math.max(1, Math.ceil(Math.sqrt(pages.length)));
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const pos = positions[p._id] || {
            x: (col - cols / 2) * 320,
            y: (row - Math.floor(pages.length / cols) / 2) * 220,
          };
          const isDragging = draggingPageId === p._id;

          return (
            <div
              key={p._id}
              onMouseDown={(e) => handleNodeMouseDown(e, p._id)}
              onDoubleClick={() => onOpenPage(p._id)}
              className={cn(
                "absolute cursor-grab active:cursor-grabbing rounded-3xl border border-border/80 bg-card/90 p-4 shadow-lg backdrop-blur-xl w-64 transition-all hover:ring-2 hover:ring-primary/40",
                isDragging && "scale-105 z-30 ring-2 ring-primary"
              )}
              style={{
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0px)`,
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {p.kind === "task" ? (
                    <CheckSquare2 className="size-4 text-emerald-400 shrink-0" />
                  ) : (
                    <FileText className="size-4 text-sky-400 shrink-0" />
                  )}
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {p.kind === "task" ? "Task" : "Note"}
                  </span>
                </div>

                <ProfileAvatar
                  profile={{
                    displayName: p.creator?.displayName || "Član",
                    avatarUrl: p.creator?.avatarUrl || null,
                  }}
                  className="size-6"
                />
              </div>

              <h4 className="font-bold text-sm text-foreground line-clamp-2 mb-2">
                {p.title || "Bez naslova"}
              </h4>

              {p.kind === "task" && p.taskStatus ? (
                <div className="flex items-center gap-2 mb-3">
                  <TaskStatusBadge status={p.taskStatus} />
                  {p.taskPriority ? <TaskPriorityBadge priority={p.taskPriority} /> : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-border/40 pt-2.5 mt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConnectingFromId(p._id);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                >
                  <GitCommit className="size-3" />
                  <span>Poveži</span>
                </button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPage(p._id);
                  }}
                  className="h-6 text-[11px] px-2 gap-1 text-primary hover:text-primary"
                >
                  <span>Otvori</span>
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
