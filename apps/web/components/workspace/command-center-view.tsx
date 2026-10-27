"use client";

import { useCallback, useMemo, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from "react";
import { Plus } from "lucide-react";
import {
  COMMAND_BLOCK_TEXT,
  findStartupRow,
  locateStartupRow,
  type ActivityTarget,
  type StartupMini,
  type StartupTaskSection,
} from "@devotion/shared";

import type { TaskPanelProps } from "@/components/me/task-panel/task-panel";
import { Button } from "@/components/ui/button";
import { BlockBoundary } from "@/components/workspace/command-center/block";
import { ForYouBlock } from "@/components/workspace/command-center/for-you-block";
import { RecentBlock } from "@/components/workspace/command-center/recent-block";
import { PulseBlock } from "@/components/workspace/command-center/pulse-block";
import { CommandRowsProvider, type CommandRowsValue } from "@/components/workspace/command-center/rows-context";
import { TeamBlock } from "@/components/workspace/command-center/team-block";
import { TriageBlock } from "@/components/workspace/command-center/triage-block";
import { WaitingBlock } from "@/components/workspace/command-center/waiting-block";
import { COMMAND_CENTER_LIST, type WorkloadFilter } from "@/components/workspace/startup-tasks/command-center-model";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/workspace/startup-tasks/constants";
import { useStartupTaskCommands } from "@/components/workspace/startup-tasks/use-startup-task-commands";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import { ScreenHeader } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { useFlip } from "@/lib/motion";
import type { Today } from "@/lib/today";

/** Kuda vode „Svi moji zadaci", „Sva aktivnost", „Otvori Puls" i klik na ideju ili izmenu. */
export type CommandCenterNav = {
  openMyTasks: () => void;
  openIdeas: () => void;
  openIdea: (ideaId: Id<"ideaNodes">) => void;
  openActivity: () => void;
  openPuls: () => void;
  openArea: (areaId: Id<"startupAreas">) => void;
};

/**
 * Okvir Komandnog centra — prezentacija (izlog `komandni-centar`): zaglavlje
 * ekrana i dve kolone blokova. Glavna kolona (Za tebe, Trijaža) i bočna od 20rem
 * (Čeka tebe, Nedavne izmene, Puls, Tim); ispod `lg` jedna kolona istim redom.
 */
export function CommandCenterFrame({
  onCreateTask,
  listRef,
  onListFocus,
  announcement,
  main,
  side,
}: {
  onCreateTask: () => void;
  listRef: RefObject<HTMLDivElement | null>;
  onListFocus: (event: FocusEvent<HTMLElement>) => void;
  announcement: string;
  main: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <ScreenHeader
        title="Komandni centar"
        actions={
          <Button onClick={onCreateTask}>
            <Plus /> Novi zadatak
          </Button>
        }
      />
      <div ref={listRef} onFocus={onListFocus} className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">{main}</div>
        <div className="min-w-0 space-y-6">{side}</div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/**
 * Komandni centar startupa — kontejner (PROSTOR K19, P8): Za tebe, Trijaža tima
 * („Zastarelo", „Sredi rokove"), Čeka tebe, Nedavne izmene, Puls nedelje i Tim.
 * Svaki blok ima sopstvene upite, stanja (učitavanje, prazno, greška) i granicu,
 * pa jedan pad ne obara ostale. Redovi zadataka dele jedan skup radnji
 * (`useStartupTaskCommands`: završi sa „Poništi", rok, prioritet, status, panel,
 * prečice).
 */
export function CommandCenterView({
  startup,
  profile,
  today,
  startups,
  onOpenPage,
  onOpenFull,
  onCreateTask,
  nav,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  today: Today;
  /** Startupi sa oblastima (ljuska) — panel zadatka. */
  startups: TaskPanelProps["startups"];
  /** Otvara stranicu (klik na izmenu, „Otvori" iz toasta). */
  onOpenPage: (pageId: Id<"pages">) => void;
  /** „Puni prikaz" iz panela. */
  onOpenFull: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
  nav: CommandCenterNav;
}) {
  // Sat iz `useToday`: zone se preklasifikuju u ponoć i kad se kartica vrati u fokus.
  const now = today.now;
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);
  // Trijaža i Tim dele iste pretplate: „Pokušaj ponovo" ponovo montira oba (jedan bi ostavio grešku živom kroz drugi).
  const [triageAttempt, setTriageAttempt] = useState(0);
  const retryTriage = useCallback(() => setTriageAttempt((value) => value + 1), []);

  const listRef = useRef<HTMLDivElement>(null);
  // Redovi koje blokovi trenutno crtaju (prijavljuju se kroz `register`).
  const registry = useRef(new Map<string, StartupTaskSection[]>());
  const allSections = useCallback(() => [...registry.current.values()].flat(), []);
  const register = useCallback((blockId: string, sections: StartupTaskSection[]) => {
    if (sections.length === 0) registry.current.delete(blockId);
    else registry.current.set(blockId, sections);
  }, []);

  const { capture } = useFlip(listRef);
  const flipCapture = useCallback(() => {
    const rows = allSections().reduce((sum, section) => sum + section.rows.length, 0);
    if (rows <= STARTUP_FLIP_MAX_ROWS) capture();
  }, [allSections, capture]);

  const commands = useStartupTaskCommands({
    today,
    profileId: profile._id,
    startups,
    listRef,
    locate: (key) => locateStartupRow(COMMAND_CENTER_LIST, allSections(), key),
    getRow: (key) => findStartupRow(allSections(), key),
    flipCapture,
    onOpenInStartup: (_startupId, pageId) => onOpenPage(pageId),
    onOpenFull,
  });

  const startupMini = useMemo<StartupMini>(
    () => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl }),
    [startup._id, startup.name, startup.logoUrl],
  );
  const areaLabels = useMemo(
    () => new Map(startup.areas.map((area) => [area._id as string, area.label] as const)),
    [startup.areas],
  );
  const rows: CommandRowsValue = {
    now,
    profileId: profile._id,
    isManager: startup.createdByProfileId === profile._id || profile.role === "admin",
    startup: startupMini,
    areaLabels,
    commands: {
      actions: commands.actions,
      plannedKeys: commands.plannedKeys,
      holds: commands.holds,
      pending: commands.pending,
      selectedKey: commands.selectedKey,
      activeKey: commands.activeKey,
      request: commands.request,
    },
    register,
  };

  const openTarget = (target: ActivityTarget) => {
    if (target.kind === "page") onOpenPage(target.pageId as Id<"pages">);
    else if (target.kind === "idea") nav.openIdea(target.ideaId as Id<"ideaNodes">);
    else if (target.kind === "area") nav.openArea(target.areaId as Id<"startupAreas">);
  };

  return (
    <CommandRowsProvider value={rows}>
      <CommandCenterFrame
        onCreateTask={onCreateTask}
        listRef={listRef}
        onListFocus={commands.onListFocus}
        announcement={commands.announcement}
        main={
          <>
            <BlockBoundary id="cc-za-tebe" title="Za tebe" errorText={COMMAND_BLOCK_TEXT.forYouError}>
              <ForYouBlock startupId={startup._id} onOpenAll={nav.openMyTasks} />
            </BlockBoundary>
            <BlockBoundary
              key={`trijaza-${triageAttempt}`}
              id="cc-trijaza"
              title="Trijaža"
              errorText={COMMAND_BLOCK_TEXT.triageError}
              onRetry={retryTriage}
            >
              <TriageBlock
                startupId={startup._id}
                memberFilter={memberFilter}
                onMemberFilter={setMemberFilter}
                flipCapture={flipCapture}
              />
            </BlockBoundary>
          </>
        }
        side={
          <>
            <BlockBoundary id="cc-ceka-tebe" title="Čeka tebe" errorText={COMMAND_BLOCK_TEXT.waitingError}>
              <WaitingBlock startupId={startup._id} onOpenIdea={nav.openIdea} onOpenAll={nav.openIdeas} />
            </BlockBoundary>
            <BlockBoundary id="cc-nedavne-izmene" title="Nedavne izmene" errorText={COMMAND_BLOCK_TEXT.recentError}>
              <RecentBlock startupId={startup._id} now={now} onOpen={openTarget} onOpenAll={nav.openActivity} />
            </BlockBoundary>
            <BlockBoundary id="cc-puls" title="Puls nedelje" errorText={COMMAND_BLOCK_TEXT.pulseError}>
              <PulseBlock startupId={startup._id} now={now} onOpen={nav.openPuls} />
            </BlockBoundary>
            <BlockBoundary
              key={`tim-${triageAttempt}`}
              id="cc-tim"
              title="Tim"
              errorText={COMMAND_BLOCK_TEXT.teamError}
              onRetry={retryTriage}
            >
              <TeamBlock startupId={startup._id} now={now} activeKey={memberFilter} onSelect={setMemberFilter} />
            </BlockBoundary>
          </>
        }
      />
      {commands.panel}
    </CommandRowsProvider>
  );
}
