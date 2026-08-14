"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { toast } from "sonner";
import { gsap } from "gsap";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Bell,
  Building2,
  ExternalLink,
  FileText,
  FolderOutput,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";

import { ActivityView } from "@/components/workspace/activity-view";
import { ApprovalsView } from "@/components/workspace/approvals-view";
import { AdminDialog } from "@/components/workspace/admin-dialog";
import { AreaView } from "@/components/workspace/area-view";
import { ChatView } from "@/components/workspace/chat-view";
import { CreatePageDialog } from "@/components/workspace/create-page-dialog";
import { CreateAreaDialog } from "@/components/workspace/create-area-dialog";
import { HomeView } from "@/components/workspace/home-view";
import { IdeasView } from "@/components/workspace/ideas-view";
import { MoveToAreaMenu } from "@/components/workspace/move-to-area-menu";
import { ProfileDialog } from "@/components/workspace/profile-dialog";
import { NotificationSettingsDialog } from "@/components/workspace/notification-settings-dialog";
import { SearchDialog } from "@/components/workspace/search-dialog";
import { CommandCenterView } from "@/components/workspace/command-center-view";
import {
  NotificationsSheet,
  useNotificationToasts,
  type NotificationItem,
} from "@/components/workspace/notifications-panel";
import { PulsView } from "@/components/workspace/puls-view";
import { TasksView } from "@/components/workspace/tasks-view";
import { ThoughtDestinationPicker } from "@/components/workspace/thought-destination-picker";
import {
  ProfileAvatar,
  StartupLogo,
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

export function WorkspaceShell(props: { profile: ProfileWithAvatar; onSignOut: () => void }) {
  return (
    <WorkspaceHistoryProvider>
      <WorkspaceShellContent {...props} />
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
  const [route, setRoute] = useState<WorkspaceRoute>({ kind: "home" });
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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
  const approvalsOverview = useQuery(
    api.collaboration.overview,
    startup ? { startupId: startup._id } : "skip",
  );
  const pageNestingInbox = useQuery(
    api.areasV2.listNestingInbox,
    startup ? { startupId: startup._id } : "skip",
  );
  const unreadNotifications = useQuery(
    api.notifications.unreadCount,
    startup ? { startupId: startup._id } : "skip",
  );
  const chatUnread = useQuery(api.chat.unreadSummary, {});
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
        { kind: "home" },
        {
          replace: true,
          bypassGuard: true,
          targetStartupId: currentStartupId,
        },
      );
      if (location.hasExplicitView) {
        toast.error("Traženi prikaz nije dostupan. Vraćen si na početnu stranu.");
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
      { kind: "home" },
      {
        replace: true,
        bypassGuard: true,
        targetStartupId: currentStartupId,
      },
    );
    toast.error("Traženi prikaz nije dostupan. Vraćen si na početnu stranu.");
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
        navigateRoute({ kind: "home" }, { replace: true });
      }
    }

    function onPopState() {
      if (!canLeaveActivePage({ kind: "home" })) {
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
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (startup) setSearchOpen(true); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startup]);

  function selectStartup(nextStartupId: Id<"startups">) {
    if (startup?._id !== nextStartupId) {
      const nextRoute = workspaceRouteAfterStartupSwitch(route);
      resetForStartupIdRef.current = nextStartupId;
      if (
        !navigateRoute(nextRoute, {
          replace: true,
          targetStartupId: nextStartupId,
        })
      ) {
        resetForStartupIdRef.current = null;
        return;
      }
    }
    setSelectedStartupId(nextStartupId);
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
      setNotificationsOpen(false);
      void markNotificationRead({ notificationId: item._id }).catch(() => {
        // Neuspelo označavanje ne sme da blokira navigaciju.
      });

      if (item.targetType === "approvals") {
        navigateRoute({ kind: "approvals" });
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
    onRouteChange: navigateRoute,
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
    pendingApprovals:
      (approvalsOverview?.pendingCount ?? 0) +
      (pageNestingInbox?.incoming.length ?? 0),
    unreadNotifications: unreadNotifications?.count ?? 0,
    chatUnread:
      chatUnread?.byStartup.find((entry) => entry.startupId === startup._id)
        ?.unreadCount ?? 0,
    onOpenNotifications: () => setNotificationsOpen(true),
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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-xl lg:hidden"><MobileWorkspaceMenu {...sidebarProps} /><StartupLogo startup={startup} className="size-8" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{startup.name}</p><p className="truncate text-[0.6875rem] text-muted-foreground">{route.kind === "page" ? "Stranica" : route.kind === "thoughts" ? "Moje misli · Samo ti" : route.kind === "my-tasks" ? "Moji zadaci" : route.kind === "today" ? "Danas" : route.kind === "chat" ? "Chat" : route.kind === "puls" ? "Puls nedelje" : route.kind === "approvals" ? "Odobrenja" : "Radni prostor"}</p></div><Button variant="ghost" size="icon" aria-label="Pretraži" onClick={() => setSearchOpen(true)}><Search /></Button><Button variant="ghost" size="icon" className="relative" aria-label={`Obaveštenja${(unreadNotifications?.count ?? 0) > 0 ? `, ${unreadNotifications?.count} nepročitano` : ""}`} onClick={() => setNotificationsOpen(true)}><Bell />{(unreadNotifications?.count ?? 0) > 0 ? <span aria-hidden="true" className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[0.625rem] font-bold leading-4 tabular-nums text-primary-foreground">{unreadNotifications?.capped ? "99+" : unreadNotifications?.count}</span> : null}</Button><ThemeToggle /></header>
        <WorkspaceStage key={routeKey} viewKey={routeKey} contained={route.kind === "thoughts" || route.kind === "ideas" || route.kind === "chat"}>
          {route.kind === "home" ? (
            <HomeView startup={startup} profile={profile} onOpenArea={(areaId) => navigateRoute({ kind: "area", areaId })} onOpenPage={openPageDetails} onCreate={(kind) => openCreate({ initialKind: kind })} />
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
            <CommandCenterView startup={startup} profile={profile} onOpenPage={openPageDetails} onCreateTask={() => openCreate({ initialKind: "task" })} />
          ) : route.kind === "my-tasks" ? (
            <TasksView startup={startup} profile={profile} onOpenPage={openPageDetails} onCreateTask={() => openCreate({ initialKind: "task" })} />
          ) : route.kind === "puls" ? (
            <PulsView
              startup={startup}
              initialWeekStart={route.weekStart ?? null}
              onOpenPage={openPageDetails}
              onOpenArea={(areaId) => navigateRoute({ kind: "area", areaId })}
            />
          ) : route.kind === "activity" ? (
            <ActivityView startup={startup} />
          ) : route.kind === "approvals" ? (
            <ApprovalsView startup={startup} />
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
        </WorkspaceStage>
      </div>
      {sidebarDragRequest ? <ThoughtSidebarDragLayer key={sidebarDragRequest.sessionId} request={sidebarDragRequest} onActiveTargetChange={setActiveThoughtDropTarget} onDwellTarget={dwellThoughtTarget} onComplete={completeThoughtSidebarDrag} onCancel={cancelThoughtSidebarDrag} /> : null}
      <NotificationsSheet
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        startupId={startup._id}
        onOpenNotification={openNotificationTarget}
        onOpenSettings={() => {
          // Zatvori panel pa otvori dijalog — samo jedan modal aktivan u datom
          // trenutku (izbegava dupli overlay i nestovane Radix modale).
          setNotificationsOpen(false);
          setNotificationSettingsOpen(true);
        }}
      />
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

      <CreatePageDialog key={`${createOpen}-${createTarget?.areaId ?? "none"}-${createTarget?.parentPageId ?? "root"}-${createTarget?.initialKind ?? "note"}`} open={createOpen} onOpenChange={setCreateOpen} startup={startup} target={createTarget} onCreated={openPageDetails} />
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
