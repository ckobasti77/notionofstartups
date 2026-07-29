"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Activity,
  Bell,
  Brain,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronsUpDown,
  GripVertical,
  HeartPulse,
  Home,
  Lightbulb,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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
  getAreaTint,
  ProfileAvatar,
  StartupLogo,
} from "@/components/workspace/workspace-ui";
import { Blocks } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { api } from "@/convex/_generated/api";
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
  onCreateArea: () => void;
  onSearch: () => void;
  onAdmin: () => void;
  onCreateStartup: () => void;
  onLoadMoreStartups: () => void;
  startupsStatus:
    "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onProfile: () => void;
  onSignOut: () => void;
  draggedPageId: Id<"pages"> | null;
  activeDropPageId: Id<"pages"> | null;
  activeDropAreaId: Id<"startupAreas"> | null;
  pendingApprovals: number;
  unreadNotifications: number;
  onOpenNotifications: () => void;
  onDragPageStart: (pageId: Id<"pages">) => void;
  onDragPageEnd: () => void;
  onDragPageOver: (
    pageId: Id<"pages"> | null,
    areaId: Id<"startupAreas">,
  ) => void;
  onDropPage: (
    draggedPageId: Id<"pages">,
    targetParentPageId: Id<"pages"> | null,
    targetAreaId: Id<"startupAreas">,
  ) => void;
};

const primaryNav = [
  { kind: "home" as const, label: "Početna", icon: Home },
  {
    kind: "thoughts" as const,
    label: "Moje misli",
    icon: Brain,
    hint: "Samo ti",
  },
  { kind: "ideas" as const, label: "Ideje", icon: Lightbulb, hint: "Glasanje" },
  { kind: "approvals" as const, label: "Odobrenja", icon: ShieldCheck },
  { kind: "today" as const, label: "Danas", icon: CalendarDays },
  { kind: "my-tasks" as const, label: "Moji zadaci", icon: CheckSquare2 },
  { kind: "activity" as const, label: "Aktivnost", icon: Activity },
  { kind: "puls" as const, label: "Puls", icon: HeartPulse, hint: "Nedeljno" },
];

const DEFAULT_PRIMARY_PANE_HEIGHT = 412;
const MIN_PRIMARY_PANE_HEIGHT = 96;
const MIN_AREAS_PANE_HEIGHT = 128;
const SIDEBAR_RESIZE_HANDLE_HEIGHT = 9;

