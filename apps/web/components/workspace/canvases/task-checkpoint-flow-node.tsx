"use client";

import {
  createContext,
  memo,
  useContext,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import { useMutation } from "convex/react";
import {
  Check,
  Circle,
  LoaderCircle,
  Lock,
  Maximize2,
  MessageSquareText,
  Minimize2,
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

import {
  taskCheckpointUsesExpandedSize,
  type TaskCheckpointSizePreset,
} from "./task-checkpoint-layout";
import { CircularTextFlow } from "./circular-text-flow";
import { PerimeterResizeControl } from "./perimeter-resize-control";
import styles from "./task-checkpoint-node.module.css";

export type TaskCheckpointFlowNodeData = {
  checkpointId: Id<"taskCheckpoints">;
  ordinal: number;
  text: string;
  completed: boolean;
  chainedToPrevious: boolean;
  locked: boolean;
  blockedByOrdinal: number | null;
  canEdit: boolean;
  canToggle: boolean;
  canMove: boolean;
  canResize: boolean;
  manuallySized: boolean;
  canDeleteDirectly: boolean;
  canRequestDeletion: boolean;
};

export type TaskCheckpointFlowNode = Node<
  TaskCheckpointFlowNodeData,
  "taskCheckpoint"
>;

const TaskCheckpointNodeActionsContext = createContext<{
  startResize: (checkpointId: Id<"taskCheckpoints">) => void;
  resize: (
    checkpointId: Id<"taskCheckpoints">,
    layout: ResizeParams,
  ) => void;
  setSizePreset: (
    checkpointId: Id<"taskCheckpoints">,
    preset: TaskCheckpointSizePreset,
  ) => void;
} | null>(null);

export function TaskCheckpointNodeActionsProvider({
  startResize,
  resize,
  setSizePreset,
  children,
}: {
  startResize: (checkpointId: Id<"taskCheckpoints">) => void;
  resize: (
    checkpointId: Id<"taskCheckpoints">,
    layout: ResizeParams,
  ) => void;
  setSizePreset: (
    checkpointId: Id<"taskCheckpoints">,
    preset: TaskCheckpointSizePreset,
  ) => void;
  children: ReactNode;
}) {
  return (
    <TaskCheckpointNodeActionsContext.Provider
      value={{ startResize, resize, setSizePreset }}
    >
      {children}
    </TaskCheckpointNodeActionsContext.Provider>
  );
}

function stopCanvasEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

export const TaskCheckpointFlowNodeCard = memo(
  function TaskCheckpointFlowNodeCard({
    id,
    data,
    selected,
    width,
    height,
  }: NodeProps<TaskCheckpointFlowNode>) {
    const nodeActions = useContext(TaskCheckpointNodeActionsContext);
    const setCompleted = useMutation(api.taskCheckpoints.setCompleted);
    const updateText = useMutation(api.taskCheckpoints.updateText);
    const archiveOwn = useMutation(api.taskCheckpoints.archiveOwn);
    const restoreOwn = useMutation(api.taskCheckpoints.restoreOwn);
    const requestDeletion = useMutation(api.collaboration.requestDeletion);
    const [pending, setPending] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(data.text);
    const [threadOpen, setThreadOpen] = useState(false);
    const usesExpandedSize = taskCheckpointUsesExpandedSize({
      manuallySized: data.manuallySized,
      width,
      height,
    });

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
          data-circular-text-shell
          className={cn(
            styles.shell,
            data.completed && styles.completed,
            selected && styles.selected,
            !data.canMove && "nodrag !cursor-default",
          )}
          aria-label={`Checkpoint broj ${data.ordinal}: ${data.text}. ${
            data.completed
              ? "Završen"
              : data.locked
                ? `Zaključan dok se ne završi korak broj ${data.blockedByOrdinal}`
                : "Otvoren"
          }.`}
          title={
            data.locked
              ? `Zaključano dok se ne završi korak #${data.blockedByOrdinal}`
              : "Izaberi checkpoint za izmenu, doprinos ili brisanje"
          }
        >
          <PerimeterResizeControl<TaskCheckpointFlowNode>
            nodeId={id}
            width={width ?? 140}
            height={height ?? 92}
            selected={selected}
            disabled={!data.canResize}
            shape="checkpoint"
            minWidth={140}
            minHeight={92}
            maxWidth={520}
            maxHeight={600}
            ariaLabel={`Promeni veličinu checkpointa broj ${data.ordinal} povlačenjem oboda`}
            onResizeStart={() => {
              if (data.canResize) {
                nodeActions?.startResize(data.checkpointId);
              }
            }}
            onResizeEnd={(layout) => {
              if (data.canResize) {
                nodeActions?.resize(data.checkpointId, layout);
              }
            }}
          />
          <div className={styles.surface} aria-hidden="true" />
          <span
            data-circular-text-obstacle
            className={styles.ordinal}
            aria-hidden="true"
            title={`Checkpoint broj ${data.ordinal}`}
          >
            #{data.ordinal}
          </span>
          <button
            data-circular-text-obstacle
            type="button"
            className={cn(styles.toggle, "nodrag nopan")}
            disabled={!data.canToggle || data.locked || pending}
            aria-label={
              data.locked
                ? `Checkpoint je zaključan dok se ne završi korak broj ${data.blockedByOrdinal}`
                : data.completed
                  ? `Ponovo otvori checkpoint: ${data.text}`
                  : `Završi checkpoint: ${data.text}`
            }
            title={
              data.locked
                ? `Zaključano dok se ne završi korak #${data.blockedByOrdinal}`
                : data.completed
                  ? "Ponovo otvori"
                  : "Označi kao završeno"
            }
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
            ) : data.locked ? (
              <Lock className="size-4" />
            ) : (
              <Circle className="size-4" />
            )}
          </button>

          {editing ? (
            <div className={styles.body}>
              <div
                className={cn(styles.editing, "nodrag nopan nowheel")}
                onPointerDown={stopCanvasEvent}
              >
                <Input
                  autoFocus
                  value={draft}
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
            </div>
          ) : (
            <CircularTextFlow
              text={data.text}
              className={styles.checkpointTextViewport}
              contentClassName={styles.checkpointMeasuredText}
              ariaLabel={`Tekst checkpointa broj ${data.ordinal}`}
            />
          )}

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
              {data.canResize ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={styles.action}
                  aria-label={`${usesExpandedSize ? "Skupi" : "Raširi"} checkpoint broj ${data.ordinal}`}
                  title={
                    usesExpandedSize
                      ? "Skupi checkpoint"
                      : "Raširi checkpoint"
                  }
                  onClick={() =>
                    nodeActions?.setSizePreset(
                      data.checkpointId,
                      usesExpandedSize ? "compact" : "expanded",
                    )
                  }
                >
                  {usesExpandedSize ? (
                    <Minimize2 className="size-4" />
                  ) : (
                    <Maximize2 className="size-4" />
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

          <Handle
            id="left"
            type="source"
            position={Position.Left}
            className={styles.handle}
            aria-label="Leva tačka za povezivanje checkpointa"
          />
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            className={styles.handle}
            aria-label="Desna tačka za povezivanje checkpointa"
          />
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
