"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Brain,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronsUpDown,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react";

import { AppMark } from "@/components/app-mark";
import { PageTree } from "@/components/workspace/page-tree";
import type {
  CreatePageTarget,
  ProfileWithAvatar,
  StartupWithAreas,
  WorkspaceRoute,
} from "@/components/workspace/types";
import type { ThoughtDropTarget } from "@/components/workspace/thought-sharing";
import {
  AREA_ICONS,
  AREA_TINTS,
  ProfileAvatar,
  StartupLogo,
} from "@/components/workspace/workspace-ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type { AreaKey } from "@/lib/workspace";

type WorkspaceSidebarProps = {
  profile: ProfileWithAvatar;
  startups: Array<StartupWithAreas>;
  startup: StartupWithAreas;
  route: WorkspaceRoute;
  collapsed: boolean;
  temporarilyExpanded?: boolean;
  expandedAreas: Readonly<Record<string, boolean>>;
  expandedPageIds: ReadonlySet<Id<"pages">>;
  transientExpandedAreaIds: ReadonlySet<Id<"startupAreas">>;
  transientExpandedPageIds: ReadonlySet<Id<"pages">>;
  activeThoughtDropTarget: ThoughtDropTarget | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onAreaExpandedChange: (areaId: Id<"startupAreas">, expanded: boolean) => void;
  onPageExpandedChange: (pageId: Id<"pages">, expanded: boolean) => void;
  onStartupChange: (startupId: Id<"startups">) => void;
  onRouteChange: (route: WorkspaceRoute) => void;
  onCreate: (target?: CreatePageTarget) => void;
  onSearch: () => void;
  onAdmin: () => void;
  onCreateStartup: () => void;
  onLoadMoreStartups: () => void;
  startupsStatus: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onProfile: () => void;
  onSignOut: () => void;
  draggedPageId: Id<"pages"> | null;
  activeDropPageId: Id<"pages"> | null;
  activeDropAreaId: Id<"startupAreas"> | null;
  onDragPageStart: (pageId: Id<"pages">) => void;
  onDragPageEnd: () => void;
  onDragPageOver: (pageId: Id<"pages"> | null, areaId: Id<"startupAreas">) => void;
  onDropPage: (draggedPageId: Id<"pages">, targetParentPageId: Id<"pages"> | null, targetAreaId: Id<"startupAreas">) => void;
};

const primaryNav = [
  { kind: "home" as const, label: "Početna", icon: Home },
  { kind: "thoughts" as const, label: "Moje misli", icon: Brain, hint: "Samo ti" },
  { kind: "today" as const, label: "Danas", icon: CalendarDays },
  { kind: "my-tasks" as const, label: "Moji zadaci", icon: CheckSquare2 },
  { kind: "activity" as const, label: "Aktivnost", icon: Activity },
];

