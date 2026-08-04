"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { Pencil, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
type ThoughtEdgeActions = {
  editLabel: (edgeId: string) => void;
  archiveEdge: (edgeId: string) => void;
};

const ThoughtEdgeActionsContext = createContext<ThoughtEdgeActions | null>(null);

export function ThoughtEdgeActionsProvider({
  actions,
  children,
}: {
  actions: ThoughtEdgeActions;
  children: ReactNode;
}) {
  return (
    <ThoughtEdgeActionsContext.Provider value={actions}>
      {children}
    </ThoughtEdgeActionsContext.Provider>
  );
}

export function ThoughtEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
}: EdgeProps) {
  const actions = useContext(ThoughtEdgeActionsContext);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan group z-10 flex items-center gap-1 rounded-full border border-border/80 bg-card/95 px-2.5 py-1 text-[0.6875rem] font-semibold shadow-md backdrop-blur transition-all hover:scale-105"
          onDoubleClick={(e) => {
            e.stopPropagation();
            actions?.editLabel(id);
          }}
        >
          {label ? (
            <span className="max-w-[120px] truncate text-foreground">{String(label)}</span>
          ) : (
            <span className="text-muted-foreground opacity-60 group-hover:opacity-100">
              Veza
            </span>
          )}

          {actions ? (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-5 rounded-full hover:bg-accent"
                aria-label="Uredi naziv veze"
                title="Uredi naziv veze"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.editLabel(id);
                }}
              >
                <Pencil className="size-2.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-5 rounded-full text-destructive hover:bg-destructive/15 hover:text-destructive"
                aria-label="Prekini vezu"
                title="Prekini vezu"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.archiveEdge(id);
                }}
              >
                <Scissors className="size-2.5" />
              </Button>
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
