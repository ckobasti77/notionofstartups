"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { Crown, ExternalLink, Pencil, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import styles from "./thoughts-canvas.module.css";
import type { ThoughtFlowNode } from "./types";

type ThoughtNodeActions = {
  connectedNodeIds: ReadonlySet<string>;
  edit: (nodeId: Id<"thoughtNodes">) => void;
  toggleParent: (nodeId: Id<"thoughtNodes">) => void;
  send: (nodeIds: Id<"thoughtNodes">[]) => void;
  openIdeas: () => void;
  openPage: (pageId: Id<"pages">) => void;
};

const ThoughtNodeActionsContext = createContext<ThoughtNodeActions | null>(null);

export function ThoughtNodeActionsProvider({
  actions,
  children,
}: {
  actions: ThoughtNodeActions;
  children: ReactNode;
}) {
  return (
    <ThoughtNodeActionsContext.Provider value={actions}>
      {children}
    </ThoughtNodeActionsContext.Provider>
  );
}

const SHAPES = [
  "42% 58% 52% 48% / 46% 44% 56% 54%",
  "55% 45% 43% 57% / 48% 58% 42% 52%",
  "48% 52% 58% 42% / 57% 43% 54% 46%",
  "58% 42% 49% 51% / 43% 55% 45% 57%",
] as const;

function hashId(id: string) {
  let value = 0;
  for (let index = 0; index < id.length; index += 1) {
    value = (value * 31 + id.charCodeAt(index)) >>> 0;
  }
  return value;
}

export function ThoughtNode({ id, data, selected }: NodeProps<ThoughtFlowNode>) {
  const actions = useContext(ThoughtNodeActionsContext);
  const shape = useMemo(() => SHAPES[hashId(id) % SHAPES.length], [id]);
  const connected = actions?.connectedNodeIds.has(id) ?? false;
  const nodeId = id as Id<"thoughtNodes">;
  const isParent = data.isParent ?? false;

  return (
    <article
      className={cn(
        isParent ? styles.parentBox : styles.cloud,
        styles[data.color],
        selected && styles.cloudSelected,
        connected && !selected && styles.cloudConnected,
      )}
      style={{ borderRadius: isParent ? "1rem" : shape }}
      aria-label={`${isParent ? "Roditeljska misao" : "Misao"}: ${data.title ?? ""}. ${data.text}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions?.edit(nodeId);
      }}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <div className="nodrag flex items-center gap-1 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur-sm">
          <Button
            type="button"
            size="icon"
            variant={isParent ? "default" : "ghost"}
            className="size-11 sm:size-8"
            aria-label={isParent ? "Ukloni status glavne misli" : "Postavi kao glavnu (Parent) misao"}
            title={isParent ? "Ukloni status glavne misli" : "Postavi kao glavnu (Parent) misao"}
            onClick={() => actions?.toggleParent(nodeId)}
          >
            <Crown className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 sm:size-8"
            aria-label="Uredi misao"
            onClick={() => actions?.edit(nodeId)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 sm:size-8"
            aria-label="Pošalji misao u Ideje"
            onClick={() => actions?.send([nodeId])}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </NodeToolbar>

      <Handle
        type="target"
        position={Position.Left}
        className={styles.handle}
        aria-label="Ulazna veza"
      />
      <div className="flex min-h-[8.75rem] flex-col px-6 py-5">
        {isParent ? (
          <span className="mb-1.5 inline-flex w-fit items-center gap-1.5 rounded-md bg-primary/15 px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wider text-primary">
            <Crown className="size-3" /> Parent misao
          </span>
        ) : null}
        {data.title ? (
          <h3 className="line-clamp-2 text-sm font-bold tracking-[-0.02em] text-foreground">
            {data.title}
          </h3>
        ) : !isParent ? (
          <span className="mb-1 inline-flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <Sparkles className="size-3" /> Misao
          </span>
        ) : null}
        <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-[0.8125rem] leading-[1.55] text-foreground/82">
          {data.text}
        </p>
        {data.conversionCount > 0 && data.lastConvertedIdeaId ? (
          <button
            type="button"
            className="nodrag mt-auto inline-flex w-fit items-center gap-1.5 pt-3 text-[0.6875rem] font-semibold text-primary hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              actions?.openIdeas();
            }}
          >
            Poslato u Ideje {data.conversionCount > 1 ? `${data.conversionCount}×` : ""}
            <ExternalLink className="size-3" />
          </button>
        ) : data.conversionCount > 0 && data.lastConvertedPageId ? (
          <button
            type="button"
            className="nodrag mt-auto inline-flex w-fit items-center gap-1.5 pt-3 text-[0.6875rem] font-semibold text-primary hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              actions?.openPage(data.lastConvertedPageId!);
            }}
          >
            Pretvoreno {data.conversionCount > 1 ? `${data.conversionCount}×` : ""}
            <ExternalLink className="size-3" />
          </button>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className={styles.handle}
        aria-label="Izlazna veza"
      />
    </article>
  );
}
