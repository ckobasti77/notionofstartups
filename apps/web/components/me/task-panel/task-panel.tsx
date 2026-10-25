"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { taskPermissions, type TaskPriorityKey } from "@devotion/shared";

import { Drawer } from "@/components/motion/drawer";
import { TaskCheckpointList } from "@/components/workspace/task-checkpoint-list";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import type { Today } from "@/lib/today";

import { useQueryState } from "../my-day/use-query-state";
import { PersonalTaskPanelHeader, PersonalTaskPanelView, type MoveTargetStartup } from "./personal-task-panel-view";
import { StartupTaskPanelHeader, StartupTaskPanelView, type StartupTaskStatus } from "./startup-task-panel-view";
import { isGoneError, TaskPanelError, TaskPanelGone, TaskPanelHeaderSkeleton, TaskPanelSkeleton } from "./task-panel-states";
import { useTitleFlight } from "./use-title-flight";

export type TaskPanelTarget =
  | { kind: "task"; pageId: Id<"pages"> }
  | { kind: "personal"; personalTaskId: Id<"personalTasks"> };

/** Otvaranje panela: cilj, naslov (ime dijaloga dok se podaci ne učitaju) i naslov reda za let. */
export type TaskPanelRequest = {
  target: TaskPanelTarget;
  title: string;
  origin: HTMLElement | null;
  /** `performance.now()` pri kliku (rukovalac) — let naslova samo dok panel ulazi. */
  openedAt: number;
};

export type TaskPanelProps = {
  request: TaskPanelRequest | null;
  onClose: () => void;
  today: Today;
  profileId: Id<"profiles">;
  /** Startupi sa oblastima (ljuska, `startups.listForCurrent`): mini podaci i „Prebaci u startup". */
  startups: ReadonlyArray<MoveTargetStartup & { _id: Id<"startups">; areas: ReadonlyArray<{ _id: Id<"startupAreas">; label: string }> }>;
  onOpenInStartup: (startupId: Id<"startups">, pageId: Id<"pages">) => void;
};

/** „Poništi" traje 8 s (plan K07 E6). */
const UNDO_MS = 8_000;

export function panelRequestKey(request: TaskPanelRequest | null) {
  if (!request) return null;
  return request.target.kind === "task" ? `task:${request.target.pageId}` : `personal:${request.target.personalTaskId}`;
}

/**
 * Panel zadatka (plan K07 §1.4, trenutak 3) — kontejner. Desni `Drawer`
 * (28rem, na uskom ekranu ceo ekran) za startup zadatak ili lični zadatak;
 * Moj dan i Moji zadaci otvaraju ISTI panel. Tokom izlaza prikazuje poslednji
 * cilj (Drawer izlazi istim putem).
 */
export function TaskPanel({ request, onClose, today, profileId, startups, onOpenInStartup }: TaskPanelProps) {
  const [shown, setShown] = useState(request);
  // „Pokušaj ponovo" ponovo montira sadržaj (nova pretplata).
  const [attempt, setAttempt] = useState(0);
  if (request && request !== shown) setShown(request);
  const requestRef = useRef(request);
  useLayoutEffect(() => {
    requestRef.current = request;
  });
  // Posle izlaza panel se demontira (pretplate se puštaju do sledećeg otvaranja).
  const onExited = () => {
    if (!requestRef.current) setShown(null);
  };
  const startedAt = shown?.openedAt ?? null;
  const open = request !== null;
  // „Otvori" iz toasta može stići kasnije: uvek najnoviji rukovalac.
  const openInStartupRef = useRef(onOpenInStartup);
  useLayoutEffect(() => {
    openInStartupRef.current = onOpenInStartup;
  });

  if (!shown) return null;
  const common = {
    open,
    onClose,
    today,
    profileId,
    startups,
    origin: shown.origin,
    fallbackTitle: shown.title,
    flightKey: open ? `${panelRequestKey(shown)}:${startedAt ?? 0}` : null,
    startedAt,
    openInStartup: (startupId: Id<"startups">, pageId: Id<"pages">) => openInStartupRef.current(startupId, pageId),
    retry: () => setAttempt((value) => value + 1),
    onExited,
  };
  return shown.target.kind === "task" ? (
    <StartupTaskPanel key={`${shown.target.pageId}:${attempt}`} pageId={shown.target.pageId} {...common} />
  ) : (
    <PersonalTaskPanel key={`${shown.target.personalTaskId}:${attempt}`} personalTaskId={shown.target.personalTaskId} {...common} />
  );
}

