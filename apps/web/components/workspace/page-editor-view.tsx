"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArrowLeft, CheckSquare2, ChevronRight, FolderOutput, LoaderCircle, Plus, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";

import { CommentsSection } from "@/components/collab/comments-section";
import { ConflictDialog } from "@/components/collab/conflict-dialog";
import { LockNotice } from "@/components/collab/lock";
import { useLiveNow } from "@/components/collab/use-live-now";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityDiscussionPanel } from "@/components/workspace/chat/entity-discussion-panel";
import { MoveToAreaMenu } from "@/components/workspace/move-to-area-menu";
import {
  combinedEditorSaveState,
  SAVE_STATE_LABELS,
  type PageEditorSaveState,
} from "@/components/workspace/page/page-autosave-model";
import { trashedMessage } from "@/components/workspace/page/page-document-model";
import { useBeforeUnloadGuard, usePageAutosave } from "@/components/workspace/page/use-page-autosave";
import { pageEntryDisplayText } from "@/components/workspace/page-entry-text";
import { PageRelationsPanel } from "@/components/workspace/page-relations";
import { TaskCheckpointList } from "@/components/workspace/task-checkpoint-list";
import {
  TaskContentLocks,
  TaskMetaChips,
  type TaskMetaChange,
} from "@/components/workspace/startup-tasks/task-meta-chips";
import {
  createTaskInstructionsDraft,
  editTaskInstructionsDraft,
  prepareTaskInstructionsSave,
  reconcileTaskInstructionsDraft,
  rejectTaskInstructionsSave,
  resolveTaskInstructionsSave,
  taskInstructionsSaveState,
  type TaskInstructionsDraft,
  type TaskInstructionsSaveState,
  type TaskInstructionsServerState,
} from "@/components/workspace/task-instructions-draft";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { taskPermissions } from "@devotion/shared";
import { accessErrorMessage } from "@/lib/errors";
import { type TaskPriority, type TaskStatus } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export type { PageEditorSaveState };

/**
 * Zadatak na ruti stranice — prelazni prikaz do K11 (zadatak na celu stranu):
 * naslov, čipovi, instrukcije, koraci, Povezano, Diskusija i Komentari, bez
 * kanvasa (P14). Beleška, tabela i fajl su dokument tima
 * (`page/page-document-view.tsx`). Naslov se čuva kroz zajednički
 * `usePageAutosave` (isti red i revizija kao osobine zadatka).
 */
