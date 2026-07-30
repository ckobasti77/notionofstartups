"use client";

import {
  createContext,
  memo,
  useContext,
  useState,
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
  Clock3,
  Flame,
  FolderInput,
  Info,
  ListChecks,
  Maximize2,
  Minimize2,
  Paperclip,
  RotateCcw,
  Table2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { assigneeStackLabel } from "@/components/workspace/assignee-stack";
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
import {
  MoveToAreaMenu,
  type MoveToAreaOption,
} from "@/components/workspace/move-to-area-menu";
import type { Id } from "@/convex/_generated/dataModel";
import {
  classifyDeadline,
  deadlineAriaLabel,
  deadlineLabel,
} from "@/lib/deadline";
import {
  fileKindLabel,
  pageKindMeta,
  supportsTaskData,
  type PageFileCategory,
  type PageKind,
} from "@/lib/page-kinds";
import { cn } from "@/lib/utils";

import { CircularTextFlow } from "./circular-text-flow";
import styles from "./connected-canvas.module.css";
import orbital from "./orbital-node.module.css";
import { PerimeterResizeControl } from "./perimeter-resize-control";

export type AreaCanvasNodeData = {
  title: string;
  text: string;
  kind: PageKind;
  taskStatus: "backlog" | "next" | "in_progress" | "blocked" | "done" | null;
  taskPriority: "low" | "medium" | "high" | "urgent" | null;
  dueDate: number | null;
  assignees: Array<{ displayName: string; avatarUrl: string | null }>;
  creatorName: string;
  creatorAvatarUrl: string | null;
  updatedAt: number;
  checkpointTotal: number;
  checkpointCompleted: number;
  checkpointsExpanded: boolean;
  fileCount: number;
  fileCategory: PageFileCategory | null;
  filePreviewUrl: string | null;
  tableRowCount: number;
  tableColumnCount: number;
  canMove: boolean;
  canResize: boolean;
  canDetach: boolean;
  pendingNesting: boolean;
  nestingTarget: boolean;
};

export type AreaFlowNode = Node<AreaCanvasNodeData, "areaPage">;

const AreaNodeActionsContext = createContext<{
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  areas: MoveToAreaOption[];
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
  areaId,
  areas,
  nestingCandidates,
  openCanvas,
  openDetails,
  toggleCheckpoints,
  resize,
  resetSize,
  children,
}: {
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  areas: MoveToAreaOption[];
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
        areaId,
        areas,
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
  const [now] = useState(() => Date.now());
  const pageId = id as Id<"pages">;
  const isTask = supportsTaskData(data.kind);
  const meta = pageKindMeta(data.kind);
  const kindLabel =
    data.kind === "file" ? fileKindLabel(data.fileCategory) : meta.label;
  const KindIcon = meta.icon;
  const title = data.title || "Bez naslova";
  const canResize = data.canResize && !data.pendingNesting;
  const hasCheckpoints = isTask && data.checkpointTotal > 0;
  // Kanvas govori isti jezik hitnosti kao liste i tabele, ali zadržava svoju
  // orbitalnu geometriju: boja i ikona se menjaju samo kad rok gori.
  const deadline = classifyDeadline({
    dueDate: data.dueDate,
    taskStatus: data.taskStatus,
    now,
  });
  const dueDateLabel = deadlineLabel(deadline, data.dueDate);
  const dueDateAriaLabel = deadlineAriaLabel(deadline, data.dueDate);
  const dueIsOverdue = deadline.urgency === "overdue";
  const DueIcon = dueIsOverdue ? Flame : CalendarDays;
  const dueDateStyle = dueIsOverdue
    ? { color: "color-mix(in oklab, var(--destructive) 85%, var(--foreground))" }
    : undefined;
  const updatedAtLabel = new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "2-digit",
    month: "short",
  }).format(data.updatedAt);
  const assigneeLabel = assigneeStackLabel(data.assignees);

  return (
    <article
      data-circular-text-shell
      className={cn(
        orbital.shell,
        meta.shape === "rounded" && orbital.taskShell,
        styles[meta.accentToken],
        data.pendingNesting && styles.amber,
        data.nestingTarget && orbital.nestingTarget,
        (!data.canMove || data.pendingNesting) && "nodrag !cursor-default",
        selected && orbital.selected,
      )}
      aria-label={`${kindLabel}: ${title}. ${data.text}${
        isTask
          ? `. Dodeljeno: ${assigneeLabel}. ${dueDateAriaLabel}`
          : ""
      }${
        data.kind === "file" ? `. ${data.fileCount} priloga` : ""
      }${
        data.kind === "table"
          ? `. ${data.tableRowCount} redova, ${data.tableColumnCount} kolona`
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
      {data.kind === "file" && data.filePreviewUrl !== null ? (
        // Slika se namerno ne vidi cela — ona je nagoveštaj sadržaja, a ceo
        // prikaz otvara modal iz toolbar-a ili duplim klikom.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.filePreviewUrl}
          alt=""
          aria-hidden="true"
          className={orbital.filePreview}
        />
      ) : null}
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
        shape={meta.shape}
        minWidth={240}
        minHeight={168}
        maxWidth={720}
        maxHeight={1_000}
        ariaLabel={`Promeni veličinu — ${kindLabel} ${title} — povlačenjem oboda`}
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
              {data.canMove && actions.areas.length > 1 ? (
                <MoveToAreaMenu
                  startupId={actions.startupId}
                  pageId={pageId}
                  pageTitle={title}
                  currentAreaId={actions.areaId}
                  areas={actions.areas}
                  className="border-0 shadow-none"
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
        <KindIcon className="size-3.5" />
        <span className="text-[0.625rem] font-extrabold">{kindLabel}</span>
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
              {data.assignees.length === 0 ? (
                <>
                  <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>{assigneeLabel}</span>
                </>
              ) : (
                <>
                  <span className="flex shrink-0 items-center -space-x-1">
                    {data.assignees.slice(0, 3).map((assignee, index) => (
                      <ProfileAvatar
                        key={`${assignee.displayName}-${index}`}
                        profile={assignee}
                        className="size-5 shrink-0 ring-1 ring-background"
                      />
                    ))}
                  </span>
                  <span>
                    {data.assignees[0].displayName}
                    {data.assignees.length > 1
                      ? ` +${data.assignees.length - 1}`
                      : ""}
                  </span>
                </>
              )}
            </span>
          </div>
        ) : data.kind === "file" ? (
          <span className="flex items-center gap-1.5 px-2 text-[0.625rem] font-bold text-muted-foreground">
            <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
            {data.fileCount === 0
              ? "Bez priloga"
              : `${data.fileCount} ${data.fileCount === 1 ? "fajl" : "fajlova"}`}
          </span>
        ) : data.kind === "table" ? (
          <span className="flex items-center gap-1.5 px-2 text-[0.625rem] font-bold tabular-nums text-muted-foreground">
            <Table2 className="size-3.5 shrink-0" aria-hidden="true" />
            {data.tableRowCount} × {data.tableColumnCount}
          </span>
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
            aria-label={dueDateAriaLabel}
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {dueDateLabel}
          </span>
        ) : (
          <time
            data-circular-text-obstacle
            className={cn(orbital.orbit, orbital.dateOrbit)}
            style={dueDateStyle}
            dateTime={new Date(data.dueDate).toISOString()}
            aria-label={dueDateAriaLabel}
          >
            <DueIcon className="size-3.5" aria-hidden="true" />
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
        ariaLabel={`Tekst — ${kindLabel} ${title}`}
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
