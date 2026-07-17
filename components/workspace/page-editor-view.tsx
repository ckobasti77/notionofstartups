"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Archive, Check, CheckSquare2, ChevronRight, Clock3, Copy, FileText, LoaderCircle, Plus, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { ProfileAvatar, TaskPriorityBadge, TaskStatusBadge } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TASK_PRIORITY_META, TASK_STATUS_META, fromDateInputValue, toDateInputValue, type TaskPriority, type TaskStatus } from "@/lib/workspace";

export function PageEditorView({ startup, pageId, onOpenPage, onCreateChild, onArchived }: { startup: StartupWithAreas; pageId: Id<"pages">; onOpenPage: (pageId: Id<"pages">) => void; onCreateChild: (target: CreatePageTarget) => void; onArchived: () => void }) {
  const page = useQuery(api.pages.get, { pageId });
  const breadcrumbs = useQuery(api.pages.getBreadcrumbs, { pageId });
  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const updatePage = useMutation(api.pages.update);
  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const archivePage = useMutation(api.pages.archive);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error" | "conflict">("saved");
  const [autosaveTick, setAutosaveTick] = useState(0);
  const loadedPageId = useRef<string | null>(null);
  const activePageIdRef = useRef<string>(pageId);
  const baseRevisionRef = useRef(0);
  const localVersionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const latestDraftRef = useRef({ title: "", content: "" });

  useEffect(() => {
    activePageIdRef.current = pageId;
  }, [pageId]);

  useEffect(() => {
    if (!page) return;

    if (loadedPageId.current !== page._id) {
      loadedPageId.current = page._id;
      activePageIdRef.current = page._id;
      baseRevisionRef.current = page.revision;
      localVersionRef.current = 0;
      saveQueuedRef.current = false;
      const remoteDraft = { title: page.title, content: page.content };
      latestDraftRef.current = remoteDraft;
      setTitle(remoteDraft.title);
      setContent(remoteDraft.content);
      setSaveState("saved");
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

    baseRevisionRef.current = page.revision;
    const remoteDraft = { title: page.title, content: page.content };
    latestDraftRef.current = remoteDraft;
    setTitle(remoteDraft.title);
    setContent(remoteDraft.content);
  }, [page, saveState]);

  useEffect(() => {
    if (!page || saveState !== "dirty") return;
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
      const snapshotVersion = localVersionRef.current;
      const expectedRevision = baseRevisionRef.current;
      saveInFlightRef.current = true;
      saveQueuedRef.current = false;
      setSaveState("saving");
      let conflictDetected = false;

      try {
        const result = await updatePage({
          pageId: requestPageId,
          title: snapshot.title,
          content: snapshot.content,
          expectedRevision,
        });
        if (activePageIdRef.current !== requestPageId) return;

        baseRevisionRef.current = result.revision;
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
  }, [autosaveTick, content, page, pageId, saveState, title, updatePage]);

  useEffect(() => {
    if (saveState === "saved") return;
    const warnAboutUnsavedDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnAboutUnsavedDraft);
    return () => window.removeEventListener("beforeunload", warnAboutUnsavedDraft);
  }, [saveState]);

  function markDraftChanged(nextDraft: { title: string; content: string }) {
    latestDraftRef.current = nextDraft;
    localVersionRef.current += 1;
    setSaveState((current) => current === "conflict" ? "conflict" : "dirty");
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
    baseRevisionRef.current = page.revision;
    localVersionRef.current += 1;
    latestDraftRef.current = remoteDraft;
    saveQueuedRef.current = false;
    setTitle(remoteDraft.title);
    setContent(remoteDraft.content);
    setSaveState("saved");
    toast.success("Učitana je poslednja timska verzija.");
  }

  async function setTaskMetadata(patch: { status?: TaskStatus; priority?: TaskPriority; assigneeProfileId?: Id<"profiles"> | null; dueDate?: number | null }) {
    try { await updateMetadata({ pageId, ...patch }); toast.success("Zadatak je ažuriran."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Podaci zadatka nisu sačuvani."); }
  }

  async function archive() {
    if (!window.confirm("Arhivirati ovu stranicu? Njene podstranice više neće biti vidljive.")) return;
    try { await archivePage({ pageId }); toast.success("Stranica je arhivirana."); onArchived(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Stranica nije arhivirana."); }
  }

  if (page === undefined) return <EditorSkeleton />;
  const pageArea = startup.areas.find((area) => area._id === page.areaId);
  const status = (page.taskStatus ?? "backlog") as TaskStatus;
  const priority = (page.taskPriority ?? "medium") as TaskPriority;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 sm:px-7 lg:px-10 lg:pt-6">
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
        <header className="border-b border-border/65 px-5 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-7">
          <div className="flex items-start gap-3"><span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/9 text-primary">{page.kind === "task" ? <CheckSquare2 className="size-4.5" /> : <FileText className="size-4.5" />}</span><div className="min-w-0 flex-1"><Input aria-label="Naslov stranice" value={title} onChange={(event) => { const nextTitle = event.target.value; setTitle(nextTitle); markDraftChanged({ ...latestDraftRef.current, title: nextTitle }); }} className="h-auto border-0 bg-transparent px-0 py-0 text-2xl font-bold tracking-[-0.04em] shadow-none focus-visible:ring-0 sm:text-3xl" maxLength={200} /><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5">{saveState === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : saveState === "saved" ? <Check className="size-3.5 text-success" /> : saveState === "conflict" ? <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-300" /> : <Clock3 className="size-3.5" />}{saveState === "saving" ? "Čuvam…" : saveState === "saved" ? "Sačuvano" : saveState === "error" ? "Čuvanje nije uspelo" : saveState === "conflict" ? "Konflikt izmena" : !title.trim() ? "Unesi naslov za čuvanje" : "Izmene čekaju"}</span>{page.updater ? <span>Ažurirao/la {page.updater.displayName}</span> : null}</div></div><Button type="button" variant="ghost" size="icon" aria-label="Arhiviraj stranicu" onClick={archive}><Archive /></Button></div>
          {page.kind === "task" ? <div className="mt-5 grid gap-3 rounded-xl border border-border/65 bg-muted/25 p-3 sm:grid-cols-2 lg:grid-cols-4"><div><span className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground">Status</span><Select value={status} onValueChange={(value) => setTaskMetadata({ status: value as TaskStatus })}><SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_STATUS_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div><div><span className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground">Prioritet</span><Select value={priority} onValueChange={(value) => setTaskMetadata({ priority: value as TaskPriority })}><SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_PRIORITY_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div><div><span className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground">Dodeljeno</span><Select value={page.assigneeProfileId ?? "none"} onValueChange={(value) => setTaskMetadata({ assigneeProfileId: value === "none" ? null : value as Id<"profiles"> })}><SelectTrigger className="h-9 bg-card"><SelectValue placeholder="Nije dodeljen" /></SelectTrigger><SelectContent><SelectItem value="none">Nije dodeljen</SelectItem>{members?.map(({ profile }) => <SelectItem key={profile._id} value={profile._id}>{profile.displayName}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-muted-foreground" htmlFor="task-due-date">Rok</label><Input id="task-due-date" type="date" className="h-9 bg-card" value={toDateInputValue(page.dueDate)} onChange={(event) => setTaskMetadata({ dueDate: event.target.value ? fromDateInputValue(event.target.value) ?? null : null })} /></div></div> : null}
        </header>
        <div className="px-5 sm:px-8"><RichTextEditor key={page._id} documentKey={page._id} content={content} onChange={({ html }) => { setContent(html); markDraftChanged({ ...latestDraftRef.current, content: html }); }} /></div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/65 bg-muted/20 px-5 py-4 sm:px-8"><div className="flex items-center gap-2 text-xs text-muted-foreground">{page.creator ? <><ProfileAvatar profile={page.creator} className="size-6" /> Kreirao/la {page.creator.displayName}</> : <><UserRound className="size-4" /> Autor nije dostupan</>}</div><Button variant="outline" size="sm" onClick={() => onCreateChild({ areaId: page.areaId, parentPageId: page._id })}><Plus /> Podstranica</Button></footer>
      </article>
      {page.kind === "task" ? <div data-workspace-enter className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3"><TaskStatusBadge status={status} /><TaskPriorityBadge priority={priority} /></div> : null}
    </div>
  );
}

function EditorSkeleton() { return <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-7 sm:px-7 lg:px-10"><Skeleton className="h-6 w-72" /><Skeleton className="h-[38rem] rounded-2xl" /></div>; }
