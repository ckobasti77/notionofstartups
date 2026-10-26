"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Building2,
  ExternalLink,
  FileText,
  FolderOutput,
  LoaderCircle,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";

import { ChatHubSkeleton } from "@/components/me/chat/chat-hub-skeleton";
import { MyDaySkeleton } from "@/components/me/my-day/my-day-skeleton";
import { InboxSkeleton } from "@/components/me/inbox/inbox-skeleton";
import { MyTasksSkeleton } from "@/components/me/tasks/my-tasks-skeleton";
import { buildMyDay, firstNameOf, openByStartup, openTodayCount } from "@/components/me/my-day/my-day-model";
import { MeSidebar, type MeSidebarProps } from "@/components/me/shell/me-sidebar";
import {
  railBadges,
  railDirection,
  railKey,
  type RailScope,
} from "@/components/me/shell/scope";
import { MobileScopeHeader } from "@/components/me/shell/mobile-scope-header";
import type { ScopeChipsProps } from "@/components/me/shell/scope-chips";
import { ScopeSwap } from "@/components/me/shell/scope-swap";
import { MotionStage } from "@/components/motion/motion-stage";
import { ShortcutProvider, useShortcuts } from "@/components/shortcuts/shortcut-provider";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import { SHELL_SHORTCUTS } from "@/lib/shortcuts/registry";
import { useToday } from "@/lib/use-today";
import { ActivityView } from "@/components/workspace/activity-view";
import { AdminDialog } from "@/components/workspace/admin-dialog";
import { AreaView } from "@/components/workspace/area-view";
import { ChatView } from "@/components/workspace/chat-view";
import { CreatePageDialog } from "@/components/workspace/create-page-dialog";
import { QuickAddContainer } from "@/components/me/quick-add/quick-add-container";
import { CreateAreaDialog } from "@/components/workspace/create-area-dialog";
import { IdeasView } from "@/components/workspace/ideas-view";
import { MoveToAreaMenu } from "@/components/workspace/move-to-area-menu";
import { ProfileDialog } from "@/components/workspace/profile-dialog";
import { NotificationSettingsDialog } from "@/components/workspace/notification-settings-dialog";
import { SearchDialog } from "@/components/workspace/search-dialog";
import { CommandCenterView } from "@/components/workspace/command-center-view";
import {
  useNotificationToasts,
  type NotificationItem,
} from "@/components/workspace/notifications-panel";
import { PulsView } from "@/components/workspace/puls-view";
import { TasksView, type TasksFilterValue } from "@/components/workspace/tasks-view";
import { TrashContainer } from "@/components/workspace/trash/trash-container";
import { ThoughtDestinationPicker } from "@/components/workspace/thought-destination-picker";
import {
  ProfileAvatar,
} from "@/components/workspace/workspace-ui";
import { ThoughtSidebarDragLayer } from "@/components/workspace/thought-sidebar-drag";
import {
  WorkspaceErrorBoundary,
  useQueryTolerant,
} from "@/components/workspace/workspace-error-boundary";
import type {
  ThoughtDestination,
  ThoughtDestinationRequest,
  ThoughtDropTarget,
  ThoughtSidebarDragRequest,
} from "@/components/workspace/thought-sharing";
import type { CreatePageTarget, MeRoute, ProfileWithAvatar, StartupRoute, TrashSegment, WorkspaceRoute } from "@/components/workspace/types";
import type { InboxNavigation } from "@/components/me/inbox/inbox-container";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PageEditorSaveState } from "@/components/workspace/page-editor-view";
import {
  ITEM_SIZE_DIMENSIONS,
  ItemSizeMenu,
  ItemSizePicker,
  workspaceItemDialogContentClass,
  type ItemSizePreset,
} from "@/components/workspace/workspace-item-dialog";
import {
  useWorkspaceHistory,
  WorkspaceHistoryProvider,
} from "@/components/workspace/workspace-history";
import {
  isAreasRouteCandidate,
  isMeRoute,
  readWorkspaceLocation,
  resolvedAreasRoute,
  workspaceRouteAfterStartupSwitch,
  workspaceRouteHref,
} from "@/components/workspace/workspace-route";

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

const PageWorkspaceView = dynamic(
  () =>
    import("@/components/workspace/page-workspace-view").then(
      (module) => module.PageWorkspaceView,
    ),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-7 sm:px-7 lg:px-10">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-[42rem] rounded-3xl" />
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

const MyDayContainer = dynamic(
  () => import("@/components/me/my-day/my-day-container").then((module) => module.MyDayContainer),
  { loading: () => <MyDaySkeleton /> },
);

const MyTasksContainer = dynamic(
  () => import("@/components/me/tasks/my-tasks-container").then((module) => module.MyTasksContainer),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
        <MyTasksSkeleton />
      </div>
    ),
  },
);

const ChatHubContainer = dynamic(
  () => import("@/components/me/chat/chat-hub-container").then((module) => module.ChatHubContainer),
  { loading: () => <ChatHubSkeleton /> },
);

const InboxContainer = dynamic(
  () => import("@/components/me/inbox/inbox-container").then((module) => module.InboxContainer),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
        <InboxSkeleton />
      </div>
    ),
  },
);

/** Prvi prikaz iz URL-a (ljuska se učitava tek na klijentu, posle prijave). */
function initialRoute(): WorkspaceRoute {
  if (typeof window === "undefined") return { kind: "today" };
  const candidate = readWorkspaceLocation(window.location.search).route;
  return candidate && !isAreasRouteCandidate(candidate) ? candidate : { kind: "today" };
}

/** Naslov ispod `lg` (podnaslov uz ime startupa) — plan K07 §2.3. */
function startupRouteTitle(route: StartupRoute): string {
  switch (route.kind) {
    case "today":
      return "Komandni centar";
    case "tasks":
      return "Zadaci";
    case "ideas":
      return "Ideje";
    case "chat":
      return "Poruke";
    case "trash":
      return "Korpa";
    case "activity":
      return "Aktivnost";
    case "puls":
      return "Puls";
    case "thoughts":
      return "Beleške";
    case "area":
      return "Dokumenti";
    case "page":
      return "Stranica";
  }
}

/** Filter Zadataka iz rute (osoba ima prednost). */
function tasksFilterOf(route: Extract<StartupRoute, { kind: "tasks" }>): TasksFilterValue {
  return route.profileId ?? route.filter ?? "svi";
}

