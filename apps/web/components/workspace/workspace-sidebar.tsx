"use client";

import {
  Component,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Bell,
  CheckSquare2,
  ChevronDown,
  ChevronsUpDown,
  Gauge,
  GripVertical,
  Lightbulb,
  LogOut,
  MessageCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { DURATION } from "@devotion/shared";

import { AppMark } from "@/components/app-mark";
import { MeSidebar, type MeSidebarProps } from "@/components/me/shell/me-sidebar";
import { StartupChip } from "@/components/me/startup-chip";
import { ScopeChips, type ScopeChipsProps } from "@/components/me/shell/scope-chips";
import { Collapse } from "@/components/motion/collapse";
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

export type WorkspaceSidebarProps = {
  profile: ProfileWithAvatar;
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
  onRouteChange: (route: WorkspaceRoute) => void;
  onCreate: (target?: CreatePageTarget) => void;
  onCreateArea: () => void;
  onSearch: () => void;
  /** „Podešavanja startupa" (P11, K20): ruta koju vide svi članovi. */
  onOpenSettings: () => void;
  /** „Obaveštenja i zvuci" u meniju profila (mobilni meni; na desktopu traka). */
  onOpenNotificationSettings: () => void;
  onProfile: () => void;
  onSignOut: () => void;
  draggedPageId: Id<"pages"> | null;
  activeDropPageId: Id<"pages"> | null;
  activeDropAreaId: Id<"startupAreas"> | null;
  chatUnread: number;
  /** Ideje u fazi „Razmatra se" koje čekaju moj glas u ovom startupu (bedž „Ideje", P22). */
  ideasWaiting?: number;
  /**
   * Izlog: stablo oblasti iz fixture-a umesto `PageTree` (koji čita Convex).
   * Ljuska ga ne prosleđuje.
   */
  renderAreaTree?: (areaId: Id<"startupAreas">) => ReactNode;
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

/**
 * Meni startupa (PROSTOR P11, plan K07 §2.1): četiri stvari koje tim stvarno
 * koristi, pa Dokumenti (stablo oblasti i stranica), a dole Korpa i
 * Podešavanja startupa. Početna, Moje misli, Odobrenja, Aktivnost, Puls i
 * Obaveštenja više nisu u meniju (Inbox je u „Ja", Aktivnost i Puls se
 * otvaraju iz Komandnog centra).
 */
const primaryNav = [
  { kind: "today" as const, label: "Komandni centar", icon: Gauge },
  { kind: "tasks" as const, label: "Zadaci", icon: CheckSquare2 },
  { kind: "ideas" as const, label: "Ideje", icon: Lightbulb },
  { kind: "chat" as const, label: "Poruke", icon: MessageCircle },
];

const DEFAULT_SIDEBAR_WIDTH = 296;
const MIN_SIDEBAR_WIDTH = DEFAULT_SIDEBAR_WIDTH;
const SIDEBAR_WIDTH_STEP = 24;

function subscribeToViewportWidth(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getViewportWidth() {
  return window.innerWidth;
}

function getServerViewportWidth() {
  return 1024;
}

function SidebarButton({
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
  badgeLabel = "nepročitano",
  shortcut,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  /** Šta broj znači za čitač ekrana (podrazumevano „nepročitano"). */
  badgeLabel?: string;
  /** `aria-keyshortcuts` (npr. pretraga). */
  shortcut?: string;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      className={cn(
        "relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
      )}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={badge && badge > 0 ? `${label}, ${badge > 99 ? "99+" : badge} ${badgeLabel}` : label}
      aria-keyshortcuts={shortcut}
    >
      {/* Aktivna stavka: statička traka (bez ukrasnog pokreta, PROSTOR P17). */}
      {active ? (
        <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
      ) : null}
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {badge && badge > 0 ? (
            <span
              aria-hidden="true"
              className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 py-0.5 font-mono text-[0.625rem] font-bold tabular-nums text-primary-foreground"
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </>
      )}
    </button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">
        <span className="block font-medium">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Identitet izabranog startupa na vrhu menija (čip + ime, bez nadnaslova).
 * Startup se bira u traci „Ja + startupi" (≥ lg) ili u redu opsega mobilnog
 * menija, pa ovde nema padajućeg birača.
 */
function StartupIdentity({
  startup,
  collapsed,
}: {
  startup: StartupWithAreas;
  collapsed: boolean;
}) {
  return (
    <div
      title={collapsed ? startup.name : undefined}
      className={cn(
        "flex min-h-10 min-w-0 flex-1 items-center gap-2.5",
        collapsed && "flex-none justify-center",
      )}
    >
      <StartupChip startup={startup} size="md" variant="solid" />
      {collapsed ? (
        <span className="sr-only">{startup.name}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground">
          {startup.name}
        </span>
      )}
    </div>
  );
}

function SidebarContent(
  props: WorkspaceSidebarProps & {
    mobile?: boolean;
    /** Red opsega (Ja + startupi) ispod zaglavlja u mobilnom meniju. */
    scopeSlot?: ReactNode;
  },
) {
  const {
    profile,
    startup,
    route,
    collapsed,
    mobile = false,
  } = props;
  const compact = collapsed && !props.temporarilyExpanded && !mobile;
  const selectedPageId = route.kind === "page" ? route.pageId : undefined;
  const sidebarInstanceId = useId();
  const canManage =
    profile.role === "admin" || startup.createdByProfileId === profile._id;

  const updateArea = useMutation(api.startups.updateArea);
  const reorderAreas = useMutation(api.startups.reorderAreas);

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

  return (
    <div
      data-thought-sidebar-root
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div
        className={cn(
          "flex items-center gap-2 p-3",
          compact && "flex-col px-2",
          // Mesto za X dugme mobilnog Sheet-a (top-4 right-4).
          mobile && "pr-12",
        )}
      >
        <StartupIdentity startup={startup} collapsed={compact} />
        {mobile ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-compact="true"
            className="size-8 shrink-0"
            aria-label={
              collapsed ? "Proširi bočnu navigaciju" : "Sakrij bočnu navigaciju"
            }
            onClick={() => props.onCollapsedChange(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        )}
      </div>

      {props.scopeSlot}

      {/* Jedan skrol (P11): glavne stavke i Dokumenti se pomeraju zajedno. */}
      <ScrollArea data-thought-sidebar-scroll className="min-h-0 flex-1">
        <nav
          aria-label="Meni startupa"
          className={cn("space-y-0.5 px-3 pb-3", compact && "px-2", props.scopeSlot && "pt-3")}
        >
          <SidebarButton
            label="Pretraži"
            icon={Search}
            active={false}
            collapsed={compact}
            shortcut="Control+K Meta+K"
            onClick={props.onSearch}
          />
          {primaryNav.map((item) => (
            <SidebarButton
              key={item.kind}
              label={item.label}
              icon={item.icon}
              badge={item.kind === "chat" ? props.chatUnread : item.kind === "ideas" ? props.ideasWaiting : undefined}
              badgeLabel={item.kind === "ideas" ? "na glasanju" : undefined}
              active={route.kind === item.kind}
              collapsed={compact}
              onClick={() => props.onRouteChange({ kind: item.kind })}
            />
          ))}
        </nav>

        <section
          aria-labelledby={`${sidebarInstanceId}-dokumenti`}
          className={cn("px-3 pb-3", compact && "px-2")}
        >
          {compact ? (
            <h2 id={`${sidebarInstanceId}-dokumenti`} className="sr-only">
              Dokumenti
            </h2>
          ) : (
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <h2
                id={`${sidebarInstanceId}-dokumenti`}
                className="text-xs font-medium text-muted-foreground"
              >
                Dokumenti
              </h2>
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

          <div className="space-y-0.5">
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
                      "group flex min-h-10 items-center rounded-lg transition-[background-color,box-shadow]",
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
                      aria-controls={`${sidebarInstanceId}-oblast-${area._id}`}
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
                        style={{ transitionDuration: `${DURATION.quick}ms` }}
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
                          aria-label={`Naziv oblasti ${area.label}`}
                          className="h-7 px-2 text-xs font-semibold"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-current={
                          route.kind === "area" && route.areaId === area._id
                            ? "page"
                            : undefined
                        }
                        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 pr-1 text-left text-sm font-medium"
                        onClick={() =>
                          props.onRouteChange({
                            kind: "area",
                            areaId: area._id,
                          })
                        }
                      >
                        <Icon className={cn("size-4 shrink-0", tintClass)} />
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
                  {/* Otvaranje/zatvaranje oblasti kroz `Collapse` (K19); stablo se
                      montira tek kad je oblast otvorena, kao i ranije. */}
                  <Collapse open={expanded} id={`${sidebarInstanceId}-oblast-${area._id}`} unmountWhenClosed>
                    {props.renderAreaTree ? props.renderAreaTree(area._id) : <TreeBoundary><PageTree
                      startupId={startup._id}
                      areaId={area._id}
                      currentProfileId={profile._id}
                      canManage={canManage}
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
                      onShowMore={(parentPageId) =>
                        props.onRouteChange(
                          parentPageId === null
                            ? { kind: "area", areaId: area._id, tab: "dokumenti" }
                            : { kind: "page", pageId: parentPageId },
                        )
                      }
                      onCreate={props.onCreate}
                      draggedPageId={props.draggedPageId}
                      onDragPageStart={props.onDragPageStart}
                      onDragPageEnd={props.onDragPageEnd}
                      onDragPageOver={props.onDragPageOver}
                      onDropPage={props.onDropPage}
                    /></TreeBoundary>}
                  </Collapse>
                </div>
              );
            })}
          </div>
        </section>
      </ScrollArea>

      <div
        className={cn(
          "space-y-0.5 border-t border-sidebar-border/80 p-3",
          compact && "px-2",
        )}
      >
        <SidebarButton
          label="Korpa"
          icon={Trash2}
          active={route.kind === "trash"}
          collapsed={compact}
          onClick={() => props.onRouteChange({ kind: "trash" })}
        />
        <SidebarButton
          label="Podešavanja startupa"
          icon={Settings}
          active={route.kind === "settings"}
          collapsed={compact}
          onClick={props.onOpenSettings}
        />

        {/* Na desktopu profil, tema i odjava žive u traci „Ja + startupi". */}
        {mobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-2 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-sidebar-accent/60"
                aria-label="Meni profila"
              >
                <ProfileAvatar profile={profile} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {profile.displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {profile.role === "admin" ? "Administrator" : "Član tima"}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
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
              <DropdownMenuItem onSelect={props.onOpenNotificationSettings}>
                <Bell /> Obaveštenja i zvuci
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
        ) : null}
      </div>
    </div>
  );
}

/**
 * Pad upita stabla jedne oblasti ostaje u toj oblasti (DIZAJN-SMIRENJE §5.5):
 * meni i ostatak ljuske rade; „Pokušaj ponovo" ponovo montira stablo.
 */
class TreeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-2 px-3 py-1.5 text-xs text-muted-foreground">
        <span>Stranice nisu učitane.</span>
        <button
          type="button"
          className="rounded-md font-medium text-foreground underline-offset-2 hover:underline"
          onClick={() => this.setState({ failed: false })}
        >
          Pokušaj ponovo
        </button>
      </div>
    );
  }
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const compact = props.collapsed && !props.temporarilyExpanded;
  const sidebarRef = useRef<HTMLElement>(null);
  const resizeStartRef = useRef<{
    pointerId: number;
    pointerX: number;
    sidebarWidth: number;
  } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const viewportWidth = useSyncExternalStore(
    subscribeToViewportWidth,
    getViewportWidth,
    getServerViewportWidth,
  );
  const maxSidebarWidth = Math.max(
    DEFAULT_SIDEBAR_WIDTH,
    Math.floor(viewportWidth / 2),
  );
  const renderedSidebarWidth = Math.min(
    maxSidebarWidth,
    Math.max(MIN_SIDEBAR_WIDTH, sidebarWidth),
  );

  function setClampedSidebarWidth(nextWidth: number) {
    setSidebarWidth(
      Math.min(maxSidebarWidth, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)),
    );
  }

  function finishSidebarResize(pointerId: number) {
    if (resizeStartRef.current?.pointerId !== pointerId) return;
    resizeStartRef.current = null;
    setIsResizingSidebar(false);
  }

  return (
    <aside
      ref={sidebarRef}
      data-sidebar-width={Math.round(renderedSidebarWidth)}
      data-sidebar-width-resizing={isResizingSidebar || undefined}
      className={cn(
        "relative hidden h-dvh shrink-0 overflow-visible border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:block",
        compact && "w-[4.5rem]",
        isResizingSidebar && "select-none transition-none",
      )}
      style={compact ? undefined : { width: renderedSidebarWidth }}
    >
      <SidebarContent {...props} />
      {compact ? null : (
        <div
          role="separator"
          tabIndex={0}
          aria-label="Promeni širinu bočne navigacije"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={maxSidebarWidth}
          aria-valuenow={Math.round(renderedSidebarWidth)}
          aria-valuetext={`${Math.round(renderedSidebarWidth)} piksela širine`}
          data-sidebar-width-resizer
          data-resizing={isResizingSidebar || undefined}
          className="group absolute inset-y-0 -right-1 z-40 flex w-2 touch-none cursor-col-resize items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          title="Prevuci levo ili desno da promeniš širinu"
          onDoubleClick={() => setClampedSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          onKeyDown={(event) => {
            const currentWidth =
              sidebarRef.current?.getBoundingClientRect().width ??
              renderedSidebarWidth;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setClampedSidebarWidth(currentWidth - SIDEBAR_WIDTH_STEP);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setClampedSidebarWidth(currentWidth + SIDEBAR_WIDTH_STEP);
            } else if (event.key === "Home") {
              event.preventDefault();
              setClampedSidebarWidth(MIN_SIDEBAR_WIDTH);
            } else if (event.key === "End") {
              event.preventDefault();
              setClampedSidebarWidth(maxSidebarWidth);
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const currentWidth =
              sidebarRef.current?.getBoundingClientRect().width;
            if (currentWidth === undefined) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeStartRef.current = {
              pointerId: event.pointerId,
              pointerX: event.clientX,
              sidebarWidth: currentWidth,
            };
            setIsResizingSidebar(true);
          }}
          onPointerMove={(event) => {
            const resizeStart = resizeStartRef.current;
            if (!resizeStart || resizeStart.pointerId !== event.pointerId)
              return;
            setClampedSidebarWidth(
              resizeStart.sidebarWidth + event.clientX - resizeStart.pointerX,
            );
          }}
          onPointerUp={(event) => {
            finishSidebarResize(event.pointerId);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => finishSidebarResize(event.pointerId)}
          onLostPointerCapture={(event) => finishSidebarResize(event.pointerId)}
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-full w-px bg-transparent transition-[width,background-color]",
              "group-hover:w-0.5 group-hover:bg-primary/55 group-focus-visible:w-0.5 group-focus-visible:bg-primary/70",
              isResizingSidebar && "w-0.5 bg-primary/75",
            )}
          />
        </div>
      )}
    </aside>
  );
}