type PanelCommon = {
  open: boolean;
  onClose: () => void;
  today: Today;
  profileId: Id<"profiles">;
  startups: TaskPanelProps["startups"];
  origin: HTMLElement | null;
  fallbackTitle: string;
  flightKey: string | null;
  startedAt: number | null;
  openInStartup: (startupId: Id<"startups">, pageId: Id<"pages">) => void;
  retry: () => void;
  onExited: () => void;
};

/** Ako je panel otvoren iz menija (stavka nestaje), fokus se vraća na naslov reda. */
function rowFocusOf(origin: HTMLElement | null) {
  return () => origin?.closest("[data-row-key]")?.querySelector<HTMLElement>("[data-row-focus]") ?? null;
}

type PlanRef = { kind: "task"; taskPageId: Id<"pages"> } | { kind: "personal"; personalTaskId: Id<"personalTasks"> };

/** Stavka plana za danas (iz deljene pretplate `myDay.overview`). */
function usePlanEntry(today: Today, refKey: string) {
  const overview = useQueryState(api.myDay.overview, { dayKey: today.dayKey, doneSince: today.doneSince });
  if (overview.status !== "ready") return null;
  return overview.data.entries.find((entry) => entry.refKey === refKey)?._id ?? null;
}

function usePlanToggle(today: Today, entryId: Id<"myDayEntries"> | null, ref: PlanRef) {
  const plan = useMutation(api.myDay.plan);
  const unplan = useMutation(api.myDay.unplan);
  return () => {
    if (entryId !== null) {
      void unplan({ entryId })
        .then((removed) =>
          toast("Uklonjeno iz Moj dan.", {
            duration: UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => {
                void plan({ dayKey: removed.dayKey, ref: removed.ref, position: removed.position }).catch((error: unknown) =>
                  toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
                );
              },
            },
          }),
        )
        .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
      return;
    }
    void plan({ dayKey: today.dayKey, ref })
      .then(() => toast.success("Dodato u Moj dan."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
  };
}

function StartupTaskPanel({
  pageId,
  open,
  onClose,
  today,
  profileId,
  startups,
  origin,
  fallbackTitle,
  flightKey,
  startedAt,
  openInStartup,
  retry,
  onExited,
}: PanelCommon & { pageId: Id<"pages"> }) {
  const page = useQueryState(api.pages.get, { pageId });
  const assignees = useQueryState(api.taskAssignees.listForTask, { taskPageId: pageId });
  const data = page.status === "ready" ? page.data : null;
  const isCreator = data?.createdByProfileId === profileId;
  const members = useQueryState(
    api.startups.listMembers,
    data && isCreator ? { startupId: data.startupId, limit: 50 } : "skip",
  );
  const entryId = usePlanEntry(today, `task:${pageId}`);
  const togglePlan = usePlanToggle(today, entryId, { kind: "task", taskPageId: pageId });

  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const renamePage = useMutation(api.pages.update);
  const join = useMutation(api.taskAssignees.join);
  const leave = useMutation(api.taskAssignees.leave);

  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  useTitleFlight({ origin, target: titleEl, flightKey, startedAt });

  // Startup van liste ljuske (npr. iza prvih 50) i dalje otvara panel, uz opšte ime.
  const startup = data
    ? (startups.find((item) => item._id === data.startupId) ?? { _id: data.startupId, name: "Startup", logoUrl: null, areas: [] })
    : undefined;
  const area = data && startup ? startup.areas.find((item) => item._id === data.areaId) : undefined;
  // Dozvole zavise od izvršilaca: dok se ne učitaju, panel je u učitavanju
  // (inače bi izvršilac na trenutak video zaključan status i „Priključi se").
  const assigneeList = assignees.status === "ready" ? assignees.data : [];
  const isAssignee = assigneeList.some((person) => person.profileId === profileId);
  const permissions = taskPermissions({ kind: "task", isCreator, isAssignee });

  const fail = (fallback: string) => (error: unknown) => toast.error(accessErrorMessage(error, fallback));

  const change = (patch: {
    status?: StartupTaskStatus;
    priority?: TaskPriorityKey;
    dueDate?: number | null;
    assigneeProfileIds?: string[];
    instructions?: string | null;
  }) => {
    if (!data) return;
    const previousStatus = (data.taskStatus ?? "backlog") as StartupTaskStatus;
    void updateMetadata({
      pageId,
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.priority === undefined ? {} : { priority: patch.priority }),
      ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
      ...(patch.assigneeProfileIds === undefined
        ? {}
        : { assigneeProfileIds: patch.assigneeProfileIds as Id<"profiles">[] }),
      ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
    })
      .then(() => {
        if (patch.dueDate !== undefined) toast.success("Rok je promenjen.");
        if (patch.status === "done" && previousStatus !== "done") {
          toast(`Završeno: ${data.title}`, {
            duration: UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => {
                void updateMetadata({ pageId, status: previousStatus }).catch(fail("Zadatak nije vraćen. Pokušaj ponovo."));
              },
            },
          });
        }
      })
      .catch(
        fail(
          patch.dueDate !== undefined
            ? "Rok nije sačuvan."
            : patch.instructions !== undefined
              ? "Instrukcije nisu sačuvane."
              : "Izmena nije sačuvana.",
        ),
      );
  };

  const title = data?.title ?? fallbackTitle;
  let body;
  let header;
  if (page.status === "error" || assignees.status === "error") {
    header = null;
    const error = page.status === "error" ? page.error : assignees.status === "error" ? assignees.error : null;
    body = error && isGoneError(error) ? <TaskPanelGone onClose={onClose} /> : <TaskPanelError retry={retry} onClose={onClose} />;
  } else if (!data || !startup || assignees.status !== "ready") {
    header = <TaskPanelHeaderSkeleton />;
    body = <TaskPanelSkeleton />;
  } else {
    const task = {
      title: data.title,
      status: (data.taskStatus ?? "backlog") as StartupTaskStatus,
      priority: data.taskPriority ?? null,
      dueDate: data.dueDate ?? null,
      instructions: data.instructions ?? null,
      startup: { _id: startup._id, name: startup.name, logoUrl: startup.logoUrl },
      areaLabel: area?.label ?? null,
    };
    header = (
      <StartupTaskPanelHeader
        task={task}
        canEditTitle={data.permissions.canEdit}
        titleRef={setTitleEl}
        onRename={(next) => {
          void renamePage({ pageId, title: next, expectedRevision: data.revision }).catch(fail("Naslov nije sačuvan."));
        }}
      />
    );
    body = (
      <StartupTaskPanelView
        now={today.now}
        task={task}
        assignees={assigneeList.map((person) => ({
          _id: person.profileId,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl,
        }))}
        members={
          members.status === "ready"
            ? members.data.map(({ profile }) => ({ _id: profile._id, displayName: profile.displayName, avatarUrl: profile.avatarUrl }))
            : members.status === "error"
              ? "error"
              : undefined
        }
        permissions={permissions}
        isSelfAssigned={isAssignee}
        planned={entryId !== null}
        onChange={change}
        onJoin={() => void join({ taskPageId: pageId }).catch(fail("Priključivanje nije uspelo."))}
        onLeave={() => void leave({ taskPageId: pageId }).catch(fail("Napuštanje zadatka nije uspelo."))}
        onTogglePlan={togglePlan}
        onOpenInStartup={() => {
          onClose();
          openInStartup(data.startupId, pageId);
        }}
        onDenied={(reason) => toast.error(reason)}
        checkpoints={<TaskCheckpointList taskPageId={pageId} canCreate={permissions.checkpoints.allowed} compact />}
      />
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={title}
      header={header}
      width="28rem"
      initialFocus="panel"
      closeLabel="Zatvori panel"
      returnFocusFallback={rowFocusOf(origin)}
      onExited={onExited}
    >
      {body}
    </Drawer>
  );
}

