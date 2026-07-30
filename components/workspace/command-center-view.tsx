"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  CircleDashed,
  Flame,
  HandHelping,
  Plus,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AssigneePickerCompact,
} from "@/components/workspace/assignee-picker";
import { AssigneeStack } from "@/components/workspace/assignee-stack";
import { DeadlineBadge } from "@/components/workspace/deadline-badge";
import { PulseBar, type PulseSegment } from "@/components/workspace/pulse-bar";
import {
  WorkloadStrip,
  type WorkloadEntry,
  type WorkloadFilter,
} from "@/components/workspace/workload-strip";
import type {
  ProfileWithAvatar,
  StartupMember,
  StartupWithAreas,
} from "@/components/workspace/types";
import {
  EmptyState,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  bucketTasksByZone,
  classifyDeadline,
  nextLocalMidnight,
  TRIAGE_ZONE_ORDER,
  type TriageZone,
} from "@/lib/deadline";
import { cn } from "@/lib/utils";
import {
  fromDateInputValue,
  tasksWord,
  toDateInputValue,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/workspace";

const UNASSIGNED_KEY = "unassigned";

type TaskAssigneeSummary = {
  profileId: Id<"profiles">;
  displayName: string;
  avatarUrl: string | null;
};

const STATUS_OPTIONS: Array<TaskStatus> = [
  "backlog",
  "next",
  "in_progress",
  "blocked",
  "done",
];

type CommandCenterTask = {
  _id: Id<"pages">;
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  title: string;
  taskStatus: TaskStatus | null;
  taskPriority: TaskPriority | null;
  assigneeProfileId: Id<"profiles"> | null;
  dueDate: number | null;
  taskSortAt: number;
  createdByProfileId: Id<"profiles">;
};

const ZONE_META: Record<
  TriageZone,
  {
    label: string;
    hint: string;
    icon: typeof Flame;
    frameClass: string;
    accentClass: string;
    countClass: string;
    emptyLabel: string;
  }
> = {
  gori: {
    label: "Gori",
    hint: "Rok je prošao, hitno je ili je blokirano",
    icon: Flame,
    frameClass: "border-l-4 border-l-destructive bg-destructive/[0.04]",
    accentClass: "text-destructive",
    countClass: "bg-destructive/12 text-destructive",
    emptyLabel: "Ništa ne gori. Tim diše.",
  },
  danas: {
    label: "Danas",
    hint: "Rok je danas",
    icon: CalendarClock,
    frameClass: "border-l-4 border-l-warning bg-warning/[0.06]",
    accentClass: "text-warning-foreground dark:text-warning",
    countClass: "bg-warning/18 text-warning-foreground dark:text-warning",
    emptyLabel: "Danas nema rokova.",
  },
  nedelja: {
    label: "Ova nedelja",
    hint: "Rok u narednih sedam dana",
    icon: CalendarDays,
    frameClass: "border-l-4 border-l-info bg-info/[0.05]",
    accentClass: "text-info",
    countClass: "bg-info/12 text-info",
    emptyLabel: "Slobodna nedelja ispred.",
  },
  kasnije: {
    label: "Kasnije i bez roka",
    hint: "Nema roka ili je dalji od nedelje",
    icon: CircleDashed,
    frameClass: "border-l-4 border-l-border bg-muted/20",
    accentClass: "text-muted-foreground",
    countClass: "bg-muted text-muted-foreground",
    emptyLabel: "Sve ima rok.",
  },
};

const ZONE_TONE = {
  gori: "danger",
  danas: "warn",
  nedelja: "info",
  kasnije: "muted",
} as const;

export function CommandCenterView({
  startup,
  profile,
  onOpenPage,
  onCreateTask,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
}) {
  const overview = useQuery(api.tasks.commandCenter, { startupId: startup._id });
  const members = useQuery(api.startups.listMembers, {
    startupId: startup._id,
    limit: 50,
  });
  const [now, setNow] = useState(() => Date.now());
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Zone se preklasifikuju na prelasku dana, bez osvežavanja stranice.
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(nextLocalMidnight(now) - now, 1_000),
    );
    return () => window.clearTimeout(timeout);
  }, [now]);

  const tasks = useMemo<Array<CommandCenterTask>>(
    () => (overview?.tasks ?? []) as Array<CommandCenterTask>,
    [overview],
  );

  // Jedna subskripcija za spiskove izvršilaca svih otvorenih zadataka.
  const assigneeRows = useQuery(api.taskAssignees.listForTasks, {
    startupId: startup._id,
    taskPageIds: tasks.map((task) => task._id),
  });
  const assigneesByTaskId = useMemo(
    () =>
      new Map(
        (assigneeRows ?? []).map((row) => [row.taskPageId, row.assignees]),
      ),
    [assigneeRows],
  );

  const areaLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const area of startup.areas) map.set(area._id, area.label);
    return map;
  }, [startup.areas]);

  const workload = useMemo<Array<WorkloadEntry>>(() => {
    const entries: Array<WorkloadEntry> = (members ?? []).map((member) => ({
      key: member.profile._id,
      name: member.profile.displayName,
      avatar: member.profile,
      open: 0,
      overdue: 0,
      urgent: 0,
    }));
    const unassigned: WorkloadEntry = {
      key: UNASSIGNED_KEY,
      name: "Nedodeljeno",
      avatar: null,
      open: 0,
      overdue: 0,
      urgent: 0,
    };
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));

    for (const task of tasks) {
      // Svi izvršioci su ravnopravni, pa zadatak ulazi u opterećenje svakog od
      // njih; zbir po članovima je zato veći od broja zadataka.
      const taskAssignees = assigneesByTaskId.get(task._id) ?? [];
      const taskEntries =
        taskAssignees.length === 0
          ? [unassigned]
          : taskAssignees.flatMap((assignee) => {
              const entry = byKey.get(assignee.profileId);
              return entry === undefined ? [] : [entry];
            });
      const overdue =
        classifyDeadline({
          dueDate: task.dueDate,
          taskStatus: task.taskStatus,
          now,
        }).urgency === "overdue";
      for (const entry of taskEntries) {
        entry.open += 1;
        if (overdue) entry.overdue += 1;
        if (task.taskPriority === "urgent") entry.urgent += 1;
      }
    }

    return unassigned.open > 0 ? [...entries, unassigned] : entries;
  }, [assigneesByTaskId, members, now, tasks]);

  const visibleTasks = useMemo(() => {
    if (memberFilter === null) return tasks;
    if (memberFilter === UNASSIGNED_KEY) {
      return tasks.filter(
        (task) => (assigneesByTaskId.get(task._id) ?? []).length === 0,
      );
    }
    return tasks.filter((task) =>
      (assigneesByTaskId.get(task._id) ?? []).some(
        (assignee) => assignee.profileId === memberFilter,
      ),
    );
  }, [assigneesByTaskId, memberFilter, tasks]);

  const buckets = useMemo(
    () => bucketTasksByZone(visibleTasks, now),
    [now, visibleTasks],
  );

  const pulseSegments = useMemo<Array<PulseSegment>>(
    () =>
      TRIAGE_ZONE_ORDER.map((zone) => ({
        key: zone,
        label: ZONE_META[zone].label,
        count: buckets[zone].length,
        tone: ZONE_TONE[zone],
        onSelect: () => {
          document
            .getElementById(`zona-${zone}`)
            ?.scrollIntoView({
              behavior: prefersReducedMotion ? "auto" : "smooth",
              block: "start",
            });
          if (zone === "kasnije") setLaterOpen(true);
        },
      })),
    [buckets, prefersReducedMotion],
  );

  const loading = overview === undefined || members === undefined;
  const totalOpen = tasks.length;
  const filteredTotal = visibleTasks.length;

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header data-workspace-enter className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">
              {startup.name}
            </p>
            <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
              Komandni centar
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Trijaža za danas: šta gori, šta je na redu i ko je preopterećen.
            </p>
          </div>
          <Button onClick={onCreateTask}>
            <Plus /> Novi zadatak
          </Button>
        </div>

        <div className="mt-5">
          {loading ? (
            <Skeleton className="h-2.5 w-full rounded-sm" />
          ) : (
            <PulseBar
              segments={pulseSegments}
              label={`Sastav dana: ${filteredTotal} ${tasksWord(filteredTotal)}`}
            />
          )}
        </div>
      </header>

      {loading ? (
        <CommandCenterSkeleton />
      ) : (
        <>
          <section data-workspace-enter className="mb-6">
            <WorkloadStrip
              entries={workload}
              totalOpen={totalOpen}
              activeKey={memberFilter}
              onSelect={setMemberFilter}
            />
          </section>

          {totalOpen === 0 ? (
            <EmptyState
              icon={CheckSquare2}
              title="Nema otvorenih zadataka"
              description={`U startupu ${startup.name} trenutno nema posla u toku. Kreiraj zadatak kada se pojavi.`}
              action={
                <Button onClick={onCreateTask}>
                  <Plus /> Novi zadatak
                </Button>
              }
            />
          ) : (
            <LayoutGroup>
              <div data-workspace-enter className="space-y-4">
                {TRIAGE_ZONE_ORDER.map((zone) => (
                  <TriageZoneSection
                    key={zone}
                    zone={zone}
                    tasks={buckets[zone]}
                    members={members}
                    assigneesByTaskId={assigneesByTaskId}
                    profile={profile}
                    areaLabels={areaLabels}
                    now={now}
                    collapsed={zone === "kasnije" && !laterOpen}
                    onToggleCollapsed={
                      zone === "kasnije"
                        ? () => setLaterOpen((open) => !open)
                        : undefined
                    }
                    onOpenPage={onOpenPage}
                  />
                ))}
              </div>
            </LayoutGroup>
          )}

          {overview.hasMore ? (
            <p className="mt-5 text-xs text-muted-foreground">
              Prikazano je prvih 150 zadataka po statusu.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function CommandCenterSkeleton() {
  return (
    <div aria-label="Učitavanje trijaže" className="space-y-4">
      <div className="flex gap-2">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-14 w-40 rounded-xl" />
        ))}
      </div>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="rounded-2xl border border-border/70 p-3">
          <Skeleton className="mb-3 h-5 w-40" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function TriageZoneSection({
  zone,
  tasks,
  members,
  profile,
  areaLabels,
  now,
  collapsed,
  onToggleCollapsed,
  onOpenPage,
  assigneesByTaskId,
}: {
  zone: TriageZone;
  tasks: Array<CommandCenterTask>;
  members: Array<StartupMember>;
  assigneesByTaskId: Map<Id<"pages">, Array<TaskAssigneeSummary>>;
  profile: ProfileWithAvatar;
  areaLabels: Map<string, string>;
  now: number;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const meta = ZONE_META[zone];
  const Icon = meta.icon;
  const count = tasks.length;
  const listId = `zona-${zone}-lista`;

  return (
    <section
      id={`zona-${zone}`}
      aria-labelledby={`zona-${zone}-naslov`}
      className={cn(
        "scroll-mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card/60",
        meta.frameClass,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
        <Icon className={cn("size-4 shrink-0", meta.accentClass)} aria-hidden="true" />
        <h2
          id={`zona-${zone}-naslov`}
          className="text-sm font-bold uppercase tracking-[0.08em]"
        >
          {meta.label}
        </h2>
        <span
          className={cn(
            "grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono text-[0.6875rem] font-semibold tabular-nums",
            meta.countClass,
          )}
        >
          {count}
        </span>
        <p className="hidden text-xs text-muted-foreground sm:block">{meta.hint}</p>
        {onToggleCollapsed === undefined ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={onToggleCollapsed}
          >
            {collapsed ? "Prikaži" : "Sakrij"}
            <ChevronDown
              className={cn("transition-transform", !collapsed && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        )}
      </header>

      <div id={listId} hidden={collapsed}>
        {count === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground sm:px-4">
            {meta.emptyLabel}
          </p>
        ) : (
          <div className="border-t border-border/50">
            {tasks.map((task) => (
              <CommandCenterRow
                key={task._id}
                task={task}
                members={members}
                assignees={assigneesByTaskId.get(task._id) ?? []}
                profile={profile}
                areaLabel={areaLabels.get(task.areaId) ?? "Bez oblasti"}
                now={now}
                onOpenPage={onOpenPage}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CommandCenterRow({
  task,
  members,
  assignees,
  profile,
  areaLabel,
  now,
  onOpenPage,
}: {
  task: CommandCenterTask;
  members: Array<StartupMember>;
  assignees: Array<TaskAssigneeSummary>;
  profile: ProfileWithAvatar;
  areaLabel: string;
  now: number;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [busy, setBusy] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const assigneeProfileIds = assignees.map((assignee) => assignee.profileId);
  const isCreator = task.createdByProfileId === profile._id;
  const isAssignee = assigneeProfileIds.includes(profile._id);
  const canChangeStatus = isCreator || isAssignee;
  // Svaki član može sam sebe da doda, i kad zadatak već ima izvršioce.
  const canJoin = !isCreator && !isAssignee;

  async function run(
    patch: {
      status?: TaskStatus;
      assigneeProfileIds?: Array<Id<"profiles">>;
      dueDate?: number | null;
    },
    fallbackMessage: string,
    successMessage?: string,
  ) {
    setBusy(true);
    const operation = queueRef.current
      .catch(() => undefined)
      .then(() => updateMetadata({ pageId: task._id, ...patch }));
    queueRef.current = operation;
    try {
      await operation;
      if (successMessage !== undefined) toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  }

  // `layoutId` je nosilac jedinog orkestriranog pokreta u aplikaciji: kad
  // zadatak promeni status ili rok, njegov red otputuje u novu zonu — vidi se
  // da posao izlazi iz „Gori”.
  const motionProps = prefersReducedMotion
    ? {}
    : {
        layout: true as const,
        layoutId: task._id,
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2 },
      };

  return (
    <motion.div
      {...motionProps}
      className="grid gap-2 border-b border-border/50 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-4"
    >
      <button
        type="button"
        onClick={() => onOpenPage(task._id)}
        className="flex min-w-0 items-center gap-3 rounded-lg text-left"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
          <CheckSquare2 className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{task.title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{areaLabel}</span>
            <span aria-hidden="true">·</span>
            <AssigneeStack assignees={assignees} showLabel max={3} />
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2 sm:justify-end">
        <DeadlineBadge
          dueDate={task.dueDate}
          taskStatus={task.taskStatus}
          now={now}
          size="sm"
        />
        <TaskPriorityBadge priority={task.taskPriority ?? "medium"} />

        <div className="hidden items-center gap-2 sm:flex">
          <QuickActions
            task={task}
            members={members}
            profileId={profile._id}
            busy={busy}
            canChangeStatus={canChangeStatus}
            canEditAll={isCreator}
            canJoin={canJoin}
            assigneeProfileIds={assigneeProfileIds}
            onRun={run}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label={`Brze akcije za zadatak ${task.title}`}
          onClick={() => setActionsOpen(true)}
        >
          <Settings2 />
        </Button>
      </div>

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent side="bottom" className="gap-5 rounded-t-2xl sm:hidden">
          <SheetHeader>
            <SheetTitle className="truncate text-base">{task.title}</SheetTitle>
            <SheetDescription>
              Promeni status, rok ili preuzmi zadatak na sebe.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4">
            <QuickActions
              task={task}
              members={members}
              profileId={profile._id}
              busy={busy}
              canChangeStatus={canChangeStatus}
              canEditAll={isCreator}
              canJoin={canJoin}
              assigneeProfileIds={assigneeProfileIds}
              stacked
              onRun={run}
            />
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}

function QuickActions({
  task,
  members,
  profileId,
  busy,
  canChangeStatus,
  canEditAll,
  canJoin,
  assigneeProfileIds,
  stacked = false,
  onRun,
}: {
  task: CommandCenterTask;
  members: Array<StartupMember>;
  profileId: Id<"profiles">;
  busy: boolean;
  canChangeStatus: boolean;
  canEditAll: boolean;
  canJoin: boolean;
  assigneeProfileIds: Array<Id<"profiles">>;
  stacked?: boolean;
  onRun: (
    patch: {
      status?: TaskStatus;
      assigneeProfileIds?: Array<Id<"profiles">>;
      dueDate?: number | null;
    },
    fallbackMessage: string,
    successMessage?: string,
  ) => Promise<void>;
}) {
  const statusId = `status-${task._id}`;
  const dueId = `rok-${task._id}`;
  const assigneeId = `dodela-${task._id}`;

  return (
    <>
      <Field stacked={stacked} htmlFor={statusId} label="Status">
        <Select
          value={task.taskStatus ?? "backlog"}
          disabled={busy || !canChangeStatus}
          onValueChange={(value) =>
            onRun({ status: value as TaskStatus }, "Status nije sačuvan.")
          }
        >
          <SelectTrigger
            id={statusId}
            className={cn("h-8 text-xs", stacked ? "w-full" : "w-32")}
            aria-label={`Status zadatka ${task.title}`}
            title={
              canChangeStatus
                ? undefined
                : "Status menja kreator zadatka ili osoba kojoj je dodeljen."
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                <TaskStatusBadge status={status} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field stacked={stacked} htmlFor={dueId} label="Rok">
        <Input
          id={dueId}
          type="date"
          value={toDateInputValue(task.dueDate)}
          disabled={busy || !canEditAll}
          aria-label={`Rok za zadatak ${task.title}`}
          title={canEditAll ? undefined : "Rok menja samo kreator zadatka."}
          className={cn("h-8 text-xs", stacked ? "w-full" : "w-36")}
          onChange={(event) =>
            onRun(
              {
                dueDate: event.target.value
                  ? fromDateInputValue(event.target.value) ?? null
                  : null,
              },
              "Rok nije sačuvan. Proveri datum i probaj ponovo.",
            )
          }
        />
      </Field>

      {canEditAll ? (
        <Field stacked={stacked} htmlFor={assigneeId} label="Izvršioci">
          <div
            id={assigneeId}
            className={cn(stacked ? "w-full" : "w-36")}
          >
            <AssigneePickerCompact
              members={members}
              value={assigneeProfileIds}
              disabled={busy}
              label={`Izvršioci zadatka ${task.title}`}
              onChange={(next) =>
                void onRun(
                  { assigneeProfileIds: next },
                  "Dodela nije sačuvana.",
                )
              }
            />
          </div>
        </Field>
      ) : canJoin ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className={cn("h-8 text-xs", stacked && "w-full")}
          onClick={() =>
            onRun(
              { assigneeProfileIds: [...assigneeProfileIds, profileId] },
              "Priključivanje nije sačuvano.",
              "Priključio/la si se zadatku.",
            )
          }
        >
          <HandHelping /> Priključi se
        </Button>
      ) : null}
    </>
  );
}

function Field({
  stacked,
  htmlFor,
  label,
  children,
}: {
  stacked: boolean;
  htmlFor: string;
  label: string;
  children: React.ReactNode;
}) {
  if (!stacked) return <>{children}</>;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