/** Sadržaj mobilnog menija bez Sheet okvira (izlog ga prikazuje u mestu). */
export type MobileMenuPanelProps = WorkspaceSidebarProps & {
  scopeChips: ScopeChipsProps;
  /** Meni opsega „Ja"; `null` = opseg startupa. */
  me: MeSidebarProps | null;
};

/**
 * Meni ispod `lg` (PLAN §3.2): na vrhu red „Ja" + čipovi startupa, ispod meni
 * aktivnog opsega — „Moj prostor" (`me`) ili postojeći meni startupa.
 * `onClose` se zove posle svake radnje koja vodi negde.
 */
export function MobileMenuPanel({ onClose, ...props }: MobileMenuPanelProps & { onClose: () => void }) {
  const close = <Args extends unknown[]>(handler: (...args: Args) => void) =>
    (...args: Args) => {
      handler(...args);
      onClose();
    };
  const mobileProps: WorkspaceSidebarProps = {
    ...props,
    onRouteChange: close(props.onRouteChange),
    onCreate: close(props.onCreate),
    onCreateArea: close(props.onCreateArea),
    onSearch: close(props.onSearch),
    onOpenSettings: close(props.onOpenSettings),
    onOpenNotificationSettings: close(props.onOpenNotificationSettings),
    onProfile: close(props.onProfile),
    onSignOut: () => {
      onClose();
      props.onSignOut();
    },
  };
  const scope = (
    <ScopeChips
      {...props.scopeChips}
      onSelectMe={close(props.scopeChips.onSelectMe)}
      onSelectStartup={close(props.scopeChips.onSelectStartup)}
      onCreateStartup={
        props.scopeChips.onCreateStartup ? close(props.scopeChips.onCreateStartup) : undefined
      }
      className="shrink-0 border-b border-sidebar-border/80"
    />
  );
  if (!props.me) {
    return <SidebarContent {...mobileProps} mobile collapsed={false} scopeSlot={scope} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 p-3 pr-12">
        <AppMark className="size-8" />
        <p className="min-w-0 truncate text-sm font-semibold">Devotion</p>
      </div>
      {scope}
      <MeSidebar
        {...props.me}
        className="min-h-0 flex-1"
        onNavigate={close(props.me.onNavigate)}
        onOpenStartup={close(props.me.onOpenStartup)}
        account={{
          onProfile: mobileProps.onProfile,
          onSignOut: mobileProps.onSignOut,
        }}
      />
    </div>
  );
}

export function MobileWorkspaceMenu(props: MobileMenuPanelProps) {
  const [open, setOpen] = useState(false);
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
          Opsezi, meni izabranog opsega i podešavanja.
        </SheetDescription>
        <MobileMenuPanel {...props} onClose={() => setOpen(false)} />
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
        <p className="text-sm font-semibold">Devotion</p>
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