function tasksRouteOf(filter: TasksFilterValue): StartupRoute {
  if (filter === "svi") return { kind: "tasks" };
  if (filter === "moji") return { kind: "tasks", filter: "moji" };
  return { kind: "tasks", profileId: filter };
}

export function WorkspaceShell(props: { profile: ProfileWithAvatar; onSignOut: () => void }) {
  return (
    <WorkspaceHistoryProvider>
      <ShortcutProvider>
        <WorkspaceShellContent {...props} />
      </ShortcutProvider>
    </WorkspaceHistoryProvider>
  );
}

function WorkspaceShellContent({ profile, onSignOut }: { profile: ProfileWithAvatar; onSignOut: () => void }) {
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
  const [route, setRoute] = useState<WorkspaceRoute>(initialRoute);
  // Poslednji prikaz ličnog nivoa — „Ja" u traci vraća tamo gde si bio.
  const lastMeRouteRef = useRef<MeRoute>({ kind: "me-today" });
  // Smer kretanja kroz traku za smenu menija: postavlja ga rukovalac klika i
  // važi samo za opseg ka kome je postavljen (Nazad/Napred ide bez smera).
  const [scopeMotion, setScopeMotion] = useState<{ toKey: string; direction: -1 | 0 | 1 }>({
    toKey: "",
    direction: 0,
  });
  const routeResolutionRequestRef = useRef(0);
  const activeStartupIdRef = useRef<Id<"startups"> | null>(null);
  const resetForStartupIdRef = useRef<Id<"startups"> | null>(null);
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
  const [quickAdd, setQuickAdd] = useState<{
    open: boolean;
    preset: { startupId: Id<"startups"> } | null;
  }>({ open: false, preset: null });
  const [searchOpen, setSearchOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminMode, setAdminMode] = useState<"edit" | "create">("edit");
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailPageId, setDetailPageId] = useState<Id<"pages"> | null>(null);
  const [detailSaveState, setDetailSaveState] =
    useState<PageEditorSaveState>("saved");
  const [detailDetachBusy, setDetailDetachBusy] = useState(false);
  const [pageSaveState, setPageSaveState] =
    useState<PageEditorSaveState>("saved");
  // Drag and drop state for pages in sidebar
  const [draggedPageId, setDraggedPageId] = useState<Id<"pages"> | null>(null);
  const [activeDropPageId, setActiveDropPageId] = useState<Id<"pages"> | null>(null);
  const [activeDropAreaId, setActiveDropAreaId] = useState<Id<"startupAreas"> | null>(null);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const markNotificationRead = useMutation(api.notifications.markRead);
  const movePage = useMutation(api.areasV2.movePage);
  const resizePage = useMutation(api.areasV2.resizePage);
  const resetPageSize = useMutation(api.areasV2.resetPageSize);
  const detachPage = useMutation(api.areasV2.detachPage);
  const convex = useConvex();
  const { pushHistory } = useWorkspaceHistory();
  const startupIdFromUrl =
    typeof window === "undefined"
      ? null
      : readWorkspaceLocation(window.location.search).startupId;
  const startup =
    startups?.find((item) => item._id === selectedStartupId) ??
    (selectedStartupId === null
      ? startups?.find((item) => item._id === startupIdFromUrl)
      : undefined) ??
    startups?.[0];
  const startupId = startup?._id;
  // Tolerantno kao ostali brojači: od K08 hrani i bedž „Ja" i meni.
  const chatUnread = useQueryTolerant(api.chat.unreadSummary, {});
  // Lični nivo: tolerantno — greška brojača ne sme da obori ljusku; bedž se
  // tada samo ne prikazuje (plan K01 §5).
  const today = useToday();
  const inboxUnread = useQueryTolerant(api.inbox.unreadCounts, {});
  const myDayOverview = useQueryTolerant(api.myDay.overview, {
    dayKey: today.dayKey,
    doneSince: today.doneSince,
  });
  const myDayStats = useMemo(
    () =>
      myDayOverview
        ? {
            counts: buildMyDay(myDayOverview, today.now).counts,
            openByStartup: openByStartup(myDayOverview, today.now),
            capped: myDayOverview.capped.tasks,
          }
        : null,
    [myDayOverview, today.now],
  );
  // Tolerantno: pad `pages.get` obara body dijaloga kroz granicu, a footer se
  // degradira na „Autor nije dostupan" umesto da sruši ceo shell.
  const detailPage = useQueryTolerant(
    api.pages.get,
    detailPageId ? { pageId: detailPageId } : "skip",
  );
  const detailCanvas = useQuery(
    api.areasV2.getCanvas,
    detailPage && startup && detailPage.startupId === startup._id
      ? {
          startupId: startup._id,
          areaId: detailPage.areaId,
          rootPageId: detailPage.parentPageId,
        }
      : "skip",
  );
  const detailCardSize = detailCanvas?.pages.find(
    (page) => page._id === detailPageId,
  );

  const canLeaveActivePage = useCallback((
    nextRoute: WorkspaceRoute,
  ) => {
    const staysOnSamePage =
      route.kind === "page" &&
      nextRoute.kind === "page" &&
      route.pageId === nextRoute.pageId;
    if (route.kind !== "page" || staysOnSamePage) return true;

    if (pageSaveState === "dirty" || pageSaveState === "saving") {
      toast.info("Sačekaj trenutak da se izmene sačuvaju.");
      return false;
    }
    if (
      (pageSaveState === "invalid" ||
        pageSaveState === "error" ||
        pageSaveState === "conflict") &&
      !window.confirm(
        pageSaveState === "invalid"
          ? "Naslov je prazan i nacrt ne može da se sačuva. Napustiti stranicu i odbaciti nacrt?"
          : "Izmene nisu sačuvane. Napustiti stranicu?",
      )
    ) {
      return false;
    }
    return true;
  }, [pageSaveState, route]);

  const navigateRoute = useCallback((
    nextRoute: WorkspaceRoute,
    options: {
      replace?: boolean;
      bypassGuard?: boolean;
      targetStartupId?: Id<"startups">;
    } = {},
  ) => {
    if (!options.bypassGuard && !canLeaveActivePage(nextRoute)) return false;
    const navigationStartupId = options.targetStartupId ?? startupId;
    const leavesCurrentPage =
      route.kind === "page" &&
      !(
        nextRoute.kind === "page" &&
        nextRoute.pageId === route.pageId
      );
    if (leavesCurrentPage) setPageSaveState("saved");
    if (selectedStartupId === null && navigationStartupId) {
      setSelectedStartupId(navigationStartupId);
    }
    routeResolutionRequestRef.current += 1;
    setRoute(nextRoute);
    if (typeof window === "undefined") return true;
    const href = workspaceRouteHref(
      nextRoute,
      window.location.href,
      navigationStartupId,
    );
    if (options.replace) {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }
    return true;
  }, [
    canLeaveActivePage,
    route,
    selectedStartupId,
    startupId,
  ]);

  const resolveLocationRoute = useCallback(async (
    currentStartupId: Id<"startups">,
  ) => {
    if (typeof window === "undefined") return;
    const requestId = routeResolutionRequestRef.current + 1;
    routeResolutionRequestRef.current = requestId;
    const location = readWorkspaceLocation(window.location.search);
    const candidate = location.route;

    if (!candidate) {
      navigateRoute(
        { kind: "me-today" },
        {
          replace: true,
          bypassGuard: true,
          targetStartupId: currentStartupId,
        },
      );
      if (location.hasExplicitView) {
        toast.error("Traženi prikaz nije dostupan. Otvoren je Moj dan.");
      }
      return;
    }

    if (!isAreasRouteCandidate(candidate)) {
      navigateRoute(candidate, {
        replace: true,
        bypassGuard: true,
        targetStartupId: currentStartupId,
      });
      return;
    }

    try {
      const value = await convex.query(
        api.areasV2.resolveRoute,
        candidate.kind === "area"
          ? { startupId: currentStartupId, areaId: candidate.areaId }
          : { startupId: currentStartupId, pageId: candidate.pageId },
      );
      if (routeResolutionRequestRef.current !== requestId) return;
      const resolved = resolvedAreasRoute(value);
      if (resolved) {
        navigateRoute(resolved, {
          replace: true,
          bypassGuard: true,
          targetStartupId: currentStartupId,
        });
        if (candidate.kind === "page" && resolved.kind === "area") {
          toast.info(
            "Stranica više nije dostupna. Otvorena je njena pripadajuća oblast.",
          );
        }
        return;
      }
    } catch {
      if (routeResolutionRequestRef.current !== requestId) return;
    }

    navigateRoute(
      { kind: "today" },
      {
        replace: true,
        bypassGuard: true,
        targetStartupId: currentStartupId,
      },
    );
    toast.error("Traženi prikaz nije dostupan. Otvoren je Komandni centar.");
  }, [convex, navigateRoute]);

  useEffect(() => {
    if (!startupId) return;
    const previousStartupId = activeStartupIdRef.current;
    activeStartupIdRef.current = startupId;

    if (previousStartupId === null) {
      void resolveLocationRoute(startupId);
    } else if (previousStartupId !== startupId) {
      if (resetForStartupIdRef.current === startupId) {
        resetForStartupIdRef.current = null;
        void resolveLocationRoute(startupId);
      } else {
        navigateRoute({ kind: "today" }, { replace: true });
      }
    }

    function onPopState() {
      if (!canLeaveActivePage({ kind: "today" })) {
        window.history.pushState(
          null,
          "",
          workspaceRouteHref(route, window.location.href, startupId),
        );
        return;
      }
      setPageSaveState("saved");
      const requestedStartupId = readWorkspaceLocation(
        window.location.search,
      ).startupId;
      const requestedStartup = startups?.find(
        (item) => item._id === requestedStartupId,
      );
      if (requestedStartup && requestedStartup._id !== startupId) {
        resetForStartupIdRef.current = requestedStartup._id;
        setSelectedStartupId(requestedStartup._id);
        return;
      }
      void resolveLocationRoute(startupId);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [
    canLeaveActivePage,
    navigateRoute,
    resolveLocationRoute,
    route,
    startupId,
    startups,
  ]);

  useEffect(() => {
    if (isMeRoute(route)) lastMeRouteRef.current = route;
  }, [route]);

  // Promena prikaza ili opsega ume da ukloni element koji je imao fokus (npr.
  // stavka menija „Ja"); tada fokus ide na sadržaj, ne na body.
  const routeFocusArmedRef = useRef(false);
  useEffect(() => {
    // Prvi prikaz ne krade fokus (skip link i čitač ekrana kreću od vrha).
    if (!routeFocusArmedRef.current) {
      routeFocusArmedRef.current = true;
      return;
    }
    const active = document.activeElement;
    if (active === null || active === document.body) {
      document.getElementById("sadrzaj")?.focus({ preventScroll: true });
    }
  }, [route]);

  // Ctrl/⌘+K kroz registar prečica — isto ponašanje kao ranije (radi i u
  // polju i uz otvoren dijalog).
  useShortcuts([SHELL_SHORTCUTS.search], () => {
    if (startup) setSearchOpen(true);
  });
  // Brzi unos (`q`, K10): svuda isti dijalog; u opsegu startupa je taj
  // startup unapred izabran (preset), u „Ja" važi zapamćen izbor ili Lično.
  useShortcuts([SHELL_SHORTCUTS.quickAdd], () => openQuickAdd(), startup !== undefined);

  const railScope: RailScope | null = startup
    ? isMeRoute(route)
      ? { kind: "me" }
      : { kind: "startup", startupId: startup._id }
    : null;
  const startupOrder = (startups ?? []).map((item) => item._id as string);

  function markScopeMotion(next: RailScope) {
    if (!railScope) return;
    setScopeMotion({
      toKey: railKey(next),
      direction: railDirection(railScope, next, startupOrder),
    });
  }

  /** „Ja": poslednji lični prikaz (ili zadati); startup ostaje u pozadini. */
  function goToMe(next?: MeRoute) {
    const target = next ?? lastMeRouteRef.current;
    // Isti prikaz: bez novog unosa u istoriji.
    if (JSON.stringify(target) === JSON.stringify(route)) return;
    markScopeMotion({ kind: "me" });
    navigateRoute(target);
  }

  /**
   * Otvori nešto u startupu iz ličnog nivoa (npr. stavku iz Moj dan): isti
   * mehanizam kao izbor startupa, pa po potrebi detalj stranice.
   */
  function openInStartup(
    targetStartupId: Id<"startups">,
    target: { pageId: Id<"pages"> } | { route: WorkspaceRoute },
  ) {
    const nextRoute: WorkspaceRoute =
      "route" in target ? target.route : { kind: "today" };
    markScopeMotion({ kind: "startup", startupId: targetStartupId });
    if (startup?._id !== targetStartupId) {
      resetForStartupIdRef.current = targetStartupId;
      if (!navigateRoute(nextRoute, { targetStartupId })) {
        resetForStartupIdRef.current = null;
        return;
      }
      setSelectedStartupId(targetStartupId);
      resetStartupLocalState();
    } else if (!navigateRoute(nextRoute)) {
      return;
    }
    if ("pageId" in target) openPageDetails(target.pageId);
  }

  function selectStartup(nextStartupId: Id<"startups">) {
    // Iz „Ja" je izbor startupa nov unos u istoriji (Nazad vraća u „Ja");
    // između startupa ostaje zamena kao ranije.
    const fromMe = isMeRoute(route);
    const changesStartup = startup?._id !== nextStartupId;
    markScopeMotion({ kind: "startup", startupId: nextStartupId });
    if (changesStartup) {
      const nextRoute = workspaceRouteAfterStartupSwitch(route);
      resetForStartupIdRef.current = nextStartupId;
      if (
        !navigateRoute(nextRoute, {
          replace: !fromMe,
          targetStartupId: nextStartupId,
        })
      ) {
        resetForStartupIdRef.current = null;
        return;
      }
    } else if (fromMe) {
      // Startup u pozadini je već izabran: samo prelaz u Komandni centar.
      if (!navigateRoute({ kind: "today" }, { targetStartupId: nextStartupId })) {
        return;
      }
    }
    setSelectedStartupId(nextStartupId);
    // Stablo oblasti i prevlačenja pripadaju startupu: čiste se samo pri promeni.
    if (changesStartup) resetStartupLocalState();
  }

  function resetStartupLocalState() {
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
      const result = await movePage({
        startupId: startup._id,
        pageId,
        targetAreaId,
        targetParentPageId,
      });
      if (result.nestingStatus === "pending") {
        toast.info(
          "Zahtev je poslat autoru roditeljske stranice. Stavka ostaje na trenutnom mestu do odobrenja.",
        );
      } else {
        toast.success("Stranica je uspešno premeštena.");
      }
      if (result.nestingStatus === "none" && targetParentPageId) {
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
      (detailSaveState === "invalid" ||
        detailSaveState === "error" ||
        detailSaveState === "conflict") &&
      !window.confirm(
        detailSaveState === "invalid"
          ? "Naslov je prazan i nacrt ne može da se sačuva. Napustiti detalje i odbaciti nacrt?"
          : "Izmene nisu sačuvane. Napustiti detalje?",
      )
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

  /**
   * Klik na obaveštenje vodi na njegov povod. Cilj može biti arhiviran ili
   * obrisan u međuvremenu, pa se degradira na oblast, a u najgorem slučaju
   * objašnjava zašto ne može da se otvori — obaveštenje se svakako čita.
   */
  async function openNotificationTarget(item: NotificationItem) {
    {
      void markNotificationRead({ notificationId: item._id }).catch(() => {
        // Neuspelo označavanje ne sme da blokira navigaciju.
      });

      // Odobrenja više ne postoje (PROSTOR P3/P11): stari cilj vodi u Korpu.
      if (item.targetType === "approvals") {
        navigateRoute({ kind: "trash" });
        return;
      }
      if (item.targetType === "ideas") {
        navigateRoute({ kind: "ideas" });
        return;
      }
      if (item.targetType === "puls") {
        const weekRef = Number(item.targetId);
        navigateRoute(
          Number.isFinite(weekRef) && weekRef > 0
            ? { kind: "puls", weekStart: weekRef }
            : { kind: "puls" },
        );
        return;
      }
      if (item.targetType === "chat") {
        // targetId je channelId (packages/backend/convex/lib/notificationTarget.ts);
        // bez njega chat se otvara na listi razgovora.
        navigateRoute(
          item.targetId === null
            ? { kind: "chat" }
            : { kind: "chat", channelId: item.targetId as Id<"chatChannels"> },
        );
        return;
      }
      if (item.targetType === "area") {
        // Komentar na opisu oblasti: targetId je areaId, ne pageId. Ekran oblasti
        // dolazi sa K13; do tada Komandni centar (kao `notificationDestination`).
        navigateRoute({ kind: "today" });
        return;
      }
      if (item.targetId === null) {
        navigateRoute({ kind: "today" });
        return;
      }

      if (startupId === undefined) return;
      try {
        const value = await convex.query(api.areasV2.resolveRoute, {
          startupId,
          pageId: item.targetId as Id<"pages">,
        });
        const resolved = resolvedAreasRoute(value);
        if (resolved === null) {
          toast.error("Sadržaj obaveštenja više ne postoji.");
          return;
        }
        if (resolved.kind === "page") {
          openPageDetails(resolved.pageId);
          return;
        }
        navigateRoute(resolved);
        toast.info("Sadržaj više nije dostupan; otvorena je njegova oblast.");
      } catch {
        toast.error("Sadržaj obaveštenja više ne postoji.");
      }
    }
  }

  useNotificationToasts({ startupId, onOpen: openNotificationTarget });

  /**
   * Klik na stavku Inbox-a (K14). Startup cilj prebacuje opseg u taj startup i
   * otvara stranicu/chat/odobrenja/ideje/puls kao `openNotificationTarget`
   * (isto mapiranje: `notificationDestination`); lični razgovor ostaje u opsegu
   * „Ja" (`me-chat`).
   */
  async function openInboxTarget(target: InboxNavigation) {
    if (target.kind === "none") return;
    if (target.kind === "personal-chat") {
      goToMe(
        target.channelId === null
          ? { kind: "me-chat" }
          : { kind: "me-chat", channelId: target.channelId as Id<"chatChannels"> },
      );
      return;
    }
    const targetStartupId = target.startupId as Id<"startups">;
    const { screen, entityId, weekStart } = target.destination;
    if (screen === "page" && entityId !== null) {
      try {
        const value = await convex.query(api.areasV2.resolveRoute, {
          startupId: targetStartupId,
          pageId: entityId as Id<"pages">,
        });
        const resolved = resolvedAreasRoute(value);
        if (resolved === null) {
          toast.error("Sadržaj obaveštenja više ne postoji.");
          return;
        }
        if (resolved.kind === "page") {
          openInStartup(targetStartupId, { pageId: resolved.pageId });
          return;
        }
        openInStartup(targetStartupId, { route: resolved });
        toast.info("Sadržaj više nije dostupan; otvorena je njegova oblast.");
      } catch {
        toast.error("Sadržaj obaveštenja više ne postoji.");
      }
      return;
    }
    const route: StartupRoute =
      screen === "approvals"
        ? { kind: "trash" }
        : screen === "ideas"
          ? { kind: "ideas" }
          : screen === "puls"
            ? weekStart === null
              ? { kind: "puls" }
              : { kind: "puls", weekStart }
            : screen === "chat"
              ? entityId === null
                ? { kind: "chat" }
                : { kind: "chat", channelId: entityId as Id<"chatChannels"> }
              : { kind: "today" };
    openInStartup(targetStartupId, { route });
  }

  function resizeDetailCard(preset: ItemSizePreset) {
    if (
      !detailPageId ||
      !detailPage ||
      !detailCardSize ||
      !detailCardSize.canResize ||
      detailPage.startupId !== startup._id
    ) {
      return;
    }
    const pageId = detailPageId;
    const scope = {
      startupId: startup._id,
      areaId: detailPage.areaId,
      rootPageId: detailPage.parentPageId,
      pageId,
    };
    const before = {
      width: detailCardSize.width,
      height: detailCardSize.height,
    };
    const dimensions = ITEM_SIZE_DIMENSIONS[preset];
    void resizePage({ ...scope, ...dimensions })
      .then(() => {
        pushHistory({
          label: "promena veličine kartice",
          undo: () => resizePage({ ...scope, ...before }),
          redo: () => resizePage({ ...scope, ...dimensions }),
        });
        toast.success("Veličina oblačića je sačuvana.");
      })
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Veličina oblačića nije sačuvana.",
        ),
      );
  }

  function resetDetailCardSize() {
    if (
      !detailPageId ||
      !detailPage ||
      !detailCardSize ||
      !detailCardSize.canResize ||
      detailPage.startupId !== startup._id
    ) {
      return;
    }
    const pageId = detailPageId;
    const scope = {
      startupId: startup._id,
      areaId: detailPage.areaId,
      rootPageId: detailPage.parentPageId,
      pageId,
    };
    const before = {
      width: detailCardSize.width,
      height: detailCardSize.height,
    };
    void resetPageSize(scope)
      .then(() => {
        pushHistory({
          label: "vraćanje početne veličine kartice",
          undo: () => resizePage({ ...scope, ...before }),
          redo: () => resetPageSize(scope),
        });
        toast.success("Vraćena je početna veličina kartice.");
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Početna veličina nije vraćena.",
        ),
      );
  }

  async function detachDetailPage() {
    if (
      !detailPageId ||
      !detailPage?.permissions.canDetach ||
      detailDetachBusy ||
      !canLeavePageDetails()
    ) {
      return;
    }
    if (
      !window.confirm(
        "Odvojiti ovu stavku od roditelja i vratiti je u koren oblasti?",
      )
    ) {
      return;
    }
    setDetailDetachBusy(true);
    try {
      const result = await detachPage({
        startupId: startup._id,
        pageId: detailPageId,
      });
      if (result.status !== "detached") {
        throw new Error("Stavka više nije ugnežđena.");
      }
      toast.success("Stavka je odvojena i vraćena u koren oblasti.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Stavka nije odvojena.",
      );
    } finally {
      setDetailDetachBusy(false);
    }
  }

  function createChildFromDetails() {
    if (!detailPage || !canLeavePageDetails()) return;
    const target = {
      areaId: detailPage.areaId,
      parentPageId: detailPage._id,
    };
    setDetailPageId(null);
    setDetailSaveState("saved");
    openCreate(target);
  }

  function openAdmin() {
    setAdminMode("edit");
    setAdminOpen(true);
  }

  /** Brzi unos: iz startupa sa njim unapred izabranim, iz „Ja" bez preseta. */
  function openQuickAdd() {
    setQuickAdd({
      open: true,
      preset: startup && !isMeRoute(route) ? { startupId: startup._id } : null,
    });
  }

  function openCreateStartup() {
    setAdminMode("create");
    setAdminOpen(true);
  }

  if (startupsStatus === "LoadingFirstPage") return <WorkspaceLoading />;
  if (!startup) return <EmptyWorkspace profile={profile} onAdmin={openCreateStartup} onSignOut={onSignOut} adminOpen={adminOpen} setAdminOpen={setAdminOpen} onStartupCreated={setSelectedStartupId} />;

  const sidebarProps = {
    profile,
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
    onRouteChange: navigateRoute,
    onCreate: openCreate,
    onCreateArea: () => setCreateAreaOpen(true),
    onSearch: () => setSearchOpen(true),
    // Do K20 „Podešavanja startupa" otvaraju postojeći dijalog (samo admin).
    onOpenSettings: profile.role === "admin" ? openAdmin : null,
    onOpenNotificationSettings: () => setNotificationSettingsOpen(true),
    onProfile: () => setProfileOpen(true),
    onSignOut,
    draggedPageId,
    activeDropPageId,
    activeDropAreaId,
    chatUnread:
      chatUnread?.byStartup.find((entry) => entry.startupId === startup._id)
        ?.unreadCount ?? 0,
    onDragPageStart: handleDragPageStart,
    onDragPageEnd: handleDragPageEnd,
    onDragPageOver: handleDragPageOver,
    onDropPage: handleDropPage,
  };
  const routeKey = route.kind === "page" ? `page:${route.pageId}` : route.kind === "area" ? `area:${route.areaId}` : route.kind;
  const meActive = isMeRoute(route);
  const currentScope: RailScope = meActive
    ? { kind: "me" }
    : { kind: "startup", startupId: startup._id };
  const railStartups = startups.map((item) => ({
    id: item._id,
    name: item.name,
    logoUrl: item.logoUrl,
  }));
  const badges = railBadges(inboxUnread, chatUnread);
  const meSidebarProps: MeSidebarProps = {
    profile,
    active: meActive ? route.kind : null,
    counts: {
      today: myDayStats ? openTodayCount(myDayStats.counts) : null,
      inbox: inboxUnread?.total.count ?? null,
      inboxCapped: inboxUnread?.total.capped ?? false,
      chat: chatUnread?.total.unreadCount ?? null,
    },
    startups: railStartups.map((item) => ({
      ...item,
      openCount: myDayStats ? (myDayStats.openByStartup[item.id] ?? 0) : null,
      capped: myDayStats?.capped ?? false,
    })),
    onNavigate: (key) => goToMe({ kind: key }),
    onOpenStartup: selectStartup,
  };
  const scopeChipsProps: ScopeChipsProps = {
    profile,
    startups: railStartups,
    active: currentScope,
    badges,
    onSelectMe: () => goToMe(),
    onSelectStartup: selectStartup,
    onCreateStartup: profile.role === "admin" ? openCreateStartup : undefined,
  };
  const meTitle =
    route.kind === "me-tasks"
      ? "Moji zadaci"
      : route.kind === "me-inbox"
        ? "Inbox"
        : route.kind === "me-chat"
          ? "Poruke"
          : "Moj dan";
  // Zvono startupa je ugašeno (P11, K07 E7): Inbox u „Ja" nosi sva obaveštenja.
  const notificationCount = inboxUnread?.total.count ?? 0;
  const notificationCapped = inboxUnread?.total.capped ?? false;
  return (
    <div className="app-canvas flex h-dvh overflow-hidden bg-background">
      <a
        href="#sadrzaj"
        onClick={(event) => {
          // Bez promene hash-a: ne pravi `popstate` ni trag u URL-u ljuske.
          event.preventDefault();
          document.getElementById("sadrzaj")?.focus();
        }}
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Preskoči na sadržaj
      </a>
      <WorkspaceRail
        profile={profile}
        startups={railStartups}
        active={currentScope}
        isAdmin={profile.role === "admin"}
        badges={badges}
        onSelectMe={() => goToMe()}
        onSelectStartup={selectStartup}
        onCreateStartup={openCreateStartup}
        onLoadMore={
          startupsStatus === "CanLoadMore" || startupsStatus === "LoadingMore"
            ? () => loadMoreStartups(50)
            : undefined
        }
        loadingMore={startupsStatus === "LoadingMore"}
        onProfile={() => setProfileOpen(true)}
        onNotificationSettings={() => setNotificationSettingsOpen(true)}
        onSignOut={onSignOut}
      />
      <ScopeSwap
        scopeKey={railKey(currentScope)}
        direction={
          scopeMotion.toKey === railKey(currentScope) ? scopeMotion.direction : 0
        }
        className="hidden h-dvh shrink-0 lg:flex"
      >
        {meActive ? (
          <aside className="h-dvh w-[18.5rem] shrink-0 border-r border-sidebar-border bg-sidebar">
            <MeSidebar {...meSidebarProps} />
          </aside>
        ) : (
          <WorkspaceSidebar {...sidebarProps} />
        )}
      </ScopeSwap>
      <div id="sadrzaj" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        <MobileScopeHeader
          menu={<MobileWorkspaceMenu {...sidebarProps} scopeChips={scopeChipsProps} me={meActive ? meSidebarProps : null} />}
          scope={
            meActive
              ? { kind: "me", profile, title: meTitle }
              : {
                  kind: "startup",
                  startup,
                  subtitle: startupRouteTitle(route),
                  onSearch: () => setSearchOpen(true),
                }
          }
          notifications={{
            label: "Inbox",
            count: notificationCount,
            capped: notificationCapped,
            onOpen: () => goToMe({ kind: "me-inbox" }),
          }}
          onQuickAdd={meActive ? openQuickAdd : undefined}
        />
        <MotionStage key={routeKey} viewKey={routeKey} contained={route.kind === "thoughts" || route.kind === "ideas" || route.kind === "chat" || route.kind === "me-chat"}>
          {route.kind === "me-today" ? (
            <WorkspaceErrorBoundary key="me-today" title="Moj dan se ne može učitati" className="m-4 min-h-[20rem]">
              <MyDayContainer
                today={today}
                firstName={firstNameOf(profile.displayName)}
                profileId={profile._id}
                startups={startups}
                onOpenTask={(taskStartupId, pageId) =>
                  openInStartup(taskStartupId, { pageId })
                }
                onOpenTasks={() => goToMe({ kind: "me-tasks" })}
                onQuickAdd={openQuickAdd}
                onOpenInbox={() => goToMe({ kind: "me-inbox" })}
                onOpenChat={() => goToMe({ kind: "me-chat" })}
                onOpenApprovals={(approvalsStartupId) =>
                  openInStartup(approvalsStartupId, { route: { kind: "trash" } })
                }
              />
            </WorkspaceErrorBoundary>
          ) : route.kind === "me-tasks" ? (
            <WorkspaceErrorBoundary key="me-tasks" title="Moji zadaci se ne mogu učitati" className="m-4 min-h-[20rem]">
              <MyTasksContainer
                today={today}
                profileId={profile._id}
                startups={startups}
                onQuickAdd={openQuickAdd}
                onOpenInStartup={(taskStartupId, pageId) => openInStartup(taskStartupId, { pageId })}
              />
            </WorkspaceErrorBoundary>
          ) : route.kind === "me-inbox" ? (
            <WorkspaceErrorBoundary key="me-inbox" title="Inbox se ne može učitati" className="m-4 min-h-[20rem]">
              <InboxContainer
                today={today}
                startups={startups}
                onNavigate={openInboxTarget}
                onOpenSettings={() => setNotificationSettingsOpen(true)}
              />
            </WorkspaceErrorBoundary>
          ) : route.kind === "me-chat" ? (
            <WorkspaceErrorBoundary key="me-chat" title="Poruke se ne mogu učitati" className="m-4 min-h-[20rem]">
              <ChatHubContainer
                today={today}
                profile={profile}
                startups={startups}
                channelId={route.channelId ?? null}
                onSelectChannel={(channelId) => navigateRoute({ kind: "me-chat", channelId })}
                onBackToList={() => navigateRoute({ kind: "me-chat" })}
                onOpenInStartup={openInStartup}
              />
            </WorkspaceErrorBoundary>
          ) : route.kind === "thoughts" ? (
            <ThoughtsCanvasView startup={startup} profile={profile} onOpenPage={openPageDetails} onOpenIdeas={() => navigateRoute({ kind: "ideas" })} />
          ) : route.kind === "ideas" ? (
            <IdeasView
              startup={startup}
              onOpenPage={openPageDetails}
              onOpenChannel={(channelId) =>
                navigateRoute({ kind: "chat", channelId })
              }
            />
          ) : route.kind === "today" ? (
            <WorkspaceErrorBoundary key={`today-${startup._id}`} title="Komandni centar se ne može učitati" className="m-4 min-h-[20rem]">
              <CommandCenterView
                startup={startup}
                profile={profile}
                today={today}
                startups={startups}
                onOpenPage={openPageDetails}
                onOpenFull={(pageId) => navigateRoute({ kind: "page", pageId })}
                onCreateTask={() => openCreate({ initialKind: "task" })}
                links={[
                  { label: "Puls nedelje", onSelect: () => navigateRoute({ kind: "puls" }) },
                  { label: "Aktivnost", onSelect: () => navigateRoute({ kind: "activity" }) },
                  { label: "Moje misli", onSelect: () => navigateRoute({ kind: "thoughts" }) },
                ]}
              />
            </WorkspaceErrorBoundary>
          ) : route.kind === "tasks" ? (
            <WorkspaceErrorBoundary key={`tasks-${startup._id}`} title="Zadaci se ne mogu učitati" className="m-4 min-h-[20rem]">
              <TasksView
                startup={startup}
                profile={profile}
                today={today}
                startups={startups}
                filter={tasksFilterOf(route)}
                onFilterChange={(filter) => navigateRoute(tasksRouteOf(filter), { replace: true })}
                onOpenPage={openPageDetails}
                onOpenFull={(pageId) => navigateRoute({ kind: "page", pageId })}
                onCreateTask={() => openCreate({ initialKind: "task" })}
              />
            </WorkspaceErrorBoundary>
          ) : route.kind === "puls" ? (
            <PulsView
              startup={startup}
              initialWeekStart={route.weekStart ?? null}
              onOpenPage={openPageDetails}
              onOpenArea={(areaId) => navigateRoute({ kind: "area", areaId })}
            />
          ) : route.kind === "activity" ? (
            <ActivityView startup={startup} />
          ) : route.kind === "trash" ? (
            <TrashContainer
              key={`trash-${startup._id}`}
              startupId={startup._id}
              segment={route.segment ?? "page"}
              onSegmentChange={(segment: TrashSegment) =>
                navigateRoute(segment === "page" ? { kind: "trash" } : { kind: "trash", segment }, { replace: true })
              }
              now={today.now}
              onOpen={(target) =>
                target.kind === "page" ? openPageDetails(target.pageId) : navigateRoute({ kind: "ideas" })
              }
            />
          ) : route.kind === "chat" ? (
            <ChatView
              startup={startup}
              profile={profile}
              channelId={route.channelId}
              onSelectChannel={(channelId) =>
                navigateRoute({ kind: "chat", channelId })
              }
              onOpenList={() => navigateRoute({ kind: "chat" })}
              onOpenPage={openPageDetails}
            />
          ) : route.kind === "area" ? (
            <AreaView
              startup={startup}
              profile={profile}
              areaId={route.areaId}
              onOpenCanvas={(pageId) =>
                navigateRoute({ kind: "page", pageId })
              }
              onOpenDetails={openPageDetails}
              onCreate={openCreate}
              onCreateArea={() => setCreateAreaOpen(true)}
            />
          ) : (
            <WorkspaceErrorBoundary
              key={route.pageId}
              title="Stranica se ne može učitati"
              className="min-h-[24rem]"
            >
            <PageWorkspaceView
              startup={startup}
              pageId={route.pageId}
              onOpenCanvas={(pageId) =>
                navigateRoute({ kind: "page", pageId })
              }
              onOpenArea={(areaId) =>
                navigateRoute({ kind: "area", areaId })
              }
              onOpenChannel={(channelId) =>
                navigateRoute({ kind: "chat", channelId })
              }
              onOpenDetails={openPageDetails}
              onCreateChild={openCreate}
              onSaveStateChange={setPageSaveState}
              onArchived={(fallbackRoute) => {
                setPageSaveState("saved");
                if (
                  navigateRoute(fallbackRoute, {
                    bypassGuard: true,
                  })
                ) {
                  toast.info(
                    fallbackRoute.kind === "page"
                      ? "Otvoren je roditeljski kanvas."
                      : "Otvorena je pripadajuća oblast.",
                  );
                }
              }}
            />
            </WorkspaceErrorBoundary>
          )}
        </MotionStage>
      </div>
      {sidebarDragRequest ? <ThoughtSidebarDragLayer key={sidebarDragRequest.sessionId} request={sidebarDragRequest} onActiveTargetChange={setActiveThoughtDropTarget} onDwellTarget={dwellThoughtTarget} onComplete={completeThoughtSidebarDrag} onCancel={cancelThoughtSidebarDrag} /> : null}
      <NotificationSettingsDialog
        open={notificationSettingsOpen}
        onOpenChange={setNotificationSettingsOpen}
      />
      <Dialog
        open={detailPageId !== null}
        onOpenChange={(open) => {
          if (!open) closePageDetails();
        }}
      >
        <DialogContent
          className={`${workspaceItemDialogContentClass} grid-rows-[auto_minmax(0,1fr)_auto]`}
        >
          <div className="relative z-30 flex flex-wrap items-center gap-3 border-b border-border/70 bg-card/90 px-4 py-3 pr-14 backdrop-blur-xl sm:px-6 sm:pr-16">
            <DialogHeader className="sr-only">
              <DialogTitle>Detalji sadržaja</DialogTitle>
              <DialogDescription>
                Pročitaj i izmeni belešku ili zadatak bez napuštanja trenutnog prikaza.
              </DialogDescription>
            </DialogHeader>
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              Detalji stavke
            </span>
            {detailCardSize?.canResize ? (
              <>
                <ItemSizeMenu
                  className="ml-auto sm:hidden"
                  onChange={resizeDetailCard}
                  onReset={resetDetailCardSize}
                />
                <ItemSizePicker
                  className="ml-auto hidden w-auto sm:block"
                  onChange={resizeDetailCard}
                  onReset={resetDetailCardSize}
                />
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => {
                if (!detailPageId) return;
                if (!canLeavePageDetails()) return;
                const pageId = detailPageId;
                if (!navigateRoute({ kind: "page", pageId })) return;
                setDetailPageId(null);
                setDetailSaveState("saved");
              }}
            >
              <ExternalLink className="size-4" />
              Puni prikaz
            </Button>
          </div>
          <div className="scrollbar-thin min-h-0 overflow-y-auto overscroll-contain bg-background">
            {detailPageId ? (
              <WorkspaceErrorBoundary
                key={detailPageId}
                title="Stranica se ne može učitati"
                className="m-4 min-h-[20rem]"
              >
              <PageEditorView
                key={detailPageId}
                startup={startup}
                pageId={detailPageId}
                presentation="dialog"
                onSaveStateChange={setDetailSaveState}
                onOpenPage={openPageDetails}
                onOpenArea={(areaId) => {
                  if (!canLeavePageDetails()) return;
                  if (!navigateRoute({ kind: "area", areaId })) return;
                  setDetailPageId(null);
                  setDetailSaveState("saved");
                }}
                onOpenChannel={(channelId) => {
                  if (!canLeavePageDetails()) return;
                  if (!navigateRoute({ kind: "chat", channelId })) return;
                  setDetailPageId(null);
                  setDetailSaveState("saved");
                }}
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
              </WorkspaceErrorBoundary>
            ) : null}
          </div>
          <footer className="relative z-30 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-background/95 px-4 py-3 shadow-[0_-14px_30px_-24px_rgba(0,0,0,0.6)] backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {detailPage?.creator ? (
                <>
                  <ProfileAvatar
                    profile={detailPage.creator}
                    className="size-6 shrink-0"
                  />
                  <span className="truncate">
                    Kreirao/la{" "}
                    <strong className="font-semibold text-foreground">
                      {detailPage.creator.displayName}
                    </strong>
                  </span>
                </>
              ) : (
                <>
                  <UserRound className="size-4" aria-hidden="true" />
                  Autor nije dostupan
                </>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {detailPage?.permissions.canDetach ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={detailDetachBusy}
                  onClick={() => void detachDetailPage()}
                >
                  {detailDetachBusy ? (
                    <LoaderCircle
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FolderOutput aria-hidden="true" />
                  )}
                  Odvoji u oblast
                </Button>
              ) : null}
              {detailPage?.permissions.canMove && startup.areas.length > 1 ? (
                <MoveToAreaMenu
                  startupId={startup._id}
                  pageId={detailPage._id}
                  pageTitle={detailPage.title}
                  currentAreaId={detailPage.areaId}
                  areas={startup.areas}
                />
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!detailPage}
                onClick={createChildFromDetails}
              >
                <Plus aria-hidden="true" />
                Podstranica
              </Button>
            </div>
          </footer>
        </DialogContent>
      </Dialog>

      <CreatePageDialog key={`${createOpen}-${createTarget?.areaId ?? "none"}-${createTarget?.parentPageId ?? "root"}-${createTarget?.initialKind ?? "note"}`} open={createOpen} onOpenChange={setCreateOpen} startup={startup} profileId={profile._id} now={today.now} target={createTarget} onCreated={openPageDetails} />
      <QuickAddContainer
        open={quickAdd.open}
        onOpenChange={(open) => setQuickAdd((current) => ({ ...current, open }))}
        today={today}
        profileId={profile._id}
        startups={startups}
        preset={quickAdd.preset}
        onOpenTask={(taskStartupId, pageId) => openInStartup(taskStartupId, { pageId })}
      />
      <CreateAreaDialog key={`${createAreaOpen}-${startup._id}`} open={createAreaOpen} onOpenChange={setCreateAreaOpen} startup={startup} onCreated={(areaId) => navigateRoute({ kind: "area", areaId })} />
      <SearchDialog key={`${searchOpen}`} open={searchOpen} onOpenChange={setSearchOpen} startupId={startup._id} onOpenPage={(pageId) => {
        setSearchOpen(false);
        openPageDetails(pageId);
      }} onNavigate={(route) => {
        setSearchOpen(false);
        navigateRoute(route);
      }} />
      <ProfileDialog key={`${profileOpen}-${profile.updatedAt}`} open={profileOpen} onOpenChange={setProfileOpen} profile={profile} />
      {destinationRequest ? <ThoughtDestinationPicker key={`${startup._id}-${destinationRequest.nodeIds.join("-")}`} open startup={startup} selectedCount={destinationRequest.nodeIds.length} onOpenChange={(open) => { if (!open) cancelDestinationPicker(); }} onSelect={completeDestinationPicker} /> : null}
      {profile.role === "admin" ? <AdminDialog key={`${adminOpen}-${adminMode}-${startup._id}`} open={adminOpen} onOpenChange={setAdminOpen} startup={adminMode === "create" ? undefined : startup} onStartupCreated={selectStartup} onCreateStartup={openCreateStartup} /> : null}
    </div>
  );
}

function WorkspaceLoading() { return <div className="flex h-dvh overflow-hidden"><div className="hidden w-[18.5rem] shrink-0 border-r bg-sidebar p-4 lg:block"><Skeleton className="h-10 w-40" /><Skeleton className="mt-6 h-11 w-full" /><div className="mt-6 space-y-2">{[0,1,2,3,4].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div></div><main className="flex flex-1 items-center justify-center"><div className="text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-3 size-5 animate-spin text-primary" /> Otvaram radni prostor…</div></main></div>; }

function EmptyWorkspace({ profile, onAdmin, onSignOut, adminOpen, setAdminOpen, onStartupCreated }: { profile: ProfileWithAvatar; onAdmin: () => void; onSignOut: () => void; adminOpen: boolean; setAdminOpen: (open: boolean) => void; onStartupCreated: (startupId: Id<"startups">) => void }) {
  return <div className="app-canvas flex h-dvh overflow-hidden"><StartupEmptyRail profile={profile} onAdmin={onAdmin} onSignOut={onSignOut} /><main className="flex flex-1 items-center justify-center p-5"><div className="max-w-md rounded-xl border bg-card p-7 text-center"><Building2 className="mx-auto size-5 text-muted-foreground" aria-hidden="true" /><h1 className="mt-4 text-xl font-semibold tracking-[-0.02em]">Još nema startupa</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{profile.role === "admin" ? "Napravi prvi startup. Dobija oblasti Razvoj, Marketing, Prodaja i Ostalo." : "Administrator ti još nije dodelio startup."}</p>{profile.role === "admin" ? <Button className="mt-5" onClick={onAdmin}><Sparkles /> Napravi startup</Button> : null}</div></main>{profile.role === "admin" ? <AdminDialog key={`${adminOpen}-empty`} open={adminOpen} onOpenChange={setAdminOpen} onStartupCreated={onStartupCreated} /> : null}</div>;
}
