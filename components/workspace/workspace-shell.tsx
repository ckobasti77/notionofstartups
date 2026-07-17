"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { gsap } from "gsap";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Building2, LoaderCircle, Search, Sparkles } from "lucide-react";

import { ActivityView } from "@/components/workspace/activity-view";
import { AdminDialog } from "@/components/workspace/admin-dialog";
import { AreaView } from "@/components/workspace/area-view";
import { CreatePageDialog } from "@/components/workspace/create-page-dialog";
import { HomeView } from "@/components/workspace/home-view";
import { ProfileDialog } from "@/components/workspace/profile-dialog";
import { SearchDialog } from "@/components/workspace/search-dialog";
import { TasksView } from "@/components/workspace/tasks-view";
import type { CreatePageTarget, ProfileWithAvatar, WorkspaceRoute } from "@/components/workspace/types";
import { MobileWorkspaceMenu, StartupEmptyRail, WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

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

export function WorkspaceShell({ profile, onSignOut }: { profile: ProfileWithAvatar; onSignOut: () => void }) {
  const startups = useQuery(api.startups.listForCurrent, { limit: 20 });
  const [selectedStartupId, setSelectedStartupId] = useState<Id<"startups"> | null>(null);
  const [route, setRoute] = useState<WorkspaceRoute>({ kind: "home" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<CreatePageTarget | undefined>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const startup = startups?.find((item) => item._id === selectedStartupId) ?? startups?.[0];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (startup) setSearchOpen(true); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startup]);

  function selectStartup(startupId: Id<"startups">) { setSelectedStartupId(startupId); setRoute({ kind: "home" }); }
  function openCreate(target?: CreatePageTarget) {
    if (!startup) return;
    setCreateTarget(target);
    setCreateOpen(true);
  }

  if (startups === undefined) return <WorkspaceLoading />;
  if (!startup) return <EmptyWorkspace profile={profile} onAdmin={() => setAdminOpen(true)} onSignOut={onSignOut} adminOpen={adminOpen} setAdminOpen={setAdminOpen} onStartupCreated={setSelectedStartupId} />;

  const sidebarProps = { profile, startups, startup, route, collapsed: sidebarCollapsed, onCollapsedChange: setSidebarCollapsed, onStartupChange: selectStartup, onRouteChange: setRoute, onCreate: openCreate, onSearch: () => setSearchOpen(true), onAdmin: () => setAdminOpen(true), onProfile: () => setProfileOpen(true), onSignOut };
  const routeKey = route.kind === "page" ? `page:${route.pageId}` : route.kind === "area" ? `area:${route.areaId}` : route.kind;
  return (
    <div className="app-canvas flex h-dvh overflow-hidden bg-background">
      <WorkspaceSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-xl lg:hidden"><MobileWorkspaceMenu {...sidebarProps} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{startup.name}</p><p className="truncate text-[0.6875rem] text-muted-foreground">{route.kind === "page" ? "Stranica" : route.kind === "my-tasks" ? "Moji zadaci" : route.kind === "today" ? "Danas" : "Radni prostor"}</p></div><Button variant="ghost" size="icon" aria-label="Pretraži" onClick={() => setSearchOpen(true)}><Search /></Button><ThemeToggle /></header>
        <WorkspaceStage key={routeKey} viewKey={routeKey}>
          {route.kind === "home" ? <HomeView startup={startup} profile={profile} onOpenArea={(areaId) => setRoute({ kind: "area", areaId })} onOpenPage={(pageId) => setRoute({ kind: "page", pageId })} onCreate={(kind) => openCreate({ initialKind: kind })} /> : route.kind === "today" ? <TasksView startup={startup} profile={profile} mode="today" onOpenPage={(pageId) => setRoute({ kind: "page", pageId })} onCreateTask={() => openCreate({ initialKind: "task" })} /> : route.kind === "my-tasks" ? <TasksView startup={startup} profile={profile} mode="mine" onOpenPage={(pageId) => setRoute({ kind: "page", pageId })} onCreateTask={() => openCreate({ initialKind: "task" })} /> : route.kind === "activity" ? <ActivityView startup={startup} /> : route.kind === "area" ? <AreaView startup={startup} areaId={route.areaId} onOpenPage={(pageId) => setRoute({ kind: "page", pageId })} onCreate={openCreate} /> : <PageEditorView startup={startup} pageId={route.pageId} onOpenPage={(pageId) => setRoute({ kind: "page", pageId })} onCreateChild={openCreate} onArchived={() => setRoute({ kind: "home" })} />}
        </WorkspaceStage>
      </div>
      <CreatePageDialog key={`${createOpen}-${createTarget?.areaId ?? "none"}-${createTarget?.parentPageId ?? "root"}-${createTarget?.initialKind ?? "note"}`} open={createOpen} onOpenChange={setCreateOpen} startup={startup} target={createTarget} onCreated={(pageId) => setRoute({ kind: "page", pageId })} />
      <SearchDialog key={`${searchOpen}`} open={searchOpen} onOpenChange={setSearchOpen} startupId={startup._id} onOpenPage={(pageId) => setRoute({ kind: "page", pageId })} />
      <ProfileDialog key={`${profileOpen}-${profile.updatedAt}`} open={profileOpen} onOpenChange={setProfileOpen} profile={profile} />
      {profile.role === "admin" ? <AdminDialog key={`${adminOpen}-${startup._id}`} open={adminOpen} onOpenChange={setAdminOpen} startup={startup} onStartupCreated={selectStartup} /> : null}
    </div>
  );
}

function WorkspaceStage({ children, viewKey }: { children: React.ReactNode; viewKey: string }) {
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
  return <main ref={ref} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</main>;
}

function WorkspaceLoading() { return <div className="flex h-dvh overflow-hidden"><div className="hidden w-[18.5rem] shrink-0 border-r bg-sidebar p-4 lg:block"><Skeleton className="h-10 w-40" /><Skeleton className="mt-6 h-11 w-full" /><div className="mt-6 space-y-2">{[0,1,2,3,4].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div></div><main className="flex flex-1 items-center justify-center"><div className="text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-3 size-5 animate-spin text-primary" /> Otvaram radni prostor…</div></main></div>; }

function EmptyWorkspace({ profile, onAdmin, onSignOut, adminOpen, setAdminOpen, onStartupCreated }: { profile: ProfileWithAvatar; onAdmin: () => void; onSignOut: () => void; adminOpen: boolean; setAdminOpen: (open: boolean) => void; onStartupCreated: (startupId: Id<"startups">) => void }) {
  return <div className="app-canvas flex h-dvh overflow-hidden"><StartupEmptyRail profile={profile} onAdmin={onAdmin} onSignOut={onSignOut} /><main className="flex flex-1 items-center justify-center p-5"><motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="desk-surface max-w-lg rounded-3xl border bg-card p-7 text-center sm:p-10"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-6" /></span><p className="mt-6 text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-primary">Privatan timski prostor</p><h1 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Prvi startup počinje ovde</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Kreiraj prostor, a mi ćemo automatski dodati Dev, Marketing, Sales i Ostalo oblasti.</p>{profile.role === "admin" ? <Button className="mt-6" onClick={onAdmin}><Sparkles /> Kreiraj startup</Button> : <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm">Administrator još nije dodelio startup ovom profilu.</p>}</motion.div></main>{profile.role === "admin" ? <AdminDialog key={`${adminOpen}-empty`} open={adminOpen} onOpenChange={setAdminOpen} onStartupCreated={onStartupCreated} /> : null}</div>;
}
