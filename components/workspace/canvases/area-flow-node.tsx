"use client";

import { createContext, memo, useContext, type ReactNode } from "react";
import {
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import { ArrowUpRight, CheckSquare2, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ProfileAvatar,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import styles from "./connected-canvas.module.css";

export type AreaCanvasNodeData = {
  title: string;
  kind: "task" | "note";
  taskStatus: "backlog" | "next" | "in_progress" | "blocked" | "done" | null;
  taskPriority: "low" | "medium" | "high" | "urgent" | null;
  creatorName: string;
  creatorAvatarUrl: string | null;
  updatedAt: number;
};

export type AreaFlowNode = Node<AreaCanvasNodeData, "areaPage">;

const AreaNodeActionsContext = createContext<{
  open: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
} | null>(null);

export function AreaNodeActionsProvider({
  open,
  resize,
  children,
}: {
  open: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  children: ReactNode;
}) {
  return (
    <AreaNodeActionsContext.Provider value={{ open, resize }}>
      {children}
    </AreaNodeActionsContext.Provider>
  );
}

export const AreaFlowNodeCard = memo(function AreaFlowNodeCard({
  id,
  data,
  selected,
}: NodeProps<AreaFlowNode>) {
  const actions = useContext(AreaNodeActionsContext);
  const pageId = id as Id<"pages">;
  const isTask = data.kind === "task";

  return (
    <article
      className={cn(
        styles.node,
        styles.areaNode,
        isTask ? styles.task : styles.note,
        selected && styles.nodeSelected,
      )}
      aria-label={`${isTask ? "Zadatak" : "Beleška"}: ${data.title}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions?.open(pageId);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={168}
        maxWidth={720}
        maxHeight={1_000}
        onResizeEnd={(_event, layout) => actions?.resize(pageId, layout)}
      />
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <Button
          type="button"
          size="sm"
          className="nodrag h-9 gap-1.5 rounded-xl px-3 text-xs shadow-lg"
          onClick={() => actions?.open(pageId)}
        >
          Otvori <ArrowUpRight className="size-3.5" />
        </Button>
      </NodeToolbar>

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={styles.handle}
        aria-label="Leva tačka za povezivanje kartice"
      />

      <div className="flex min-h-[10.5rem] flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <span className={cn(
            "inline-flex items-center gap-1.5 text-[0.625rem] font-extrabold uppercase tracking-[0.14em]",
            isTask
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-sky-700 dark:text-sky-300",
          )}>
            {isTask ? <CheckSquare2 className="size-3.5" /> : <FileText className="size-3.5" />}
            {isTask ? "Zadatak" : "Beleška"}
          </span>
          <ProfileAvatar
            profile={{
              displayName: data.creatorName,
              avatarUrl: data.creatorAvatarUrl,
            }}
            className="size-7 ring-2 ring-background"
          />
        </div>

        <h3 className="mt-4 line-clamp-3 text-sm font-bold leading-5 tracking-[-0.02em]">
          {data.title || "Bez naslova"}
        </h3>

        {isTask && data.taskStatus ? (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <TaskStatusBadge status={data.taskStatus} />
            {data.taskPriority ? <TaskPriorityBadge priority={data.taskPriority} /> : null}
          </div>
        ) : (
          <div className="mt-auto pt-4 text-[0.6875rem] font-medium text-muted-foreground">
            Izmenjeno{" "}
            {new Date(data.updatedAt).toLocaleDateString("sr-RS", {
              day: "2-digit",
              month: "short",
            })}
          </div>
        )}
      </div>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={styles.handle}
        aria-label="Desna tačka za povezivanje kartice"
      />
    </article>
  );
});