function PersonalTaskPanel({
  personalTaskId,
  open,
  onClose,
  today,
  startups,
  origin,
  fallbackTitle,
  flightKey,
  startedAt,
  openInStartup,
  retry,
  onExited,
}: PanelCommon & { personalTaskId: Id<"personalTasks"> }) {
  const taskState = useQueryState(api.personalTasks.get, { personalTaskId });
  const entryId = usePlanEntry(today, `personal:${personalTaskId}`);
  const togglePlan = usePlanToggle(today, entryId, { kind: "personal", personalTaskId });
  const update = useMutation(api.personalTasks.update);
  const setStatus = useMutation(api.personalTasks.setStatus);
  const archive = useMutation(api.personalTasks.archive);
  const restore = useMutation(api.personalTasks.restore);
  const moveToStartup = useMutation(api.personalTasks.moveToStartup);
  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  useTitleFlight({ origin, target: titleEl, flightKey, startedAt });

  const fail = (fallback: string) => (error: unknown) => toast.error(accessErrorMessage(error, fallback));
  const task = taskState.status === "ready" ? taskState.data : undefined;

  let header = null;
  let body;
  if (taskState.status === "error") {
    body = isGoneError(taskState.error) ? <TaskPanelGone onClose={onClose} /> : <TaskPanelError retry={retry} onClose={onClose} />;
  } else if (taskState.status === "loading") {
    header = <TaskPanelHeaderSkeleton />;
    body = <TaskPanelSkeleton />;
  } else if (!task) {
    body = <TaskPanelGone onClose={onClose} />;
  } else {
    const view = {
      title: task.title,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
    };
    const change = (patch: { title?: string; notes?: string | null; priority?: TaskPriorityKey | null; dueDate?: number | null }) => {
      void update({ personalTaskId, ...patch })
        .then(() => {
          if (patch.dueDate !== undefined) toast.success("Rok je promenjen.");
        })
        .catch(fail(patch.dueDate !== undefined ? "Rok nije sačuvan." : "Izmena nije sačuvana."));
    };
    const toggleDone = (done: boolean) => {
      void setStatus({ personalTaskId, status: done ? "done" : "open" })
        .then(() => {
          if (!done) return;
          toast(`Završeno: ${task.title}`, {
            duration: UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => void setStatus({ personalTaskId, status: "open" }).catch(fail("Zadatak nije vraćen. Pokušaj ponovo.")),
            },
          });
        })
        .catch(fail(done ? "Zadatak nije završen. Pokušaj ponovo." : "Zadatak nije vraćen. Pokušaj ponovo."));
    };
    header = <PersonalTaskPanelHeader task={view} onChange={change} onToggleDone={toggleDone} titleRef={setTitleEl} />;
    body = (
      <PersonalTaskPanelView
        now={today.now}
        task={view}
        planned={entryId !== null}
        startups={startups}
        onChange={change}
        onToggleDone={toggleDone}
        onTogglePlan={togglePlan}
        onArchive={() => {
          onClose();
          void archive({ personalTaskId })
            .then(() =>
              toast("Zadatak je obrisan.", {
                duration: UNDO_MS,
                action: {
                  label: "Poništi",
                  onClick: () => void restore({ personalTaskId }).catch(fail("Vraćanje nije uspelo.")),
                },
              }),
            )
            .catch(fail("Brisanje nije uspelo."));
        }}
        onMove={async (startupId, areaId) => {
          const target = startups.find((item) => item._id === startupId);
          try {
            const { pageId } = await moveToStartup({
              personalTaskId,
              startupId: startupId as Id<"startups">,
              areaId: areaId as Id<"startupAreas">,
            });
            onClose();
            toast.success(`Prebačeno u ${target?.name ?? "startup"}.`, {
              duration: UNDO_MS,
              action: { label: "Otvori", onClick: () => openInStartup(startupId as Id<"startups">, pageId) },
            });
          } catch (error) {
            throw new Error(accessErrorMessage(error, "Zadatak nije prebačen. Pokušaj ponovo."));
          }
        }}
      />
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={task?.title ?? fallbackTitle}
      header={header}
      width="28rem"
      initialFocus="panel"
      closeLabel="Zatvori panel"
      returnFocusFallback={rowFocusOf(origin)}
      onExited={onExited}
    >
      {body}
    </Drawer>
  );
}
