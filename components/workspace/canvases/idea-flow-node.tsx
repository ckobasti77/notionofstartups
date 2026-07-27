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
  CalendarDays,
  Check,
  FolderInput,
  GitBranchPlus,
  Lightbulb,
  Pencil,
  RotateCcw,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  Ungroup,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { IdeaInlineThread } from "@/components/workspace/idea-discussion-dialog";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { CircularTextFlow } from "./circular-text-flow";
import styles from "./connected-canvas.module.css";
import orbital from "./orbital-node.module.css";

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
  pendingDeletion: boolean;
  canEdit: boolean;
  canResize: boolean;
  canDeleteDirectly: boolean;
  canRequestDeletion: boolean;
  canDetach: boolean;
  nestingModerationStatus: "pending" | "rejected" | null;
  canModerateNesting: boolean;
};

export type IdeaFlowNode = Node<IdeaCanvasNodeData, "idea">;

type IdeaNodeActions = {
  vote: (ideaId: Id<"ideaNodes">, voteType: "up" | "down") => void;
  convert: (ideaId: Id<"ideaNodes">) => void;
  branch: (ideaId: Id<"ideaNodes">) => void;
  edit: (ideaId: Id<"ideaNodes">) => void;
  resize: (ideaId: Id<"ideaNodes">, layout: ResizeParams) => void;
  resetSize: (ideaId: Id<"ideaNodes">) => void;
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
  const status = data.nestingModerationStatus === "pending"
    ? "Čeka odobrenje"
    : data.nestingModerationStatus === "rejected"
      ? "Odbijeno ugnježdenje"
      : data.pendingDeletion
    ? "Glasanje o brisanju"
    : data.convertedPageId
      ? "Pretvoreno"
      : data.isApproved
        ? "Odobreno"
        : "Ideja";

  return (
    <article
      className={cn(
        orbital.shell,
        styles[data.color],
        selected && orbital.selected,
      )}
      aria-label={`Ideja: ${data.title ?? "Bez naslova"}. ${data.text}`}
    >
      <div className={orbital.surface} aria-hidden="true" />

      <NodeResizer
        isVisible={selected && data.canResize}
        minWidth={264}
        minHeight={196}
        maxWidth={720}
        maxHeight={1000}
        handleClassName={cn(styles.resizeHandle, orbital.resizeControl)}
        lineClassName={styles.resizeLine}
        onResizeEnd={(_event, layout) => actions?.resize(ideaId, layout)}
      />

      <NodeToolbar isVisible={selected} position={Position.Top} offset={24}>
        <div className={cn(orbital.toolbar, "nodrag flex items-center gap-1 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur")}>
          {data.canEdit ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                onClick={() => actions?.edit(ideaId)}
              >
                <Pencil className="size-3.5" /> Uredi
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 rounded-lg"
                aria-label="Vrati početnu veličinu ideje"
                title="Vrati početnu veličinu"
                onClick={() => actions?.resetSize(ideaId)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
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

      <div className={cn(orbital.orbit, orbital.titleOrbit)} title={data.title ?? "Bez naslova"}>
        {data.title ?? "Bez naslova"}
      </div>

      <div className={cn(orbital.orbit, orbital.founderOrbit)}>
        <ProfileAvatar
          profile={{
            displayName: data.authorName,
            avatarUrl: data.authorAvatarUrl,
          }}
          className="size-7 shrink-0 ring-2 ring-background"
        />
        <span className={orbital.founderLabel}>
          <span className={orbital.founderEyebrow}>Osnivač</span>
          <span className={orbital.founderName}>{data.authorName}</span>
        </span>
      </div>

      <div
        className={cn(
          orbital.orbit,
          orbital.statusOrbit,
          data.nestingModerationStatus === "rejected" || data.pendingDeletion
            ? "text-rose-700 dark:text-rose-300"
            : data.nestingModerationStatus === "pending"
              ? "text-amber-700 dark:text-amber-300"
            : data.isApproved || data.convertedPageId
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-muted-foreground",
        )}
      >
        {data.isApproved || data.convertedPageId ? (
          <Check className="size-3.5" />
        ) : (
          <Lightbulb className="size-3.5" />
        )}
        <span className="text-[0.625rem] font-extrabold">{status}</span>
      </div>

      <div className={cn(orbital.orbit, orbital.actionOrbit)}>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs font-bold transition-colors",
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
            "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs font-bold transition-colors",
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

      <time
        className={cn(orbital.orbit, orbital.dateOrbit)}
        dateTime={new Date(data.createdAt).toISOString()}
      >
        <CalendarDays className="size-3.5" />
        {new Intl.DateTimeFormat("sr-Latn-RS", {
          day: "2-digit",
          month: "short",
        }).format(data.createdAt)}
      </time>

      <CircularTextFlow
        text={data.text}
        ariaLabel={`Tekst ideje ${data.title ?? "Bez naslova"}`}
      >
        <IdeaInlineThread
          ideaId={ideaId}
          canAdd={!data.canEdit}
          compact
        />
      </CircularTextFlow>

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={cn(styles.handle, orbital.handle)}
        aria-label="Leva tačka za povezivanje ideje"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={cn(styles.handle, orbital.handle)}
        aria-label="Desna tačka za povezivanje ideje"
      />
    </article>
  );
});
