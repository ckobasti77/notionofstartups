"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
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
import {
  AREA_ICONS,
  AREA_TINTS,
  ProfileAvatar,
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
  onCollapsedChange: (collapsed: boolean) => void;
  onStartupChange: (startupId: Id<"startups">) => void;
  onRouteChange: (route: WorkspaceRoute) => void;
  onCreate: (target?: CreatePageTarget) => void;
  onSearch: () => void;
  onAdmin: () => void;
  onProfile: () => void;
  onSignOut: () => void;
};

const primaryNav = [
  { kind: "home" as const, label: "Početna", icon: Home },
  { kind: "today" as const, label: "Danas", icon: CalendarDays },
  { kind: "my-tasks" as const, label: "Moji zadaci", icon: CheckSquare2 },
  { kind: "activity" as const, label: "Aktivnost", icon: Activity },
];

function SidebarButton({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
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
      {collapsed ? null : <span>{label}</span>}
    </motion.button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function StartupPicker({
  startups,
  startup,
  collapsed,
  onChange,
}: {
  startups: Array<StartupWithAreas>;
  startup: StartupWithAreas;
  collapsed: boolean;
  onChange: (startupId: Id<"startups">) => void;
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
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm">
            {startup.name.slice(0, 1).toUpperCase()}
          </span>
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
            <span
              className={cn(
                "grid size-7 place-items-center rounded-md text-xs font-bold",
                item._id === startup._id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {item.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{item.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent(props: WorkspaceSidebarProps & { mobile?: boolean }) {
  const { profile, startups, startup, route, collapsed, mobile = false } = props;
  const compact = collapsed && !mobile;
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const selectedPageId = route.kind === "page" ? route.pageId : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center gap-2 p-3", compact && "flex-col px-2")}>
        <div className={cn("flex min-w-0 flex-1 items-center gap-2", compact && "flex-none")}>
          <AppMark className="size-8" />
          {compact ? null : (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-[-0.02em]">Notion Clone</p>
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

      <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
        <div className={cn("space-y-1", compact && "px-0")}>
          {startup.areas.map((area) => {
            const key = area.key as AreaKey;
            const Icon = AREA_ICONS[key];
            const expanded =
              expandedAreas[area._id]
              ?? (route.kind === "area" && route.areaId === area._id);
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
                  className={cn(
                    "group flex min-h-10 items-center rounded-xl",
                    route.kind === "area" && route.areaId === area._id
                      ? "bg-sidebar-accent/70"
                      : "hover:bg-sidebar-accent/45",
                  )}
                >
                  <button
                    type="button"
                    data-compact="true"
                    className="ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-card/60"
                    aria-expanded={expanded}
                    aria-label={expanded ? `Sakrij ${area.label}` : `Prikaži ${area.label}`}
                    onClick={() =>
                      setExpandedAreas((current) => ({ ...current, [area._id]: !expanded }))
                    }
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
                    onOpenPage={(pageId) => props.onRouteChange({ kind: "page", pageId })}
                    onCreate={props.onCreate}
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
  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 overflow-visible border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:block",
        props.collapsed ? "w-[4.5rem]" : "w-[18.5rem]",
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
          <p className="text-sm font-bold">Notion Clone</p>
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
