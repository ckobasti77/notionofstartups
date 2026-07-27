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
import {
  ArrowUpRight,
  CalendarDays,
  CheckSquare2,
  FileText,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ProfileAvatar,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { CircularTextFlow } from "./circular-text-flow";
import styles from "./connected-canvas.module.css";
import orbital from "./orbital-node.module.css";

export type AreaCanvasNodeData = {
  title: string;
  text: string;
  kind: "task" | "note";
  taskStatus: "backlog" | "next" | "in_progress" | "blocked" | "done" | null;
  taskPriority: "low" | "medium" | "high" | "urgent" | null;
  creatorName: string;
  creatorAvatarUrl: string | null;
  updatedAt: number;
  canResize: boolean;
};

export type AreaFlowNode = Node<AreaCanvasNodeData, "areaPage">;

const AreaNodeActionsContext = createContext<{
  open: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  resetSize: (pageId: Id<"pages">) => void;
} | null>(null);

export function AreaNodeActionsProvider({
  open,
  resize,
  resetSize,
  children,
}: {
  open: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  resetSize: (pageId: Id<"pages">) => void;
  children: ReactNode;
}) {
  return (
    <AreaNodeActionsContext.Provider value={{ open, resize, resetSize }}>
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
        orbital.shell,
        isTask ? styles.task : styles.note,
        selected && orbital.selected,
      )}
      aria-label={`${isTask ? "Zadatak" : "Beleška"}: ${data.title || "Bez naslova"}. ${data.text}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions?.open(pageId);
      }}
    >
      <div className={orbital.surface} aria-hidden="true" />

      <NodeResizer
        isVisible={selected && data.canResize}
        minWidth={240}
        minHeight={168}
        maxWidth={720}
        maxHeight={1_000}
        handleClassName={cn(styles.resizeHandle, orbital.resizeControl)}
        lineClassName={styles.resizeLine}
        onResizeEnd={(_event, layout) => actions?.resize(pageId, layout)}
      />

      <NodeToolbar isVisible={selected} position={Position.Top} offset={24}>
        <div className={cn(orbital.toolbar, "nodrag flex items-center gap-1 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur")}>
          {data.canResize ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              onClick={() => actions?.resetSize(pageId)}
            >
              <RotateCcw className="size-3.5" /> Početna veličina
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
            onClick={() => actions?.open(pageId)}
          >
            Otvori <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      </NodeToolbar>

      <div className={cn(orbital.orbit, orbital.titleOrbit)}>
        {data.title || "Bez naslova"}
      </div>

      <div className={cn(orbital.orbit, orbital.founderOrbit)}>
        <ProfileAvatar
          profile={{
            displayName: data.creatorName,
            avatarUrl: data.creatorAvatarUrl,
          }}
          className="size-7 shrink-0 ring-2 ring-background"
        />
        <span className={orbital.founderLabel}>
          <span className={orbital.founderEyebrow}>Osnivač</span>
          <span className={orbital.founderName}>{data.creatorName}</span>
        </span>
      </div>

      <div
        className={cn(
          orbital.orbit,
          orbital.statusOrbit,
          isTask
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-sky-700 dark:text-sky-300",
        )}
      >
        {isTask ? <CheckSquare2 className="size-3.5" /> : <FileText className="size-3.5" />}
        <span className="text-[0.625rem] font-extrabold">
          {isTask ? "Zadatak" : "Beleška"}
        </span>
      </div>

      <div className={cn(orbital.orbit, orbital.actionOrbit)}>
        {isTask && data.taskStatus ? (
          <div className="flex flex-wrap items-center gap-1">
            <TaskStatusBadge status={data.taskStatus} />
            {data.taskPriority ? (
              <TaskPriorityBadge priority={data.taskPriority} />
            ) : null}
          </div>
        ) : (
          <span className="px-2 text-[0.625rem] font-bold text-muted-foreground">
            Sačuvan sadržaj
          </span>
        )}
      </div>

      <time
        className={cn(orbital.orbit, orbital.dateOrbit)}
        dateTime={new Date(data.updatedAt).toISOString()}
      >
        <CalendarDays className="size-3.5" />
        {new Intl.DateTimeFormat("sr-Latn-RS", {
          day: "2-digit",
          month: "short",
        }).format(data.updatedAt)}
      </time>

      <CircularTextFlow
        text={data.text}
        ariaLabel={`${isTask ? "Tekst zadatka" : "Tekst beleške"} ${data.title || "Bez naslova"}`}
      />

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={cn(styles.handle, orbital.handle)}
        aria-label="Leva tačka za povezivanje kartice"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={cn(styles.handle, orbital.handle)}
        aria-label="Desna tačka za povezivanje kartice"
      />
    </article>
  );
});
