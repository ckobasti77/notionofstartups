"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AlertTriangle, Archive, Check, CheckSquare2, ChevronRight, Clock3, Copy, FileText, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { pageEntryDisplayText } from "@/components/workspace/page-entry-text";
import { PageRelationsPanel } from "@/components/workspace/page-relations";
import {
  activatePageRevision,
  createTaskInstructionsDraft,
  createPageRevisionLedger,
  editTaskInstructionsDraft,
  prepareTaskInstructionsSave,
  readPageRevision,
  reconcileTaskInstructionsDraft,
  rejectTaskInstructionsSave,
  resolvePageRevision,
  resolveTaskInstructionsSave,
  taskInstructionsSaveState,
  type PageRevisionLedger,
  type TaskInstructionsDraft,
  type TaskInstructionsSaveState,
  type TaskInstructionsServerState,
} from "@/components/workspace/task-instructions-draft";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { TASK_PRIORITY_META, TASK_STATUS_META, fromDateInputValue, toDateInputValue, type TaskPriority, type TaskStatus } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export type PageEditorSaveState =
  | "saved"
  | "saving"
  | "dirty"
  | "error"
  | "conflict"
  | "invalid";

function combinedEditorSaveState(
  pageState: PageEditorSaveState,
  instructionsState: TaskInstructionsSaveState,
): PageEditorSaveState {
  if (pageState === "saving" || instructionsState === "saving") {
    return "saving";
  }
  if (pageState === "dirty" || instructionsState === "dirty") {
    return "dirty";
  }
  if (pageState === "invalid") return "invalid";
  if (pageState === "conflict") return "conflict";
  if (pageState === "error" || instructionsState === "error") {
    return "error";
  }
  return "saved";
}

