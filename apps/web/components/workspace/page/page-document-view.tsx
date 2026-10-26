"use client";

import { Component, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { History, Lock, LockOpen, Map as MapIcon, MessageSquare, MessagesSquare, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { CommentsSection, type CommentsCount } from "@/components/collab/comments-section";
import type { MentionMember } from "@/components/collab/comment-composer";
import { ConflictDialog } from "@/components/collab/conflict-dialog";
import { RevisionHistoryDrawer } from "@/components/collab/revision-history-drawer";
import { usePagePresence } from "@/components/collab/use-page-presence";
import { useLiveNow } from "@/components/collab/use-live-now";
import { MotionDialog } from "@/components/motion";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityDiscussionPanel } from "@/components/workspace/chat/entity-discussion-panel";
import { NoteAttachmentsProvider, useNoteFileUpload } from "@/components/workspace/files/note-attachments";
import { PageFilesPanel } from "@/components/workspace/files/page-files-panel";
import { MoveToAreaMenu } from "@/components/workspace/move-to-area-menu";
import { PageRelationsCompact } from "@/components/workspace/page-relations";
import { PageTablePanel } from "@/components/workspace/tables/page-table-panel";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { useQueryResult, useQueryTolerant } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import { prefersReducedMotion } from "@/lib/motion";

import type { PageEditorSaveState } from "./page-autosave-model";
import {
  PAGE_ACTIONS_SELECTOR,
  PageDocument,
  type PageDocumentMenuItem,
  type PageDocumentNotice,
} from "./page-document";
import {
  countLabel,
  documentAccess,
  pageMenuKeys,
  restoreBlockedReason,
  subpageMeta,
  trashedMessage,
} from "./page-document-model";
import { PageSideFacts } from "./page-side-column";
import { SubpagesList } from "./subpages-list";
import { useBeforeUnloadGuard, usePageAutosave } from "./use-page-autosave";

export type PageDetails = FunctionReturnType<typeof api.pages.get>;

/** Fioka/dijalog otvoren iz menija: stavka menija nestaje, fokus se vraća na „…". */
const actionsTrigger = () => document.querySelector<HTMLElement>(PAGE_ACTIONS_SELECTOR);

/** Podstranica po strani liste. */
const SUBPAGES_PAGE = 20;

export type PageDocumentViewProps = {
  startup: StartupWithAreas;
  profileId: Id<"profiles">;
  page: PageDetails;
  now: number;
  /** Fokus na naslov samo za upravo napravljenu stranicu (K07 §5.6). */
  autoFocusTitle?: boolean;
  /** Naslov je dobio fokus (shell zaboravlja da je stranica nova). */
  onAutoFocusDone?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
  onOpenMap: (pageId: Id<"pages">) => void;
  onOpenChannel?: (channelId: Id<"chatChannels">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
  /** Stranica je u Korpi: shell vodi na roditelja ili oblast. */
  onArchived: () => void;
  onSaveStateChange?: (state: PageEditorSaveState) => void;
};

/**
 * Stranica (beleška, tabela, fajl) kao dokument tima — kontejner (PROSTOR
 * P13, P19, P23; K07 §5.6). Izvori: `pages.get` (dozvole), `getBreadcrumbs`,
 * `startups.listMembers` (imena i @), `areasV2.updatePage` kroz
 * `usePageAutosave`, `pages.listChildren`, `areasV2.listRelations`,
 * `pages.lock/unlock`, `presence.*`, `comments.*`, `history.*`,
 * `areasV2.archivePage` (Korpa + „Poništi" kroz `trash.restore`).
 */
export function PageDocumentView({
  startup,
  profileId,
  page,
  now,
  autoFocusTitle = false,
  onAutoFocusDone,
  onOpenPage,
  onOpenArea,
  onOpenMap,
  onOpenChannel,
  onCreateChild,
  onArchived,
  onSaveStateChange,
}: PageDocumentViewProps) {
  const pageId = page._id;
  const liveNow = useLiveNow(now);
  const access = documentAccess(page.permissions);
  const breadcrumbs = useQueryTolerant(api.pages.getBreadcrumbs, { pageId });
  const membersResult = useQueryTolerant(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  // Tolerantno: pad spiska priloga ne obara dokument (prilozi se tada ne prikazuju).
  const noteFiles = useQueryTolerant(api.pageFiles.list, page.kind === "note" ? { pageId } : "skip");
  const uploadNoteFile = useNoteFileUpload(page.kind === "note" && access.editable ? pageId : null);
  const autosave = usePageAutosave({
    startupId: startup._id,
    pageId,
    page,
    noteFileCount: noteFiles?.length ?? 0,
  });
  const lockPage = useMutation(api.pages.lock);
  const unlockPage = useMutation(api.pages.unlock);
  const archivePage = useMutation(api.areasV2.archivePage);
  const restoreFromTrash = useMutation(api.trash.restore);
  const detachPage = useMutation(api.areasV2.detachPage);
  const discussion = useQueryTolerant(api.chat.channelForAnchor, {
    startupId: startup._id,
    anchorType: "page",
    anchorId: pageId,
  });

  const regionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const subpagesHeadingId = useId();
  const commentsHeadingId = useId();
  const relationsHeadingId = useId();
  const [lockBusy, setLockBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState<CommentsCount | null>(null);
  const [subpageCount, setSubpageCount] = useState<{ count: number; capped: boolean } | null>(null);
  const { editors } = usePagePresence(pageId, { canEdit: access.editable, region: regionRef });

  const members = useMemo(() => membersResult ?? [], [membersResult]);
  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map(({ profile }) => ({
        profileId: profile._id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      })),
    [members],
  );
  const memberName = useCallback(
    (id: string | null) => members.find(({ profile }) => profile._id === id)?.profile.displayName ?? null,
    [members],
  );

  const saveState = autosave.saveState;
  useBeforeUnloadGuard(saveState);
  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [onSaveStateChange, saveState]);

  const conflictKey = autosave.conflict
    ? `${autosave.conflict.currentRevision ?? "?"}:${autosave.conflict.updatedAt ?? "?"}`
    : null;
  // Nov konflikt otvara dijalog sam; Esc ga zatvara za taj konflikt (traka ostaje).
  const conflictOpen = conflictKey !== null && dismissedConflict !== conflictKey;
  const setConflictOpen = (open: boolean) => setDismissedConflict(open ? null : conflictKey);

  // Ctrl/⌘ S: sačuvaj odmah (pregledač ne otvara svoj dijalog). Slušalac se
  // vezuje jednom; poslednja funkcija čuvanja stiže kroz ref.
  const saveNowRef = useRef(autosave.saveNow);
  useEffect(() => {
    saveNowRef.current = autosave.saveNow;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "s" || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      event.preventDefault();
      saveNowRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const draftReady = autosave.draftReady;
  useEffect(() => {
    if (!autoFocusTitle || !draftReady) return;
    titleRef.current?.focus();
    onAutoFocusDone?.();
  }, [autoFocusTitle, draftReady, onAutoFocusDone]);

  function jumpToComments() {
    const heading = document.getElementById(commentsHeadingId);
    heading?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    heading
      ?.closest("section")
      ?.querySelector<HTMLTextAreaElement>("textarea")
      ?.focus({ preventScroll: true });
  }

  async function setLocked(locked: boolean) {
    if (lockBusy) return;
    setLockBusy(true);
    try {
      if (locked) await lockPage({ pageId });
      else await unlockPage({ pageId });
      toast.success(locked ? "Stranica je zaključana." : "Stranica je otključana.");
    } catch (error) {
      toast.error(accessErrorMessage(error, locked ? "Stranica nije zaključana." : "Stranica nije otključana."));
    } finally {
      setLockBusy(false);
    }
  }

  async function archive() {
    if (saveState === "dirty" || saveState === "saving") {
      toast.info("Sačekaj trenutak da se izmene sačuvaju.");
      return;
    }
    const title = page.title;
    try {
      await archivePage({ startupId: startup._id, pageId });
      toast.success(trashedMessage(title), {
        action: {
          label: "Poništi",
          onClick: () =>
            void restoreFromTrash({ target: { kind: "page", id: pageId } }).catch((error: unknown) =>
              toast.error(accessErrorMessage(error, "Stranica nije vraćena.")),
            ),
        },
      });
      onArchived();
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stranica nije obrisana."));
    }
  }

  async function detach() {
    try {
      const result = await detachPage({ startupId: startup._id, pageId });
      if (result.status !== "detached") throw new Error("Stranica više nije ugnežđena.");
      toast.success("Stranica je odvojena i premeštena na vrh oblasti.");
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stranica nije odvojena."));
    }
  }

  const otherAreas = startup.areas.filter((area) => area._id !== page.areaId).length;
  const hasChildren = (subpageCount?.count ?? 0) > 0;
  const menuKeys = pageMenuKeys(page.permissions, { hasChildren, otherAreas });
  const menuItems: PageDocumentMenuItem[] = [];
  for (const key of menuKeys) {
    if (key === "comments") {
      menuItems.push({ key, label: "Komentari", icon: MessageSquare, onSelect: jumpToComments, afterClose: true });
    }
    if (key === "history") menuItems.push({ key, label: "Istorija izmena", icon: History, onSelect: () => setHistoryOpen(true) });
    if (key === "lock") menuItems.push({ key, label: "Zaključaj stranicu", icon: Lock, onSelect: () => void setLocked(true) });
    if (key === "unlock") menuItems.push({ key, label: "Otključaj", icon: LockOpen, onSelect: () => void setLocked(false) });
    if (key === "map") menuItems.push({ key, label: "Prikaži na mapi", icon: MapIcon, onSelect: () => onOpenMap(pageId) });
    if (key === "detach") menuItems.push({ key, label: "Odvoji na vrh oblasti", icon: Unlink, onSelect: () => void detach() });
    if (key === "discussion") {
      menuItems.push({
        key,
        label: discussion ? `Diskusija u Porukama · ${discussion.messageCount}` : "Diskusija u Porukama",
        icon: MessagesSquare,
        onSelect: () => (discussion && onOpenChannel ? onOpenChannel(discussion._id) : setDiscussionOpen(true)),
      });
    }
    if (key === "archive") menuItems.push({ key, label: "Obriši", icon: Trash2, onSelect: () => void archive(), destructive: true });
  }

  // Stranica je zaključana dok je nacrt čekao: editor je samo za čitanje, a
  // nacrt nije na serveru — to mora da se vidi i da se reši (kopija ili odbacivanje).
  const lostEditRight = !access.editable && saveState !== "saved";
  const notice: PageDocumentNotice | null = lostEditRight
    ? {
        text: "Stranica je zaključana dok si menjao/la — tvoje izmene nisu sačuvane.",
        actionLabel: "Učitaj najnoviju",
        onAction: () => void autosave.discardDraft(),
        secondary: { label: "Kopiraj moju verziju", onAction: () => void autosave.copyDraft() },
      }
    : saveState === "conflict" && !conflictOpen
      ? { text: "Nije sačuvano zbog izmene tima.", actionLabel: "Reši", onAction: () => setConflictOpen(true) }
      : autosave.retriesExhausted
        ? { text: "Izmene nisu sačuvane.", actionLabel: "Pokušaj ponovo", onAction: autosave.saveNow }
        : null;

  const body =
    page.kind === "note" ? (
      autosave.draftReady ? (
        <NoteAttachmentsProvider files={noteFiles}>
          <RichTextEditor
            key={pageId}
            documentKey={pageId}
            content={autosave.content}
            editable={access.editable}
            attachments={uploadNoteFile !== null ? { upload: uploadNoteFile } : undefined}
            onChange={({ html }) => autosave.editContent(html)}
          />
        </NoteAttachmentsProvider>
      ) : (
        <Skeleton className="h-[40vh] rounded-lg" />
      )
    ) : page.kind === "table" ? (
      <PageTablePanel pageId={pageId} />
    ) : (
      <PageFilesPanel pageId={pageId} canManage={access.editable} />
    );

  const ancestors = (breadcrumbs ?? []).slice(0, -1).map((item) => ({ id: item._id, title: item.title }));
  const areaLabel = startup.areas.find((area) => area._id === page.areaId)?.label ?? "Oblast";

  return (
    <>
      <PageDocument
        crumbs={{
          areaLabel,
          onOpenArea: () => onOpenArea(page.areaId),
          ancestors,
          onOpenPage: (id) => onOpenPage(id as Id<"pages">),
        }}
        title={autosave.draftReady ? autosave.title : page.title}
        editable={access.editable && autosave.draftReady}
        onTitleChange={autosave.editTitle}
        titleRef={titleRef}
        saveState={access.editable || lostEditRight ? saveState : null}
        notice={notice}
        editors={editors}
        lock={{
          view: access.lock,
          lockedByName: page.lockedBy?.displayName ?? null,
          lockedAt: page.lockedAt ?? null,
        }}
        meta={{
          authorName: page.creator?.displayName ?? null,
          editorName: page.updater?.displayName ?? null,
          updatedAt: page.updatedAt,
        }}
        commentCount={countLabel(commentCount)}
        onJumpToComments={jumpToComments}
        onOpenHistory={() => setHistoryOpen(true)}
        menuItems={menuItems}
        menuExtra={
          menuKeys.includes("move") ? (
            <MoveToAreaMenu
              asSubmenu
              startupId={startup._id}
              pageId={pageId}
              pageTitle={page.title}
              currentAreaId={page.areaId}
              areas={startup.areas}
            />
          ) : null
        }
        body={body}
        subpages={
          <SubpagesBoundary headingId={subpagesHeadingId}>
            <SubpagesLoader
              startupId={startup._id}
              page={page}
              headingId={subpagesHeadingId}
              now={liveNow}
              canCreate={access.canCreateChild}
              memberName={memberName}
              onOpen={(id) => onOpenPage(id)}
              onCreate={() => onCreateChild({ areaId: page.areaId, parentPageId: pageId })}
              onShowMap={() => onOpenMap(pageId)}
              onCount={setSubpageCount}
            />
          </SubpagesBoundary>
        }
        sideFacts={
          <PageSideFacts
            author={
              page.creator
                ? { displayName: page.creator.displayName, avatarUrl: page.creator.avatarUrl }
                : null
            }
            lastEdit={{ editorName: page.updater?.displayName ?? null, at: page.updatedAt }}
            lock={{
              locked: page.permissions.isLocked,
              canLock: page.permissions.canLock,
              canUnlock: page.permissions.canUnlock,
              busy: lockBusy,
              onLock: () => void setLocked(true),
              onUnlock: () => void setLocked(false),
            }}
            now={liveNow}
          />
        }
        relations={
          <RelationsContainer
            startupId={startup._id}
            page={page}
            areas={startup.areas}
            headingId={relationsHeadingId}
            onOpenPage={onOpenPage}
          />
        }
        comments={
          <CommentsSection
            target={{ kind: "page", id: pageId }}
            members={mentionMembers}
            selfProfileId={profileId}
            now={liveNow}
            headingId={commentsHeadingId}
            onCountChange={setCommentCount}
          />
        }
        regionRef={regionRef}
        now={liveNow}
      />
      <RevisionHistoryDrawer
        returnFocusFallback={actionsTrigger}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        target={{ kind: "page", id: pageId }}
        currentRevision={page.revision}
        blockedReason={restoreBlockedReason({ canRestoreRevision: page.permissions.canRestoreRevision, saveState })}
        richPreview={page.kind === "note"}
        memberName={memberName}
        now={liveNow}
      />
      <ConflictDialog
        open={conflictOpen && saveState === "conflict"}
        onOpenChange={setConflictOpen}
        updaterName={memberName(autosave.conflict?.updatedByProfileId ?? null)}
        updatedAt={autosave.conflict?.updatedAt ?? null}
        now={liveNow}
        onCopy={() => void autosave.copyDraft()}
        onLoadLatest={() => {
          if (autosave.loadLatest()) setConflictOpen(false);
        }}
        onOverwrite={() => {
          setConflictOpen(false);
          autosave.overwrite();
        }}
      />
      <MotionDialog
        open={discussionOpen}
        onOpenChange={setDiscussionOpen}
        title="Diskusija u Porukama"
        description="Poruka ide u kanal ove stranice u Porukama."
        width="32rem"
        returnFocusFallback={actionsTrigger}
      >
        <EntityDiscussionPanel
          startupId={startup._id}
          anchorType="page"
          anchorId={pageId}
          members={members}
          onOpenChannel={
            onOpenChannel
              ? (channelId) => {
                  setDiscussionOpen(false);
                  onOpenChannel(channelId);
                }
              : undefined
          }
          className="border-0 bg-transparent p-0 shadow-none"
        />
      </MotionDialog>
    </>
  );
}

function SubpagesLoader({
  startupId,
  page,
  headingId,
  now,
  canCreate,
  memberName,
  onOpen,
  onCreate,
  onShowMap,
  onCount,
}: {
  startupId: Id<"startups">;
  page: PageDetails;
  headingId: string;
  now: number;
  canCreate: boolean;
  memberName: (id: string | null) => string | null;
  onOpen: (id: Id<"pages">) => void;
  onCreate: () => void;
  onShowMap: () => void;
  onCount: (count: { count: number; capped: boolean } | null) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId, areaId: page.areaId, parentPageId: page._id },
    { initialNumItems: SUBPAGES_PAGE },
  );
  const loading = status === "LoadingFirstPage";
  const hasMore = status === "CanLoadMore" || status === "LoadingMore";
  useEffect(() => {
    onCount(loading ? null : { count: results.length, capped: hasMore });
  }, [hasMore, loading, onCount, results.length]);

  return (
    <SubpagesList
      headingId={headingId}
      state={
        loading
          ? { status: "loading" }
          : {
              status: "ready",
              items: results.map((child) => ({
                id: child._id,
                title: child.title,
                kind: child.kind,
                meta: subpageMeta(
                  { kind: child.kind, editorName: memberName(child.updatedByProfileId), updatedAt: child.updatedAt },
                  now,
                ),
                locked: child.lockedAt !== null,
              })),
              loadMore: hasMore
                ? { busy: status === "LoadingMore", onLoad: () => loadMore(SUBPAGES_PAGE) }
                : null,
            }
      }
      count={countLabel(loading ? null : { count: results.length, capped: hasMore })}
      onOpen={(id) => onOpen(id as Id<"pages">)}
      onCreate={canCreate ? onCreate : undefined}
      onShowMap={onShowMap}
    />
  );
}

class SubpagesBoundary extends Component<{ children: ReactNode; headingId: string }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return <div key={this.state.attempt}>{this.props.children}</div>;
    return (
      <SubpagesList
        headingId={this.props.headingId}
        state={{
          status: "error",
          onRetry: () => this.setState((current) => ({ failed: false, attempt: current.attempt + 1 })),
        }}
        count={null}
        onOpen={() => {}}
      />
    );
  }
}

function RelationsContainer(props: {
  startupId: Id<"startups">;
  page: PageDetails;
  areas: ReadonlyArray<{ _id: Id<"startupAreas">; label: string }>;
  headingId: string;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  // Greška upita se ne popravlja sama: „Pokušaj ponovo" pravi novu pretplatu.
  const [attempt, setAttempt] = useState(0);
  return <RelationsLoader key={attempt} {...props} onRetry={() => setAttempt((value) => value + 1)} />;
}

function RelationsLoader({
  startupId,
  page,
  areas,
  headingId,
  onOpenPage,
  onRetry,
}: {
  startupId: Id<"startups">;
  page: PageDetails;
  areas: ReadonlyArray<{ _id: Id<"startupAreas">; label: string }>;
  headingId: string;
  onOpenPage: (pageId: Id<"pages">) => void;
  onRetry: () => void;
}) {
  const { data: result, failed } = useQueryResult(api.areasV2.listRelations, { startupId, pageId: page._id });
  const createRelation = useMutation(api.areasV2.createRelation);
  const deleteRelation = useMutation(api.areasV2.deleteRelation);
  const [selected, setSelected] = useState<Id<"pages"> | "">("");
  const [busy, setBusy] = useState(false);
  const areaLabel = (areaId: Id<"startupAreas">) =>
    areaId === page.areaId ? null : (areas.find((area) => area._id === areaId)?.label ?? "Druga oblast");

  async function create() {
    if (!selected) return;
    setBusy(true);
    try {
      const linked = result?.candidates.find((candidate) => candidate.pageId === selected);
      await createRelation({ startupId, pageAId: page._id, pageBId: selected });
      setSelected("");
      toast.success(`Povezano sa „${linked?.title.trim() || "Bez naslova"}”.`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(relationId: Id<"pageRelations">) {
    setBusy(true);
    try {
      await deleteRelation({ startupId, relationId });
      toast.success("Veza je uklonjena.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageRelationsCompact
      headingId={headingId}
      loading={result === undefined}
      failed={failed ? { onRetry } : null}
      relations={(result?.relations ?? []).map((relation) => ({
        id: relation._id,
        pageId: relation.linkedPage.pageId,
        title: relation.linkedPage.title,
        kind: relation.linkedPage.kind,
        areaLabel: areaLabel(relation.linkedPage.areaId),
        canDelete: relation.canDelete,
        canRequestDeletion: false,
      }))}
      candidates={(result?.candidates ?? []).map((candidate) => ({
        pageId: candidate.pageId,
        title: candidate.title,
        kind: candidate.kind,
        areaLabel: areaLabel(candidate.areaId),
      }))}
      candidatesTruncated={result?.candidatesTruncated ?? false}
      selectedCandidate={selected}
      onSelectedCandidate={setSelected}
      busy={busy}
      onCreate={create}
      onDelete={remove}
      onOpenPage={onOpenPage}
    />
  );
}
