"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { toast } from "sonner";
import { gsap } from "gsap";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Building2, ExternalLink, FileText, LoaderCircle, Search, Sparkles } from "lucide-react";

import { ActivityView } from "@/components/workspace/activity-view";
import { ApprovalsView } from "@/components/workspace/approvals-view";
import { AdminDialog } from "@/components/workspace/admin-dialog";
import { AreaView } from "@/components/workspace/area-view";
import { CreatePageDialog } from "@/components/workspace/create-page-dialog";
import { CreateAreaDialog } from "@/components/workspace/create-area-dialog";
import { HomeView } from "@/components/workspace/home-view";
import { IdeasView } from "@/components/workspace/ideas-view";
import { ProfileDialog } from "@/components/workspace/profile-dialog";
import { SearchDialog } from "@/components/workspace/search-dialog";
import { TasksView } from "@/components/workspace/tasks-view";
import { ThoughtDestinationPicker } from "@/components/workspace/thought-destination-picker";
import { StartupLogo } from "@/components/workspace/workspace-ui";
import { ThoughtSidebarDragLayer } from "@/components/workspace/thought-sidebar-drag";
import type {
  ThoughtDestination,
  ThoughtDestinationRequest,
  ThoughtDropTarget,
  ThoughtSidebarDragRequest,
} from "@/components/workspace/thought-sharing";
import type { CreatePageTarget, ProfileWithAvatar, WorkspaceRoute } from "@/components/workspace/types";
import { MobileWorkspaceMenu, StartupEmptyRail, WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PageEditorSaveState } from "@/components/workspace/page-editor-view";
import {
  ITEM_SIZE_DIMENSIONS,
  ItemSizePicker,
  workspaceItemDialogContentClass,
  type ItemSizePreset,
} from "@/components/workspace/workspace-item-dialog";

const PageEditorView = dynamic(
  () => import("@/components/workspace/page-editor-view").then((module) => module.PageEditorView),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-7 sm:px-7 lg:px-10">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-[38rem] rounded-2xl" />
      </div>
    ),
  },
);

const ThoughtsCanvasView = dynamic(
  () => import("@/components/workspace/thoughts/thoughts-canvas-view").then((module) => module.ThoughtsCanvasView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin text-primary" /> Otvaram privatni kanvas…
      </div>
    ),
  },
);