export function PageEditorView({
  startup,
  pageId,
  onOpenPage,
  onCreateChild,
  onArchived,
  presentation = "page",
  onSaveStateChange,
}: {
  startup: StartupWithAreas;
  pageId: Id<"pages">;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
  onArchived: () => void;
  presentation?: "page" | "dialog";
  onSaveStateChange?: (state: PageEditorSaveState) => void;
}) {
  const page = useQuery(api.pages.get, { pageId });
  const breadcrumbs = useQuery(api.pages.getBreadcrumbs, { pageId });
  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const updatePage = useMutation(api.areasV2.updatePage);
  const archivePage = useMutation(api.areasV2.archivePage);
  const relationsResult = useQuery(api.areasV2.listRelations, {
    startupId: startup._id,
    pageId,
  });
  const createRelation = useMutation(api.areasV2.createRelation);
  const deleteRelation = useMutation(api.areasV2.deleteRelation);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [draftPageId, setDraftPageId] = useState<Id<"pages"> | null>(null);
  const [saveState, setSaveState] = useState<PageEditorSaveState>("saved");
  const [instructionsSaveState, setInstructionsSaveState] =
    useState<TaskInstructionsSaveState>("saved");
  const [autosaveTick, setAutosaveTick] = useState(0);
  const [selectedRelationPageId, setSelectedRelationPageId] = useState<
    Id<"pages"> | ""
  >("");
  const [relationBusy, setRelationBusy] = useState(false);
  const loadedPageId = useRef<string | null>(null);
  const activePageIdRef = useRef<string>(pageId);
  const baseRevisionRef = useRef(0);
  const localVersionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const pageUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pageRevisionLedgerRef = useRef<PageRevisionLedger>(
    createPageRevisionLedger(pageId, 0),
  );
  const latestDraftRef = useRef({ title: "", content: "" });
  const editorSaveState = combinedEditorSaveState(
    saveState,
    instructionsSaveState,
  );
  const enqueuePageUpdate = useCallback(
    <Result,>(operation: () => Promise<Result>) => {
      const queued = pageUpdateQueueRef.current.then(operation, operation);
      pageUpdateQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [],
  );

  useLayoutEffect(() => {
    activePageIdRef.current = pageId;
    activatePageRevision(pageRevisionLedgerRef.current, pageId);
  }, [pageId]);

  useEffect(() => {
    if (!page) return;

    if (loadedPageId.current !== page._id) {
      loadedPageId.current = page._id;
      activePageIdRef.current = page._id;
      activatePageRevision(
        pageRevisionLedgerRef.current,
        page._id,
        page.revision,
      );
      baseRevisionRef.current = readPageRevision(
        pageRevisionLedgerRef.current,
        page._id,
        page.revision,
      );
      localVersionRef.current = 0;
      saveQueuedRef.current = false;
      const remoteDraft = { title: page.title, content: page.content };
      latestDraftRef.current = remoteDraft;
      setTitle(remoteDraft.title);
      setContent(remoteDraft.content);
      setDraftPageId(page._id);
      setSaveState("saved");
      setInstructionsSaveState("saved");
      return;
    }

    // Reaktivne izmene sa servera prihvatamo samo kada lokalni nacrt nije
    // promenjen. Dok je nacrt dirty/saving/conflict, baseRevision ostaje
    // prikovan za verziju od koje je korisnik krenuo, pa sledece cuvanje mora
    // ili uspeti nad tom verzijom ili eksplicitno prijaviti konflikt.
    if (saveState !== "saved" || page.revision < baseRevisionRef.current) return;
    if (
      page.revision === baseRevisionRef.current
      && page.title === latestDraftRef.current.title
      && page.content === latestDraftRef.current.content
    ) return;

    activatePageRevision(
      pageRevisionLedgerRef.current,
      page._id,
      page.revision,
    );
    baseRevisionRef.current = readPageRevision(
      pageRevisionLedgerRef.current,
      page._id,
      page.revision,
    );
    const remoteDraft = { title: page.title, content: page.content };
    latestDraftRef.current = remoteDraft;
    setTitle(remoteDraft.title);
    setContent(remoteDraft.content);
  }, [page, saveState]);

  useEffect(() => {
    if (!page || !page.permissions.canEdit || saveState !== "dirty") return;
    const timer = window.setTimeout(async () => {
      if (saveInFlightRef.current) {
        saveQueuedRef.current = true;
        return;
      }

      const snapshot = {
        title: latestDraftRef.current.title.trim(),
        content: latestDraftRef.current.content,
      };
      if (!snapshot.title) return;

      const requestPageId = pageId;
      const fallbackRevision = baseRevisionRef.current;
      const snapshotVersion = localVersionRef.current;
      saveInFlightRef.current = true;
      saveQueuedRef.current = false;
      setSaveState("saving");
      let conflictDetected = false;

      try {
        const result = await enqueuePageUpdate(() =>
          updatePage({
            startupId: startup._id,
            pageId: requestPageId,
            title: snapshot.title,
            content: snapshot.content,
            expectedRevision: readPageRevision(
              pageRevisionLedgerRef.current,
              requestPageId,
              fallbackRevision,
            ),
          }),
        );
        const activeRevision = resolvePageRevision(
          pageRevisionLedgerRef.current,
          requestPageId,
          result.revision,
        );
        if (activePageIdRef.current !== requestPageId) return;

        if (activeRevision !== null) {
          baseRevisionRef.current = activeRevision;
        }
        setSaveState(localVersionRef.current === snapshotVersion ? "saved" : "dirty");
      } catch (error) {
        if (activePageIdRef.current !== requestPageId) return;

        if (String(error).includes("KONFLIKT_IZMENA")) {
          conflictDetected = true;
          saveQueuedRef.current = false;
          setSaveState("conflict");
        } else {
          setSaveState(localVersionRef.current === snapshotVersion ? "error" : "dirty");
          toast.error(error instanceof Error ? error.message : "Izmene nisu sačuvane.");
        }
      } finally {
        saveInFlightRef.current = false;
        if (
          !conflictDetected
          && saveQueuedRef.current
        ) {
          saveQueuedRef.current = false;
          setAutosaveTick((tick) => tick + 1);
        }
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    autosaveTick,
    content,
    enqueuePageUpdate,
    page,
    pageId,
    saveState,
    startup._id,
    title,
    updatePage,
  ]);

  useEffect(() => {
    if (editorSaveState === "saved") return;
    const warnAboutUnsavedDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnAboutUnsavedDraft);
    return () => window.removeEventListener("beforeunload", warnAboutUnsavedDraft);
  }, [editorSaveState]);

  useEffect(() => {
    onSaveStateChange?.(editorSaveState);
  }, [editorSaveState, onSaveStateChange]);

  function markDraftChanged(nextDraft: { title: string; content: string }) {
    latestDraftRef.current = nextDraft;
    localVersionRef.current += 1;
    setSaveState((current) =>
      !nextDraft.title.trim()
        ? "invalid"
        : current === "conflict"
          ? "conflict"
          : "dirty",
    );
  }

  async function copyLocalDraft() {
    const draft = latestDraftRef.current;
    const parsedContent = new DOMParser().parseFromString(draft.content, "text/html");
    const plainText = parsedContent.body.textContent?.trim();
    const text = [draft.title.trim(), plainText].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Tvoj nacrt je kopiran.");
    } catch {
      toast.error("Nacrt nije moguće kopirati. Obeleži sadržaj i kopiraj ga ručno.");
    }
  }

  function loadTeamVersion() {
    if (!page || page.revision <= baseRevisionRef.current) {
      toast.info("Timska verzija još stiže. Pokušaj ponovo za trenutak.");
      return;
    }

    const remoteDraft = { title: page.title, content: page.content };
    activatePageRevision(
      pageRevisionLedgerRef.current,
      page._id,
      page.revision,
    );
    baseRevisionRef.current = readPageRevision(
      pageRevisionLedgerRef.current,
      page._id,
      page.revision,
    );
    localVersionRef.current += 1;
    latestDraftRef.current = remoteDraft;
    saveQueuedRef.current = false;
    setTitle(remoteDraft.title);
    setContent(remoteDraft.content);
    setSaveState("saved");
    toast.success("Učitana je poslednja timska verzija.");
  }

  async function updateTaskMetadata(patch: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeProfileId?: Id<"profiles"> | null;
    dueDate?: number | null;
    instructions?: string | null;
    checkpoints?: Array<{ id: string; text: string; completed: boolean }> | null;
  }) {
    const requestPageId = pageId;
    const fallbackRevision = baseRevisionRef.current;
    const result = await enqueuePageUpdate(() =>
      updatePage({
        startupId: startup._id,
        pageId: requestPageId,
        expectedRevision: readPageRevision(
          pageRevisionLedgerRef.current,
          requestPageId,
          fallbackRevision,
        ),
        ...(patch.status === undefined ? {} : { taskStatus: patch.status }),
        ...(patch.priority === undefined
          ? {}
          : { taskPriority: patch.priority }),
        ...(patch.assigneeProfileId === undefined
          ? {}
          : { assigneeProfileId: patch.assigneeProfileId }),
        ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
        ...(patch.instructions === undefined
          ? {}
          : { instructions: patch.instructions }),
        ...(patch.checkpoints === undefined
          ? {}
          : { checkpoints: patch.checkpoints }),
      }),
    );
    const activeRevision = resolvePageRevision(
      pageRevisionLedgerRef.current,
      requestPageId,
      result.revision,
    );
    if (
      activeRevision !== null &&
      activePageIdRef.current === requestPageId
    ) {
      baseRevisionRef.current = activeRevision;
    }
    return result;
  }

  async function setTaskMetadata(patch: { status?: TaskStatus; priority?: TaskPriority; assigneeProfileId?: Id<"profiles"> | null; dueDate?: number | null }) {
    if (!page?.permissions.canEdit) return;
    try { await updateTaskMetadata(patch); toast.success("Zadatak je ažuriran."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Podaci zadatka nisu sačuvani."); }
  }

  async function archive() {
    if (!page) return;
    if (
      editorSaveState === "dirty" ||
      editorSaveState === "saving"
    ) {
      toast.info("Sačekaj trenutak da se izmene sačuvaju.");
      return;
    }
    if (
      (editorSaveState === "invalid" ||
        editorSaveState === "error" ||
        editorSaveState === "conflict") &&
      !window.confirm(
        "Postoje izmene koje nisu sačuvane. Arhivirati stranicu i odbaciti taj nacrt?",
      )
    ) {
      return;
    }
    if (!page.permissions.canDeleteDirectly) {
      try {
        await requestDeletion({
          target: { kind: "page", id: page._id },
        });
        toast.success("Glasanje o brisanju je pokrenuto.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Zahtev nije poslat.",
        );
      }
      return;
    }
    if (!window.confirm("Arhivirati ovu stranicu? Podstranice će biti izvučene nivo iznad.")) return;
    try { await archivePage({ startupId: startup._id, pageId }); toast.success("Stranica je arhivirana."); onArchived(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Stranica nije arhivirana."); }
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

  async function requestUnlinkPage(relationId: Id<"pageRelations">) {
    if (relationBusy) return;
    setRelationBusy(true);
    try {
      await requestDeletion({
        target: { kind: "page_relation", id: relationId },
      });
      toast.success(
        "Zahtev za uklanjanje veze je poslat na odobravanje.",
      );
    } finally {
      setRelationBusy(false);
    }
  }

  // Tiptap must not mount with the empty local defaults. Its initial update can
  // otherwise mark that placeholder as a user edit and autosave it over the
  // body that was just created (notably after converting a private thought).
  if (!page || page._id !== pageId || draftPageId !== page._id) {
    return <EditorSkeleton presentation={presentation} />;
  }
  const pageArea = startup.areas.find((area) => area._id === page.areaId);
  const status = (page.taskStatus ?? "backlog") as TaskStatus;
  const priority = (page.taskPriority ?? "medium") as TaskPriority;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-5xl",
        presentation === "dialog"
          ? "px-4 pb-16 pt-4 sm:px-6 sm:pb-10"
          : "px-4 pb-24 pt-4 sm:px-7 lg:px-10 lg:pt-6",
      )}
    >
      <nav data-workspace-enter className="scrollbar-thin mb-5 flex min-h-9 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground" aria-label="Putanja stranice">
        <span className="font-semibold text-foreground">{startup.name}</span><ChevronRight className="size-3.5" /><span>{pageArea?.label ?? "Oblast"}</span>
        {breadcrumbs?.slice(0, -1).map((item) => <span key={item._id} className="contents"><ChevronRight className="size-3.5" /><button type="button" className="max-w-40 truncate rounded px-1 py-1 hover:bg-accent hover:text-foreground" onClick={() => onOpenPage(item._id)}>{item.title}</button></span>)}
      </nav>
      <article data-workspace-enter className="desk-surface overflow-hidden rounded-[1.35rem] border border-border/75 bg-card">
        {saveState === "conflict" ? (
          <section
            className="flex flex-col gap-3 border-b border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-foreground">Neko iz tima je izmenio ovu stranicu.</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Tvoj nacrt je ostao netaknut. Kopiraj ga pre nego što učitaš poslednju timsku verziju.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" size="sm" onClick={copyLocalDraft}>
                <Copy /> Kopiraj moj nacrt
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={loadTeamVersion}
              >
                <RefreshCw /> Učitaj timsku verziju
              </Button>
            </div>
          </section>
        ) : null}
        <header
          className={cn(
            "border-b border-border/65 bg-card px-5 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-7",
            presentation === "dialog" && "sticky top-0 z-20",
          )}
        >
          <div className="flex items-start gap-3"><span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/9 text-primary">{page.kind === "task" ? <CheckSquare2 className="size-4.5" /> : <FileText className="size-4.5" />}</span><div className="min-w-0 flex-1"><Input disabled={!page.permissions.canEdit} aria-invalid={saveState === "invalid"} aria-label="Naslov stranice" value={title} onChange={(event) => { const nextTitle = event.target.value; setTitle(nextTitle); markDraftChanged({ ...latestDraftRef.current, title: nextTitle }); }} className="h-auto border-0 bg-transparent px-0 py-0 text-2xl font-bold tracking-[-0.04em] shadow-none disabled:opacity-100 focus-visible:ring-0 sm:text-3xl" maxLength={200} /><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5">{page.permissions.canEdit ? (saveState === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : saveState === "saved" ? <Check className="size-3.5 text-success" /> : saveState === "conflict" || saveState === "invalid" ? <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-300" /> : <Clock3 className="size-3.5" />) : <UserRound className="size-3.5" />}{page.permissions.canEdit ? (saveState === "saving" ? "Čuvam…" : saveState === "saved" ? "Sačuvano" : saveState === "error" ? "Čuvanje nije uspelo" : saveState === "conflict" ? "Konflikt izmena" : saveState === "invalid" ? "Naslov je obavezan" : "Izmene čekaju") : "Osnovni sadržaj menja samo kreator"}</span>{page.updater ? <span>Ažurirao/la {page.updater.displayName}</span> : null}</div></div><Button type="button" variant="ghost" size="icon" aria-label={page.permissions.canDeleteDirectly ? "Arhiviraj stranicu" : "Zatraži brisanje stranice"} onClick={archive}><Archive /></Button></div>
          {page.kind === "task" ? <div className="mt-5 grid gap-3 rounded-xl border border-border/65 bg-muted/25 p-3 sm:grid-cols-2 lg:grid-cols-4"><div><span className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground">Status</span><Select value={status} disabled={!page.permissions.canEdit} onValueChange={(value) => setTaskMetadata({ status: value as TaskStatus })}><SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_STATUS_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div><div><span className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground">Prioritet</span><Select value={priority} disabled={!page.permissions.canEdit} onValueChange={(value) => setTaskMetadata({ priority: value as TaskPriority })}><SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_PRIORITY_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div><div><span className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground">Dodeljeno</span><Select value={page.assigneeProfileId ?? "none"} disabled={!page.permissions.canEdit} onValueChange={(value) => setTaskMetadata({ assigneeProfileId: value === "none" ? null : value as Id<"profiles"> })}><SelectTrigger className="h-9 bg-card"><SelectValue placeholder="Nije dodeljen" /></SelectTrigger><SelectContent><SelectItem value="none">Nije dodeljen</SelectItem>{members?.map(({ profile }) => <SelectItem key={profile._id} value={profile._id}>{profile.displayName}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground" htmlFor="task-due-date">Rok</label><Input id="task-due-date" type="date" disabled={!page.permissions.canEdit} className="h-9 bg-card" value={toDateInputValue(page.dueDate)} onChange={(event) => setTaskMetadata({ dueDate: event.target.value ? fromDateInputValue(event.target.value) ?? null : null })} /></div></div> : null}
        </header>
        <div className="px-5 sm:px-8">
          {page.kind === "note" ? (
            <RichTextEditor
              key={page._id}
              documentKey={page._id}
              content={content}
              editable={page.permissions.canEditBody}
              onChange={({ html }) => {
                setContent(html);
                markDraftChanged({ ...latestDraftRef.current, content: html });
              }}
            />
          ) : (
            <div className="py-6">
              <TaskDetailWidgets
                page={page}
                canEdit={page.permissions.canEdit}
                updateMetadata={updateTaskMetadata}
                onSaveStateChange={setInstructionsSaveState}
              />
              {pageEntryDisplayText(content).trim() ? (
                <section className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-5">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-muted-foreground">
                    Dodatni kontekst
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85">
                    {pageEntryDisplayText(content)}
                  </p>
                </section>
              ) : null}
            </div>
          )}

          <div className="pb-1 pt-2">
            <PageRelationsPanel
              loading={relationsResult === undefined}
              currentKind={page.kind}
              relations={(relationsResult?.relations ?? []).map((relation) => ({
                id: relation._id,
                pageId: relation.linkedPage.pageId,
                title: relation.linkedPage.title,
                kind: relation.linkedPage.kind,
                canDelete: relation.canDelete,
                canRequestDeletion: relation.canRequestDeletion,
              }))}
              candidates={(relationsResult?.candidates ?? []).map(
                (candidate) => ({
                  pageId: candidate.pageId,
                  title: candidate.title,
                  kind: candidate.kind,
                }),
              )}
              candidatesTruncated={
                relationsResult?.candidatesTruncated ?? false
              }
              selectedCandidate={selectedRelationPageId}
              onSelectedCandidate={setSelectedRelationPageId}
              busy={relationBusy}
              onCreate={linkSelectedPage}
              onDelete={unlinkPage}
              onRequestDeletion={requestUnlinkPage}
              onOpenPage={onOpenPage}
            />
          </div>

          {/* Block-level Author Entries (Sadržaj sa autorstvom članova) */}
          <PageAuthorEntries page={page} />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/65 bg-muted/20 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {page.creator ? (
              <>
                <ProfileAvatar profile={page.creator} className="size-6" />
                <span>Kreirao/la <strong className="font-semibold text-foreground">{page.creator.displayName}</strong></span>
              </>
            ) : (
              <>
                <UserRound className="size-4" /> Autor nije dostupan
              </>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onCreateChild({ areaId: page.areaId, parentPageId: page._id })}>
            <Plus /> Podstranica
          </Button>
        </footer>
      </article>
    </div>
  );
}

function TaskDetailWidgets({
  page,
  canEdit,
  updateMetadata,
  onSaveStateChange,
}: {
  page: Doc<"pages">;
  canEdit: boolean;
  updateMetadata: (args: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeProfileId?: Id<"profiles"> | null;
    dueDate?: number | null;
    instructions?: string | null;
    checkpoints?: Array<{ id: string; text: string; completed: boolean }> | null;
  }) => Promise<{ revision: number }>;
  onSaveStateChange: (state: TaskInstructionsSaveState) => void;
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
  const [newCpText, setNewCpText] = useState("");
  const checkpoints: Array<{ id: string; text: string; completed: boolean }> =
    (page.checkpoints as Array<{ id: string; text: string; completed: boolean }>) ?? [];

  const completedCount = checkpoints.filter((c) => c.completed).length;
  const totalCount = checkpoints.length;

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

  async function toggleCheckpoint(cpId: string) {
    if (!canEdit) return;
    const updated = checkpoints.map((cp) =>
      cp.id === cpId ? { ...cp, completed: !cp.completed } : cp,
    );
    try {
      await updateMetadata({ checkpoints: updated });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Greska pri ažuriranju podzadataka.");
    }
  }

  async function addCheckpoint() {
    if (!canEdit) return;
    const text = newCpText.trim();
    if (!text || checkpoints.length >= 100) return;
    const newItem = {
      id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      text,
      completed: false,
    };
    setNewCpText("");
    try {
      await updateMetadata({ checkpoints: [...checkpoints, newItem] });
      toast.success("Podzadatak je dodat.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Greska pri dodavanju podzadatka.");
    }
  }

  async function removeCheckpoint(cpId: string) {
    if (!canEdit) return;
    const updated = checkpoints.filter((cp) => cp.id !== cpId);
    try {
      await updateMetadata({ checkpoints: updated });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Greska pri brisanju podzadatka.");
    }
  }

  return (
    <div className="grid gap-5 rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
      {!canEdit ? (
        <p className="text-xs text-muted-foreground md:col-span-2">
          Task podatke i checkpoint-e menja samo autor. Detalje možeš da pregledaš.
        </p>
      ) : null}
      {/* Instructions are the task's main content, so they lead the reading order. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Instrukcije
          </h3>
          <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
            {instructions.length}/20.000
          </span>
        </div>
        <textarea
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

      {/* Checkpoints Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Podzadaci / Checkpointi
          </h3>
          {totalCount > 0 ? (
            <span className="text-xs font-semibold text-primary">
              {completedCount} / {totalCount} završeno ({Math.round((completedCount / totalCount) * 100)}%)
            </span>
          ) : null}
        </div>

        {totalCount > 0 ? (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
              role="progressbar"
              aria-label="Napredak checkpointa"
              aria-valuemin={0}
              aria-valuemax={totalCount}
              aria-valuenow={completedCount}
            />
          </div>
        ) : null}

        <div className="flex gap-2">
          <Input
            value={newCpText}
            onChange={(e) => setNewCpText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheckpoint(); } }}
            disabled={!canEdit}
            maxLength={500}
            aria-label="Novi checkpoint"
            placeholder="Dodaj novi podzadatak..."
            className="h-9 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={addCheckpoint}
            disabled={!canEdit || checkpoints.length >= 100}
            className="h-9 text-xs"
          >
            <Plus className="size-3.5" /> Dodaj
          </Button>
        </div>

        {checkpoints.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">Još nema podzadataka.</p>
        ) : (
          <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-2">
            {checkpoints.map((cp) => (
              <div key={cp.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-xs border border-border/40">
                <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={cp.completed}
                    onChange={() => toggleCheckpoint(cp.id)}
                    disabled={!canEdit}
                    className="size-4 rounded border-primary text-primary accent-primary"
                  />
                  <span className={cp.completed ? "line-through text-muted-foreground truncate" : "font-semibold truncate text-foreground"}>
                    {cp.text}
                  </span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeCheckpoint(cp.id)}
                  disabled={!canEdit}
                  aria-label={`Ukloni checkpoint: ${cp.text}`}
                >
                  <Archive className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function EditorSkeleton({
  presentation = "page",
}: {
  presentation?: "page" | "dialog";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-5xl space-y-4",
        presentation === "dialog"
          ? "px-4 py-5 sm:px-6"
          : "px-4 py-7 sm:px-7 lg:px-10",
      )}
    >
      <Skeleton className="h-6 w-72" />
      <Skeleton className="h-[38rem] rounded-2xl" />
    </div>
  );
}

function PageAuthorEntries({ page }: { page: Doc<"pages"> }) {
  const [newEntryText, setNewEntryText] = useState("");
  const [editingEntryId, setEditingEntryId] =
    useState<Id<"contentContributions"> | null>(null);
  const [editingEntryText, setEditingEntryText] = useState("");
  const {
    results: entries,
    status: entriesStatus,
    loadMore: loadMoreEntries,
  } = usePaginatedQuery(
    api.collaboration.listContributionsPaginated,
    { target: { kind: "page", id: page._id } },
    { initialNumItems: 40 },
  );
  const addEntry = useMutation(api.pages.addEntry);
  const updateEntry = useMutation(api.collaboration.updateContribution);
  const deleteEntry = useMutation(api.collaboration.deleteOwnContribution);
  const restoreEntry = useMutation(api.collaboration.restoreOwnContribution);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);

  const handleAddEntry = async () => {
    if (!newEntryText.trim()) return;
    try {
      await addEntry({
        pageId: page._id,
        content: newEntryText.trim(),
      });
      setNewEntryText("");
      toast.success("Unos sa vašim autorstvom je uspešno dodat!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Greška pri dodavanju unosa.");
    }
  };

  const handleDeleteEntry = async (
    entry: NonNullable<typeof entries>[number],
  ) => {
    try {
      if (!entry.canDeleteDirectly) {
        await requestDeletion({
          target: { kind: "contribution", id: entry._id },
        });
        toast.success("Glasanje o brisanju je pokrenuto.");
        return;
      }
      await deleteEntry({
        contributionId: entry._id,
      });
      toast.success("Tekst je uklonjen.", {
        duration: 8_000,
        action: {
          label: "Undo",
          onClick: () =>
            void restoreEntry({ contributionId: entry._id }).catch((error) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Tekst nije vraćen.",
              ),
            ),
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Greška pri brisanju.");
    }
  };

  return (
    <div className="my-8 space-y-6 border-t border-border/60 pt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
          Potpisani doprinosi članova ({entries?.length ?? 0})
        </h3>
        <span className="text-xs text-muted-foreground">
          Svaki član ima svoj označen blok sa avatarom i vremenom
        </span>
      </div>

      {/* Render existing author entries */}
      <div className="space-y-4">
        {entriesStatus === "LoadingFirstPage" ? (
          <Skeleton className="h-28 rounded-2xl" />
        ) : entries.length === 0 && entriesStatus === "Exhausted" ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Još nema izmena članova.
          </div>
        ) : entries.map((entry) => {
          const formattedTime = new Date(entry.createdAt).toLocaleString("sr-RS", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div
              key={entry._id}
              className="flex items-start gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:border-primary/30"
            >
              {/* Left Side: Avatar with clear spacing */}
              <div className="shrink-0 pt-0.5">
                <ProfileAvatar
                  profile={{
                    displayName: entry.author?.displayName || "Član",
                    avatarUrl: entry.author?.avatarUrl || null,
                  }}
                  className="size-9 ring-2 ring-primary/20"
                />
              </div>

              {/* Main Entry Content */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    {entry.author?.displayName ||
                      (entry.attribution === "legacy_neutral"
                        ? "Raniji zajednički sadržaj"
                        : "Član tima")}
                  </span>
                  <div className="flex gap-1">
                    {entry.canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          setEditingEntryId(entry._id);
                          setEditingEntryText(entry.content);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={
                        entry.canDeleteDirectly
                          ? "Obriši moj tekst"
                          : "Zatraži brisanje teksta"
                      }
                      onClick={() => void handleDeleteEntry(entry)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {editingEntryId === entry._id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingEntryText}
                      onChange={(event) =>
                        setEditingEntryText(event.target.value)
                      }
                      className="min-h-28 w-full rounded-xl border border-input bg-background p-3 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingEntryId(null)}
                      >
                        <X /> Otkaži
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          void updateEntry({
                            contributionId: entry._id,
                            content: editingEntryText,
                          })
                            .then(() => {
                              setEditingEntryId(null);
                              toast.success("Tekst je sačuvan.");
                            })
                            .catch((error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Tekst nije sačuvan.",
                              ),
                            )
                        }
                      >
                        Sačuvaj
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                    {pageEntryDisplayText(entry.content)}
                  </div>
                )}

                {/* Bottom Timestamp */}
                <div className="pt-1 text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock3 className="size-3 text-muted-foreground" />
                  <span>Napisano: {formattedTime}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {entriesStatus === "CanLoadMore" ||
      entriesStatus === "LoadingMore" ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={entriesStatus === "LoadingMore"}
            onClick={() => loadMoreEntries(40)}
          >
            {entriesStatus === "LoadingMore"
              ? "Učitavanje…"
              : "Učitaj još izmena"}
          </Button>
        </div>
      ) : null}

      {/* Add New Entry Box */}
      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-4 space-y-3">
        <label className="text-xs font-semibold text-foreground block">
          Dodaj svoj doprinos na ovoj stranici (sa tvojim avatarom i vremenom):
        </label>
        <textarea
          value={newEntryText}
          onChange={(e) => setNewEntryText(e.target.value)}
          placeholder="Napiši tvoj deo teksta, zapažanja ili izmene..."
          className="w-full min-h-[90px] rounded-xl border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleAddEntry}
            disabled={!newEntryText.trim()}
            className="rounded-xl text-xs bg-primary text-primary-foreground font-medium gap-1.5"
          >
            <Plus className="size-3.5" />
            <span>Objavi moj unos</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
