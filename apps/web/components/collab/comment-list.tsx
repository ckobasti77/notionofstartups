"use client";

import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { LoaderCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ENTER_OFFSET_PX, parseCommentSegments } from "@devotion/shared";
import type { FunctionReturnType } from "convex/server";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { api } from "@/convex/_generated/api";
import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";

import { commentAuthorName, commentMeta, commentToDraft } from "./collab-model";
import { CommentComposer, type CommentPayload, type MentionMember } from "./comment-composer";

export type CommentItem = FunctionReturnType<typeof api.comments.list>["page"][number];

export type CommentListState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | {
      status: "ready";
      items: ReadonlyArray<CommentItem>;
      loadMore: { busy: boolean; onLoad: () => void } | null;
    };

export type CommentListProps = {
  state: CommentListState;
  now: number;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  editingId: string | null;
  onStartEdit: (comment: CommentItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (comment: CommentItem, payload: CommentPayload) => Promise<void>;
  onRemove: (comment: CommentItem) => void;
  /** Nov komentar posle prvog punjenja ulazi kratkim pomakom nagore (K07 §8). */
  animateArrivals?: boolean;
};

/**
 * Lista komentara (K07 §6.1), najstariji gore. Sadržaj se crta isključivo kroz
 * `parseCommentSegments` (D18) — nikad kao HTML; pominjanje je naglašeno.
 * Radnje (Izmeni · Ukloni) su u „…" i vide se na hover/fokus.
 */
export function CommentList({
  state,
  now,
  members,
  selfProfileId,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  animateArrivals = true,
}: CommentListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Posle „Sačuvaj"/„Otkaži" polje nestaje — fokus se vraća na „…" tog komentara.
  const editedIdRef = useRef<string | null>(editingId);
  useEffect(() => {
    const previous = editedIdRef.current;
    editedIdRef.current = editingId;
    if (previous === null || editingId !== null) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(previous)}"] [data-comment-actions]`)
      ?.focus();
  }, [editingId]);
  const lastIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const play = useTweenSlots();
  const items = state.status === "ready" ? state.items : null;

  useLayoutEffect(() => {
    if (items === null) return;
    const last = items[items.length - 1];
    const previous = lastIdRef.current;
    const wasLoaded = loadedRef.current;
    lastIdRef.current = last?._id ?? null;
    loadedRef.current = true;
    if (!animateArrivals || !wasLoaded || !last || last._id === previous) return;
    const row = listRef.current?.lastElementChild;
    if (!(row instanceof HTMLElement)) return;
    play(`arrival:${last._id}`, ({ gsap, reduced }) => {
      if (reduced) {
        return gsap.fromTo(row, { opacity: 0 }, { opacity: 1, ...reducedFade(), clearProps: "opacity" });
      }
      return gsap
        .timeline()
        .fromTo(row, { opacity: 0 }, { opacity: 1, ...standardTween("quick"), clearProps: "opacity" }, 0)
        .fromTo(row, { y: ENTER_OFFSET_PX }, { y: 0, ...springTween("snappy"), clearProps: "transform" }, 0);
    });
  }, [items, animateArrivals, play]);

  if (state.status === "loading") {
    return (
      <div role="status" aria-label="Učitavanje komentara" className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex gap-3 px-2">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 px-2 py-2 text-sm">
        <p className="text-muted-foreground">Komentari nisu učitani.</p>
        <Button variant="outline" size="sm" onClick={state.onRetry}>
          Pokušaj ponovo
        </Button>
      </div>
    );
  }
  if (state.items.length === 0 && state.loadMore === null) {
    return <p className="px-2 py-2 text-sm text-muted-foreground">Još nema komentara.</p>;
  }

  return (
    <>
      <ul ref={listRef} className="space-y-1" aria-label="Komentari">
        {state.items.map((comment) => (
          <CommentRow
            key={comment._id}
            comment={comment}
            now={now}
            editing={editingId === comment._id}
            members={members}
            selfProfileId={selfProfileId}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSaveEdit={onSaveEdit}
            onRemove={onRemove}
          />
        ))}
      </ul>
      {state.loadMore ? (
        <div className="mt-2 px-2">
          <Button variant="outline" size="sm" disabled={state.loadMore.busy} onClick={state.loadMore.onLoad}>
            {state.loadMore.busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {state.loadMore.busy ? "Učitavam…" : "Učitaj još"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function CommentRow({
  comment,
  now,
  editing,
  members,
  selfProfileId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  comment: CommentItem;
  now: number;
  editing: boolean;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  onStartEdit: (comment: CommentItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (comment: CommentItem, payload: CommentPayload) => Promise<void>;
  onRemove: (comment: CommentItem) => void;
}) {
  const author = commentAuthorName(comment);
  const hasActions = comment.permissions.canEdit || comment.permissions.canRemove;
  return (
    <li
      data-comment-id={comment._id}
      className="group flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 focus-within:bg-muted/60"
    >
      <ProfileAvatar
        profile={{ displayName: author, avatarUrl: comment.author?.avatarUrl ?? null }}
        className="mt-0.5 size-6 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-xs leading-5">
            <span className="font-medium text-foreground">{author}</span>
            <span className="text-muted-foreground"> · {commentMeta(comment, now)}</span>
          </p>
          {hasActions && !editing ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(pointer:coarse)]:opacity-100"
                  aria-label={`Radnje komentara: ${author}`}
                  data-comment-actions=""
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {comment.permissions.canEdit ? (
                  <DropdownMenuItem onSelect={() => onStartEdit(comment)}>
                    <Pencil aria-hidden="true" /> Izmeni
                  </DropdownMenuItem>
                ) : null}
                {comment.permissions.canRemove ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => onRemove(comment)}>
                    <Trash2 aria-hidden="true" /> Ukloni
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {editing ? (
          <CommentComposer
            className="mt-1"
            members={members}
            selfProfileId={selfProfileId}
            initial={commentToDraft(comment.content)}
            label="Izmena komentara"
            submitLabel="Sačuvaj"
            failureMessage="Izmena nije sačuvana. Pokušaj ponovo."
            autoFocus
            onCancel={onCancelEdit}
            onSubmit={(payload) => onSaveEdit(comment, payload)}
          />
        ) : (
          <CommentBody content={comment.content} />
        )}
      </div>
    </li>
  );
}

/** Sadržaj komentara: tekst, pominjanja i prelomi — bez HTML-a (D18). */
export function CommentBody({ content }: { content: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
      {parseCommentSegments(content).map((segment, index) => (
        <Fragment key={index}>
          {segment.kind === "break" ? (
            <br />
          ) : segment.kind === "mention" ? (
            <span className="font-medium text-primary">{segment.label}</span>
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </p>
  );
}