export function WorkspaceShell({ profile, onSignOut }: { profile: ProfileWithAvatar; onSignOut: () => void }) {
  const {
    results: startups,
    status: startupsStatus,
    loadMore: loadMoreStartups,
  } = usePaginatedQuery(
    api.startups.listForCurrent,
    {},
    { initialNumItems: 50 },
  );
  const [selectedStartupId, setSelectedStartupId] = useState<Id<"startups"> | null>(null);
  const [route, setRoute] = useState<WorkspaceRoute>({ kind: "home" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [expandedPageIds, setExpandedPageIds] = useState<Set<Id<"pages">>>(new Set());
  const [transientExpandedAreaIds, setTransientExpandedAreaIds] = useState<Set<Id<"startupAreas">>>(new Set());
  const [transientExpandedPageIds, setTransientExpandedPageIds] = useState<Set<Id<"pages">>>(new Set());
  const [activeThoughtDropTarget, setActiveThoughtDropTarget] = useState<ThoughtDropTarget | null>(null);
  const [destinationRequest, setDestinationRequest] = useState<ThoughtDestinationRequest | null>(null);
  const [sidebarDragRequest, setSidebarDragRequest] = useState<ThoughtSidebarDragRequest | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<CreatePageTarget | undefined>();
  const [createAreaOpen, setCreateAreaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminMode, setAdminMode] = useState<"edit" | "create">("edit");
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailPageId, setDetailPageId] = useState<Id<"pages"> | null>(null);
  const [detailSaveState, setDetailSaveState] =
    useState<PageEditorSaveState>("saved");
  // Drag and drop state for pages in sidebar
  const [draggedPageId, setDraggedPageId] = useState<Id<"pages"> | null>(null);
  const [activeDropPageId, setActiveDropPageId] = useState<Id<"pages"> | null>(null);
  const [activeDropAreaId, setActiveDropAreaId] = useState<Id<"startupAreas"> | null>(null);
  const movePage = useMutation(api.pages.move);
  const resizeAreaCanvasPage = useMutation(api.canvases.resizeAreaCanvasPage);
  const startup = startups?.find((item) => item._id === selectedStartupId) ?? startups?.[0];
  const approvalsOverview = useQuery(
    api.collaboration.overview,
    startup ? { startupId: startup._id } : "skip",
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (startup) setSearchOpen(true); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startup]);

  function selectStartup(startupId: Id<"startups">) {
    setSelectedStartupId(startupId);
    setRoute((current) => current.kind === "thoughts" ? current : { kind: "home" });
    setExpandedAreas({});
    setExpandedPageIds(new Set());
    setTransientExpandedAreaIds(new Set());
    setTransientExpandedPageIds(new Set());
    setActiveThoughtDropTarget(null);
    destinationRequest?.cancel?.();
    setDestinationRequest(null);
    sidebarDragRequest?.cancel?.();
    setSidebarDragRequest(null);
  }

  function setAreaExpanded(areaId: Id<"startupAreas">, expanded: boolean) {
    setExpandedAreas((current) => ({ ...current, [areaId]: expanded }));
  }

  function setPageExpanded(pageId: Id<"pages">, expanded: boolean) {
    setExpandedPageIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(pageId);
      else next.delete(pageId);
      return next;
    });
  }

  function cancelThoughtSidebarDrag() {
    const request = sidebarDragRequest;
    setSidebarDragRequest(null);
    setActiveThoughtDropTarget(null);
    setTransientExpandedAreaIds(new Set());
    setTransientExpandedPageIds(new Set());
    request?.cancel?.();
  }

  function handleDragPageStart(pageId: Id<"pages">) {
    setDraggedPageId(pageId);
  }

  function handleDragPageEnd() {
    setDraggedPageId(null);
    setActiveDropPageId(null);
    setActiveDropAreaId(null);
  }

  function handleDragPageOver(pageId: Id<"pages"> | null, areaId: Id<"startupAreas">) {
    setActiveDropPageId(pageId);
    setActiveDropAreaId(areaId);
  }

  async function handleDropPage(
    pageId: Id<"pages">,
    targetParentPageId: Id<"pages"> | null,
    targetAreaId: Id<"startupAreas">
  ) {
    if (pageId === targetParentPageId) return;
    try {
      await movePage({
        pageId,
        areaId: targetAreaId,
        parentPageId: targetParentPageId,
      });
      toast.success("Stranica je uspešno premeštena.");
      if (targetParentPageId) {
        setExpandedPageIds((current) => {
          const next = new Set(current);
          next.add(targetParentPageId);
          return next;
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Premeštanje stranice nije uspelo.");
    }
  }

  function dwellThoughtTarget(target: ThoughtDropTarget) {
    setTransientExpandedAreaIds((current) => new Set(current).add(target.areaId));
    if (target.pageId !== null) {
      setTransientExpandedPageIds((current) => new Set(current).add(target.pageId as Id<"pages">));
    }
  }

  function completeThoughtSidebarDrag(target: ThoughtDropTarget) {
    const request = sidebarDragRequest;
    setExpandedAreas((current) => {
      const next = { ...current };
      for (const areaId of transientExpandedAreaIds) next[areaId] = true;
      return next;
    });
    setExpandedPageIds((current) => new Set([...current, ...transientExpandedPageIds]));
    setSidebarDragRequest(null);
    setActiveThoughtDropTarget(null);
    setTransientExpandedAreaIds(new Set());
    setTransientExpandedPageIds(new Set());
    request?.complete(target);
  }

  function cancelDestinationPicker() {
    const request = destinationRequest;
    setDestinationRequest(null);
    request?.cancel?.();
  }

  function completeDestinationPicker(destination: ThoughtDestination) {
    const request = destinationRequest;
    setDestinationRequest(null);
    request?.complete(destination);
  }
  function openCreate(target?: CreatePageTarget) {
    if (!startup) return;
    setCreateTarget(target);
    setCreateOpen(true);
  }

  function canLeavePageDetails() {
    if (detailSaveState === "dirty" || detailSaveState === "saving") {
      toast.info("Sačekaj trenutak da se izmene sačuvaju.");
      return false;
    }
    if (
      (detailSaveState === "error" || detailSaveState === "conflict") &&
      !window.confirm("Izmene nisu sačuvane. Napustiti detalje?")
    ) {
      return false;
    }
    return true;
  }

  function openPageDetails(pageId: Id<"pages">) {
    if (detailPageId !== null && !canLeavePageDetails()) return;
    setDetailSaveState("saved");
    setDetailPageId(pageId);
  }

  function closePageDetails() {
    if (!canLeavePageDetails()) return;
    setDetailPageId(null);
    setDetailSaveState("saved");
  }

  function resizeDetailCard(preset: ItemSizePreset) {
    if (!detailPageId) return;
    const dimensions = ITEM_SIZE_DIMENSIONS[preset];
    void resizeAreaCanvasPage({
      startupId: startup._id,
      pageId: detailPageId,
      ...dimensions,
    })
      .then(() => toast.success("Veličina oblačića je sačuvana."))
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Veličina oblačića nije sačuvana.",
        ),
      );
  }

  function openAdmin() {
    setAdminMode("edit");
    setAdminOpen(true);
  }

  function openCreateStartup() {
    setAdminMode("create");
    setAdminOpen(true);
  }

  if (startupsStatus === "LoadingFirstPage") return <WorkspaceLoading />;
  if (!startup) return <EmptyWorkspace profile={profile} onAdmin={openCreateStartup} onSignOut={onSignOut} adminOpen={adminOpen} setAdminOpen={setAdminOpen} onStartupCreated={setSelectedStartupId} />;

  const sidebarProps = {
    profile,
    startups,
    startup,
    route,
    collapsed: sidebarCollapsed,
    temporarilyExpanded: sidebarDragRequest !== null,
    expandedAreas,
    expandedPageIds,
    transientExpandedAreaIds,
    transientExpandedPageIds,
    activeThoughtDropTarget,
    onCollapsedChange: setSidebarCollapsed,
    onAreaExpandedChange: setAreaExpanded,
    onPageExpandedChange: setPageExpanded,
    onStartupChange: selectStartup,
    onRouteChange: setRoute,
    onCreate: openCreate,
    onCreateArea: () => setCreateAreaOpen(true),
    onSearch: () => setSearchOpen(true),
    onAdmin: openAdmin,
    onCreateStartup: openCreateStartup,
    onLoadMoreStartups: () => loadMoreStartups(50),
    startupsStatus,
    onProfile: () => setProfileOpen(true),
    onSignOut,
    draggedPageId,
    activeDropPageId,
    activeDropAreaId,
    pendingApprovals: approvalsOverview?.pendingCount ?? 0,
    onDragPageStart: handleDragPageStart,
    onDragPageEnd: handleDragPageEnd,
    onDragPageOver: handleDragPageOver,
    onDropPage: handleDropPage,
  };
  const routeKey = route.kind === "page" ? `page:${route.pageId}` : route.kind === "area" ? `area:${route.areaId}` : route.kind;
  return (
    <div className="app-canvas flex h-dvh overflow-hidden bg-background">
      <WorkspaceSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-xl lg:hidden"><MobileWorkspaceMenu {...sidebarProps} /><StartupLogo startup={startup} className="size-8" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{startup.name}</p><p className="truncate text-[0.6875rem] text-muted-foreground">{route.kind === "page" ? "Stranica" : route.kind === "thoughts" ? "Moje misli · Samo ti" : route.kind === "my-tasks" ? "Moji zadaci" : route.kind === "today" ? "Danas" : route.kind === "approvals" ? "Odobrenja" : "Radni prostor"}</p></div><Button variant="ghost" size="icon" aria-label="Pretraži" onClick={() => setSearchOpen(true)}><Search /></Button><ThemeToggle /></header>
        <WorkspaceStage key={routeKey} viewKey={routeKey} contained={route.kind === "thoughts" || route.kind === "ideas"}>
          {route.kind === "home" ? (
            <HomeView startup={startup} profile={profile} onOpenArea={(areaId) => setRoute({ kind: "area", areaId })} onOpenPage={openPageDetails} onCreate={(kind) => openCreate({ initialKind: kind })} />
          ) : route.kind === "thoughts" ? (
            <ThoughtsCanvasView startup={startup} profile={profile} onOpenPage={openPageDetails} onOpenIdeas={() => setRoute({ kind: "ideas" })} />
          ) : route.kind === "ideas" ? (
            <IdeasView startup={startup} onOpenPage={openPageDetails} />
          ) : route.kind === "today" ? (
            <TasksView startup={startup} profile={profile} mode="today" onOpenPage={openPageDetails} onCreateTask={() => openCreate({ initialKind: "task" })} />
          ) : route.kind === "my-tasks" ? (
            <TasksView startup={startup} profile={profile} mode="mine" onOpenPage={openPageDetails} onCreateTask={() => openCreate({ initialKind: "task" })} />
          ) : route.kind === "activity" ? (
            <ActivityView startup={startup} />
          ) : route.kind === "approvals" ? (
            <ApprovalsView startup={startup} />
          ) : route.kind === "area" ? (
            <AreaView startup={startup} profile={profile} areaId={route.areaId} onOpenPage={openPageDetails} onCreate={openCreate} onCreateArea={() => setCreateAreaOpen(true)} />
          ) : (
            <PageEditorView startup={startup} pageId={route.pageId} onOpenPage={(pageId) => setRoute({ kind: "page", pageId })} onCreateChild={openCreate} onArchived={() => setRoute({ kind: "home" })} />
          )}
        </WorkspaceStage>
      </div>
      {sidebarDragRequest ? <ThoughtSidebarDragLayer key={sidebarDragRequest.sessionId} request={sidebarDragRequest} onActiveTargetChange={setActiveThoughtDropTarget} onDwellTarget={dwellThoughtTarget} onComplete={completeThoughtSidebarDrag} onCancel={cancelThoughtSidebarDrag} /> : null}
      <Dialog
        open={detailPageId !== null}
        onOpenChange={(open) => {
          if (!open) closePageDetails();
        }}
      >
        <DialogContent
          className={`${workspaceItemDialogContentClass} grid-rows-[auto_minmax(0,1fr)]`}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Detalji sadržaja</DialogTitle>
            <DialogDescription>
              Pročitaj i izmeni belešku ili zadatak bez napuštanja trenutnog prikaza.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-card/90 px-4 py-3 pr-12 backdrop-blur-xl sm:px-6">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              Detalji stavke
            </span>
            <ItemSizePicker
              className="ml-auto w-full sm:w-auto"
              onChange={resizeDetailCard}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => {
                if (!detailPageId) return;
                if (!canLeavePageDetails()) return;
                const pageId = detailPageId;
                setDetailPageId(null);
                setDetailSaveState("saved");
                setRoute({ kind: "page", pageId });
              }}
            >
              <ExternalLink className="size-4" />
              Puni prikaz
            </Button>
          </div>
          <div className="min-h-0 overflow-y-auto bg-background">
            {detailPageId ? (
              <PageEditorView
                key={detailPageId}
                startup={startup}
                pageId={detailPageId}
                presentation="dialog"
                onSaveStateChange={setDetailSaveState}
                onOpenPage={openPageDetails}
                onCreateChild={(target) => {
                  if (!canLeavePageDetails()) return;
                  setDetailPageId(null);
                  setDetailSaveState("saved");
                  openCreate(target);
                }}
                onArchived={() => {
                  setDetailPageId(null);
                  setDetailSaveState("saved");
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <CreatePageDialog key={`${createOpen}-${createTarget?.areaId ?? "none"}-${createTarget?.parentPageId ?? "root"}-${createTarget?.initialKind ?? "note"}`} open={createOpen} onOpenChange={setCreateOpen} startup={startup} target={createTarget} onCreated={openPageDetails} />
      <CreateAreaDialog key={`${createAreaOpen}-${startup._id}`} open={createAreaOpen} onOpenChange={setCreateAreaOpen} startup={startup} onCreated={(areaId) => setRoute({ kind: "area", areaId })} />
      <SearchDialog key={`${searchOpen}`} open={searchOpen} onOpenChange={setSearchOpen} startupId={startup._id} onOpenPage={(pageId) => {
        setSearchOpen(false);
        openPageDetails(pageId);
      }} />
      <ProfileDialog key={`${profileOpen}-${profile.updatedAt}`} open={profileOpen} onOpenChange={setProfileOpen} profile={profile} />
      {destinationRequest ? <ThoughtDestinationPicker key={`${startup._id}-${destinationRequest.nodeIds.join("-")}`} open startup={startup} selectedCount={destinationRequest.nodeIds.length} onOpenChange={(open) => { if (!open) cancelDestinationPicker(); }} onSelect={completeDestinationPicker} /> : null}
      {profile.role === "admin" ? <AdminDialog key={`${adminOpen}-${adminMode}-${startup._id}`} open={adminOpen} onOpenChange={setAdminOpen} startup={adminMode === "create" ? undefined : startup} onStartupCreated={selectStartup} onCreateStartup={openCreateStartup} /> : null}
    </div>
  );
}

function WorkspaceStage({ children, viewKey, contained = false }: { children: React.ReactNode; viewKey: string; contained?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const items = ref.current
        ? Array.from(ref.current.querySelectorAll<HTMLElement>("[data-workspace-enter]"))
        : [];
      if (items.length === 0) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { gsap.set(items, { clearProps: "all" }); return; }
      gsap.timeline({ defaults: { ease: "power3.out" } }).fromTo(items, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.055, clearProps: "all" });
    }, ref);
    return () => context.revert();
  }, [viewKey]);
  return <main ref={ref} className={contained ? "min-h-0 flex-1 overflow-hidden" : "scrollbar-thin min-h-0 flex-1 overflow-y-auto"}>{children}</main>;
}

