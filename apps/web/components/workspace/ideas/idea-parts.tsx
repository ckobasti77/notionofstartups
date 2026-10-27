"use client";

import { ArrowUpRight, MessageSquare, MoreHorizontal, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { IDEA_CONVERTED_REASON, IDEA_STAGE_LABELS, type IdeaStage, type IdeaStoredStage } from "@devotion/shared";

import { NumberRoll } from "@/components/motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { ideaCommentCount, ideaDropTargets, ideaTitle, voteButtonLabel, type IdeaModel, type IdeaVote } from "./ideas-model";

/** Vidljivo dugme naslova ideje (kartica na tabli ili red liste) — za vraćanje fokusa. */
export function ideaTitleElement(ideaId: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-idea-title="${CSS.escape(ideaId)}"]`));
  return candidates.find((element) => element.offsetParent !== null) ?? null;
}

/** Radnje nad idejom koje dele kartica, red liste i detalj (prezentacija zove, kontejner radi). */
export type IdeaActions = {
  onOpen: (ideaId: Id<"ideaNodes">) => void;
  onVote: (idea: IdeaModel, vote: IdeaVote) => void;
  onSetStage: (idea: IdeaModel, stage: IdeaStoredStage) => void;
  onConvert: (idea: IdeaModel) => void;
  onArchive: (idea: IdeaModel) => void;
};

/**
 * Za / Protiv (PROSTOR P6: svaki član glasa, glas je signal). Moj glas je
 * `bg-accent` + `aria-pressed`; broj se kotrlja (`NumberRoll`). Pretvorena
 * ideja se više ne glasa (dugmad onemogućena uz razlog).
 */
export function IdeaVoteButtons({
  idea,
  onVote,
  size = "sm",
  className,
}: {
  idea: Pick<IdeaModel, "title" | "text" | "upvotes" | "downvotes" | "myVote" | "permissions">;
  onVote: (vote: IdeaVote) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const disabled = !idea.permissions.canVote;
  const title = ideaTitle(idea);
  const button = cn(
    "inline-flex items-center gap-1 rounded-md border px-2 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-primary/50 aria-pressed:bg-primary/10 aria-pressed:text-foreground aria-pressed:[&_svg]:fill-current aria-pressed:[&_svg]:text-primary",
    size === "sm" ? "h-7 pointer-coarse:h-10" : "h-9 px-3 text-sm",
  );
  return (
    <div role="group" aria-label={`Glasovi za „${title}”`} className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        className={button}
        aria-pressed={idea.myVote === "up"}
        aria-label={voteButtonLabel("up", idea.upvotes)}
        title={disabled ? IDEA_CONVERTED_REASON : "Za"}
        disabled={disabled}
        onClick={() => onVote("up")}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
        <NumberRoll value={idea.upvotes} />
        {size === "md" ? <span>Za</span> : null}
      </button>
      <button
        type="button"
        className={button}
        aria-pressed={idea.myVote === "down"}
        aria-label={voteButtonLabel("down", idea.downvotes)}
        title={disabled ? IDEA_CONVERTED_REASON : "Protiv"}
        disabled={disabled}
        onClick={() => onVote("down")}
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
        <NumberRoll value={idea.downvotes} />
        {size === "md" ? <span>Protiv</span> : null}
      </button>
    </div>
  );
}

/** Faza kao mirna oznaka (bez boje — boja nije status ideje, PROSTOR P17). */
export function IdeaStageBadge({ stage, className }: { stage: IdeaStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-xs font-medium text-muted-foreground",
        stage === "odobreno" && "text-foreground",
        className,
      )}
    >
      {IDEA_STAGE_LABELS[stage]}
    </span>
  );
}

export function IdeaCommentCount({ idea, className }: { idea: Pick<IdeaModel, "commentCount" | "commentCountCapped">; className?: string }) {
  const label = ideaCommentCount(idea);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground", className)}>
      <MessageSquare className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{`Komentari: ${label}`}</span>
    </span>
  );
}

/**
 * Meni „…" kartice i reda: Otvori · Premesti u fazu (samo uz `canSetStage`,
 * ciljevi iz `stageTargets`) · Pretvori (samo uz `canConvert`) · Obriši.
 * Alternativa prevlačenju za tastaturu (K07 §5.9).
 */
export function IdeaMenu({ idea, actions, className }: { idea: IdeaModel; actions: IdeaActions; className?: string }) {
  const targets = ideaDropTargets(idea);
  const title = ideaTitle(idea);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-8 shrink-0 text-muted-foreground pointer-coarse:size-10", className)}
          aria-label={`Radnje za „${title}”`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => actions.onOpen(idea._id)}>
          <ArrowUpRight aria-hidden="true" /> Otvori
        </DropdownMenuItem>
        {targets.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Premesti u fazu</DropdownMenuLabel>
            {targets.map((stage) => (
              <DropdownMenuItem
                key={stage}
                onSelect={() => {
                  actions.onSetStage(idea, stage);
                  // Kartica se premešta u drugu kolonu (nov element): fokus ide za njom.
                  window.setTimeout(() => ideaTitleElement(idea._id)?.focus(), 80);
                }}
              >
                <span className="pl-6">{IDEA_STAGE_LABELS[stage]}</span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {idea.permissions.canConvert ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.onConvert(idea)}>
              <Sparkles aria-hidden="true" /> Pretvori u zadatak ili belešku
            </DropdownMenuItem>
          </>
        ) : null}
        {idea.permissions.canArchive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => actions.onArchive(idea)}>
              <Trash2 aria-hidden="true" /> Obriši
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
