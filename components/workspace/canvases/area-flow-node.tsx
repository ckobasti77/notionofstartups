"use client";

import {
  createContext,
  memo,
  useContext,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Handle,
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
  FolderInput,
  Info,
  ListChecks,
  Maximize2,
  Minimize2,
  RotateCcw,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ProfileAvatar,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "@/components/workspace/workspace-ui";
import {
  NestingTargetMenu,
  type NestingTargetOption,
} from "@/components/workspace/nesting-target-menu";
import { DetachPageButton } from "@/components/workspace/detach-page-button";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { CircularTextFlow } from "./circular-text-flow";
import styles from "./connected-canvas.module.css";
import orbital from "./orbital-node.module.css";
import { PerimeterResizeControl } from "./perimeter-resize-control";

export type AreaCanvasNodeData = {
  title: string;
  text: string;
  kind: "task" | "note";
  taskStatus: "backlog" | "next" | "in_progress" | "blocked" | "done" | null;
  taskPriority: "low" | "medium" | "high" | "urgent" | null;
  dueDate: number | null;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  creatorName: string;
  creatorAvatarUrl: string | null;
  updatedAt: number;
  checkpointTotal: number;
  checkpointCompleted: number;
  checkpointsExpanded: boolean;
  canMove: boolean;
  canResize: boolean;
  canDetach: boolean;
  pendingNesting: boolean;
  nestingTarget: boolean;
};

export type AreaFlowNode = Node<AreaCanvasNodeData, "areaPage">;

const AreaNodeActionsContext = createContext<{
  startupId: Id<"startups">;
  nestingCandidates: NestingTargetOption[];
  openCanvas: (pageId: Id<"pages">) => void;
  openDetails: (pageId: Id<"pages">) => void;
  toggleCheckpoints: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  resetSize: (pageId: Id<"pages">) => void;
} | null>(null);

function stopToolbarEventPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export function AreaNodeActionsProvider({
  startupId,
  nestingCandidates,
  openCanvas,
  openDetails,
  toggleCheckpoints,
  resize,
  resetSize,
  children,
}: {
  startupId: Id<"startups">;
  nestingCandidates: NestingTargetOption[];
  openCanvas: (pageId: Id<"pages">) => void;
  openDetails: (pageId: Id<"pages">) => void;
  toggleCheckpoints: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  resetSize: (pageId: Id<"pages">) => void;
  children: ReactNode;
}) {
  return (
    <AreaNodeActionsContext.Provider
      value={{
        startupId,
        nestingCandidates,
        openCanvas,
        openDetails,
        toggleCheckpoints,
        resize,
        resetSize,
      }}
    >
      {children}
    </AreaNodeActionsContext.Provider>
  );
}

export const AreaFlowNodeCard = memo(function AreaFlowNodeCard({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<AreaFlowNode>) {
  const actions = useContext(AreaNodeActionsContext);
  const pageId = id as Id<"pages">;
  const isTask = data.kind === "task";
  const title = data.title || "Bez naslova";
  const canResize = data.canResize && !data.pendingNesting;
  const hasCheckpoints = isTask && data.checkpointTotal > 0;
  const dueDateLabel =
    data.dueDate === null
      ? "Bez roka"
      : new Intl.DateTimeFormat("sr-Latn-RS", {
          day: "2-digit",
          month: "short",
        }).format(data.dueDate);
  const updatedAtLabel = new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "2-digit",
    month: "short",
  }).format(data.updatedAt);
  const assigneeLabel = data.assigneeName ?? "Nedodeljeno";

  return (
    <article
      data-circular-text-shell
      className={cn(
        orbital.shell,
        isTask && orbital.taskShell,
        isTask ? styles.task : styles.note,
        data.pendingNesting && styles.amber,
        data.nestingTarget && orbital.nestingTarget,
        (!data.canMove || data.pendingNesting) && "nodrag !cursor-default",
        selected && orbital.selected,
      )}
      aria-label={`${isTask ? "Zadatak" : "Beleška"}: ${title}. ${data.text}${
        isTask
          ? `. Dodeljeno: ${assigneeLabel}. Rok: ${dueDateLabel}`
          : ""
      }${data.pendingNesting ? ". Čeka odobrenje" : ""}`}
      title="Dupli klik otvara kanvas; izaberi karticu za dodatne akcije"
      onDoubleClick={(event) => {
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
      {hasCheckpoints ? (
        <div
          className={cn(
            orbital.checkpointPeeks,
            data.checkpointsExpanded && orbital.checkpointPeeksExpanded,
          )}
          aria-hidden="true"
        >
          {Array.from({
            length: Math.min(3, data.checkpointTotal),
          }).map((_, index) => (
            <span
              key={index}
              className={cn(
                orbital.checkpointPeek,
                index < data.checkpointCompleted
                  ? orbital.checkpointPeekDone
                  : orbital.checkpointPeekOpen,
              )}
            />
          ))}
        </div>
      ) : null}
      {data.nestingTarget ? (
        <div
          className={orbital.nestingPrompt}
          role="status"
          aria-live="polite"
        >
          <FolderInput className="size-4" aria-hidden="true" />
          Pusti za ugnježđavanje
        </div>
      ) : null}

      <PerimeterResizeControl<AreaFlowNode>
        nodeId={id}
        width={width ?? 240}
        height={height ?? 168}
        selected={selected}
        disabled={!canResize}
        shape={isTask ? "rounded" : "organic"}
        minWidth={240}
        minHeight={168}
        maxWidth={720}
        maxHeight={1_000}
        ariaLabel={`Promeni veličinu ${isTask ? "zadatka" : "beleške"} ${title} povlačenjem oboda`}
        onResizeEnd={(layout) => {
          if (canResize) actions?.resize(pageId, layout);
        }}
      />

      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        offset={24}
        className="nodrag nokey nopan nowheel max-w-[calc(100vw-2rem)]"
        onPointerDown={stopToolbarEventPropagation}
        onMouseDown={stopToolbarEventPropagation}
        onTouchStart={stopToolbarEventPropagation}
        onKeyDown={stopToolbarEventPropagation}
        onClick={stopToolbarEventPropagation}
        onDoubleClick={stopToolbarEventPropagation}
      >
        <div
          className={cn(
            orbital.toolbar,
            "nodrag flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-1 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur",
          )}
        >
          {!data.pendingNesting && actions ? (
            <>
              {data.canDetach ? (
                <DetachPageButton
                  startupId={actions.startupId}
                  pageId={pageId}
                  title={title}
                  compact
                />
              ) : null}
              {data.canMove ? (
                <NestingTargetMenu
                  startupId={actions.startupId}
                  childPageId={pageId}
                  childTitle={title}
                  candidates={actions.nestingCandidates.filter(
                    (candidate) => candidate.pageId !== pageId,
                  )}
                  compact
                />
              ) : null}
            </>
          ) : null}
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

      {hasCheckpoints ? (
        <button
          type="button"
          data-circular-text-obstacle
          className={cn(
            orbital.orbit,
            orbital.checkpointOrbit,
            "nodrag nopan nowheel",
          )}
          aria-expanded={data.checkpointsExpanded}
          aria-label={
            data.checkpointsExpanded
              ? `Umanji prikaz ${data.checkpointTotal} checkpointa za ${title}`
              : `Prikaži svih ${data.checkpointTotal} checkpointa za ${title}`
          }
          title={
            data.checkpointsExpanded
              ? "Umanji checkpoint grupu"
              : "Raširi checkpoint grupu"
          }
          onPointerDown={stopToolbarEventPropagation}
          onClick={(event) => {
            stopToolbarEventPropagation(event);
            actions?.toggleCheckpoints(pageId);
          }}
        >
          <ListChecks className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">
            {data.checkpointCompleted}/{data.checkpointTotal}
          </span>
          {data.checkpointsExpanded ? (
            <Minimize2 className="size-3.5" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-3.5" aria-hidden="true" />
          )}
        </button>
      ) : null}

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
        ) : isTask ? (
          <div className={orbital.taskActionContent}>
            <div className="flex flex-wrap items-center gap-1">
              {data.taskStatus ? (
                <TaskStatusBadge status={data.taskStatus} />
              ) : null}
              {data.taskPriority ? (
                <TaskPriorityBadge priority={data.taskPriority} />
              ) : null}
            </div>
            <span
              className={orbital.assigneeCompact}
              title={`Dodeljeno: ${assigneeLabel}`}
            >
              {data.assigneeName ? (
                <ProfileAvatar
                  profile={{
                    displayName: data.assigneeName,
                    avatarUrl: data.assigneeAvatarUrl,
                  }}
                  className="size-5 shrink-0 ring-1 ring-background"
                />
              ) : (
                <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{assigneeLabel}</span>
            </span>
          </div>
        ) : (
          <span className="px-2 text-[0.625rem] font-bold text-muted-foreground">
            Sačuvan sadržaj
          </span>
        )}
      </div>

      {isTask ? (
        data.dueDate === null ? (
          <span
            data-circular-text-obstacle
            className={cn(orbital.orbit, orbital.dateOrbit)}
            aria-label="Rok nije postavljen"
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {dueDateLabel}
          </span>
        ) : (
          <time
            data-circular-text-obstacle
            className={cn(orbital.orbit, orbital.dateOrbit)}
            dateTime={new Date(data.dueDate).toISOString()}
            aria-label={`Rok: ${dueDateLabel}`}
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {dueDateLabel}
          </time>
        )
      ) : (
        <time
          data-circular-text-obstacle
          className={cn(orbital.orbit, orbital.dateOrbit)}
          dateTime={new Date(data.updatedAt).toISOString()}
          aria-label={`Ažurirano: ${updatedAtLabel}`}
        >
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {updatedAtLabel}
        </time>
      )}

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
