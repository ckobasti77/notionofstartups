"use client";

import { CommentComposer } from "@/components/collab/comment-composer";
import { CommentList, type CommentListState } from "@/components/collab/comment-list";
import { CommentsPanel } from "@/components/collab/comments-section";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";
import { IZLOG_COMMENTS, IZLOG_DOC_MEMBERS, IZLOG_DOC_SELF } from "../fixtures/page-document";

const noop = () => {};
const asyncNoop = async () => {};

/**
 * Komentari (K10, K07 §6.1): lista sa pominjanjem i ranijim tekstom tima,
 * otvorena lista za @, izmena svog komentara u mestu, prazno, greška i
 * učitavanje. Isti `CommentsPanel` / `CommentList` / `CommentComposer` kao u
 * aplikaciji.
 */
export default function KomentariEkran({ varijanta }: IzlogEkranProps) {
  const state: CommentListState =
    varijanta === "ucitavanje"
      ? { status: "loading" }
      : varijanta === "greska"
        ? { status: "error", onRetry: noop }
        : { status: "ready", items: varijanta === "prazno" ? [] : IZLOG_COMMENTS, loadMore: null };
  const own = IZLOG_COMMENTS.find((comment) => comment.author?._id === IZLOG_DOC_SELF);
  const count =
    state.status === "ready" ? String(state.items.length) : null;

  return (
    <div className="app-canvas desk-surface overflow-hidden rounded-2xl border bg-background">
      <div className="mx-auto w-full max-w-[46rem] px-4 pb-16 pt-6 sm:px-6">
        <CommentsPanel
          headingId="izlog-komentari"
          count={count === "0" ? null : count}
          composer={
            <CommentComposer
              key={varijanta}
              members={IZLOG_DOC_MEMBERS}
              selfProfileId={IZLOG_DOC_SELF}
              onSubmit={asyncNoop}
              initial={varijanta === "pominjanje" ? { text: "Pitaj @an", mentions: [] } : undefined}
              previewQuery={varijanta === "pominjanje" ? "an" : undefined}
            />
          }
        >
          <CommentList
            state={state}
            now={IZLOG_NOW}
            members={IZLOG_DOC_MEMBERS}
            selfProfileId={IZLOG_DOC_SELF}
            editingId={varijanta === "izmena" ? (own?._id ?? null) : null}
            onStartEdit={noop}
            onCancelEdit={noop}
            onSaveEdit={asyncNoop}
            onRemove={noop}
            animateArrivals={false}
          />
        </CommentsPanel>
      </div>
    </div>
  );
}
