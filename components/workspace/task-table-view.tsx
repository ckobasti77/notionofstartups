"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Plus,
  Search,
  UserRound,
  ExternalLink,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DeadlineBadge } from "@/components/workspace/deadline-badge";
import { TaskCheckpointList } from "@/components/workspace/task-checkpoint-list";
import type { ProfileWithAvatar, StartupMember, StartupWithAreas } from "@/components/workspace/types";
import {
  EmptyState,
  ProfileAvatar,
  TaskPriorityBadge,
  TaskStatusBadge,
  isToday,
} from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  toDateInputValue,
  fromDateInputValue,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/workspace";

type TaskTableViewProps = {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  areaId: Id<"startupAreas">;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
};

export function TaskTableView({
  startup,
  profile,
  areaId,
  onOpenPage,
  onCreateTask,
}: TaskTableViewProps) {
  const [now] = useState(() => Date.now());
  const { results: tasks, status: tasksStatus, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId: startup._id, areaId, parentPageId: null, kind: "task" },
    { initialNumItems: 50 },
  );

  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");

  const [expandedTaskId, setExpandedTaskId] = useState<Id<"pages"> | null>(null);

  const taskPages = tasks;

  const filteredTasks = useMemo(() => {
    return taskPages.filter((task) => {
      // Search query
      if (searchQuery.trim()) {
        const titleMatch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
        const instrMatch = task.instructions?.toLowerCase().includes(searchQuery.toLowerCase());
        if (!titleMatch && !instrMatch) return false;
      }
      // Status filter
      if (statusFilter !== "all" && task.taskStatus !== statusFilter) {
        return false;
      }
      // Priority filter
      if (priorityFilter !== "all" && task.taskPriority !== priorityFilter) {
        return false;
      }
      // Assignee filter
      if (assigneeFilter !== "all") {
        if (assigneeFilter === "unassigned") {
          if (task.assigneeProfileId !== null && task.assigneeProfileId !== undefined) return false;
        } else if (task.assigneeProfileId !== assigneeFilter) {
          return false;
        }
      }
      // Due Date filter
      if (dueFilter !== "all") {
        if (dueFilter === "today") {
          if (!isToday(task.dueDate)) return false;
        } else if (dueFilter === "overdue") {
          if (!task.dueDate || task.dueDate >= now || task.taskStatus === "done") return false;
        } else if (dueFilter === "upcoming") {
          if (!task.dueDate || task.dueDate < now) return false;
        }
      }
      return true;
    });
  }, [taskPages, searchQuery, statusFilter, priorityFilter, assigneeFilter, dueFilter, now]);

  if (tasksStatus === "LoadingFirstPage" || members === undefined) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/75 p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pretraži zadatke..."
              className="h-9 pl-8 text-xs"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[8.5rem] text-xs bg-background/80">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi statusi</SelectItem>
              {Object.entries(TASK_STATUS_META).map(([val, meta]) => (
                <SelectItem key={val} value={val}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-9 w-[8.5rem] text-xs bg-background/80">
              <SelectValue placeholder="Prioritet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi prioriteti</SelectItem>
              {Object.entries(TASK_PRIORITY_META).map(([val, meta]) => (
                <SelectItem key={val} value={val}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Assignee Filter */}
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-9 w-[9.5rem] text-xs bg-background/80">
              <SelectValue placeholder="Dodeljeno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi dodeljeni</SelectItem>
              <SelectItem value="unassigned">Nije dodeljen</SelectItem>
              {members.map(({ profile: m }) => (
                <SelectItem key={m._id} value={m._id}>{m.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Due Filter */}
          <Select value={dueFilter} onValueChange={setDueFilter}>
            <SelectTrigger className="h-9 w-[8rem] text-xs bg-background/80">
              <SelectValue placeholder="Rok" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi rokovi</SelectItem>
              <SelectItem value="today">Danas</SelectItem>
              <SelectItem value="overdue">Mimo roka</SelectItem>
              <SelectItem value="upcoming">Predstojeći</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={onCreateTask} size="sm">
          <Plus className="size-4" /> Novi zadatak
        </Button>
      </div>

      {/* Task Table */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nema pronađenih zadataka"
          description={
            taskPages.length === 0
              ? "U ovoj oblasti još nema zadataka. Napravi prvi zadatak odmah!"
              : tasksStatus === "CanLoadMore"
                ? "Nema podudaranja među trenutno učitanim zadacima. Učitaj još zadataka ili promeni filtere."
                : "Nijedan zadatak ne odgovara trenutno izabranim filterima."
          }
          action={
            <Button onClick={onCreateTask}>
              <Plus /> Novi zadatak
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden border-border/75 bg-card/90 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.35)]">
          {/* Header Row */}
          <div className="hidden grid-cols-[minmax(0,2fr)_8.5rem_7.5rem_8.5rem_8rem_minmax(0,1.5fr)_5.5rem] gap-3 border-b bg-muted/40 px-4 py-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted-foreground lg:grid">
            <span>Zadatak & Checkpoints</span>
            <span>Status</span>
            <span>Prioritet</span>
            <span>Dodeljeno</span>
            <span>Rok</span>
            <span>Instrukcije</span>
            <span className="text-right">Akcije</span>
          </div>

          <div className="divide-y divide-border/60">
            {filteredTasks.map((task) => (
              <TaskTableRow
                key={task._id}
                task={task}
                members={members}
                canEdit={task.createdByProfileId === profile._id}
                isExpanded={expandedTaskId === task._id}
                onToggleExpand={() =>
                  setExpandedTaskId((curr) => (curr === task._id ? null : task._id))
                }
                onOpenPage={onOpenPage}
              />
            ))}
          </div>
        </Card>
      )}

      {tasksStatus === "CanLoadMore" || tasksStatus === "LoadingMore" ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            disabled={tasksStatus === "LoadingMore"}
            onClick={() => loadMore(50)}
          >
            {tasksStatus === "LoadingMore" ? "Učitavam…" : "Učitaj još"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TaskTableRow({
  task,
  members,
  canEdit,
  isExpanded,
  onToggleExpand,
  onOpenPage,
}: {
  task: Doc<"pages">;
  members: Array<StartupMember>;
  canEdit: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const updateTaskPage = useMutation(api.areasV2.updatePage);
  const revisionRef = useRef(task.revision);
  const updateQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [now] = useState(() => Date.now());
  const [updating, setUpdating] = useState(false);
  const serverInstructions = task.instructions ?? "";
  const [instructionsDraft, setInstructionsDraft] = useState(() => ({
    base: serverInstructions,
    value: serverInstructions,
  }));
  const instructionsText =
    instructionsDraft.base === serverInstructions
      ? instructionsDraft.value
      : serverInstructions;
  const prefersReducedMotion = useReducedMotion();

  const legacyCheckpoints =
    task.checkpoints as
      | Array<{ id: string; text: string; completed: boolean }>
      | undefined;
  const completedCount =
    task.checkpointCompleted ??
    legacyCheckpoints?.filter((checkpoint) => checkpoint.completed).length ??
    0;
  const totalCount =
    task.checkpointTotal ?? legacyCheckpoints?.length ?? 0;

  useEffect(() => {
    if (task.revision > revisionRef.current) {
      revisionRef.current = task.revision;
    }
  }, [task.revision]);

  async function updateMetadata(patch: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeProfileId?: Id<"profiles"> | null;
    dueDate?: number | null;
    instructions?: string | null;
  }) {
    const operation = updateQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await updateTaskPage({
          startupId: task.startupId,
          pageId: task._id,
          expectedRevision: revisionRef.current,
          ...(patch.status === undefined ? {} : { taskStatus: patch.status }),
          ...(patch.priority === undefined
            ? {}
            : { taskPriority: patch.priority }),
          ...(patch.assigneeProfileId === undefined
            ? {}
            : { assigneeProfileId: patch.assigneeProfileId }),
          ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
          ...(patch.instructions === undefined
            ? {}
            : { instructions: patch.instructions }),
        });
        revisionRef.current = result.revision;
        return result;
      });
    updateQueueRef.current = operation;
    await operation;
  }

  async function updateStatus(newStatus: TaskStatus) {
    if (!canEdit) return;
    setUpdating(true);
    try {
      await updateMetadata({ status: newStatus });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function updatePriority(newPriority: TaskPriority) {
    if (!canEdit) return;
    setUpdating(true);
    try {
      await updateMetadata({ priority: newPriority });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Prioritet nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function updateAssignee(newAssigneeId: string) {
    if (!canEdit) return;
    setUpdating(true);
    try {
      await updateMetadata({
        assigneeProfileId: newAssigneeId === "none" ? null : (newAssigneeId as Id<"profiles">),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dodeljeni član nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function updateDueDate(newDateStr: string) {
    if (!canEdit) return;
    setUpdating(true);
    try {
      const parsedDate = newDateStr ? fromDateInputValue(newDateStr) : null;
      await updateMetadata({ dueDate: parsedDate });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rok nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function saveInstructions() {
    if (!canEdit) return;
    if (instructionsText === serverInstructions) return;
    try {
      await updateMetadata({ instructions: instructionsText.trim() });
      toast.success("Instrukcije sačuvane.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Instrukcije nisu sačuvane.");
    }
  }

  return (
    <div className="group transition-colors hover:bg-accent/25">
      <div className="grid min-h-16 items-center gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,2fr)_8.5rem_7.5rem_8.5rem_8rem_minmax(0,1.5fr)_5.5rem]">
        {/* Task Title & Checkpoint Toggle */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={onToggleExpand}
            title="Prikaži/sakrij podzadatke"
            aria-label={`${isExpanded ? "Sakrij" : "Prikaži"} detalje zadatka ${task.title}`}
          >
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>

          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <CheckSquare2 className="size-4" />
          </span>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="block truncate text-left text-sm font-semibold hover:text-primary transition-colors"
              onClick={() => onOpenPage(task._id)}
            >
              {task.title}
            </button>

            {totalCount > 0 ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium">
                  <ListChecks className="size-3.5 text-primary" /> {completedCount}/{totalCount}
                </span>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Status Dropdown */}
        <div>
          <Select
            value={task.taskStatus ?? "backlog"}
            onValueChange={(val) => updateStatus(val as TaskStatus)}
            disabled={updating || !canEdit}
          >
            <SelectTrigger className="h-8 border-transparent bg-transparent p-0 shadow-none focus:ring-0">
              <SelectValue>
                <TaskStatusBadge status={(task.taskStatus ?? "backlog") as TaskStatus} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_STATUS_META).map(([val]) => (
                <SelectItem key={val} value={val}>
                  <TaskStatusBadge status={val as TaskStatus} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Priority Dropdown */}
        <div>
          <Select
            value={task.taskPriority ?? "medium"}
            onValueChange={(val) => updatePriority(val as TaskPriority)}
            disabled={updating || !canEdit}
          >
            <SelectTrigger className="h-8 border-transparent bg-transparent p-0 shadow-none focus:ring-0">
              <SelectValue>
                <TaskPriorityBadge priority={(task.taskPriority ?? "medium") as TaskPriority} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_PRIORITY_META).map(([val]) => (
                <SelectItem key={val} value={val}>
                  <TaskPriorityBadge priority={val as TaskPriority} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Assignee Dropdown */}
        <div>
          <Select
            value={task.assigneeProfileId ?? "none"}
            onValueChange={updateAssignee}
            disabled={updating || !canEdit}
          >
            <SelectTrigger className="h-8 w-full border-border/50 bg-background/60 text-xs">
              <SelectValue placeholder="Nije dodeljen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserRound className="size-3.5" /> Nije dodeljen
                </span>
              </SelectItem>
              {members.map(({ profile: m }) => (
                <SelectItem key={m._id} value={m._id}>
                  <span className="flex items-center gap-2 text-xs">
                    <ProfileAvatar profile={m} className="size-4" /> {m.displayName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Due Date Input */}
        <div>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              aria-label={`Rok za zadatak ${task.title}`}
              value={toDateInputValue(task.dueDate)}
              onChange={(e) => updateDueDate(e.target.value)}
              disabled={updating || !canEdit}
              className="h-8 border-border/50 bg-background/60 px-2 py-0 text-xs"
            />
          </div>
          <DeadlineBadge
            dueDate={task.dueDate}
            taskStatus={task.taskStatus as TaskStatus | null}
            now={now}
            size="sm"
            className="mt-1"
          />
        </div>

        {/* Instructions Free-Form Field */}
        <div className="min-w-0">
          <Input
            value={instructionsText}
            onChange={(e) =>
              setInstructionsDraft({
                base: serverInstructions,
                value: e.target.value,
              })
            }
            onBlur={saveInstructions}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveInstructions(); } }}
            readOnly={!canEdit}
            maxLength={20_000}
            aria-label={`Kratke instrukcije za zadatak ${task.title}`}
            placeholder="Unesi instrukcije..."
            className="h-8 text-xs border-border/40 bg-background/40 hover:bg-background/80 transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenPage(task._id)}
            className="h-8 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
            title="Otvori zadatak"
          >
            <ExternalLink className="size-3.5" /> Detalji
          </Button>
        </div>
      </div>

      {/* Expanded Checkpoints & Instructions panel */}
      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            className="overflow-hidden border-t border-border/40 bg-muted/20 px-6 py-4"
          >
            <div className="grid gap-6 md:grid-cols-2">
              {!canEdit ? (
                <p className="text-xs text-muted-foreground md:col-span-2">
                  Autor uređuje checkpoint, dodeljena osoba može da menja
                  završeno stanje, a svaki član može da doda doprinos.
                </p>
              ) : null}
              <TaskCheckpointList
                taskPageId={task._id}
                canCreate={canEdit}
                compact
              />

              {/* Instructions Detail */}
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <MessageSquareText className="size-4 text-primary" /> Detaljne Instrukcije
                </h4>
                <textarea
                  value={instructionsText}
                  onChange={(e) =>
                    setInstructionsDraft({
                      base: serverInstructions,
                      value: e.target.value,
                    })
                  }
                  onBlur={saveInstructions}
                  readOnly={!canEdit}
                  maxLength={20_000}
                  aria-label={`Detaljne instrukcije za zadatak ${task.title}`}
                  placeholder="Napišite proizvoljne instrukcije za izvođenje ovog zadatka..."
                  className="flex min-h-24 w-full rounded-xl border border-input bg-card px-3 py-2 text-xs leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={4}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
