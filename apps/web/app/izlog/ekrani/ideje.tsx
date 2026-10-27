"use client";

import { useState } from "react";

import { CommentComposer } from "@/components/collab/comment-composer";
import { CommentList } from "@/components/collab/comment-list";
import { CommentsPanel } from "@/components/collab/comments-section";
import { Drawer } from "@/components/motion";
import { IdeaDetail, IdeaDetailHeader } from "@/components/workspace/ideas/idea-detail";
import type { IdeaActions } from "@/components/workspace/ideas/idea-parts";
import { IdeasScreen, type IdeasScreenState } from "@/components/workspace/ideas/ideas-screen";
import {
  applyIdeaStage,
  applyIdeaVote,
  DEFAULT_IDEA_SORT,
  ideaTitle,
  nextIdeaSort,
  stageChangedMessage,
  voteMessage,
  type IdeaModel,
  type IdeaSort,
  type IdeasViewMode,
} from "@/components/workspace/ideas/ideas-model";
import type { Id } from "@/convex/_generated/dataModel";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_IDEA_COMMENTS, IZLOG_IDEA_DETAIL_ID, IZLOG_IDEAS_MEMBER, IZLOG_IDEAS_OWNER } from "../fixtures/ideas";
import { IZLOG_NOW } from "../fixtures/now";
import { IZLOG_DOC_MEMBERS, IZLOG_DOC_SELF } from "../fixtures/page-document";

const noop = () => {};
const asyncNoop = async () => {};

/**
 * Ideje (K16, K07 §5.9): tabla po fazama (podrazumevano), lista, detalj u
 * fioci (vlasnik startupa menja fazu; član samo glasa i komentariše) i prazno
 * stanje. Iste prezentacione komponente kao u aplikaciji; glas i faza rade
 * lokalno (bez servera), pa se vide Flip i kotrljanje broja. Mapa je kanvas
 * (čita Convex) i ovde se ne prikazuje.
 */
export default function IdejeEkran({ varijanta }: IzlogEkranProps) {
  const member = varijanta === "detalj-clan" || varijanta === "tabla-clan";
  const [ideas, setIdeas] = useState<IdeaModel[]>(() =>
    varijanta === "prazno" ? [] : member ? IZLOG_IDEAS_MEMBER : IZLOG_IDEAS_OWNER,
  );
  const [mode, setMode] = useState<IdeasViewMode>(varijanta === "lista" ? "lista" : "tabla");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<IdeaSort>(DEFAULT_IDEA_SORT);
  const [openId, setOpenId] = useState<Id<"ideaNodes"> | null>(
    varijanta === "detalj" || varijanta === "detalj-clan" ? IZLOG_IDEA_DETAIL_ID : null,
  );
  const [announcement, setAnnouncement] = useState("");
  const [draft, setDraft] = useState<{ title: string; text: string } | null>(null);

  const update = (id: Id<"ideaNodes">, change: (idea: IdeaModel) => IdeaModel) =>
    setIdeas((current) => current.map((item) => (item._id === id ? change(item) : item)));

  const actions: IdeaActions = {
    onOpen: (id) => {
      setDraft(null);
      setOpenId(id);
    },
    onVote: (idea, vote) => {
      update(idea._id, (item) => applyIdeaVote(item, vote));
      setAnnouncement(voteMessage(idea.myVote, vote));
    },
    onSetStage: (idea, stage) => {
      update(idea._id, (item) => applyIdeaStage(item, stage, IZLOG_NOW));
      setAnnouncement(stageChangedMessage(stage));
    },
    onConvert: noop,
    onArchive: noop,
  };

  const state: IdeasScreenState =
    varijanta === "ucitavanje"
      ? { status: "loading" }
      : varijanta === "greska"
        ? { status: "error", retry: noop }
        : { status: "ready", ideas };
  const open = ideas.find((item) => item._id === openId) ?? null;
  const shownDraft = open ? (draft ?? { title: open.title ?? "", text: open.text }) : null;

  return (
    <div className="app-canvas desk-surface h-[56rem] overflow-hidden rounded-2xl border bg-background">
      <IdeasScreen
        state={state}
        mode={mode}
        onModeChange={setMode}
        query={query}
        onQueryChange={setQuery}
        now={IZLOG_NOW}
        actions={actions}
        activeIdeaId={openId}
        sort={sort}
        onSortChange={(key) => setSort((current) => nextIdeaSort(current, key))}
        onCreate={noop}
        announcement={announcement}
        map={
          <p className="mx-4 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground sm:mx-6 lg:mx-8">
            Mapa ideja je postojeći kanvas (čita Convex) — izgled je iz K15.
          </p>
        }
      />
      <Drawer
        open={open !== null}
        onOpenChange={(next) => (!next ? setOpenId(null) : undefined)}
        title={open ? ideaTitle(open) : "Ideja"}
        width="30rem"
        // Fokus na panel: prvi kontrol je „Istorija", a polje teksta se ne sme slučajno kucati.
        initialFocus="panel"
        header={
          open ? (
            <IdeaDetailHeader
              idea={open}
              onOpenHistory={noop}
              onArchive={noop}
              discussionLabel="Diskusija u Porukama · 3"
              onDiscussion={noop}
            />
          ) : undefined
        }
      >
        {open && shownDraft ? (
          <IdeaDetail
            idea={open}
            now={IZLOG_NOW}
            draft={shownDraft}
            saveState="saved"
            saveError={null}
            onDraftChange={(patch) => setDraft({ ...shownDraft, ...patch })}
            onDraftBlur={noop}
            onRetrySave={noop}
            actions={actions}
            onOpenConverted={noop}
            comments={
              <CommentsPanel
                headingId="izlog-ideja-komentari"
                count={String(IZLOG_IDEA_COMMENTS.length)}
                composer={<CommentComposer members={IZLOG_DOC_MEMBERS} selfProfileId={IZLOG_DOC_SELF} onSubmit={asyncNoop} />}
              >
                <CommentList
                  state={{ status: "ready", items: IZLOG_IDEA_COMMENTS, loadMore: null }}
                  now={IZLOG_NOW}
                  members={IZLOG_DOC_MEMBERS}
                  selfProfileId={IZLOG_DOC_SELF}
                  editingId={null}
                  onStartEdit={noop}
                  onCancelEdit={noop}
                  onSaveEdit={asyncNoop}
                  onRemove={noop}
                  animateArrivals={false}
                />
              </CommentsPanel>
            }
          />
        ) : null}
      </Drawer>
    </div>
  );
}
