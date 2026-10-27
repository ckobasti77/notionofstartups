"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { Building2, LoaderCircle, Sparkles } from "lucide-react";

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
import { AreaView, effectiveAreaTab } from "@/components/workspace/area/area-view";
import { ChatView } from "@/components/workspace/chat-view";
import { CreatePageDialog } from "@/components/workspace/create-page-dialog";
import { QuickAddContainer } from "@/components/me/quick-add/quick-add-container";
import { CreateAreaDialog } from "@/components/workspace/create-area-dialog";
import { IdeasView } from "@/components/workspace/ideas-view";
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
import { MotionDialog } from "@/components/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  isSettling,
  leavePageQuestion,
  type PageEditorSaveState,
} from "@/components/workspace/page/page-autosave-model";
import {
  WorkspaceHistoryProvider,
} from "@/components/workspace/workspace-history";
import {
  isAreasRouteCandidate,
  isMeRoute,
  pageArchiveFallbackRoute,
  readWorkspaceLocation,
  resolvedAreasRoute,
  withPageTab,
  workspaceRouteAfterStartupSwitch,
  workspaceRouteHref,
} from "@/components/workspace/workspace-route";

const PageRouteView = dynamic(
  () => import("@/components/workspace/page/page-route-view").then((module) => module.PageRouteView),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-[40vh] rounded-lg" />
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

/** Prikaz sa nacrtom koji se sam čuva: stranica i oblast (Pregled nosi opis oblasti, K13). */
function holdsDraft(route: WorkspaceRoute): boolean {
  return route.kind === "page" || route.kind === "area";
}

/** Isti prikaz sa nacrtom: ista stranica ili oblast i ista kartica. */
function sameDraftView(current: WorkspaceRoute, next: WorkspaceRoute): boolean {
  if (current.kind === "page" && next.kind === "page") {
    return current.pageId === next.pageId && (current.tab ?? null) === (next.tab ?? null);
  }
  if (current.kind === "area" && next.kind === "area") {
    // Poredi se prikazana kartica: link iz menija bez `tab` ostaje na istoj kartici.
    return (
      current.areaId === next.areaId &&
      effectiveAreaTab(current.areaId, current.tab) === effectiveAreaTab(next.areaId, next.tab)
    );
  }
  return false;
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
  // Nazad/Napred posle „Napusti" ne pita ponovo.
  const bypassPopGuardRef = useRef(false);
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
  const [pageSaveState, setPageSaveState] =
    useState<PageEditorSaveState>("saved");
  // Stranica upravo napravljena iz dijaloga: fokus ide na naslov (K07 §5.6).
  const [createdPageId, setCreatedPageId] = useState<Id<"pages"> | null>(null);
  // Napuštanje stranice sa nesačuvanim izmenama (K07 §3): prvo se sačeka do
  // 2 s da se čuvanje završi, pa tek onda pitanje „Ostani" / „Napusti".
  const [leaveRequest, setLeaveRequest] = useState<{ proceed: () => void; asked: boolean } | null>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  // Drag and drop state for pages in sidebar
  const [draggedPageId, setDraggedPageId] = useState<Id<"pages"> | null>(null);
  const [activeDropPageId, setActiveDropPageId] = useState<Id<"pages"> | null>(null);
  const [activeDropAreaId, setActiveDropAreaId] = useState<Id<"startupAreas"> | null>(null);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const markNotificationRead = useMutation(api.notifications.markRead);
  const movePage = useMutation(api.areasV2.movePage);
  const convex = useConvex();
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
  const canLeaveActivePage = useCallback((
    nextRoute: WorkspaceRoute,
    proceed: () => void,
  ) => {
    // Ista stranica (ili oblast), isti prikaz: dokument → Mapa iste stranice
    // demontira editor, pa je i to napuštanje (V2 recenzije K10); isto važi za
    // karticu oblasti — Pregled nosi nacrt opisa (K13).
    if (!holdsDraft(route) || sameDraftView(route, nextRoute) || pageSaveState === "saved") return true;
    setLeaveRequest({ proceed, asked: !isSettling(pageSaveState) });
    return false;
  }, [pageSaveState, route]);

  const navigateRoute = useCallback((
    nextRoute: WorkspaceRoute,
    options: {
      replace?: boolean;
      bypassGuard?: boolean;
      targetStartupId?: Id<"startups">;
    } = {},
  ) => {
    if (
      !options.bypassGuard &&
      !canLeaveActivePage(nextRoute, () =>
        navigateRouteRef.current(nextRoute, { ...options, bypassGuard: true }),
      )
    ) {
      return false;
    }
    const navigationStartupId = options.targetStartupId ?? startupId;
    const leavesCurrentPage = holdsDraft(route) && !sameDraftView(route, nextRoute);
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
  // Odložena navigacija (posle čuvanja) mora da vidi najnoviju funkciju.
  const navigateRouteRef = useRef(navigateRoute);
  useEffect(() => {
    navigateRouteRef.current = navigateRoute;
  }, [navigateRoute]);

  // Čeka se kraj čuvanja (do 2 s); sačuvano → idi, inače pitaj.
  const leavePending = leaveRequest !== null && !leaveRequest.asked;
  useEffect(() => {
    if (!leavePending || leaveRequest === null) return;
    const request = leaveRequest;
    const saved = pageSaveState === "saved";
    // Sačuvano → nastavi odmah; čuvanje traje → pitaj posle 2 s; zapelo → pitaj odmah.
    const timer = window.setTimeout(
      () => {
        if (saved) {
          setLeaveRequest(null);
          request.proceed();
        } else {
          setLeaveRequest((current) => (current ? { ...current, asked: true } : current));
        }
      },
      saved || !isSettling(pageSaveState) ? 0 : 2_000,
    );
    return () => window.clearTimeout(timer);
  }, [leavePending, leaveRequest, pageSaveState]);

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
      const resolved = withPageTab(resolvedAreasRoute(value), candidate);
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
      if (bypassPopGuardRef.current) {
        bypassPopGuardRef.current = false;
      } else if (
        !canLeaveActivePage({ kind: "today" }, () => {
          bypassPopGuardRef.current = true;
          window.history.back();
        })
      ) {
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
    bypassGuard = false,
  ) {
    if (!bypassGuard && deferScopeChange(() => openInStartup(targetStartupId, target, true))) return;
    const nextRoute: WorkspaceRoute =
      "route" in target ? target.route : { kind: "page", pageId: target.pageId };
    markScopeMotion({ kind: "startup", startupId: targetStartupId });
    if (startup?._id !== targetStartupId) {
      resetForStartupIdRef.current = targetStartupId;
      if (!navigateRoute(nextRoute, { targetStartupId, bypassGuard })) {
        resetForStartupIdRef.current = null;
        return;
      }
      setSelectedStartupId(targetStartupId);
      resetStartupLocalState();
    } else if (!navigateRoute(nextRoute, { bypassGuard })) {
      return;
    }
  }

  /**
   * Promena startupa ili otvaranje iz drugog opsega dok stranica još čuva:
   * cela radnja (ne samo navigacija) se ponavlja posle čuvanja ili „Napusti",
   * da izabrani startup i ruta ostanu usklađeni. `true` = radnja je odložena.
   */
  function deferScopeChange(retry: () => void): boolean {
    if (!holdsDraft(route) || pageSaveState === "saved") return false;
    setLeaveRequest({ proceed: retry, asked: !isSettling(pageSaveState) });
    return true;
  }

  function selectStartup(nextStartupId: Id<"startups">, bypassGuard = false) {
    if (!bypassGuard && deferScopeChange(() => selectStartup(nextStartupId, true))) return;
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
          bypassGuard,
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

  const clearCreatedPage = useCallback(() => setCreatedPageId(null), []);

  /** Stranica se svuda otvara rutom (K07 E2) — brzi detalj u dijalogu ne postoji. */
  function openPage(pageId: Id<"pages">) {
    navigateRoute({ kind: "page", pageId });
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
        // Komentar na opisu oblasti: targetId je areaId, ne pageId — otvara se
        // Pregled oblasti (tu su opis i Komentari, K13).
        navigateRoute(
          item.targetId === null
            ? { kind: "today" }
            : { kind: "area", areaId: item.targetId as Id<"startupAreas">, tab: "pregled" },
        );
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
        navigateRoute(resolved);
        if (resolved.kind === "page") return;
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
        : screen === "area" && entityId !== null
          ? { kind: "area", areaId: entityId as Id<"startupAreas">, tab: "pregled" }
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
  const routeKey = route.kind === "page" ? `page:${route.pageId}:${route.tab ?? ""}` : route.kind === "area" ? `area:${route.areaId}` : route.kind;
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
            <ThoughtsCanvasView startup={startup} profile={profile} onOpenPage={openPage} onOpenIdeas={() => navigateRoute({ kind: "ideas" })} />
          ) : route.kind === "ideas" ? (
            <IdeasView
              startup={startup}
              onOpenPage={openPage}
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
                onOpenPage={openPage}
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
                onOpenPage={openPage}
                onOpenFull={(pageId) => navigateRoute({ kind: "page", pageId })}
                onCreateTask={() => openCreate({ initialKind: "task" })}
              />
            </WorkspaceErrorBoundary>
          ) : route.kind === "puls" ? (
            <PulsView
              startup={startup}
              initialWeekStart={route.weekStart ?? null}
              onOpenPage={openPage}
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
                target.kind === "page" ? openPage(target.pageId) : navigateRoute({ kind: "ideas" })
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
              onOpenPage={openPage}
            />
          ) : route.kind === "area" ? (
            <AreaView
              startup={startup}
              profile={profile}
              areaId={route.areaId}
              tab={route.tab}
              today={today}
              startups={startups}
              onTabChange={(tab) => navigateRoute({ kind: "area", areaId: route.areaId, tab }, { replace: true })}
              onOpenPage={openPage}
              onOpenFull={(pageId) => navigateRoute({ kind: "page", pageId })}
              onCreate={openCreate}
              onSaveStateChange={setPageSaveState}
            />
          ) : (
            <WorkspaceErrorBoundary
              key={route.pageId}
              title="Stranica se ne može učitati"
              className="min-h-[24rem]"
            >
              <PageRouteView
                startup={startup}
                profileId={profile._id}
                pageId={route.pageId}
                tab={route.tab}
                now={today.now}
                today={today}
                autoFocusTitle={createdPageId === route.pageId}
                onAutoFocusDone={clearCreatedPage}
                onOpenPage={openPage}
                onOpenMap={(pageId) => navigateRoute({ kind: "page", pageId, tab: "mapa" })}
                onOpenArea={(areaId) => navigateRoute({ kind: "area", areaId })}
                onOpenChannel={(channelId) => navigateRoute({ kind: "chat", channelId })}
                onOpenTrash={() => navigateRoute({ kind: "trash" }, { bypassGuard: true })}
                onCreateChild={openCreate}
                onSaveStateChange={setPageSaveState}
                onArchived={(page) => {
                  setPageSaveState("saved");
                  navigateRoute(pageArchiveFallbackRoute(page), { bypassGuard: true, replace: true });
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
      <MotionDialog
        open={leaveRequest?.asked ?? false}
        onOpenChange={(open) => {
          if (!open) setLeaveRequest(null);
        }}
        title={route.kind === "area" ? "Opis oblasti još nije sačuvan. Napusti prikaz?" : leavePageQuestion(pageSaveState)}
        description={
          route.kind === "area"
            ? "Ako napustiš prikaz, nesačuvan tekst se gubi."
            : "Ako napustiš stranicu, nesačuvan tekst se gubi."
        }
        width="26rem"
        bodyClassName="py-2"
        initialFocus={() => stayButtonRef.current}
        footer={
          <>
            <Button ref={stayButtonRef} type="button" variant="outline" onClick={() => setLeaveRequest(null)}>
              Ostani
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                // Navigacija sama vraća stanje stranice na „sačuvano".
                const request = leaveRequest;
                setLeaveRequest(null);
                request?.proceed();
              }}
            >
              Napusti
            </Button>
          </>
        }
      >
        {null}
      </MotionDialog>

            <CreatePageDialog key={`${createOpen}-${createTarget?.areaId ?? "none"}-${createTarget?.parentPageId ?? "root"}-${createTarget?.initialKind ?? "note"}`} open={createOpen} onOpenChange={setCreateOpen} startup={startup} profileId={profile._id} now={today.now} target={createTarget} onCreated={(pageId) => {
        setCreatedPageId(pageId);
        openPage(pageId);
      }} />
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
        openPage(pageId);
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
