"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { CommentsSection } from "@/components/collab/comments-section";
import type { MentionMember } from "@/components/collab/comment-composer";
import { RevisionHistoryDrawer } from "@/components/collab/revision-history-drawer";
import { Drawer, MotionDialog } from "@/components/motion";
import { EntityDiscussionPanel } from "@/components/workspace/chat/entity-discussion-panel";
import type { StartupMember } from "@/components/workspace/types";
import { useQueryTolerant } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";

import { IdeaDetail, IdeaDetailError, IdeaDetailHeader, IdeaDetailMissing, IdeaDetailSkeleton, ideaDrawerTitle } from "./idea-detail";
import { ideaTitleElement, type IdeaActions } from "./idea-parts";
import {
  createIdeaDraft,
  IDEA_SAVE_DELAY_MS,
  ideaDraftEdit,
  ideaDraftError,
  ideaDraftFailed,
  ideaDraftFromServer,
  ideaDraftOnLeave,
  ideaDraftSaved,
  ideaDraftStartSave,
  ideaDraftStatus,
  type IdeaDraft,
  type IdeaModel,
} from "./ideas-model";

/**
 * Detalj ideje u desnoj fioci (`?view=ideas&ideaId=`, K07 §5.9). Ideja dolazi
 * iz `ideas.list` (R7: `ideas.get` ne postoji). `idea === undefined` = lista
 * još stiže; `null` = ideje nema u ovom startupu (Korpa ili tuđ link).
 */
export function IdeaDetailDrawer({
  startupId,
  open,
  idea,
  now,
  members,
  startupMembers,
  selfProfileId,
  actions,
  onClose,
  onOpenPage,
  onOpenTrash,
  onOpenChannel,
  loadError,
}: {
  startupId: Id<"startups">;
  open: boolean;
  idea: IdeaModel | null | undefined;
  /** `ideas.list` je pao: fioka nudi „Pokušaj ponovo" umesto večitog učitavanja. */
  loadError: { retry: () => void } | null;
  now: number;
  members: ReadonlyArray<MentionMember>;
  /** Za `@Ime` u brzoj poruci diskusije. */
  startupMembers: StartupMember[] | undefined;
  selfProfileId: string;
  actions: IdeaActions;
  onClose: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenTrash: () => void;
  onOpenChannel: (channelId: Id<"chatChannels">) => void;
}) {
  // Sadržaj ostaje dok fioka izlazi (inače klizi prazna).
  const [shown, setShown] = useState<IdeaModel | null>(idea ?? null);
  if (idea && idea !== shown) setShown(idea);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const current = idea ?? (open ? null : shown);
  // Diskusija u Porukama (P20): postojeći kanal ideje se otvara, bez njega prva poruka u dijalogu.
  const discussion = useQueryTolerant(
    api.chat.channelForAnchor,
    current ? { startupId, anchorType: "idea", anchorId: current._id } : "skip",
  );

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => (!next ? onClose() : undefined)}
        title={ideaDrawerTitle(current)}
        width="30rem"
        // Fokus na panel: prvi kontrol je „Istorija", a polje teksta se ne sme slučajno kucati.
        initialFocus="panel"
        header={
          current ? (
            <IdeaDetailHeader
              idea={current}
              onOpenHistory={() => setHistoryOpen(true)}
              onArchive={() => actions.onArchive(current)}
              discussionLabel={discussion ? `Diskusija u Porukama · ${discussion.messageCount}` : "Diskusija u Porukama"}
              onDiscussion={() => (discussion ? onOpenChannel(discussion._id) : setDiscussionOpen(true))}
            />
          ) : undefined
        }
        onExited={() => {
          const lastId = shown?._id ?? null;
          setShown(null);
          // Klik na telo kartice ne daje fokusabilan izvor (fokus dobije skrol-kontejner
          // table ili `body`): posle izlaza fokus ide na naslov iste ideje.
          window.requestAnimationFrame(() => {
            const active = document.activeElement;
            const lost =
              !(active instanceof HTMLElement) ||
              active === document.body ||
              !active.matches("button, a[href], input, textarea, select, [tabindex]");
            if (lost && lastId !== null) ideaTitleElement(lastId)?.focus();
          });
        }}
        // Element koji je otvorio fioku je možda nestao (kartica u drugoj koloni, meni):
        // fokus ide na naslov iste ideje na tabli ili u listi.
        returnFocusFallback={() => (shown ? ideaTitleElement(shown._id) : null)}
      >
        {loadError !== null && open ? (
          <IdeaDetailError retry={loadError.retry} />
        ) : idea === undefined && open ? (
          <IdeaDetailSkeleton />
        ) : current === null ? (
          <IdeaDetailMissing onOpenTrash={onOpenTrash} onClose={onClose} />
        ) : (
          <IdeaDetailBody
            key={current._id}
            startupId={startupId}
            idea={current}
            now={now}
            members={members}
            selfProfileId={selfProfileId}
            actions={actions}
            onOpenPage={onOpenPage}
          />
        )}
      </Drawer>
      {current ? (
        <RevisionHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          target={{ kind: "idea", id: current._id }}
          // Ideja nema reviziju (vraćanje ne proverava konflikt); 0 je samo popuna.
          currentRevision={0}
          blockedReason={current.permissions.canEdit ? null : "Ideja je već pretvorena."}
          memberName={(profileId) => members.find((member) => member.profileId === profileId)?.displayName ?? null}
          now={now}
        />
      ) : null}
      {current ? (
        <MotionDialog
          open={discussionOpen}
          onOpenChange={setDiscussionOpen}
          title="Diskusija u Porukama"
          description="Poruka ide u kanal ove ideje u Porukama."
          width="32rem"
        >
          <EntityDiscussionPanel
            startupId={startupId}
            anchorType="idea"
            anchorId={current._id}
            members={startupMembers}
            onOpenChannel={(channelId) => {
              setDiscussionOpen(false);
              onOpenChannel(channelId);
            }}
          />
        </MotionDialog>
      ) : null}
    </>
  );
}

