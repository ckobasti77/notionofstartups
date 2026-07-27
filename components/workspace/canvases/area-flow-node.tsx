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
  Clock3,
  FileText,
  Info,
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
  canMove: boolean;
  canResize: boolean;
  pendingNesting: boolean;
};

export type AreaFlowNode = Node<AreaCanvasNodeData, "areaPage">;

const AreaNodeActionsContext = createContext<{
  openCanvas: (pageId: Id<"pages">) => void;
  openDetails: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  resetSize: (pageId: Id<"pages">) => void;
} | null>(null);

export function AreaNodeActionsProvider({
  openCanvas,
  openDetails,
  resize,
  resetSize,
  children,
}: {
  openCanvas: (pageId: Id<"pages">) => void;
  openDetails: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  resetSize: (pageId: Id<"pages">) => void;
  children: ReactNode;
}) {
  return (
    <AreaNodeActionsContext.Provider
      value={{ openCanvas, openDetails, resize, resetSize }}
    >
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
  const title = data.title || "Bez naslova";
  const canResize = data.canResize && !data.pendingNesting;

  return (
    <article
      data-circular-text-shell
      className={cn(
        orbital.shell,
        isTask ? styles.task : styles.note,
        data.pendingNesting && styles.amber,
        (!data.canMove || data.pendingNesting) && "nodrag !cursor-default",
        selected && orbital.selected,
      )}
      tabIndex={0}
      aria-keyshortcuts="Enter"
      aria-label={`${isTask ? "Zadatak" : "Beleška"}: ${title}. ${data.text}${data.pendingNesting ? ". Čeka odobrenje" : ""}`}
      title="Dupli klik ili Enter otvara kanvas"
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions?.openCanvas(pageId);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.repeat) return;
        event.preventDefault();
        event.stopPropagation();
        actions?.openCanvas(pageId);
      }}
    >
      <div
        className={cn(
          orbital.surface,
          data.pendingNesting &&
            "!border-dashed !border-amber-500/70 !bg-amber-500/10 dark:!border-amber-300/60",
        )}
        aria-hidden="true"
      />

      <NodeResizer
        isVisible={selected && canResize}
        minWidth={240}
        minHeight={168}
        maxWidth={720}
        maxHeight={1_000}
        handleClassName={cn(styles.resizeHandle, orbital.resizeControl)}
        lineClassName={styles.resizeLine}
        onResizeEnd={(_event, layout) => {
          if (canResize) actions?.resize(pageId, layout);
        }}
      />

      <NodeToolbar isVisible={selected} position={Position.Top} offset={24}>
        <div className={cn(orbital.toolbar, "nodrag flex items-center gap-1 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur")}>
          {canResize ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              aria-label={`Vrati početnu veličinu za ${title}`}
              title="Vrati početnu veličinu"
              onClick={() => actions?.resetSize(pageId)}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Početna veličina
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
            aria-label={`Otvori detalje za ${title}`}
            title="Otvori detalje"
            onClick={() => actions?.openDetails(pageId)}
          >
            <Info className="size-3.5" aria-hidden="true" /> Detalji
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
            aria-label={`Otvori kanvas za ${title}`}
            title="Otvori kanvas"
            onClick={() => actions?.openCanvas(pageId)}
          >
            Otvori kanvas <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </NodeToolbar>

      <div
        data-circular-text-obstacle
        className={cn(orbital.orbit, orbital.titleOrbit)}
      >
        {title}
      </div>

      <div
        data-circular-text-obstacle
        className={cn(orbital.orbit, orbital.founderOrbit)}
      >
        <ProfileAvatar
          profile={{
            displayName: data.creatorName,
            avatarUrl: data.creatorAvatarUrl,
          }}
          className="size-7 shrink-0 ring-2 ring-background"
        />
        <span className={orbital.founderLabel}>
          <span className={orbital.founderEyebrow}>Autor</span>
          <span className={orbital.founderName}>{data.creatorName}</span>
        </span>
      </div>

      <div
        data-circular-text-obstacle
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

      <div
        data-circular-text-obstacle
        className={cn(orbital.orbit, orbital.actionOrbit)}
      >
        {data.pendingNesting ? (
          <span
            role="status"
            className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.625rem] font-extrabold text-amber-800 dark:text-amber-200"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            Čeka odobrenje
          </span>
        ) : isTask && data.taskStatus ? (
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
        data-circular-text-obstacle
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
        ariaLabel={`${isTask ? "Tekst zadatka" : "Tekst beleške"} ${title}`}
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
