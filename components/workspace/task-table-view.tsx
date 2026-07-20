"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Plus,
  Search,
  UserRound,
  Trash2,
  ExternalLink,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
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

type CheckpointItem = {
  id: string;
  text: string;
  completed: boolean;
};

export function TaskTableView({
  startup,
  areaId,
  onOpenPage,
  onCreateTask,
}: TaskTableViewProps) {
  const [now] = useState(() => Date.now());
  const { results: tasks, status: tasksStatus, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId: startup._id, areaId, parentPageId: null },
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

  // Filter tasks to only show kind === "task"
  const taskPages = useMemo(() => {
    return tasks.filter((page) => page.kind === "task");
  }, [tasks]);

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
  isExpanded,
  onToggleExpand,
  onOpenPage,
}: {
  task: Doc<"pages">;
  members: Array<StartupMember>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const [now] = useState(() => Date.now());
  const [updating, setUpdating] = useState(false);
  const [instructionsText, setInstructionsText] = useState(task.instructions ?? "");
  const [newCpText, setNewCpText] = useState("");

  const checkpoints: Array<CheckpointItem> = useMemo(
    () => (task.checkpoints as Array<CheckpointItem>) ?? [],
    [task.checkpoints],
  );

  const completedCount = checkpoints.filter((cp) => cp.completed).length;
  const totalCount = checkpoints.length;

  async function updateStatus(newStatus: TaskStatus) {
    setUpdating(true);
    try {
      await updateMetadata({ pageId: task._id, status: newStatus });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function updatePriority(newPriority: TaskPriority) {
    setUpdating(true);
    try {
      await updateMetadata({ pageId: task._id, priority: newPriority });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Prioritet nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function updateAssignee(newAssigneeId: string) {
    setUpdating(true);
    try {
      await updateMetadata({
        pageId: task._id,
        assigneeProfileId: newAssigneeId === "none" ? null : (newAssigneeId as Id<"profiles">),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dodeljeni član nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function updateDueDate(newDateStr: string) {
    setUpdating(true);
    try {
      const parsedDate = newDateStr ? fromDateInputValue(newDateStr) : null;
      await updateMetadata({ pageId: task._id, dueDate: parsedDate });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rok nije sačuvan.");
    } finally {
      setUpdating(false);
    }
  }

  async function saveInstructions() {
    if (instructionsText === (task.instructions ?? "")) return;
    try {
      await updateMetadata({ pageId: task._id, instructions: instructionsText.trim() });
      toast.success("Instrukcije sačuvane.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Instrukcije nisu sačuvane.");
    }
  }

  async function toggleCheckpoint(cpId: string) {
    const updated = checkpoints.map((cp) =>
      cp.id === cpId ? { ...cp, completed: !cp.completed } : cp,
    );
    try {
      await updateMetadata({ pageId: task._id, checkpoints: updated });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Podzadatak nije ažuriran.");
    }
  }

  async function addCheckpoint() {
    const text = newCpText.trim();
    if (!text) return;
    const newItem: CheckpointItem = {
      id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      text,
      completed: false,
    };
    const updated = [...checkpoints, newItem];
    setNewCpText("");
    try {
      await updateMetadata({ pageId: task._id, checkpoints: updated });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Podzadatak nije dodat.");
    }
  }

  async function removeCheckpoint(cpId: string) {
    const updated = checkpoints.filter((cp) => cp.id !== cpId);
    try {
      await updateMetadata({ pageId: task._id, checkpoints: updated });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Podzadatak nije izbrisan.");
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
            disabled={updating}
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
            disabled={updating}
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
            disabled={updating}
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
              value={toDateInputValue(task.dueDate)}
              onChange={(e) => updateDueDate(e.target.value)}
              disabled={updating}
              className={cn(
                "h-8 text-xs border-border/50 bg-background/60 px-2 py-0",
                task.dueDate && task.dueDate < now && task.taskStatus !== "done" && "border-destructive/60 text-destructive font-semibold"
              )}
            />
          </div>
        </div>

        {/* Instructions Free-Form Field */}
        <div className="min-w-0">
          <Input
            value={instructionsText}
            onChange={(e) => setInstructionsText(e.target.value)}
            onBlur={saveInstructions}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveInstructions(); } }}
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/40 bg-muted/20 px-6 py-4"
          >
            <div className="grid gap-6 md:grid-cols-2">
              {/* Checkpoints List */}
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <ListChecks className="size-4 text-primary" /> Podzadaci / Checkpointi ({completedCount}/{totalCount})
                </h4>

                <div className="flex gap-2">
                  <Input
                    value={newCpText}
                    onChange={(e) => setNewCpText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheckpoint(); } }}
                    placeholder="Novi podzadatak..."
                    className="h-8 text-xs"
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={addCheckpoint} className="h-8 text-xs">
                    <Plus className="size-3.5" /> Dodaj
                  </Button>
                </div>

                {checkpoints.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">Nema podzadataka. Dodajte prvi podzadatak iznad.</p>
                ) : (
                  <div className="space-y-1.5 rounded-xl border border-border/50 bg-card p-2">
                    {checkpoints.map((cp) => (
                      <div key={cp.id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent/40 transition-colors">
                        <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={cp.completed}
                            onChange={() => toggleCheckpoint(cp.id)}
                            className="size-4 rounded border-primary text-primary accent-primary"
                          />
                          <span className={cp.completed ? "line-through text-muted-foreground truncate" : "font-medium truncate text-foreground"}>
                            {cp.text}
                          </span>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCheckpoint(cp.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Instructions Detail */}
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <MessageSquareText className="size-4 text-primary" /> Detaljne Instrukcije
                </h4>
                <textarea
                  value={instructionsText}
                  onChange={(e) => setInstructionsText(e.target.value)}
                  onBlur={saveInstructions}
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