function SidebarButton({
  label,
  icon: Icon,
  active,
  collapsed,
  hint,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  hint?: string;
  onClick: () => void;
}) {
  const button = (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      className={cn(
        "relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
      )}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
    >
      {active ? (
        <motion.span
          layoutId={collapsed ? "rail-active" : "sidebar-active"}
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
      <Icon className="size-[1.05rem] shrink-0" />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {hint ? (
            <span className="shrink-0 rounded-md border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-primary">
              {hint}
            </span>
          ) : null}
        </>
      )}
    </motion.button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function StartupPicker({
  startups,
  startup,
  collapsed,
  onChange,
  onCreate,
  onLoadMore,
  startupsStatus,
}: {
  startups: Array<StartupWithAreas>;
  startup: StartupWithAreas;
  collapsed: boolean;
  onChange: (startupId: Id<"startups">) => void;
  onCreate: () => void;
  onLoadMore: () => void;
  startupsStatus: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Izabrani startup: ${startup.name}. Promeni startup.`}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-xl border border-sidebar-border/80 bg-card/70 px-2.5 text-left shadow-sm transition-colors hover:bg-card",
            collapsed && "justify-center border-transparent bg-transparent px-0 shadow-none",
          )}
        >
          <StartupLogo startup={startup} className="shadow-sm" />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Startup
                </span>
                <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                  {startup.name}
                </span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Izaberi startup</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {startups.map((item) => (
          <DropdownMenuItem key={item._id} onSelect={() => onChange(item._id)}>
            <StartupLogo startup={item} className="size-7 rounded-md" />
            <span className="truncate">{item.name}</span>
          </DropdownMenuItem>
        ))}
        {startupsStatus === "CanLoadMore" || startupsStatus === "LoadingMore" ? (
          <DropdownMenuItem disabled={startupsStatus === "LoadingMore"} onSelect={onLoadMore}>
            <ChevronDown className={cn("size-4", startupsStatus === "LoadingMore" && "animate-bounce")} />
            {startupsStatus === "LoadingMore" ? "Učitavam startupove…" : "Učitaj još startupova"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCreate}>
          <Plus className="size-4" /> Dodaj startup
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent(props: WorkspaceSidebarProps & { mobile?: boolean }) {
  const { profile, startups, startup, route, collapsed, mobile = false } = props;
  const compact = collapsed && !props.temporarilyExpanded && !mobile;
  const selectedPageId = route.kind === "page" ? route.pageId : undefined;

  return (
    <div data-thought-sidebar-root className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center gap-2 p-3", compact && "flex-col px-2")}>
        <div className={cn("flex min-w-0 flex-1 items-center gap-2", compact && "flex-none")}>
          <AppMark className="size-8" />
          {compact ? null : (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-[-0.02em]">Notion on Startups.</p>
              <p className="truncate text-[0.6875rem] text-muted-foreground">Tim u jednom toku</p>
            </div>
          )}
        </div>
        {mobile ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-compact="true"
            className="size-8"
            aria-label={collapsed ? "Proširi bočnu navigaciju" : "Sakrij bočnu navigaciju"}
            onClick={() => props.onCollapsedChange(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        )}
      </div>

      <div className={cn("px-3 pb-3", compact && "px-2")}>
        <StartupPicker
          startups={startups}
          startup={startup}
          collapsed={compact}
          onChange={props.onStartupChange}
          onCreate={props.onCreateStartup}
          onLoadMore={props.onLoadMoreStartups}
          startupsStatus={props.startupsStatus}
        />
      </div>

      <div className={cn("space-y-1 px-3", compact && "px-2")}>
        <SidebarButton
          label="Pretraži"
          icon={Search}
          active={false}
          collapsed={compact}
          onClick={props.onSearch}
        />
        {primaryNav.map((item) => (
          <SidebarButton
            key={item.kind}
            label={item.label}
            icon={item.icon}
            hint={item.hint}
            active={route.kind === item.kind}
            collapsed={compact}
            onClick={() => props.onRouteChange({ kind: item.kind })}
          />
        ))}
      </div>

      {compact ? (
        <div className="my-3 border-t border-sidebar-border/80" />
      ) : (
        <>
          <div className="mx-3 my-3 border-t border-sidebar-border/80" />
          <div className="flex items-center justify-between px-4 pb-1">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.13em] text-muted-foreground">
              Oblasti
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-compact="true"
              className="size-7"
              aria-label="Nova stranica"
              onClick={() => props.onCreate()}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </>
      )}

      <ScrollArea data-thought-sidebar-scroll className="min-h-0 flex-1 px-3 pb-3">
        <div className={cn("space-y-1", compact && "px-0")}>
          {startup.areas.map((area) => {
            const key = area.key as AreaKey;
            const Icon = AREA_ICONS[key];
            const expanded =
              (props.expandedAreas[area._id]
                ?? (route.kind === "area" && route.areaId === area._id))
              || props.transientExpandedAreaIds.has(area._id);
            if (compact) {
              return (
                <SidebarButton
                  key={area._id}
                  label={area.label}
                  icon={Icon}
                  active={route.kind === "area" && route.areaId === area._id}
                  collapsed
                  onClick={() => props.onRouteChange({ kind: "area", areaId: area._id })}
                />
              );
            }
            return (
              <div key={area._id}>
                <div
                  data-thought-drop-target="area"
                  data-thought-area-id={area._id}
                  data-thought-drop-label={area.label}
                  className={cn(
                    "group flex min-h-10 items-center rounded-xl transition-[background-color,box-shadow]",
                    route.kind === "area" && route.areaId === area._id
                      ? "bg-sidebar-accent/70"
                      : "hover:bg-sidebar-accent/45",
                    (props.activeThoughtDropTarget?.kind === "area"
                      && props.activeThoughtDropTarget.areaId === area._id)
                      || (props.activeDropAreaId === area._id && !props.activeDropPageId)
                      ? "bg-primary/12 ring-2 ring-inset ring-primary/55"
                      : "",
                  )}
                  onDragOver={(e) => {
                    if (props.draggedPageId) {
                      e.preventDefault();
                      props.onDragPageOver(null, area._id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (props.draggedPageId) {
                      props.onDropPage(props.draggedPageId, null, area._id);
                    }
                  }}
                >
                  <button
                    type="button"
                    data-compact="true"
                    className="ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-card/60"
                    aria-expanded={expanded}
                    aria-label={expanded ? `Sakrij ${area.label}` : `Prikaži ${area.label}`}
                    onClick={() => props.onAreaExpandedChange(area._id, !expanded)}
                  >
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")}
                    />
                  </button>
                  <button
                    type="button"
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
                    onClick={() => props.onRouteChange({ kind: "area", areaId: area._id })}
                  >
                    <span className={cn("grid size-6 place-items-center rounded-md", AREA_TINTS[key])}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="truncate">{area.label}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-compact="true"
                    className="mr-1 size-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Dodaj stranicu u ${area.label}`}
                    onClick={() => props.onCreate({ areaId: area._id, parentPageId: null })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                {expanded ? (
                  <PageTree
                    startupId={startup._id}
                    areaId={area._id}
                    selectedPageId={selectedPageId}
                    expandedPageIds={props.expandedPageIds}
                    transientExpandedPageIds={props.transientExpandedPageIds}
                    activeDropPageId={props.activeDropPageId || (props.activeThoughtDropTarget?.kind === "page"
                      ? props.activeThoughtDropTarget.pageId ?? undefined
                      : undefined)}
                    onPageExpandedChange={props.onPageExpandedChange}
                    onOpenPage={(pageId) => props.onRouteChange({ kind: "page", pageId })}
                    onCreate={props.onCreate}
                    draggedPageId={props.draggedPageId}
                    onDragPageStart={props.onDragPageStart}
                    onDragPageEnd={props.onDragPageEnd}
                    onDragPageOver={props.onDragPageOver}
                    onDropPage={props.onDropPage}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className={cn("border-t border-sidebar-border/80 p-3", compact && "px-2")}>
        {profile.role === "admin" ? (
          <SidebarButton
            label="Upravljanje timom"
            icon={Settings2}
            active={false}
            collapsed={compact}
            onClick={props.onAdmin}
          />
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left hover:bg-sidebar-accent/60",
                compact && "justify-center px-0",
              )}
              aria-label="Meni profila"
            >
              <ProfileAvatar profile={profile} className="size-8" />
              {compact ? null : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{profile.displayName}</span>
                    <span className="block truncate text-[0.6875rem] text-muted-foreground">
                      {profile.role === "admin" ? "Administrator" : "Član tima"}
                    </span>
                  </span>
                  <ChevronsUpDown className="size-4 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuLabel>
              <span className="block truncate">{profile.displayName}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{profile.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onProfile}>
              <UserRound /> Moj profil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(event) => event.preventDefault()} className="p-0">
              <ThemeToggle showLabel className="h-9 w-full justify-start border-0 bg-transparent shadow-none" />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onSignOut} variant="destructive">
              <LogOut /> Odjavi se
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const compact = props.collapsed && !props.temporarilyExpanded;
  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 overflow-visible border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:block",
        compact ? "w-[4.5rem]" : "w-[18.5rem]",
      )}
    >
      <SidebarContent {...props} />
    </aside>
  );
}

export function MobileWorkspaceMenu(props: WorkspaceSidebarProps) {
  const [open, setOpen] = useState(false);
  const mobileProps: WorkspaceSidebarProps = {
    ...props,
    onStartupChange: (startupId) => {
      props.onStartupChange(startupId);
      setOpen(false);
    },
    onRouteChange: (route) => {
      props.onRouteChange(route);
      setOpen(false);
    },
    onCreate: (target) => {
      props.onCreate(target);
      setOpen(false);
    },
    onSearch: () => {
      props.onSearch();
      setOpen(false);
    },
    onAdmin: () => {
      props.onAdmin();
      setOpen(false);
    },
    onProfile: () => {
      props.onProfile();
      setOpen(false);
    },
    onSignOut: () => {
      setOpen(false);
      props.onSignOut();
    },
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Otvori navigaciju">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(92vw,22rem)] gap-0 border-sidebar-border bg-sidebar p-0">
        <SheetTitle className="sr-only">Navigacija</SheetTitle>
        <SheetDescription className="sr-only">Startup, stranice i podešavanja.</SheetDescription>
        <SidebarContent {...mobileProps} mobile collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}

export function StartupEmptyRail({
  profile,
  onAdmin,
  onSignOut,
}: {
  profile: ProfileWithAvatar;
  onAdmin: () => void;
  onSignOut: () => void;
}) {
  return (
    <aside className="hidden h-dvh w-[18.5rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
      <div className="flex items-center gap-2.5">
        <AppMark />
        <div>
          <p className="text-sm font-bold">Notion on Startups.</p>
          <p className="text-xs text-muted-foreground">Tim u jednom toku</p>
        </div>
      </div>
      <div className="mt-auto space-y-2">
        {profile.role === "admin" ? (
          <Button className="w-full" onClick={onAdmin}>
            <Sparkles /> Kreiraj prvi startup
          </Button>
        ) : null}
        <Button variant="ghost" className="w-full justify-start" onClick={onSignOut}>
          <LogOut /> Odjavi se
        </Button>
      </div>
    </aside>
  );
}
