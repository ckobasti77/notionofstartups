import { taskCheckpointOrdinal } from "./canvases/task-checkpoint-layout";

type OrderableTaskCheckpoint = {
  completed: boolean;
  ordinal?: number | null;
};

export function orderTaskCheckpointsForEditor<
  TCheckpoint extends OrderableTaskCheckpoint,
>(checkpoints: TCheckpoint[]) {
  return checkpoints
    .map((checkpoint, index) => ({
      checkpoint,
      ordinal: taskCheckpointOrdinal(checkpoint.ordinal, index),
    }))
    .sort(
      (left, right) =>
        Number(left.checkpoint.completed) -
          Number(right.checkpoint.completed) ||
        left.ordinal - right.ordinal,
    );
}