function SidebarButton({
  label,
  icon: Icon,
  active,
  collapsed,
  hint,
  badge,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  hint?: string;
  badge?: number;
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
          {badge && badge > 0 ? (
            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-bold text-primary-foreground">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : hint ? (
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
        {badge && badge > 0 ? (
          <span className="block text-[0.6875rem] text-muted-foreground">
            {badge} za tvoju reakciju
          </span>
        ) : null}
        {hint ? (
          <span className="block text-[0.6875rem] text-muted-foreground">
            {hint}
          </span>
        ) : null}
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
  startupsStatus:
    "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Izabrani startup: ${startup.name}. Promeni startup.`}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-xl border border-sidebar-border/80 bg-card/70 px-2.5 text-left shadow-sm transition-colors hover:bg-card",
            collapsed &&
              "justify-center border-transparent bg-transparent px-0 shadow-none",
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
        {startupsStatus === "CanLoadMore" ||
        startupsStatus === "LoadingMore" ? (
          <DropdownMenuItem
            disabled={startupsStatus === "LoadingMore"}
            onSelect={onLoadMore}
          >
            <ChevronDown
              className={cn(
                "size-4",
                startupsStatus === "LoadingMore" && "animate-bounce",
              )}
            />
            {startupsStatus === "LoadingMore"
              ? "Učitavam startupove…"
              : "Učitaj još startupova"}
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
  const {
    profile,
    startups,
    startup,
    route,
    collapsed,
    mobile = false,
  } = props;
  const compact = collapsed && !props.temporarilyExpanded && !mobile;
  const selectedPageId = route.kind === "page" ? route.pageId : undefined;
  const sidebarInstanceId = useId();
  const primaryPaneId = `${sidebarInstanceId}-primary-navigation`;
  const areasPaneId = `${sidebarInstanceId}-areas-navigation`;
  const panesRef = useRef<HTMLDivElement>(null);
  const primaryPaneRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{
    pointerId: number;
    pointerY: number;
    paneHeight: number;
  } | null>(null);

  const updateArea = useMutation(api.startups.updateArea);
  const reorderAreas = useMutation(api.startups.reorderAreas);

  const [primaryPaneHeight, setPrimaryPaneHeight] = useState(
    DEFAULT_PRIMARY_PANE_HEIGHT,
  );
  const [isResizingPanes, setIsResizingPanes] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<Id<"startupAreas"> | null>(
    null,
  );
  const [editingAreaLabel, setEditingAreaLabel] = useState("");

  const [draggedAreaId, setDraggedAreaId] = useState<Id<"startupAreas"> | null>(
    null,
  );
  const [activeDropAreaTargetId, setActiveDropAreaTargetId] =
    useState<Id<"startupAreas"> | null>(null);

  async function handleSaveAreaLabel(
    areaId: Id<"startupAreas">,
    currentLabel: string,
  ) {
    const trimmed = editingAreaLabel.trim();
    if (trimmed && trimmed !== currentLabel) {
      try {
        await updateArea({ areaId, label: trimmed });
        toast.success("Naziv oblasti je sačuvan.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Neuspešna izmena naziva.",
        );
      }
    }
    setEditingAreaId(null);
  }

  async function handleDropArea(targetAreaId: Id<"startupAreas">) {
    if (!draggedAreaId || draggedAreaId === targetAreaId) return;
    const areas = [...startup.areas];
    const fromIndex = areas.findIndex((a) => a._id === draggedAreaId);
    const toIndex = areas.findIndex((a) => a._id === targetAreaId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [movedArea] = areas.splice(fromIndex, 1);
    areas.splice(toIndex, 0, movedArea);

    const orderedIds = areas.map((a) => a._id);
    try {
      await reorderAreas({
        startupId: startup._id,
        orderedAreaIds: orderedIds,
      });
      toast.success("Redosled oblasti je promenjen.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Neuspešna promena redosleda.",
      );
    } finally {
      setDraggedAreaId(null);
      setActiveDropAreaTargetId(null);
    }
  }

  function getPrimaryPaneBounds() {
    const panesHeight = panesRef.current?.getBoundingClientRect().height ?? 0;
    return {
      min: MIN_PRIMARY_PANE_HEIGHT,
      max: Math.max(
        MIN_PRIMARY_PANE_HEIGHT,
        panesHeight - MIN_AREAS_PANE_HEIGHT - SIDEBAR_RESIZE_HANDLE_HEIGHT,
      ),
    };
  }

  function setClampedPrimaryPaneHeight(nextHeight: number) {
    const bounds = getPrimaryPaneBounds();
    setPrimaryPaneHeight(
      Math.min(bounds.max, Math.max(bounds.min, nextHeight)),
    );
  }

  return (
    <div
      data-thought-sidebar-root
      data-sidebar-panes-resizing={isResizingPanes || undefined}
      className={cn(
        "flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground",
        isResizingPanes && "select-none",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 p-3",
          compact && "flex-col px-2",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            compact && "flex-none",
          )}
        >
          <AppMark className="size-8" />
          {compact ? null : (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-[-0.02em]">
                Notion on Startups.
              </p>
              <p className="truncate text-[0.6875rem] text-muted-foreground">
                Tim u jednom toku
              </p>
            </div>
          )}
        </div>
        {profile.role === "admin" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-compact="true"
                className="size-8"
                aria-label="Upravljanje timom"
                onClick={props.onAdmin}
              >
                <SlidersHorizontal />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={compact ? "right" : "bottom"}>
              Upravljanje timom
            </TooltipContent>
          </Tooltip>
        ) : null}
        {mobile ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-compact="true"
            className="size-8"
            aria-label={
              collapsed ? "Proširi bočnu navigaciju" : "Sakrij bočnu navigaciju"
            }
            onClick={() => props.onCollapsedChange(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        )}
      </div>

      <div ref={panesRef} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={primaryPaneRef}
          id={primaryPaneId}
          data-sidebar-primary-pane
          className="min-h-0 shrink-0 overflow-hidden"
          style={{
            height: primaryPaneHeight,
            minHeight: MIN_PRIMARY_PANE_HEIGHT,
            maxHeight: `calc(100% - ${MIN_AREAS_PANE_HEIGHT + SIDEBAR_RESIZE_HANDLE_HEIGHT}px)`,
          }}
        >
          <ScrollArea className="h-full pb-2">
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
              <SidebarButton
                label="Obaveštenja"
                icon={Bell}
                badge={props.unreadNotifications}
                active={false}
                collapsed={compact}
                onClick={props.onOpenNotifications}
              />
              {primaryNav.map((item) => (
                <SidebarButton
                  key={item.kind}
                  label={item.label}
                  icon={item.icon}
                  hint={item.hint}
                  badge={
                    item.kind === "approvals"
                      ? props.pendingApprovals
                      : undefined
                  }
                  active={route.kind === item.kind}
                  collapsed={compact}
                  onClick={() => props.onRouteChange({ kind: item.kind })}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        <div
          role="separator"
          tabIndex={0}
          aria-label="Promeni visinu glavne navigacije i oblasti"
          aria-orientation="horizontal"
          aria-controls={`${primaryPaneId} ${areasPaneId}`}
          aria-valuemin={MIN_PRIMARY_PANE_HEIGHT}
          aria-valuemax={720}
          aria-valuenow={Math.round(primaryPaneHeight)}
          aria-valuetext={`${Math.round(primaryPaneHeight)} piksela za glavnu navigaciju`}
          data-sidebar-pane-resizer
          data-resizing={isResizingPanes || undefined}
          className="group relative flex h-[9px] shrink-0 touch-none cursor-row-resize items-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          title="Prevuci gore ili dole da promeniš visinu"
          onDoubleClick={() =>
            setClampedPrimaryPaneHeight(DEFAULT_PRIMARY_PANE_HEIGHT)
          }
          onKeyDown={(event) => {
            const currentHeight =
              primaryPaneRef.current?.getBoundingClientRect().height ??
              primaryPaneHeight;
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setClampedPrimaryPaneHeight(currentHeight - 24);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setClampedPrimaryPaneHeight(currentHeight + 24);
            } else if (event.key === "Home") {
              event.preventDefault();
              setClampedPrimaryPaneHeight(MIN_PRIMARY_PANE_HEIGHT);
            } else if (event.key === "End") {
              event.preventDefault();
              setClampedPrimaryPaneHeight(getPrimaryPaneBounds().max);
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const paneHeight =
              primaryPaneRef.current?.getBoundingClientRect().height;
            if (paneHeight === undefined) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeStartRef.current = {
              pointerId: event.pointerId,
              pointerY: event.clientY,
              paneHeight,
            };
            setIsResizingPanes(true);
          }}
          onPointerMove={(event) => {
            const resizeStart = resizeStartRef.current;
            if (!resizeStart || resizeStart.pointerId !== event.pointerId)
              return;
            setClampedPrimaryPaneHeight(
              resizeStart.paneHeight + event.clientY - resizeStart.pointerY,
            );
          }}
          onPointerUp={(event) => {
            if (resizeStartRef.current?.pointerId !== event.pointerId) return;
            resizeStartRef.current = null;
            setIsResizingPanes(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (resizeStartRef.current?.pointerId !== event.pointerId) return;
            resizeStartRef.current = null;
            setIsResizingPanes(false);
          }}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mx-3 h-px w-full bg-sidebar-border/80 transition-[height,background-color]",
              "group-hover:h-0.5 group-hover:bg-primary/55 group-focus-visible:h-0.5 group-focus-visible:bg-primary/70",
              isResizingPanes && "h-0.5 bg-primary/75",
            )}
          />
        </div>

        <div id={areasPaneId} className="flex min-h-0 flex-1 flex-col">
          {compact ? null : (
            <div className="flex items-center justify-between px-4 pb-1 pt-1">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                Oblasti
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-compact="true"
                className="size-7"
                aria-label="Nova oblast"
                onClick={props.onCreateArea}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          )}

          <ScrollArea
            data-thought-sidebar-scroll
            className="min-h-0 flex-1 px-3 pb-3"
          >
            <div className={cn("space-y-1", compact && "px-0")}>
              {startup.areas.map((area) => {
                const Icon = AREA_ICONS[area.key as AreaKey] || Blocks;
                const tintClass = getAreaTint(area.key);
                const expanded =
                  (props.expandedAreas[area._id] ??
                    (route.kind === "area" && route.areaId === area._id)) ||
                  props.transientExpandedAreaIds.has(area._id);
                if (compact) {
                  return (
                    <SidebarButton
                      key={area._id}
                      label={area.label}
                      icon={Icon}
                      active={
                        route.kind === "area" && route.areaId === area._id
                      }
                      collapsed
                      onClick={() =>
                        props.onRouteChange({ kind: "area", areaId: area._id })
                      }
                    />
                  );
                }
                return (
                  <div
                    key={area._id}
                    draggable={!editingAreaId}
                    onDragStart={(e) => {
                      if (!props.draggedPageId) {
                        e.stopPropagation();
                        setDraggedAreaId(area._id);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedAreaId(null);
                      setActiveDropAreaTargetId(null);
                    }}
                    onDragOver={(e) => {
                      if (draggedAreaId && draggedAreaId !== area._id) {
                        e.preventDefault();
                        setActiveDropAreaTargetId(area._id);
                      } else if (props.draggedPageId) {
                        e.preventDefault();
                        props.onDragPageOver(null, area._id);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedAreaId && draggedAreaId !== area._id) {
                        handleDropArea(area._id);
                      } else if (props.draggedPageId) {
                        props.onDropPage(props.draggedPageId, null, area._id);
                      }
                    }}
                  >
                    <div
                      data-thought-drop-target="area"
                      data-thought-area-id={area._id}
                      data-thought-drop-label={area.label}
                      className={cn(
                        "group flex min-h-10 items-center rounded-xl transition-[background-color,box-shadow]",
                        route.kind === "area" && route.areaId === area._id
                          ? "bg-sidebar-accent/70"
                          : "hover:bg-sidebar-accent/45",
                        (props.activeThoughtDropTarget?.kind === "area" &&
                          props.activeThoughtDropTarget.areaId === area._id) ||
                          (props.activeDropAreaId === area._id &&
                            !props.activeDropPageId) ||
                          activeDropAreaTargetId === area._id
                          ? "bg-primary/12 ring-2 ring-inset ring-primary/55"
                          : "",
                        draggedAreaId === area._id && "opacity-50",
                      )}
                    >
                      <span
                        className="ml-1 cursor-grab opacity-0 group-hover:opacity-60 hover:!opacity-100 active:cursor-grabbing"
                        title="Prevuci da promeniš redosled oblasti"
                      >
                        <GripVertical className="size-3.5 text-muted-foreground" />
                      </span>

                      <button
                        type="button"
                        data-compact="true"
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-card/60"
                        aria-expanded={expanded}
                        aria-label={
                          expanded
                            ? `Sakrij ${area.label}`
                            : `Prikaži ${area.label}`
                        }
                        onClick={() =>
                          props.onAreaExpandedChange(area._id, !expanded)
                        }
                      >
                        <ChevronDown
                          className={cn(
                            "size-3.5 transition-transform",
                            !expanded && "-rotate-90",
                          )}
                        />
                      </button>
                      {editingAreaId === area._id ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-1">
                          <Input
                            value={editingAreaLabel}
                            onChange={(e) =>
                              setEditingAreaLabel(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveAreaLabel(area._id, area.label);
                              } else if (e.key === "Escape") {
                                setEditingAreaId(null);
                              }
                            }}
                            onBlur={() =>
                              handleSaveAreaLabel(area._id, area.label)
                            }
                            autoFocus
                            className="h-7 px-2 text-xs font-semibold"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 pr-1 text-left text-sm font-medium"
                          onClick={() =>
                            props.onRouteChange({
                              kind: "area",
                              areaId: area._id,
                            })
                          }
                        >
                          <span
                            className={cn(
                              "grid size-6 shrink-0 place-items-center rounded-md",
                              tintClass,
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <span className="truncate">{area.label}</span>
                        </button>
                      )}

                      {editingAreaId !== area._id ? (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-compact="true"
                            className="size-7"
                            aria-label={`Izmeni naziv ${area.label}`}
                            title="Izmeni naziv oblasti"
                            onClick={() => {
                              setEditingAreaId(area._id);
                              setEditingAreaLabel(area.label);
                            }}
                          >
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-compact="true"
                            className="mr-1 size-7"
                            aria-label={`Dodaj stranicu u ${area.label}`}
                            title="Dodaj novu stranicu"
                            onClick={() =>
                              props.onCreate({
                                areaId: area._id,
                                parentPageId: null,
                              })
                            }
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {expanded ? (
                      <PageTree
                        startupId={startup._id}
                        areaId={area._id}
                        currentProfileId={profile._id}
                        selectedPageId={selectedPageId}
                        expandedPageIds={props.expandedPageIds}
                        transientExpandedPageIds={
                          props.transientExpandedPageIds
                        }
                        activeDropPageId={
                          props.activeDropPageId ||
                          (props.activeThoughtDropTarget?.kind === "page"
                            ? (props.activeThoughtDropTarget.pageId ??
                              undefined)
                            : undefined)
                        }
                        onPageExpandedChange={props.onPageExpandedChange}
                        onOpenPage={(pageId) =>
                          props.onRouteChange({ kind: "page", pageId })
                        }
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
        </div>
      </div>

      <div
        className={cn(
          "border-t border-sidebar-border/80 p-3",
          compact && "px-2",
        )}
      >
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
                    <span className="block truncate text-sm font-semibold">
                      {profile.displayName}
                    </span>
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
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {profile.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onProfile}>
              <UserRound /> Moj profil
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => event.preventDefault()}
              className="p-0"
            >
              <ThemeToggle
                showLabel
                className="h-9 w-full justify-start border-0 bg-transparent shadow-none"
              />
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
    onCreateArea: () => {
      props.onCreateArea();
      setOpen(false);
    },
    onSearch: () => {
      props.onSearch();
      setOpen(false);
    },
    onOpenNotifications: () => {
      props.onOpenNotifications();
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
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Otvori navigaciju"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(92vw,22rem)] gap-0 border-sidebar-border bg-sidebar p-0"
      >
        <SheetTitle className="sr-only">Navigacija</SheetTitle>
        <SheetDescription className="sr-only">
          Startup, stranice i podešavanja.
        </SheetDescription>
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
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={onSignOut}
        >
          <LogOut /> Odjavi se
        </Button>
      </div>
    </aside>
  );
}
