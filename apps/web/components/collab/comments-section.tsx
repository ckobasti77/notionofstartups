"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { toast } from "sonner";

import { SectionHeading } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { CommentComposer, type CommentPayload, type MentionMember } from "./comment-composer";
import { CommentList, type CommentItem } from "./comment-list";

export type CommentTarget = FunctionArgs<typeof api.comments.list>["target"];

/** Komentara po strani (lista je rastuća; „Učitaj još" na dnu donosi novije). */
const COMMENTS_PAGE = 20;

export type CommentsCount = { count: number; capped: boolean };

/**
 * Komentari stavke — kontejner (PROSTOR P5, K07 §6.1) nad `comments.list/add/
 * update/remove/restore`. Lista ima svoju granicu greške („Pokušaj ponovo"
 * ponovo montira upit); unos radi i kad lista padne. Uklanjanje nudi
 * „Poništi" dok traje rok servera (`undoUntil`).
 */
export function CommentsSection({
  target,
  members,
  selfProfileId,
  now,
  headingId,
  onCountChange,
  className,
}: {
  target: CommentTarget;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  now: number;
  headingId?: string;
  onCountChange?: (count: CommentsCount | null) => void;
  className?: string;
}) {
  const add = useMutation(api.comments.add);
  const [attempt, setAttempt] = useState(0);
  const [count, setCount] = useState<CommentsCount | null>(null);
  // Uvećava se posle slanja: lista učita do kraja i pokaže nov komentar.
  const [revealSignal, setRevealSignal] = useState(0);
  const targetKey = `${target.kind}:${target.id}`;

  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  // Greška slanja se prikazuje u polju (tekst ostaje), bez dodatnog toasta.
  async function submit(payload: CommentPayload) {
    await add({
      target,
      content: payload.content,
      mentionProfileIds: payload.mentionProfileIds as Array<Id<"profiles">>,
    });
    setRevealSignal((value) => value + 1);
  }

  return (
    <CommentsPanel
      headingId={headingId}
      className={className}
      count={count === null ? null : `${count.count}${count.capped ? "+" : ""}`}
      composer={<CommentComposer members={members} selfProfileId={selfProfileId} onSubmit={submit} />}
    >
      <CommentsBoundary
        key={`${targetKey}:${attempt}`}
        onRetry={() => setAttempt((value) => value + 1)}
        onError={() => setCount(null)}
      >
        <CommentsLoader
          target={target}
          members={members}
          selfProfileId={selfProfileId}
          now={now}
          onCount={setCount}
          revealSignal={revealSignal}
        />
      </CommentsBoundary>
    </CommentsPanel>
  );
}

/** Sekcija „Komentari" — prezentacija: naslov sa brojem, lista (`children`) i unos. */
export function CommentsPanel({
  headingId,
  count,
  children,
  composer,
  className,
}: {
  headingId?: string;
  count: string | null;
  children: ReactNode;
  composer: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={headingId} className={cn("scroll-mt-20", className)}>
      <SectionHeading id={headingId} title="Komentari" count={count} />
      {children}
      <div className="mt-3">{composer}</div>
    </section>
  );
}

function CommentsLoader({
  target,
  members,
  selfProfileId,
  now,
  onCount,
  revealSignal,
}: {
  target: CommentTarget;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  now: number;
  onCount: (count: CommentsCount | null) => void;
  revealSignal: number;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.comments.list,
    { target },
    { initialNumItems: COMMENTS_PAGE },
  );
  const update = useMutation(api.comments.update);
  const remove = useMutation(api.comments.remove);
  const restore = useMutation(api.comments.restore);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loading = status === "LoadingFirstPage";
  const hasMore = status === "CanLoadMore" || status === "LoadingMore";
  useEffect(() => {
    onCount(loading ? null : { count: results.length, capped: hasMore });
  }, [hasMore, loading, onCount, results.length]);

  // Lista je rastuća: nov komentar je na kraju, iza „Učitaj još". Posle slanja
  // se učita ostatak (po 50) i poslednji komentar se dovede u vidno polje.
  const revealedRef = useRef(revealSignal);
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (revealSignal === revealedRef.current) return;
    if (status === "CanLoadMore") {
      loadMore(50);
      return;
    }
    if (status !== "Exhausted") return;
    revealedRef.current = revealSignal;
    sectionRef.current
      ?.querySelector("[data-comment-id]:last-of-type")
      ?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [loadMore, results.length, revealSignal, status]);

  async function saveEdit(comment: CommentItem, payload: CommentPayload) {
    try {
      await update({
        commentId: comment._id,
        content: payload.content,
        mentionProfileIds: payload.mentionProfileIds as Array<Id<"profiles">>,
      });
      setEditingId(null);
    } catch (error) {
      // Poruka je u polju izmene; tekst ostaje.
      throw error;
    }
  }

  function removeComment(comment: CommentItem) {
    void remove({ commentId: comment._id })
      .then(({ undoUntil }) => {
        toast.success("Komentar je uklonjen.", {
          duration: Math.max(2_000, undoUntil - Date.now()),
          action: {
            label: "Poništi",
            onClick: () =>
              void restore({ commentId: comment._id }).catch((error: unknown) =>
                toast.error(accessErrorMessage(error, "Komentar nije vraćen.")),
              ),
          },
        });
      })
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Komentar nije uklonjen.")));
  }

  return (
    <div ref={sectionRef}>
    <CommentList
      state={
        loading
          ? { status: "loading" }
          : {
              status: "ready",
              items: results,
              loadMore: hasMore
                ? { busy: status === "LoadingMore", onLoad: () => loadMore(COMMENTS_PAGE) }
                : null,
            }
      }
      now={now}
      members={members}
      selfProfileId={selfProfileId}
      editingId={editingId}
      onStartEdit={(comment) => setEditingId(comment._id)}
      onCancelEdit={() => setEditingId(null)}
      onSaveEdit={saveEdit}
      onRemove={removeComment}
    />
    </div>
  );
}

/** Pad liste komentara ne obara stranicu: poruka i „Pokušaj ponovo" u bloku. */
class CommentsBoundary extends Component<
  { children: ReactNode; onRetry: () => void; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <CommentList
        state={{ status: "error", onRetry: this.props.onRetry }}
        now={0}
        members={[]}
        selfProfileId={null}
        editingId={null}
        onStartEdit={() => {}}
        onCancelEdit={() => {}}
        onSaveEdit={async () => {}}
        onRemove={() => {}}
      />
    );
  }
}
