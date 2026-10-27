"use client";

import { useId, type ReactNode } from "react";
import { ArrowUpRight, History, Lightbulb, MessageCircle, MoreHorizontal, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  IDEA_CONVERTED_REASON,
  IDEA_STAGE_CHANGE_REASON,
  IDEA_STAGE_LABELS,
  IDEA_STORED_STAGES,
  type IdeaStoredStage,
} from "@devotion/shared";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { IdeaStageBadge, IdeaVoteButtons, type IdeaActions } from "./idea-parts";
import {
  convertHint,
  IDEA_TEXT_MAX,
  IDEA_TITLE_MAX,
  ideaAuthorLine,
  ideaSaveStateText,
  ideaTitle,
  type IdeaModel,
  type IdeaSaveState,
} from "./ideas-model";

/** Zaglavlje fioke: faza kao oznaka, Istorija izmena i „…" (Diskusija u Porukama, Obriši). */
export function IdeaDetailHeader({
  idea,
  onOpenHistory,
  onArchive,
  discussionLabel,
  onDiscussion,
}: {
  idea: IdeaModel;
  onOpenHistory: () => void;
  onArchive: () => void;
  discussionLabel: string;
  onDiscussion: () => void;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <IdeaStageBadge stage={idea.stage} />
      <span className="flex-1" />
      <Button type="button" variant="ghost" size="sm" onClick={onOpenHistory}>
        <History aria-hidden="true" /> Istorija
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Još radnji za ideju">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onDiscussion}>
            <MessageCircle aria-hidden="true" /> {discussionLabel}
          </DropdownMenuItem>
          {idea.permissions.canArchive ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                <Trash2 aria-hidden="true" /> Obriši
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Detalj ideje (PROSTOR P16, K07 §5.9) — prezentacija: naslov i tekst menja
 * svaki član (čuva se sam), autor, Za/Protiv, faza (izbor samo kome je
 * dozvoljeno, inače razlog), „Pretvori u zadatak ili belešku" (samo u fazi
 * „Odobreno" i samo kome je dozvoljeno) i Komentari (`comments`).
 */
export function IdeaDetail({
  idea,
  now,
  draft,
  saveState,
  saveError,
  onDraftChange,
  onDraftBlur,
  onRetrySave,
  actions,
  onOpenConverted,
  comments,
}: {
  idea: IdeaModel;
  now: number;
  draft: { title: string; text: string };
  saveState: IdeaSaveState;
  saveError: string | null;
  onDraftChange: (patch: Partial<{ title: string; text: string }>) => void;
  onDraftBlur: () => void;
  onRetrySave: () => void;
  actions: Pick<IdeaActions, "onVote" | "onSetStage" | "onConvert">;
  onOpenConverted: (pageId: Id<"pages">) => void;
  comments: ReactNode;
}) {
  const titleId = useId();
  const textId = useId();
  const stageId = useId();
  const editable = idea.permissions.canEdit;
  const convert = convertHint(idea);
  const problem = saveState === "error" || saveState === "invalid";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor={titleId} className="sr-only">
          Naslov ideje
        </label>
        <input
          id={titleId}
          value={draft.title}
          readOnly={!editable}
          maxLength={IDEA_TITLE_MAX}
          placeholder="Naslov ideje"
          aria-invalid={saveState === "invalid" && !draft.title.trim() ? true : undefined}
          onChange={(event) => onDraftChange({ title: event.target.value })}
          onBlur={onDraftBlur}
          className="-mx-1 w-[calc(100%+0.5rem)] rounded-md bg-transparent px-1 py-0.5 text-lg font-semibold tracking-[-0.01em] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label htmlFor={textId} className="sr-only">
          Tekst ideje
        </label>
        <Textarea
          id={textId}
          value={draft.text}
          readOnly={!editable}
          maxLength={IDEA_TEXT_MAX}
          placeholder="Šta predlažeš i zašto?"
          aria-invalid={saveState === "invalid" && !draft.text.trim() ? true : undefined}
          onChange={(event) => onDraftChange({ text: event.target.value })}
          onBlur={onDraftBlur}
          className="field-sizing-content max-h-[50vh] min-h-20 resize-none border-transparent bg-transparent px-1 text-base leading-6 shadow-none md:text-sm hover:border-border focus-visible:border-ring"
        />
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{ideaAuthorLine(idea, now)}</span>
          {saveState !== "saved" ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={cn(problem && "text-destructive")}>{ideaSaveStateText(saveState, saveError)}</span>
            </>
          ) : null}
          {saveState === "error" ? (
            <Button type="button" variant="link" size="sm" className="h-6 px-0 text-xs" onClick={onRetrySave}>
              <RefreshCw aria-hidden="true" /> Pokušaj ponovo
            </Button>
          ) : null}
          {/* Čitaču ekrana se najavljuje samo problem, ne svako čuvanje. */}
          <span role="alert" className="sr-only">
            {problem ? ideaSaveStateText(saveState, saveError) : ""}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 text-sm">
        <dt className="pt-2 text-xs text-muted-foreground">Glasovi</dt>
        <dd>
          <IdeaVoteButtons idea={idea} size="md" onVote={(vote) => actions.onVote(idea, vote)} />
        </dd>
        <dt className="pt-2 text-xs text-muted-foreground">
          {idea.permissions.canSetStage ? <label htmlFor={stageId}>Faza</label> : "Faza"}
        </dt>
        <dd>
          {idea.permissions.canSetStage ? (
            <Select value={idea.storedStage} onValueChange={(value) => actions.onSetStage(idea, value as IdeaStoredStage)}>
              <SelectTrigger id={stageId} className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDEA_STORED_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {IDEA_STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-1 pt-1.5">
              <p>{IDEA_STAGE_LABELS[idea.stage]}</p>
              <p className="text-xs text-muted-foreground">
                {idea.convertedPageId !== null ? IDEA_CONVERTED_REASON : IDEA_STAGE_CHANGE_REASON}
              </p>
            </div>
          )}
        </dd>
        {idea.convertedPageId !== null ? (
          <>
            <dt className="pt-1.5 text-xs text-muted-foreground">Rezultat</dt>
            <dd>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 py-1"
                onClick={() => onOpenConverted(idea.convertedPageId as Id<"pages">)}
              >
                {IDEA_STAGE_LABELS.postalo_zadatak} <ArrowUpRight aria-hidden="true" />
              </Button>
            </dd>
          </>
        ) : null}
      </dl>

      {convert.kind === "button" ? (
        <Button type="button" onClick={() => actions.onConvert(idea)}>
          <Sparkles aria-hidden="true" /> Pretvori u zadatak ili belešku
        </Button>
      ) : convert.kind === "hint" ? (
        <p className="text-xs text-muted-foreground">{convert.text}</p>
      ) : null}

      {comments}
    </div>
  );
}

export function IdeaDetailSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje ideje" className="space-y-4">
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-9 w-48" />
    </div>
  );
}

/** Lista ideja nije stigla (greška servera ili veze). */
export function IdeaDetailError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-8 text-center">
      <h2 className="text-sm font-semibold">Ideja nije učitana.</h2>
      <Button type="button" variant="outline" className="mt-4" onClick={retry}>
        <RefreshCw aria-hidden="true" /> Pokušaj ponovo
      </Button>
    </div>
  );
}

/** Ideja ne postoji u ovom startupu (obrisana u Korpu ili tuđ link). */
export function IdeaDetailMissing({ onOpenTrash, onClose }: { onOpenTrash: () => void; onClose: () => void }) {
  return (
    <EmptyState
      icon={Lightbulb}
      headingAs="h2"
      title="Ideja više nije ovde."
      description="Možda je u Korpi ili pripada drugom startupu."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={onOpenTrash}>
            Otvori Korpu
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Zatvori
          </Button>
        </div>
      }
    />
  );
}

/** Naslov fioke za čitač ekrana. */
export function ideaDrawerTitle(idea: IdeaModel | null): string {
  return idea ? ideaTitle(idea) : "Ideja";
}