function WorkspaceLoading() { return <div className="flex h-dvh overflow-hidden"><div className="hidden w-[18.5rem] shrink-0 border-r bg-sidebar p-4 lg:block"><Skeleton className="h-10 w-40" /><Skeleton className="mt-6 h-11 w-full" /><div className="mt-6 space-y-2">{[0,1,2,3,4].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div></div><main className="flex flex-1 items-center justify-center"><div className="text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-3 size-5 animate-spin text-primary" /> Otvaram radni prostor…</div></main></div>; }

function EmptyWorkspace({ profile, onAdmin, onSignOut, adminOpen, setAdminOpen, onStartupCreated }: { profile: ProfileWithAvatar; onAdmin: () => void; onSignOut: () => void; adminOpen: boolean; setAdminOpen: (open: boolean) => void; onStartupCreated: (startupId: Id<"startups">) => void }) {
  return <div className="app-canvas flex h-dvh overflow-hidden"><StartupEmptyRail profile={profile} onAdmin={onAdmin} onSignOut={onSignOut} /><main className="flex flex-1 items-center justify-center p-5"><motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="desk-surface max-w-lg rounded-3xl border bg-card p-7 text-center sm:p-10"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-6" /></span><p className="mt-6 text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-primary">Privatan timski prostor</p><h1 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Prvi startup počinje ovde</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Kreiraj prostor, a mi ćemo automatski dodati Dev, Marketing, Sales i Ostalo oblasti.</p>{profile.role === "admin" ? <Button className="mt-6" onClick={onAdmin}><Sparkles /> Kreiraj startup</Button> : <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm">Administrator još nije dodelio startup ovom profilu.</p>}</motion.div></main>{profile.role === "admin" ? <AdminDialog key={`${adminOpen}-empty`} open={adminOpen} onOpenChange={setAdminOpen} onStartupCreated={onStartupCreated} /> : null}</div>;
}