function IdeaDetailBody({
  startupId,
  idea,
  now,
  members,
  selfProfileId,
  actions,
  onOpenPage,
}: {
  startupId: Id<"startups">;
  idea: IdeaModel;
  now: number;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string;
  actions: IdeaActions;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const draft = useIdeaDraft(startupId, idea);
  return (
    <IdeaDetail
      idea={idea}
      now={now}
      draft={draft.value}
      saveState={draft.status}
      saveError={draft.error}
      onDraftChange={draft.edit}
      onDraftBlur={draft.flush}
      onRetrySave={draft.flush}
      actions={actions}
      onOpenConverted={onOpenPage}
      comments={
        <CommentsSection target={{ kind: "idea", id: idea._id }} members={members} selfProfileId={selfProfileId} now={now} />
      }
    />
  );
}

/**
 * Naslov i tekst ideje kao dokument tima: čuva se 1 s posle kucanja i na blur
 * (`ideas.update`; boja ostaje ista). Izmena drugog člana se prima samo kad
 * ništa ne čeka; odlazak sa nesačuvanim izmenama ih šalje.
 */
function useIdeaDraft(startupId: Id<"startups">, idea: IdeaModel) {
  const update = useMutation(api.ideas.update);
  const [draft, setDraftState] = useState<IdeaDraft>(() => createIdeaDraft(idea));
  const draftRef = useRef(draft);
  const colorRef = useRef(idea.color);

  const setDraft = useCallback((next: IdeaDraft) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const { _id: ideaId, title, text, color } = idea;
  useEffect(() => {
    colorRef.current = color;
    const next = ideaDraftFromServer(draftRef.current, { _id: ideaId, title, text });
    if (next !== draftRef.current) setDraft(next);
  }, [ideaId, title, text, color, setDraft]);

  const send = useCallback(
    (submission: { title: string; text: string }) =>
      update({ startupId, ideaId, title: submission.title, text: submission.text, color: colorRef.current }),
    [ideaId, startupId, update],
  );

  const saveNow = useCallback(() => {
    const started = ideaDraftStartSave(draftRef.current);
    if (started === null) return;
    setDraft(started.draft);
    // Greška se vidi u polju i najavljuje jednom (`role=alert`), bez dodatnog toasta.
    void send(started.submission)
      .then(() => setDraft(ideaDraftSaved(draftRef.current, started.submission)))
      .catch(() => setDraft(ideaDraftFailed(draftRef.current)));
  }, [send, setDraft]);

  const status = ideaDraftStatus(draft);
  useEffect(() => {
    if (status !== "dirty") return;
    const timer = window.setTimeout(saveNow, IDEA_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [status, draft.title, draft.text, saveNow]);

  // Zatvaranje fioke ili prelaz na drugu ideju: ono što čeka ide odmah.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(
    () => () => {
      // I ono što je otkucano dok je prethodno čuvanje bilo na putu.
      const leaving = ideaDraftOnLeave(draftRef.current);
      if (leaving === null) return;
      void sendRef.current(leaving).catch((error: unknown) =>
        toast.error(accessErrorMessage(error, "Ideja nije sačuvana.")),
      );
    },
    [],
  );

  return {
    value: { title: draft.title, text: draft.text },
    status,
    error: status === "invalid" ? ideaDraftError(draft) : null,
    edit: (patch: Partial<{ title: string; text: string }>) => setDraft(ideaDraftEdit(draftRef.current, patch)),
    flush: saveNow,
  };
}
