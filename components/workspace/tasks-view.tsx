"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  CheckSquare2,
  CircleDashed,
  LayoutGrid,
  Plus,
  Rows3,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProfileWithAvatar, StartupMember, StartupWithAreas } from "@/components/workspace/types";
import {
  EmptyState,
  ProfileAvatar,
  TaskPriorityBadge,
  TaskStatusBadge,
  isToday,
  memberById,
} from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  TASK_STATUS_META,
  formatShortDate,
  type TaskStatus,
} from "@/lib/workspace";

type TasksViewProps = {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  mode: "today" | "mine";
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
};

const boardStatuses: Array<TaskStatus> = [
  "backlog",
  "next",
  "in_progress",
  "blocked",
  "done",
];

export function TasksView({
  startup,
  profile,
  mode,
  onOpenPage,
  onCreateTask,
}: TasksViewProps) {
  const [todayRange] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { dueStart: start.getTime(), dueEnd: end.getTime() };
  });
  const { results: tasks, status: tasksStatus, loadMore } = usePaginatedQuery(
    api.tasks.listForStartup,
    {
      startupId: startup._id,
      ...(mode === "mine" ? { assigneeProfileId: profile._id } : todayRange),
    },
    { initialNumItems: 50 },
  );
  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const visibleTasks = useMemo(
    () => tasks.filter((task) => (mode === "today" ? isToday(task.dueDate) : true)),
    [mode, tasks],
  );
  const title = mode === "today" ? "Današnji fokus" : "Moji zadaci";
  const description =
    mode === "today"
      ? `Sve što tim treba da završi danas u startupu ${startup.name}.`
      : `Tvoji zadaci u startupu ${startup.name}, od ideje do završenog.`;

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header data-workspace-enter className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">
            {startup.name}
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Button onClick={onCreateTask}>
          <Plus /> Novi zadatak
        </Button>
      </header>

      {tasksStatus === "LoadingFirstPage" || members === undefined ? (
        <TasksSkeleton />
      ) : mode === "mine" ? (
        <Tabs defaultValue="list" data-workspace-enter>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{visibleTasks.length}</span>{" "}
              {visibleTasks.length === 1 ? "zadatak" : "zadataka"}
            </p>
            <TabsList aria-label="Prikaz zadataka">
              <TabsTrigger value="list"><Rows3 /> Lista</TabsTrigger>
              <TabsTrigger value="board"><LayoutGrid /> Tabla</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="list">
            <TaskList
              tasks={visibleTasks}
              members={members}
              onOpenPage={onOpenPage}
              onCreateTask={onCreateTask}
            />
          </TabsContent>
          <TabsContent value="board">
            <KanbanBoard tasks={visibleTasks} members={members} onOpenPage={onOpenPage} />
          </TabsContent>
        </Tabs>
      ) : (
        <div data-workspace-enter>
          <TaskList
            tasks={visibleTasks}
            members={members}
            onOpenPage={onOpenPage}
            onCreateTask={onCreateTask}
            emptyTitle="Nema zadataka za danas"
            emptyDescription="Današnji raspored je čist. Dodajte rok zadatku kada želite da se pojavi ovde."
          />
        </div>
      )}
      {tasksStatus === "CanLoadMore" || tasksStatus === "LoadingMore" ? (
        <div className="mt-5 flex justify-center" data-workspace-enter>
          <Button variant="outline" disabled={tasksStatus === "LoadingMore"} onClick={() => loadMore(50)}>
            {tasksStatus === "LoadingMore" ? "Učitavam…" : "Učitaj još zadataka"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TasksSkeleton() {
  return (
    <div className="space-y-2" aria-label="Učitavanje zadataka">
      {[0, 1, 2, 3].map((item) => (
        <Skeleton key={item} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

function TaskList({
  tasks,
  members,
  onOpenPage,
  onCreateTask,
  emptyTitle = "Nema dodeljenih zadataka",
  emptyDescription = "Kada ti neko dodeli zadatak, pojaviće se ovde. Možeš i odmah da kreiraš svoj.",
}: {
  tasks: Array<Doc<"pages">>;
  members: Array<StartupMember>;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [now] = useState(() => Date.now());
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={emptyTitle}
        description={emptyDescription}
        action={<Button onClick={onCreateTask}><Plus /> Novi zadatak</Button>}
      />
    );
  }

  return (
    <Card className="overflow-hidden border-border/75 bg-card/80 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.38)]">
      <div className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_8rem] gap-3 border-b bg-muted/35 px-4 py-2 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-muted-foreground sm:grid">
        <span>Zadatak</span><span>Status</span><span>Prioritet</span><span>Rok</span>
      </div>
      <AnimatePresence initial={false}>
        {tasks.map((task) => {
          const assignee = memberById(members, task.assigneeProfileId);
          return (
            <motion.button
              layout
              key={task._id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="grid min-h-16 w-full gap-2 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/35 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_8rem] sm:items-center sm:gap-3"
              onClick={() => onOpenPage(task._id)}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                  <CheckSquare2 className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{task.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {assignee ? (
                      <><ProfileAvatar profile={assignee} className="size-4" /> {assignee.displayName}</>
                    ) : (
                      <><UserRound className="size-3" /> Nije dodeljen</>
                    )}
                  </span>
                </span>
              </span>
              <span><TaskStatusBadge status={(task.taskStatus ?? "backlog") as TaskStatus} /></span>
              <TaskPriorityBadge priority={(task.taskPriority ?? "medium") as "low" | "medium" | "high" | "urgent"} />
              <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", task.dueDate && task.dueDate < now && task.taskStatus !== "done" && "font-semibold text-destructive")}>
                <CalendarClock className="size-3.5" /> {formatShortDate(task.dueDate)}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </Card>
  );
}

function KanbanBoard({
  tasks,
  members,
  onOpenPage,
}: {
  tasks: Array<Doc<"pages">>;
  members: Array<StartupMember>;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
      <div className="grid min-w-[74rem] grid-cols-5 gap-3">
        {boardStatuses.map((status) => {
          const columnTasks = tasks.filter((task) => task.taskStatus === status);
          return (
            <section key={status} className="rounded-2xl border border-border/70 bg-muted/30 p-2.5">
              <header className="mb-2 flex items-center justify-between px-1 py-1">
                <div className="flex items-center gap-2">
                  <CircleDashed className="size-4 text-primary" />
                  <h2 className="text-xs font-bold uppercase tracking-[0.08em]">{TASK_STATUS_META[status].label}</h2>
                </div>
                <span className="grid size-5 place-items-center rounded-full bg-card text-[0.6875rem] font-semibold text-muted-foreground">{columnTasks.length}</span>
              </header>
              <div className="min-h-40 space-y-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {columnTasks.map((task) => (
                    <KanbanCard key={task._id} task={task} members={members} onOpenPage={onOpenPage} />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  task,
  members,
  onOpenPage,
}: {
  task: Doc<"pages">;
  members: Array<StartupMember>;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const [updating, setUpdating] = useState(false);
  const assignee = memberById(members, task.assigneeProfileId);

  async function changeStatus(status: TaskStatus) {
    setUpdating(true);
    try {
      await updateMetadata({ pageId: task._id, status });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      className="rounded-xl border border-border/75 bg-card p-3 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.65)]"
    >
      <button type="button" className="w-full text-left" onClick={() => onOpenPage(task._id)}>
        <h3 className="line-clamp-2 text-sm font-semibold leading-5">{task.title}</h3>
        <div className="mt-3 flex items-center justify-between gap-2">
          <TaskPriorityBadge priority={(task.taskPriority ?? "medium") as "low" | "medium" | "high" | "urgent"} />
          {assignee ? <ProfileAvatar profile={assignee} className="size-6" /> : <UserRound className="size-4 text-muted-foreground" />}
        </div>
      </button>
      <div className="mt-3 border-t border-border/60 pt-2">
        <Select value={task.taskStatus ?? "backlog"} onValueChange={(value) => changeStatus(value as TaskStatus)} disabled={updating}>
          <SelectTrigger className="h-8 w-full border-transparent bg-muted/55 text-xs shadow-none" aria-label={`Promeni status za ${task.title}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {boardStatuses.map((status) => <SelectItem key={status} value={status}>{TASK_STATUS_META[status].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </motion.article>
  );
}
