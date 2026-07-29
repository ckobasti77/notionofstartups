"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import {
  CalendarDays,
  Crown,
  ExternalLink,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CircularTextFlow } from "@/components/workspace/canvases/circular-text-flow";
import orbital from "@/components/workspace/canvases/orbital-node.module.css";
import { PerimeterResizeControl } from "@/components/workspace/canvases/perimeter-resize-control";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
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
  resize: (nodeId: Id<"thoughtNodes">, layout: ResizeParams) => void;
  resetSize: (nodeId: Id<"thoughtNodes">) => void;
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

export function ThoughtNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<ThoughtFlowNode>) {
  const actions = useContext(ThoughtNodeActionsContext);
  const connected = actions?.connectedNodeIds.has(id) ?? false;
  const nodeId = id as Id<"thoughtNodes">;
  const isParent = data.isParent ?? false;
  const conversionLabel = data.lastConvertedIdeaId
    ? "Poslato u Ideje"
    : data.lastConvertedPageId
      ? "Pretvoreno"
      : "Privatno";

  return (
    <article
      className={cn(
        orbital.shell,
        styles[data.color],
        selected && orbital.selected,
        connected && !selected && styles.cloudConnected,
      )}
      style={{ "--node-accent": "var(--cloud-accent)" } as CSSProperties}
      aria-label={`Misao: ${data.title ?? "Bez naslova"}. ${data.text}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions?.edit(nodeId);
      }}
    >
      <div className={orbital.surface} aria-hidden="true" />

      <PerimeterResizeControl<ThoughtFlowNode>
        nodeId={id}
        width={width ?? 240}
        height={height ?? 160}
        selected={selected}
        shape="organic"
        minWidth={240}
        minHeight={160}
        maxWidth={720}
        maxHeight={1_000}
        ariaLabel={`Promeni veličinu misli ${data.title ?? "Bez naslova"} povlačenjem oboda`}
        onResizeEnd={(layout) => actions?.resize(nodeId, layout)}
      />

      <NodeToolbar isVisible={selected} position={Position.Top} offset={24}>
        <div className={cn(orbital.toolbar, "nodrag flex items-center gap-1 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur")}>
          <Button
            type="button"
            size="icon"
            variant={isParent ? "default" : "ghost"}
            className="size-11 sm:size-8"
            aria-label={isParent ? "Ukloni status glavne misli" : "Postavi kao glavnu misao"}
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
            aria-label="Vrati početnu veličinu misli"
            onClick={() => actions?.resetSize(nodeId)}
          >
            <RotateCcw className="size-3.5" />
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

      <div className={cn(orbital.orbit, orbital.titleOrbit)}>
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

      <div className={cn(orbital.orbit, orbital.statusOrbit, isParent ? "text-primary" : "text-muted-foreground")}>
        {isParent ? <Crown className="size-3.5" /> : <Sparkles className="size-3.5" />}
        <span className="text-[0.625rem] font-extrabold">
          {isParent ? "Glavna misao" : "Moja misao"}
        </span>
      </div>

      <div className={cn(orbital.orbit, orbital.actionOrbit)}>
        {data.conversionCount > 0 && data.lastConvertedIdeaId ? (
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[0.6875rem] font-bold text-primary hover:bg-primary/10"
            onClick={(event) => {
              event.stopPropagation();
              actions?.openIdeas();
            }}
          >
            {conversionLabel} {data.conversionCount > 1 ? `${data.conversionCount}×` : ""}
            <ExternalLink className="size-3" />
          </button>
        ) : data.conversionCount > 0 && data.lastConvertedPageId ? (
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[0.6875rem] font-bold text-primary hover:bg-primary/10"
            onClick={(event) => {
              event.stopPropagation();
              actions?.openPage(data.lastConvertedPageId!);
            }}
          >
            {conversionLabel} {data.conversionCount > 1 ? `${data.conversionCount}×` : ""}
            <ExternalLink className="size-3" />
          </button>
        ) : (
          <span className="px-2 text-[0.625rem] font-bold text-muted-foreground">
            {conversionLabel}
          </span>
        )}
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
        ariaLabel={`Tekst misli ${data.title ?? "Bez naslova"}`}
      />

      <Handle
        type="target"
        position={Position.Left}
        className={cn(styles.handle, orbital.handle)}
        aria-label="Ulazna veza"
      />
      <Handle
        type="source"
        position={Position.Right}
        className={cn(styles.handle, orbital.handle)}
        aria-label="Izlazna veza"
      />
    </article>
  );
}
