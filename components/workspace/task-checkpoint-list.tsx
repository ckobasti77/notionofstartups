"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronRight,
  Circle,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { taskCheckpointOrdinal } from "@/components/workspace/canvases/task-checkpoint-layout";
import { ContributionInlineThread } from "@/components/workspace/idea-discussion-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type TaskCheckpointDraft = {
  id: string;
  text: string;
  completed: boolean;
};

export function TaskCheckpointDraftList({
  items,
  onChange,
}: {
  items: TaskCheckpointDraft[];
  onChange: (items: TaskCheckpointDraft[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  function add() {
    const text = draft.trim();
    if (!text || items.length >= 100) return;
    onChange([
      ...items,
      {
        id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        completed: false,
      },
    ]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Dodaj podzadatak / checkpoint..."
          className="min-h-11"
        />
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          onClick={add}
          disabled={!draft.trim() || items.length >= 100}
        >
          <Plus className="size-4" /> Dodaj
        </Button>
      </div>
      {items.length > 0 ? (
        <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-2.5 py-1.5"
            >
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={
                  item.completed
                    ? `Označi checkpoint kao otvoren: ${item.text}`
                    : `Označi checkpoint kao završen: ${item.text}`
                }
                title={item.completed ? "Ponovo otvori" : "Označi kao završeno"}
                onClick={() =>
                  onChange(
                    items.map((current) =>
                      current.id === item.id
                        ? { ...current, completed: !current.completed }
                        : current,
                    ),
                  )
                }
              >
                {item.completed ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Circle className="size-4 text-orange-600" />
                )}
              </button>
              {editingId === item.id ? (
                <Input
                  autoFocus
                  value={editingText}
                  className="h-8 flex-1"
                  onChange={(event) => setEditingText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditingId(null);
                    if (event.key === "Enter" && editingText.trim()) {
                      onChange(
                        items.map((current) =>
                          current.id === item.id
                            ? { ...current, text: editingText.trim() }
                            : current,
                        ),
                      );
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-medium",
                    item.completed && "text-muted-foreground line-through",
                  )}
                >
                  {item.text}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`Uredi checkpoint: ${item.text}`}
                title="Uredi checkpoint"
                onClick={() => {
                  if (editingId === item.id) {
                    if (editingText.trim()) {
                      onChange(
                        items.map((current) =>
                          current.id === item.id
                            ? { ...current, text: editingText.trim() }
                            : current,
                        ),
                      );
                    }
                    setEditingId(null);
                    return;
                  }
                  setEditingId(item.id);
                  setEditingText(item.text);
                }}
              >
                {editingId === item.id ? (
                  <Check className="size-3.5" />
                ) : (
                  <Pencil className="size-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-muted-foreground hover:text-destructive"
                aria-label={`Ukloni checkpoint: ${item.text}`}
                title="Ukloni checkpoint"
                onClick={() =>
                  onChange(items.filter((current) => current.id !== item.id))
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CheckpointContributionDialog({
  checkpointId,
  title,
  open,
  onOpenChange,
}: {
  checkpointId: Id<"taskCheckpoints"> | null;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(42rem,90vh)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-primary" />
            Doprinosi checkpointu
          </DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        {checkpointId ? (
          <ContributionInlineThread
            target={{ kind: "task_checkpoint", id: checkpointId }}
            canAdd
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function TaskCheckpointList({
  taskPageId,
  canCreate,
  compact = false,
  autoFocusCreate = false,
  collapsible = false,
  className,
}: {
  taskPageId: Id<"pages">;
  canCreate: boolean;
  compact?: boolean;
  autoFocusCreate?: boolean;
  collapsible?: boolean;
  className?: string;
}) {
  const checkpoints = useQuery(api.taskCheckpoints.listForTask, {
    taskPageId,
  });
  const createCheckpoint = useMutation(api.taskCheckpoints.create);
  const updateText = useMutation(api.taskCheckpoints.updateText);
  const setCompleted = useMutation(api.taskCheckpoints.setCompleted);
  const archiveOwn = useMutation(api.taskCheckpoints.archiveOwn);
  const restoreOwn = useMutation(api.taskCheckpoints.restoreOwn);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  const [draft, setDraft] = useState("");
  const [pendingId, setPendingId] =
    useState<Id<"taskCheckpoints"> | "create" | null>(null);
  const [editingId, setEditingId] =
    useState<Id<"taskCheckpoints"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const [thread, setThread] = useState<{
    id: Id<"taskCheckpoints">;
    title: string;
  } | null>(null);

  if (checkpoints === undefined) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  const completedCount = checkpoints.filter((item) => item.completed).length;

  async function add() {
    const text = draft.trim();
    if (!text || !canCreate || checkpoints!.length >= 100) return;
    setPendingId("create");
    try {
      await createCheckpoint({ taskPageId, text });
      setDraft("");
      toast.success("Checkpoint je dodat.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkpoint nije dodat.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={cn("space-y-3", className)} aria-label="Checkpointi zadatka">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-primary" />
          <span className="text-sm font-bold">Podzadaci / Checkpointi</span>
          {collapsible ? (
            <button
              type="button"
              className="-ml-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={
                expanded
                  ? "Skupi podzadatke i checkpointe"
                  : "Proširi podzadatke i checkpointe"
              }
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronRight
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  expanded && "rotate-90",
                )}
              />
            </button>
          ) : null}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-bold text-muted-foreground">
            {completedCount}/{checkpoints.length}
          </span>
        </div>
        {checkpoints.length > 0 ? (
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Napredak checkpointa"
            aria-valuemin={0}
            aria-valuemax={checkpoints.length}
            aria-valuenow={completedCount}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{
                width: `${Math.round(
                  (completedCount / checkpoints.length) * 100,
                )}%`,
              }}
            />
          </div>
        ) : null}
      </div>

      <div
        id={contentId}
        hidden={collapsible && !expanded}
        className="space-y-3"
      >
        {canCreate ? (
          <div className="flex gap-2">
            <Input
              autoFocus={autoFocusCreate}
              value={draft}
              placeholder="Dodaj novi checkpoint..."
              aria-label="Novi checkpoint"
              className="min-h-11"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void add();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={
                pendingId === "create" ||
                !draft.trim() ||
                checkpoints.length >= 100
              }
              onClick={() => void add()}
            >
              {pendingId === "create" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Dodaj
            </Button>
          </div>
        ) : null}

        {checkpoints.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
            Još nema checkpointa.
          </p>
        ) : (
          <div className={cn("space-y-2", compact && "space-y-1.5")}>
            {checkpoints.map((checkpoint, index) => (
              <article
                key={checkpoint._id}
                aria-label={`Checkpoint broj ${taskCheckpointOrdinal(checkpoint.ordinal, index)}: ${checkpoint.text}`}
                className={cn(
                  "rounded-xl border px-2.5 py-2 transition-colors",
                  checkpoint.completed
                    ? "border-emerald-500/30 bg-emerald-500/6"
                    : "border-orange-500/30 bg-orange-500/6",
                )}
              >
              <div className="flex items-center gap-2">
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full border border-border/70 bg-background/80 px-1.5 text-[0.6875rem] font-extrabold text-muted-foreground">
                  #{taskCheckpointOrdinal(checkpoint.ordinal, index)}
                </span>
                <button
                  type="button"
                  className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!checkpoint.canToggle || pendingId === checkpoint._id}
                  aria-label={
                    checkpoint.completed
                      ? `Ponovo otvori checkpoint broj ${taskCheckpointOrdinal(checkpoint.ordinal, index)}: ${checkpoint.text}`
                      : `Završi checkpoint broj ${taskCheckpointOrdinal(checkpoint.ordinal, index)}: ${checkpoint.text}`
                  }
                  title={
                    checkpoint.completed
                      ? "Ponovo otvori"
                      : "Označi kao završeno"
                  }
                  onClick={() => {
                    setPendingId(checkpoint._id);
                    void setCompleted({
                      checkpointId: checkpoint._id,
                      completed: !checkpoint.completed,
                    })
                      .catch((error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Status nije promenjen.",
                        ),
                      )
                      .finally(() => setPendingId(null));
                  }}
                >
                  {pendingId === checkpoint._id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : checkpoint.completed ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Circle className="size-4 text-orange-600" />
                  )}
                </button>
                {editingId === checkpoint._id ? (
                  <Input
                    autoFocus
                    value={editingText}
                    className="h-9 flex-1"
                    onChange={(event) => setEditingText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditingId(null);
                      if (event.key === "Enter" && editingText.trim()) {
                        setPendingId(checkpoint._id);
                        void updateText({
                          checkpointId: checkpoint._id,
                          text: editingText,
                        })
                          .then(() => setEditingId(null))
                          .catch((error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Checkpoint nije sačuvan.",
                            ),
                          )
                          .finally(() => setPendingId(null));
                      }
                    }}
                  />
                ) : (
                  <p
                    className={cn(
                      "min-w-0 flex-1 text-sm font-medium",
                      checkpoint.completed &&
                        "text-muted-foreground line-through",
                    )}
                  >
                    {checkpoint.text}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Dodaj doprinos: ${checkpoint.text}`}
                  title="Doprinosi"
                  onClick={() =>
                    setThread({
                      id: checkpoint._id,
                      title: checkpoint.text,
                    })
                  }
                >
                  <MessageSquareText className="size-3.5" />
                </Button>
                {checkpoint.canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Uredi checkpoint: ${checkpoint.text}`}
                    title="Uredi checkpoint"
                    onClick={() => {
                      if (editingId === checkpoint._id) {
                        setEditingId(null);
                        return;
                      }
                      setEditingId(checkpoint._id);
                      setEditingText(checkpoint.text);
                    }}
                  >
                    {editingId === checkpoint._id ? (
                      <X className="size-3.5" />
                    ) : (
                      <Pencil className="size-3.5" />
                    )}
                  </Button>
                ) : null}
                {checkpoint.canDeleteDirectly ||
                checkpoint.canRequestDeletion ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 text-rose-600"
                    aria-label={
                      checkpoint.canDeleteDirectly
                        ? `Obriši checkpoint: ${checkpoint.text}`
                        : `Zatraži brisanje checkpointa: ${checkpoint.text}`
                    }
                    title={
                      checkpoint.canDeleteDirectly
                        ? "Obriši checkpoint"
                        : "Zatraži brisanje"
                    }
                    onClick={() => {
                      if (checkpoint.canRequestDeletion) {
                        void requestDeletion({
                          target: {
                            kind: "task_checkpoint",
                            id: checkpoint._id,
                          },
                        })
                          .then(() =>
                            toast.success("Zahtev za brisanje je poslat."),
                          )
                          .catch((error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Zahtev nije poslat.",
                            ),
                          );
                        return;
                      }
                      void archiveOwn({ checkpointId: checkpoint._id })
                        .then(() =>
                          toast.success("Checkpoint je obrisan.", {
                            duration: 8_000,
                            action: {
                              label: "Undo",
                              onClick: () =>
                                void restoreOwn({
                                  checkpointId: checkpoint._id,
                                }),
                            },
                          }),
                        )
                        .catch((error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Checkpoint nije obrisan.",
                          ),
                        );
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <CheckpointContributionDialog
        checkpointId={thread?.id ?? null}
        title={thread?.title ?? ""}
        open={thread !== null}
        onOpenChange={(open) => {
          if (!open) setThread(null);
        }}
      />
    </section>
  );
}
