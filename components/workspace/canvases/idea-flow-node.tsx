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
  ArrowRight,
  Check,
  GitBranchPlus,
  FolderInput,
  Lightbulb,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Pencil,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  Ungroup,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import styles from "./connected-canvas.module.css";

export type IdeaCanvasColor =
  | "neutral"
  | "violet"
  | "blue"
  | "green"
  | "amber"
  | "rose";

export type IdeaCanvasNodeData = {
  title: string | null;
  text: string;
  color: IdeaCanvasColor;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: number;
  upvotes: number;
  downvotes: number;
  userVote: "up" | "down" | null;
  isApproved: boolean;
  convertedPageId: Id<"pages"> | null;
  isExpanded: boolean;
  contributionCount: number;
  pendingDeletion: boolean;
  canEdit: boolean;
  canResize: boolean;
  canDeleteDirectly: boolean;
  canRequestDeletion: boolean;
  canDetach: boolean;
};

export type IdeaFlowNode = Node<IdeaCanvasNodeData, "idea">;

type IdeaNodeActions = {
  vote: (ideaId: Id<"ideaNodes">, voteType: "up" | "down") => void;
  convert: (ideaId: Id<"ideaNodes">) => void;
  branch: (ideaId: Id<"ideaNodes">) => void;
  edit: (ideaId: Id<"ideaNodes">) => void;
  resize: (ideaId: Id<"ideaNodes">, layout: ResizeParams) => void;
  discuss: (ideaId: Id<"ideaNodes">) => void;
  nest: (ideaId: Id<"ideaNodes">) => void;
  detach: (ideaId: Id<"ideaNodes">) => void;
  remove: (ideaId: Id<"ideaNodes">) => void;
};

const IdeaNodeActionsContext = createContext<IdeaNodeActions | null>(null);

export function IdeaNodeActionsProvider({
  actions,
  children,
}: {
  actions: IdeaNodeActions;
  children: ReactNode;
}) {
  return (
    <IdeaNodeActionsContext.Provider value={actions}>
      {children}
    </IdeaNodeActionsContext.Provider>
  );
}

export const IdeaFlowNodeCard = memo(function IdeaFlowNodeCard({
  id,
  data,
  selected,
}: NodeProps<IdeaFlowNode>) {
  const actions = useContext(IdeaNodeActionsContext);
  const ideaId = id as Id<"ideaNodes">;

  return (
    <article
      className={cn(
        styles.node,
        styles.ideaNode,
        styles[data.color],
        selected && styles.nodeSelected,
      )}
      aria-label={`Ideja: ${data.title ?? data.text}`}
    >
      <NodeResizer
        isVisible={selected && !data.isExpanded && data.canResize}
        minWidth={264}
        minHeight={196}
        maxWidth={720}
        maxHeight={1000}
        handleClassName={styles.resizeHandle}
        lineClassName={styles.resizeLine}
        onResizeEnd={(_event, layout) => actions?.resize(ideaId, layout)}
      />
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <div className="nodrag flex items-center gap-1 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur">
          {data.canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              onClick={() => actions?.edit(ideaId)}
            >
              <Pencil className="size-3.5" /> Uredi moje
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
            onClick={() => actions?.discuss(ideaId)}
          >
            <MessageSquareText className="size-3.5" /> Doprinosi
          </Button>
          {data.canEdit ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                onClick={() => actions?.branch(ideaId)}
              >
                <GitBranchPlus className="size-3.5" /> Grana
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                onClick={() => actions?.nest(ideaId)}
              >
                <FolderInput className="size-3.5" /> Ubaci u…
              </Button>
            </>
          ) : null}
          {data.canDetach ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              onClick={() => actions?.detach(ideaId)}
            >
              <Ungroup className="size-3.5" /> Izvuci
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs text-rose-600"
            onClick={() => actions?.remove(ideaId)}
          >
            <Trash2 className="size-3.5" />
            {data.canDeleteDirectly ? "Obriši" : "Zatraži brisanje"}
          </Button>
          {data.isApproved && !data.convertedPageId ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
              onClick={() => actions?.convert(ideaId)}
            >
              Pretvori <ArrowRight className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </NodeToolbar>

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={styles.handle}
        aria-label="Leva tačka za povezivanje ideje"
      />

      <div className="flex h-full min-h-0 flex-col px-7 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ProfileAvatar
              profile={{
                displayName: data.authorName,
                avatarUrl: data.authorAvatarUrl,
              }}
              className="size-7 ring-2 ring-background"
            />
            <span className="truncate text-[0.6875rem] font-semibold text-muted-foreground">
              {data.authorName}
            </span>
          </div>
          {data.pendingDeletion ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/13 px-2 py-1 text-[0.625rem] font-bold text-rose-600 dark:text-rose-300">
              Glasanje o brisanju
            </span>
          ) : data.convertedPageId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-1 text-[0.625rem] font-bold text-primary">
              <Check className="size-3" /> Pretvoreno
            </span>
          ) : data.isApproved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/13 px-2 py-1 text-[0.625rem] font-bold text-emerald-600 dark:text-emerald-400">
              <Check className="size-3" /> Odobreno
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Lightbulb className="size-3" /> Ideja
            </span>
          )}
        </div>

        {data.title ? (
          <h3 className={cn(
            "mt-4 text-[0.95rem] font-bold tracking-[-0.02em]",
            data.isExpanded ? "line-clamp-none" : "line-clamp-2",
          )}>
            {data.title}
          </h3>
        ) : null}
        <p className={cn(
          "min-h-0 whitespace-pre-wrap text-[0.8125rem] leading-[1.55] text-foreground/80",
          data.isExpanded
            ? "nodrag nowheel line-clamp-none overflow-y-auto pr-1 scrollbar-thin"
            : "line-clamp-4",
          data.title ? "mt-1" : "mt-4 font-semibold",
        )}>
          {data.text}
        </p>

        <div className="nodrag mt-auto flex items-center justify-between pt-4">
          <div className="flex items-center gap-1 rounded-xl bg-background/55 p-1">
            <button
              type="button"
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors",
                data.userVote === "up"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label={`Glasaj za. Trenutno ${data.upvotes}`}
              onClick={() => actions?.vote(ideaId, "up")}
            >
              <ThumbsUp className="size-3.5" /> {data.upvotes}
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors",
                data.userVote === "down"
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label={`Glasaj protiv. Trenutno ${data.downvotes}`}
              onClick={() => actions?.vote(ideaId, "down")}
            >
              <ThumbsDown className="size-3.5" /> {data.downvotes}
            </button>
          </div>
          <div className="flex items-center gap-1">
            {data.contributionCount > 1 ? (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[0.625rem] font-semibold text-primary hover:bg-primary/10"
                onClick={() => actions?.discuss(ideaId)}
              >
                {data.contributionCount} doprinosa
              </button>
            ) : null}
            <time
              className="text-[0.625rem] font-medium text-muted-foreground"
              dateTime={new Date(data.createdAt).toISOString()}
            >
              {new Date(data.createdAt).toLocaleDateString("sr-RS", {
                day: "2-digit",
                month: "short",
              })}
            </time>
            <button
              type="button"
              data-idea-expand
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={data.isExpanded ? "Smanji oblačić" : "Pročitaj celu ideju"}
              title={data.isExpanded ? "Smanji oblačić" : "Pročitaj celu ideju"}
            >
              {data.isExpanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={styles.handle}
        aria-label="Desna tačka za povezivanje ideje"
      />
    </article>
  );
});