export function PageEditorView({
  startup,
  pageId,
  onOpenPage,
  onOpenArea,
  onOpenChannel,
  onCreateChild,
  onArchived,
  onSaveStateChange,
}: {
  startup: StartupWithAreas;
  pageId: Id<"pages">;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenArea?: (areaId: Id<"startupAreas">) => void;
  onOpenChannel?: (channelId: Id<"chatChannels">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
  onArchived: () => void;
  onSaveStateChange?: (state: PageEditorSaveState) => void;
}) {
  const page = useQuery(api.pages.get, { pageId });
  const breadcrumbs = useQuery(api.pages.getBreadcrumbs, { pageId });
  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const updatePage = useMutation(api.areasV2.updatePage);
  // Metapodaci zadatka (K17): izvršilac na zaključanom menja status kroz
  // `tasks.updateMetadata`, a sebe dodaje/skida kroz `taskAssignees`.
  const currentProfile = useQuery(api.profiles.getCurrent, {});
  // Sat za oznaku roka i „pre N min" (prikaz ne čita sat u renderu).
  const [initialNow] = useState(() => Date.now());
  const metaNow = useLiveNow(initialNow);
  const updateTaskAsMember = useMutation(api.tasks.updateMetadata);
  const joinTask = useMutation(api.taskAssignees.join);
  const leaveTask = useMutation(api.taskAssignees.leave);
  const archivePage = useMutation(api.areasV2.archivePage);
  const restoreFromTrash = useMutation(api.trash.restore);
  const detachPage = useMutation(api.areasV2.detachPage);
  const relationsResult = useQuery(api.areasV2.listRelations, {
    startupId: startup._id,
    pageId,
  });
  const createRelation = useMutation(api.areasV2.createRelation);
  const deleteRelation = useMutation(api.areasV2.deleteRelation);
  const autosave = usePageAutosave({
    startupId: startup._id,
    pageId,
    page,
  });
  const [instructionsSaveState, setInstructionsSaveState] =
    useState<TaskInstructionsSaveState>("saved");
  const [selectedRelationPageId, setSelectedRelationPageId] = useState<
    Id<"pages"> | ""
  >("");
  const [relationBusy, setRelationBusy] = useState(false);
  const [detachBusy, setDetachBusy] = useState(false);
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const commentsHeadingId = useId();
  const editorSaveState = combinedEditorSaveState(
    autosave.saveState,
    instructionsSaveState,
  );
  useBeforeUnloadGuard(editorSaveState);

  useEffect(() => {
    onSaveStateChange?.(editorSaveState);
  }, [editorSaveState, onSaveStateChange]);

  const conflictKey = autosave.conflict
    ? `${autosave.conflict.currentRevision ?? "?"}:${autosave.conflict.updatedAt ?? "?"}`
    : null;
  // Nov konflikt otvara dijalog sam; Esc ga zatvara za taj konflikt (traka ostaje).
  const conflictOpen = conflictKey !== null && dismissedConflict !== conflictKey;
  const setConflictOpen = (open: boolean) => setDismissedConflict(open ? null : conflictKey);

  const runPageUpdate = autosave.runPageUpdate;
  const updateTaskMetadata = useCallback(
    (patch: {
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeProfileIds?: Array<Id<"profiles">>;
      dueDate?: number | null;
      instructions?: string | null;
      checkpoints?: Array<{ id: string; text: string; completed: boolean }> | null;
    }) =>
      runPageUpdate((expectedRevision) =>
        updatePage({
          startupId: startup._id,
          pageId,
          expectedRevision,
          ...(patch.status === undefined ? {} : { taskStatus: patch.status }),
          ...(patch.priority === undefined ? {} : { taskPriority: patch.priority }),
          ...(patch.assigneeProfileIds === undefined
            ? {}
            : { assigneeProfileIds: patch.assigneeProfileIds }),
          ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
          ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
          ...(patch.checkpoints === undefined ? {} : { checkpoints: patch.checkpoints }),
        }),
      ),
    [pageId, runPageUpdate, startup._id, updatePage],
  );

  async function setTaskMetadata(patch: { status?: TaskStatus; priority?: TaskPriority; assigneeProfileIds?: Array<Id<"profiles">>; dueDate?: number | null }) {
    if (!page?.permissions.canEdit) return;
    try {
      await updateTaskMetadata(patch);
      toast.success("Zadatak je ažuriran.");
    } catch (error) {
      toast.error(accessErrorMessage(error, "Podaci zadatka nisu sačuvani."));
    }
  }

  /**
   * Promena kroz čip: ko sme da menja zadatak ide kroz `areasV2.updatePage` sa
   * revizijom; izvršilac zaključanog zadatka menja samo status, kroz
   * `tasks.updateMetadata` (ista pravila servera kao panel zadatka).
   */
  function changeTaskMeta(change: TaskMetaChange) {
    if (!page) return;
    if (page.permissions.canEdit) {
      const { assigneeProfileIds, ...rest } = change;
      void setTaskMetadata({
        ...rest,
        ...(assigneeProfileIds === undefined
          ? {}
          : { assigneeProfileIds: assigneeProfileIds as Array<Id<"profiles">> }),
      });
      return;
    }
    if (change.status === undefined) return;
    void updateTaskAsMember({ pageId: page._id, status: change.status })
      .then(() => toast.success("Zadatak je ažuriran."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Status nije sačuvan.")));
  }

  async function archive() {
    if (!page) return;
    if (editorSaveState === "dirty" || editorSaveState === "saving") {
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
              toast.error(accessErrorMessage(error, "Zadatak nije vraćen.")),
            ),
        },
      });
      onArchived();
    } catch (error) {
      toast.error(accessErrorMessage(error, "Zadatak nije obrisan."));
    }
  }

  async function detachFromParent() {
    if (!page?.permissions.canDetach || detachBusy) return;
    setDetachBusy(true);
    try {
      const result = await detachPage({
        startupId: startup._id,
        pageId: page._id,
      });
      if (result.status !== "detached") {
        throw new Error("Stavka više nije ugnežđena.");
      }
      toast.success("Stavka je odvojena i premeštena na vrh oblasti.");
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stavka nije odvojena."));
    } finally {
      setDetachBusy(false);
    }
  }

  async function linkSelectedPage() {
    if (!selectedRelationPageId || relationBusy) return;
    setRelationBusy(true);
    try {
      await createRelation({
        startupId: startup._id,
        pageAId: pageId,
        pageBId: selectedRelationPageId,
      });
      setSelectedRelationPageId("");
      toast.success("Stavke su povezane.");
    } finally {
      setRelationBusy(false);
    }
  }

  async function unlinkPage(relationId: Id<"pageRelations">) {
    if (relationBusy) return;
    setRelationBusy(true);
    try {
      await deleteRelation({
        startupId: startup._id,
        relationId,
      });
      toast.success("Veza je uklonjena.");
    } finally {
      setRelationBusy(false);
    }
  }

  // Polje se ne puni dok ne stigne verzija ove stranice (Tiptap/autosave ne
  // smeju da prime prazne podrazumevane vrednosti kao izmenu korisnika).
  if (!page || !autosave.draftReady) {
    return <EditorSkeleton />;
  }
  const pageArea = startup.areas.find((area) => area._id === page.areaId);
  const areaLabelById = new Map(
    startup.areas.map((area) => [area._id, area.label]),
  );
  const relationAreaLabel = (areaId: Id<"startupAreas">) =>
    areaId === page.areaId
      ? null
      : (areaLabelById.get(areaId) ?? "Nepoznata oblast");
  const canMoveToArea = page.permissions.canMove && startup.areas.length > 1;
  // „Nazad” = jedan nivo hijerarhije naviše: roditeljska stranica ako je
  // stavka ugnežđena, inače njena oblast.
  const parentCrumb =
    breadcrumbs && breadcrumbs.length > 1
      ? breadcrumbs[breadcrumbs.length - 2]
      : null;
  const backTargetLabel = page.parentPageId
    ? `„${parentCrumb?.title?.trim() || "roditeljsku stavku"}”`
    : (pageArea?.label ?? "oblast");
  const goBack = () => {
    if (page.parentPageId) onOpenPage(page.parentPageId);
    else onOpenArea?.(page.areaId);
  };
  const showBack = page.parentPageId !== null || Boolean(onOpenArea);
  const status = (page.taskStatus ?? "backlog") as TaskStatus;
  const priority = (page.taskPriority ?? "medium") as TaskPriority;
  const assigneeProfileIds = (page.assignees ?? []).map((assignee) => assignee._id);
  const isTaskAssignee = currentProfile ? assigneeProfileIds.includes(currentProfile._id) : false;
  const content = autosave.content;
  const saveState = autosave.saveState;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 sm:px-7 lg:px-10 lg:pt-6">
      <PageBreadcrumbNav
        className="mb-5"
        startupName={startup.name}
        areaLabel={pageArea?.label ?? "Oblast"}
        breadcrumbs={breadcrumbs}
        onOpenArea={onOpenArea ? () => onOpenArea(page.areaId) : undefined}
        onOpenPage={onOpenPage}
        onBack={showBack ? goBack : undefined}
        backLabel={backTargetLabel}
      />
      <article data-workspace-enter className="rounded-xl border bg-card">
        <header className="border-b px-5 pb-5 pt-5 sm:px-8 sm:pt-7">
          <div className="flex items-start gap-3">
            <CheckSquare2 className="mt-2 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h1>
                <Input
                  disabled={!page.permissions.canEdit}
                  aria-invalid={saveState === "invalid"}
                  aria-label="Naslov zadatka"
                  value={autosave.title}
                  onChange={(event) => autosave.editTitle(event.target.value)}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-xl font-semibold tracking-[-0.02em] shadow-none disabled:opacity-100 focus-visible:ring-0 lg:text-2xl"
                  maxLength={200}
                />
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                {page.permissions.canEdit ? <span>{SAVE_STATE_LABELS[saveState]}</span> : null}
                {page.updater ? <span>Izmenio/la {page.updater.displayName}</span> : null}
              </div>
            </div>
            {page.permissions.canArchive ? (
              <Button type="button" variant="ghost" size="icon" aria-label="Obriši zadatak" onClick={() => void archive()}>
                <Archive />
              </Button>
            ) : null}
          </div>
          {page.permissions.isLocked && !page.permissions.canEdit ? <LockNotice className="mt-4" /> : null}
          {!page.permissions.canEdit && saveState !== "saved" ? (
            <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>Zadatak je zaključan dok si menjao/la — tvoje izmene nisu sačuvane.</span>
              <span className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => void autosave.copyDraft()}>
                  Kopiraj moju verziju
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void autosave.discardDraft()}>
                  Učitaj najnoviju
                </Button>
              </span>
            </div>
          ) : null}
          {saveState === "conflict" && !conflictOpen ? (
            <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>Nije sačuvano zbog izmene tima.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setConflictOpen(true)}>
                <RefreshCw /> Reši
              </Button>
            </div>
          ) : null}
          <div className="mt-5">
            <TaskMetaChips
              now={metaNow}
              status={status}
              priority={priority}
              dueDate={page.dueDate}
              assignees={(page.assignees ?? []).map((person) => ({
                _id: person._id,
                displayName: person.displayName,
                avatarUrl: person.avatarUrl ?? null,
              }))}
              members={members?.map(({ profile }) => ({
                _id: profile._id,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
              }))}
              permissions={taskPermissions({
                kind: "task",
                isCreator: page.permissions.canEdit,
                isAssignee: isTaskAssignee,
              })}
              isSelfAssigned={isTaskAssignee}
              onChange={changeTaskMeta}
              onJoin={() =>
                void joinTask({ taskPageId: page._id })
                  .then(() => toast.success("Sad si na zadatku."))
                  .catch((error: unknown) => toast.error(accessErrorMessage(error, "Priključivanje nije uspelo.")))
              }
              onLeave={() =>
                void leaveTask({ taskPageId: page._id })
                  .then(() => toast.success("Više nisi na zadatku."))
                  .catch((error: unknown) => toast.error(accessErrorMessage(error, "Napuštanje zadatka nije uspelo.")))
              }
              onDenied={(reason) => toast.error(reason)}
            />
          </div>
        </header>
        <div className="space-y-6 px-5 py-6 sm:px-8">
          <TaskDetailWidgets
            page={page}
            canEdit={page.permissions.canEdit}
            updateMetadata={updateTaskMetadata}
            onSaveStateChange={setInstructionsSaveState}
          />
          {pageEntryDisplayText(content).trim() ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Dodatni kontekst</h2>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85">
                {pageEntryDisplayText(content)}
              </p>
            </section>
          ) : null}
          <PageRelationsPanel
            loading={relationsResult === undefined}
            currentKind={page.kind}
            relations={(relationsResult?.relations ?? []).map((relation) => ({
              id: relation._id,
              pageId: relation.linkedPage.pageId,
              title: relation.linkedPage.title,
              kind: relation.linkedPage.kind,
              areaLabel: relationAreaLabel(relation.linkedPage.areaId),
              canDelete: relation.canDelete,
              canRequestDeletion: false,
            }))}
            candidates={(relationsResult?.candidates ?? []).map((candidate) => ({
              pageId: candidate.pageId,
              title: candidate.title,
              kind: candidate.kind,
              areaLabel: relationAreaLabel(candidate.areaId),
            }))}
            candidatesTruncated={relationsResult?.candidatesTruncated ?? false}
            selectedCandidate={selectedRelationPageId}
            onSelectedCandidate={setSelectedRelationPageId}
            busy={relationBusy}
            onCreate={linkSelectedPage}
            onDelete={unlinkPage}
            onRequestDeletion={unlinkPage}
            onOpenPage={onOpenPage}
          />
          <EntityDiscussionPanel
            startupId={startup._id}
            anchorType="page"
            anchorId={page._id}
            members={members}
            onOpenChannel={onOpenChannel}
          />
          <CommentsSection
            target={{ kind: "page", id: page._id }}
            members={(members ?? []).map(({ profile }) => ({
              profileId: profile._id,
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
            }))}
            selfProfileId={currentProfile?._id ?? null}
            now={metaNow}
            headingId={commentsHeadingId}
          />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {page.creator ? (
              <>
                <ProfileAvatar profile={page.creator} className="size-6" />
                <span>Napravio/la <strong className="font-semibold text-foreground">{page.creator.displayName}</strong></span>
              </>
            ) : (
              <>
                <UserRound className="size-4" /> Autor nije dostupan
              </>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {page.permissions.canDetach ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={detachBusy}
                onClick={detachFromParent}
              >
                {detachBusy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <FolderOutput />
                )}
                Odvoji na vrh oblasti
              </Button>
            ) : null}
            {canMoveToArea ? (
              <MoveToAreaMenu
                startupId={startup._id}
                pageId={page._id}
                pageTitle={page.title}
                currentAreaId={page.areaId}
                areas={startup.areas}
              />
            ) : null}
            {page.permissions.canEdit ? (
              <Button variant="outline" size="sm" onClick={() => onCreateChild({ areaId: page.areaId, parentPageId: page._id })}>
                <Plus /> Podstranica
              </Button>
            ) : null}
          </div>
        </footer>
      </article>
      <ConflictDialog
        open={conflictOpen && saveState === "conflict"}
        onOpenChange={setConflictOpen}
        updaterName={
          members?.find(({ profile }) => profile._id === autosave.conflict?.updatedByProfileId)?.profile.displayName ?? null
        }
        updatedAt={autosave.conflict?.updatedAt ?? null}
        now={metaNow}
        onCopy={() => void autosave.copyDraft()}
        onLoadLatest={() => {
          if (autosave.loadLatest()) setConflictOpen(false);
        }}
        onOverwrite={() => {
          setConflictOpen(false);
          autosave.overwrite();
        }}
      />
    </div>
  );
}

