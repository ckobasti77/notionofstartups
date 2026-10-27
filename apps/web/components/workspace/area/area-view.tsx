"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation } from "convex/react";
import { Blocks } from "lucide-react";
import { toast } from "sonner";

import type { MentionMember } from "@/components/collab/comment-composer";
import { useLiveNow } from "@/components/collab/use-live-now";
import {
  TaskPanel,
  type TaskPanelProps,
  type TaskPanelRequest,
} from "@/components/me/task-panel/task-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { AreaCanvasViewProps } from "@/components/workspace/area-canvas-view";
import type { PageEditorSaveState } from "@/components/workspace/page/page-autosave-model";
import type {
  AreaTab,
  CreatePageTarget,
  ProfileWithAvatar,
  StartupWithAreas,
} from "@/components/workspace/types";
import { useQueryTolerant, WorkspaceErrorBoundary } from "@/components/workspace/workspace-error-boundary";
import { isAreaTab } from "@/components/workspace/workspace-route";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import type { PageKind } from "@/lib/page-kinds";
import type { Today } from "@/lib/today";
import { tasksWord } from "@/lib/workspace";

import { AreaDocumentsContainer } from "./area-documents-container";
import { AreaHeader } from "./area-header";
import {
  AREA_TASKS_PAGE,
  areaHeaderMeta,
  areaTaskCount,
  countText,
  pagesWord,
  readRememberedAreaTab,
  rememberAreaTab,
  resolveAreaTab,
} from "./area-model";
import { AreaOverviewContainer } from "./area-overview-container";
import { AreaTasksContainer } from "./area-tasks";

// Mapa je težak prikaz (React Flow): učitava se tek kad se kartica otvori.
const AreaCanvasView = dynamic(
  () => import("@/components/workspace/area-canvas-view").then((module) => module.AreaCanvasView),
  {
    loading: () => (
      <div role="status" aria-label="Učitavam mapu">
        <Skeleton className="h-[min(72vh,52rem)] min-h-[32rem] rounded-lg" />
      </div>
    ),
  },
);

/** `localStorage` kad postoji (izlog i SSR ga nemaju). */
function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Kartica koju oblast stvarno prikazuje za rutu (URL, pa zapamćena, pa Pregled) —
 * ljuska po njoj zna da li prelaz demontira Pregled sa nacrtom opisa.
 */
export function effectiveAreaTab(areaId: string, tab: AreaTab | undefined): AreaTab {
  return resolveAreaTab(tab, readRememberedAreaTab(tabStorage(), areaId));
}

export type AreaViewProps = {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  areaId: Id<"startupAreas">;
  /** Kartica iz URL-a (`&tab=`); bez nje zapamćena ili Pregled. */
  tab: AreaTab | undefined;
  today: Today;
  startups: TaskPanelProps["startups"];
  onTabChange: (tab: AreaTab) => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenFull: (pageId: Id<"pages">) => void;
  onCreate: (target: CreatePageTarget) => void;
  /** Nacrt opisa oblasti (ljuska pita pre napuštanja, kao za stranicu). */
  onSaveStateChange?: (state: PageEditorSaveState) => void;
};

/**
 * Oblast — kontejner (PROSTOR P12, plan K07 §5.5): zaglavlje (naziv menja svaki
 * član, broj stranica i zadataka, „Nova stranica") i kartice Pregled · Zadaci ·
 * Dokumenti · Mapa. Kartica iz URL-a ima prednost, pa zapamćena po oblasti, pa
 * Pregled. Svaka kartica ima svoju granicu greške.
 */
