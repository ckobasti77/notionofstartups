"use client";

import { memo, useState, type SyntheticEvent } from "react";
import { type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import {
  Check,
  Circle,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckpointContributionDialog } from "@/components/workspace/task-checkpoint-list";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import styles from "./task-checkpoint-node.module.css";

export type TaskCheckpointFlowNodeData = {
  checkpointId: Id<"taskCheckpoints">;
  text: string;
  completed: boolean;
  canEdit: boolean;
  canToggle: boolean;
  canMove: boolean;
  canDeleteDirectly: boolean;
  canRequestDeletion: boolean;
};

export type TaskCheckpointFlowNode = Node<
  TaskCheckpointFlowNodeData,
  "taskCheckpoint"
>;

function stopCanvasEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

export const TaskCheckpointFlowNodeCard = memo(
  function TaskCheckpointFlowNodeCard({
    data,
    selected,
  }: NodeProps<TaskCheckpointFlowNode>) {
    const setCompleted = useMutation(api.taskCheckpoints.setCompleted);
    const updateText = useMutation(api.taskCheckpoints.updateText);
    const archiveOwn = useMutation(api.taskCheckpoints.archiveOwn);
    const restoreOwn = useMutation(api.taskCheckpoints.restoreOwn);
    const requestDeletion = useMutation(api.collaboration.requestDeletion);
    const [pending, setPending] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(data.text);
    const [threadOpen, setThreadOpen] = useState(false);

    async function saveText() {
      const text = draft.trim();
      if (!text || text === data.text) {
        setDraft(data.text);
        setEditing(false);
        return;
      }
      setPending(true);
      try {
        await updateText({ checkpointId: data.checkpointId, text });
        setEditing(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Checkpoint nije sačuvan.",
        );
      } finally {
        setPending(false);
      }
    }

    return (
      <>
        <article
          className={cn(
            styles.shell,
            data.completed && styles.completed,
            selected && styles.selected,
            !data.canMove && "nodrag !cursor-default",
          )}
          aria-label={`Checkpoint: ${data.text}. ${
            data.completed ? "Završen" : "Otvoren"
          }.`}
          title="Izaberi checkpoint za izmenu, doprinos ili brisanje"
        >
          <div className={styles.surface} aria-hidden="true" />
          <button
            type="button"
            className={cn(styles.toggle, "nodrag nopan")}
            disabled={!data.canToggle || pending}
            aria-label={
              data.completed
                ? `Ponovo otvori checkpoint: ${data.text}`
                : `Završi checkpoint: ${data.text}`
            }
            title={data.completed ? "Ponovo otvori" : "Označi kao završeno"}
            onPointerDown={stopCanvasEvent}
            onClick={(event) => {
              stopCanvasEvent(event);
              setPending(true);
              void setCompleted({
                checkpointId: data.checkpointId,
                completed: !data.completed,
              })
                .catch((error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Status nije promenjen.",
                  ),
                )
                .finally(() => setPending(false));
            }}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : data.completed ? (
              <Check className="size-4" />
            ) : (
              <Circle className="size-4" />
            )}
          </button>

          <div className={styles.body}>
            {editing ? (
              <div
                className={cn(styles.editing, "nodrag nopan nowheel")}
                onPointerDown={stopCanvasEvent}
              >
                <Input
                  autoFocus
                  value={draft}
                  maxLength={500}
                  aria-label={`Tekst checkpointa: ${data.text}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setDraft(data.text);
                      setEditing(false);
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={() => void saveText()}
                />
              </div>
            ) : (
              <p className={styles.text}>{data.text}</p>
            )}
          </div>

          {selected ? (
            <div
              className={cn(styles.actions, "nodrag nopan nowheel")}
              onPointerDown={stopCanvasEvent}
              onClick={stopCanvasEvent}
            >
              {data.canEdit ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={styles.action}
                  aria-label={
                    editing
                      ? `Otkaži izmenu: ${data.text}`
                      : `Uredi checkpoint: ${data.text}`
                  }
                  title={editing ? "Otkaži izmenu" : "Uredi"}
                  onClick={() => {
                    setDraft(data.text);
                    setEditing((current) => !current);
                  }}
                >
                  {editing ? (
                    <X className="size-4" />
                  ) : (
                    <Pencil className="size-4" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="outline"
                className={styles.action}
                aria-label={`Dodaj doprinos checkpointu: ${data.text}`}
                title="Doprinosi"
                onClick={() => setThreadOpen(true)}
              >
                <MessageSquareText className="size-4" />
              </Button>
              {data.canDeleteDirectly || data.canRequestDeletion ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={cn(styles.action, "text-rose-600")}
                  aria-label={
                    data.canDeleteDirectly
                      ? `Obriši checkpoint: ${data.text}`
                      : `Zatraži brisanje checkpointa: ${data.text}`
                  }
                  title={
                    data.canDeleteDirectly
                      ? "Obriši checkpoint"
                      : "Zatraži brisanje"
                  }
                  onClick={() => {
                    if (data.canRequestDeletion) {
                      void requestDeletion({
                        target: {
                          kind: "task_checkpoint",
                          id: data.checkpointId,
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
                    void archiveOwn({
                      checkpointId: data.checkpointId,
                    })
                      .then(() =>
                        toast.success("Checkpoint je obrisan.", {
                          duration: 8_000,
                          action: {
                            label: "Undo",
                            onClick: () =>
                              void restoreOwn({
                                checkpointId: data.checkpointId,
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
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </article>

        <CheckpointContributionDialog
          checkpointId={data.checkpointId}
          title={data.text}
          open={threadOpen}
          onOpenChange={setThreadOpen}
        />
      </>
    );
  },
);