function TaskDetailWidgets({
  page,
  canEdit,
  updateMetadata,
  onSaveStateChange,
  focusCheckpointCreate = false,
  focusInstructions = false,
  stacked = false,
  collapsible = false,
}: {
  page: Doc<"pages">;
  canEdit: boolean;
  updateMetadata: (args: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeProfileIds?: Array<Id<"profiles">>;
    dueDate?: number | null;
    instructions?: string | null;
    checkpoints?: Array<{ id: string; text: string; completed: boolean }> | null;
  }) => Promise<{ revision: number }>;
  onSaveStateChange: (state: TaskInstructionsSaveState) => void;
  focusCheckpointCreate?: boolean;
  focusInstructions?: boolean;
  stacked?: boolean;
  collapsible?: boolean;
}) {
  const serverInstructions: TaskInstructionsServerState = {
    pageId: page._id,
    value: page.instructions ?? "",
    revision: page.revision,
  };
  const [instructionsDraft, setInstructionsDraft] =
    useState<TaskInstructionsDraft>(() =>
      createTaskInstructionsDraft(serverInstructions),
    );
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const instructionsContentId = useId();
  const instructionsDraftRef = useRef(instructionsDraft);
  const instructionsSubmissionIdRef = useRef(0);
  const instructions =
    instructionsDraft.pageId === page._id
      ? instructionsDraft.value
      : serverInstructions.value;
  const instructionsState =
    instructionsDraft.pageId === page._id
      ? taskInstructionsSaveState(instructionsDraft)
      : "saved";
  useEffect(() => {
    const next = reconcileTaskInstructionsDraft(
      instructionsDraftRef.current,
      {
        pageId: page._id,
        value: page.instructions ?? "",
        revision: page.revision,
      },
    );
    if (next === instructionsDraftRef.current) return;
    instructionsDraftRef.current = next;
    setInstructionsDraft(next);
  }, [page._id, page.instructions, page.revision]);

  useEffect(() => {
    onSaveStateChange(instructionsState);
  }, [instructionsState, onSaveStateChange]);

  function changeInstructions(value: string) {
    const next = editTaskInstructionsDraft(
      instructionsDraftRef.current,
      serverInstructions,
      value,
    );
    instructionsDraftRef.current = next;
    setInstructionsDraft(next);
  }

  async function saveInstructions() {
    if (!canEdit) return;
    instructionsSubmissionIdRef.current += 1;
    const prepared = prepareTaskInstructionsSave(
      instructionsDraftRef.current,
      serverInstructions,
      instructionsSubmissionIdRef.current,
    );
    instructionsDraftRef.current = prepared.draft;
    setInstructionsDraft(prepared.draft);
    if (prepared.submission === null) return;
    try {
      const result = await updateMetadata({
        instructions: prepared.submission.value,
      });
      const next = resolveTaskInstructionsSave(
        instructionsDraftRef.current,
        prepared.submission,
        result.revision,
      );
      instructionsDraftRef.current = next;
      setInstructionsDraft(next);
      toast.success("Instrukcije sačuvane.");
    } catch (error) {
      const next = rejectTaskInstructionsSave(
        instructionsDraftRef.current,
        prepared.submission,
      );
      instructionsDraftRef.current = next;
      setInstructionsDraft(next);
      toast.error(error instanceof Error ? error.message : "Instrukcije nisu sačuvane.");
    }
  }

  return (
    <div
      className={cn(
        "grid gap-5 rounded-2xl border border-border/70 bg-card p-5 shadow-sm",
        stacked
          ? "grid-cols-1"
          : "md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]",
      )}
    >
      {!canEdit ? (
        <TaskContentLocks
          className={cn(!stacked && "md:col-span-2")}
          onDenied={(reason) => toast.error(reason)}
        />
      ) : null}
      {/* Instructions are the task's main content, so they lead the reading order. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Instrukcije
            </h3>
            {collapsible ? (
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={
                  instructionsExpanded
                    ? "Skupi instrukcije"
                    : "Proširi instrukcije"
                }
                aria-expanded={instructionsExpanded}
                aria-controls={instructionsContentId}
                onClick={() => setInstructionsExpanded((expanded) => !expanded)}
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    instructionsExpanded && "rotate-90",
                  )}
                />
              </button>
            ) : null}
          </div>
          <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
            {instructions.length}/20.000
          </span>
        </div>
        <div
          id={instructionsContentId}
          hidden={collapsible && !instructionsExpanded}
          className="space-y-3"
        >
          <textarea
            autoFocus={focusInstructions}
            value={instructions}
            onChange={(e) => changeInstructions(e.target.value)}
            onBlur={saveInstructions}
            readOnly={!canEdit}
            maxLength={20_000}
            aria-label="Instrukcije zadatka"
            placeholder="Napiši šta treba uraditi i koji rezultat se očekuje…"
            className="flex min-h-[11rem] w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-6 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div
            className="flex min-h-7 items-center justify-between gap-3 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span>
              {instructionsState === "saving"
                ? "Čuvam instrukcije…"
                : instructionsState === "dirty"
                  ? "Instrukcije imaju nesačuvane izmene."
                  : instructionsState === "error"
                    ? "Instrukcije nisu sačuvane."
                    : "Instrukcije su sačuvane."}
            </span>
            {instructionsState === "error" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={saveInstructions}
              >
                <RefreshCw className="size-3.5" />
                Pokušaj ponovo
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <TaskCheckpointList
        taskPageId={page._id}
        canCreate={canEdit}
        autoFocusCreate={focusCheckpointCreate}
        collapsible={collapsible}
      />

    </div>
  );
}

function PageBreadcrumbNav({
  startupName,
  areaLabel,
  breadcrumbs,
  onOpenArea,
  onOpenPage,
  onBack,
  backLabel,
  className,
}: {
  startupName: string;
  areaLabel: string;
  breadcrumbs: Array<{ _id: Id<"pages">; title: string }> | undefined;
  onOpenArea?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  /** Bez vrednosti nema dugmeta (dialog prezentacija — tamo je Esc zatvaranje). */
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}) {
  const backTitle = `Nazad na ${backLabel ?? "prethodni nivo"}`;
  return (
    <nav
      data-workspace-enter
      className={cn(
        "scrollbar-thin flex min-h-9 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground",
        className,
      )}
      aria-label="Putanja stranice"
    >
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mr-1 size-8 shrink-0 rounded-lg"
          aria-label={backTitle}
          title={backTitle}
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
      <span className="font-semibold text-foreground">{startupName}</span>
      <ChevronRight className="size-3.5" />
      <button
        type="button"
        className="max-w-40 truncate rounded px-1 py-1 hover:bg-accent hover:text-foreground"
        onClick={onOpenArea}
        disabled={!onOpenArea}
      >
        {areaLabel}
      </button>
      {breadcrumbs?.map((item, index) => {
        const isCurrent = index === breadcrumbs.length - 1;
        return (
          <span key={item._id} className="contents">
            <ChevronRight className="size-3.5" />
            {isCurrent ? (
              <span
                className="max-w-48 truncate px-1 py-1 font-semibold text-foreground"
                aria-current="page"
              >
                {item.title}
              </span>
            ) : (
              <button
                type="button"
                className="max-w-40 truncate rounded px-1 py-1 hover:bg-accent hover:text-foreground"
                onClick={() => onOpenPage(item._id)}
              >
                {item.title}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function EditorSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje zadatka" className="mx-auto w-full max-w-5xl space-y-4 px-4 py-7 sm:px-7 lg:px-10">
      <Skeleton className="h-6 w-72" />
      <Skeleton className="h-[38rem] rounded-xl" />
    </div>
  );
}