export function AreaView({
  startup,
  profile,
  areaId,
  tab: routeTab,
  today,
  startups,
  onTabChange,
  onOpenPage,
  onOpenFull,
  onCreate,
  onSaveStateChange,
}: AreaViewProps) {
  const area = startup.areas.find((item) => item._id === areaId) ?? null;
  const liveNow = useLiveNow(today.now);
  // Zapamćena kartica se čita pri svakom prikazu: link iz menija bez `tab` vraća
  // poslednju prikazanu karticu i kad oblast ostane montirana.
  const tab = resolveAreaTab(routeTab, readRememberedAreaTab(tabStorage(), areaId));
  useEffect(() => {
    rememberAreaTab(tabStorage(), areaId, tab);
  }, [areaId, tab]);
  const [mapFilter, setMapFilter] = useState<AreaCanvasViewProps["filter"]>("all");
  // „Pregled" zadatka na Mapi otvara panel zadatka (LICNO, K07 §7).
  const [mapTask, setMapTask] = useState<TaskPanelRequest | null>(null);

  const updateArea = useMutation(api.startups.updateArea);
  const membersResult = useQueryTolerant(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const topCounts = useQueryTolerant(api.pages.areaTopLevelCounts, { startupId: startup._id });
  // Broj zadataka: prva strana bez filtera („50+" kad ima još). Tolerantno — zaglavlje ne pada.
  const firstTasks = useQueryTolerant(api.tasks.listForArea, {
    startupId: startup._id,
    areaId,
    paginationOpts: { numItems: AREA_TASKS_PAGE, cursor: null },
  });

  const members = useMemo(() => membersResult ?? [], [membersResult]);
  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map(({ profile: member }) => ({
        profileId: member._id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
      })),
    [members],
  );
  const memberName = useCallback(
    (id: string | null) => members.find(({ profile: member }) => member._id === id)?.profile.displayName ?? null,
    [members],
  );

  if (!area) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <EmptyState icon={Blocks} headingAs="h2" title="Oblast nije pronađena." description="Izaberi drugu oblast u meniju." />
      </div>
    );
  }

  const pageCount = topCounts?.find((entry) => entry.areaId === areaId) ?? null;
  const taskCount =
    firstTasks === undefined
      ? null
      : areaTaskCount({ status: firstTasks.isDone ? "Exhausted" : "CanLoadMore", loaded: firstTasks.page.length });
  const isManager = startup.createdByProfileId === profile._id || profile.role === "admin";

  function changeTab(next: AreaTab) {
    // Pamti se tek prikazana kartica (efekat iznad): ljuska može da zadrži
    // Pregled dok se opis ne sačuva.
    onTabChange(next);
  }

  function create(kind?: PageKind) {
    onCreate({ areaId, parentPageId: null, ...(kind ? { initialKind: kind } : {}) });
  }

  async function rename(label: string): Promise<boolean> {
    try {
      await updateArea({ areaId, label });
      toast.success("Naziv oblasti je sačuvan.");
      return true;
    } catch (error) {
      toast.error(accessErrorMessage(error, "Naziv oblasti nije sačuvan."));
      return false;
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <Tabs value={tab} onValueChange={(value) => isAreaTab(value) && changeTab(value)}>
        <AreaHeader
          label={area.label}
          meta={areaHeaderMeta(pageCount, taskCount)}
          tabCounts={{ zadaci: countText(taskCount), dokumenti: countText(pageCount) }}
          tabCountLabels={{
            zadaci: taskCount ? `${countText(taskCount)} ${tasksWord(taskCount.count)}` : null,
            dokumenti: pageCount ? `${countText(pageCount)} ${pagesWord(pageCount.count)} na vrhu` : null,
          }}
          onRename={rename}
          onCreate={create}
        />
        <TabsContent value="pregled" className="mt-0">
          <WorkspaceErrorBoundary title="Pregled oblasti nije učitan." className="min-h-[16rem]">
            <AreaOverviewContainer
              startupId={startup._id}
              areaId={areaId}
              profileId={profile._id}
              members={mentionMembers}
              memberName={memberName}
              now={liveNow}
              onOpenPage={onOpenPage}
              onSaveStateChange={onSaveStateChange}
            />
          </WorkspaceErrorBoundary>
        </TabsContent>
        <TabsContent value="zadaci" className="mt-0">
          <WorkspaceErrorBoundary title="Zadaci oblasti nisu učitani." className="min-h-[16rem]">
            <AreaTasksContainer
              startup={startup}
              profile={profile}
              areaId={areaId}
              today={today}
              startups={startups}
              onOpenPage={onOpenPage}
              onOpenFull={onOpenFull}
              onCreateTask={() => create("task")}
            />
          </WorkspaceErrorBoundary>
        </TabsContent>
        <TabsContent value="dokumenti" className="mt-0">
          <WorkspaceErrorBoundary title="Dokumenti oblasti nisu učitani." className="min-h-[16rem]">
            <AreaDocumentsContainer
              startup={startup}
              profileId={profile._id}
              canManage={isManager}
              areaId={areaId}
              memberName={memberName}
              now={liveNow}
              onOpenPage={onOpenPage}
              onCreate={create}
            />
          </WorkspaceErrorBoundary>
        </TabsContent>
        <TabsContent value="mapa" className="mt-0">
          <WorkspaceErrorBoundary title="Mapa oblasti nije učitana." className="min-h-[16rem]">
            <AreaCanvasView
              startupId={startup._id}
              areaId={areaId}
              rootPageId={null}
              canvasLabel={area.label}
              areaKey={area.key}
              areas={startup.areas}
              filter={mapFilter}
              onFilterChange={setMapFilter}
              onOpenCanvas={onOpenPage}
              onOpenDetails={onOpenPage}
              onCreatePage={create}
              onOpenTask={(pageId, title) =>
                setMapTask({
                  target: { kind: "task", pageId },
                  title,
                  origin: null,
                  openedAt: performance.now(),
                })
              }
            />
          </WorkspaceErrorBoundary>
          <TaskPanel
            request={mapTask}
            onClose={() => setMapTask(null)}
            today={today}
            profileId={profile._id}
            startups={startups}
            onOpenInStartup={(_taskStartupId, pageId) => onOpenPage(pageId)}
            onOpenFull={onOpenFull}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
