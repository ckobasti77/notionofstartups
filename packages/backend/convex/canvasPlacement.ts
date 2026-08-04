export const DEFAULT_CANVAS_NODE_WIDTH = 288;
export const DEFAULT_CANVAS_NODE_HEIGHT = 196;

const CANVAS_NODE_GAP = 32;
const AUTOMATIC_COLUMNS = 4;
const MAX_AUTOMATIC_POSITION_ATTEMPTS = 2_048;

export type CanvasPlacementBox = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

function positiveDimension(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function overlapsWithGap(
  first: CanvasPlacementBox,
  second: CanvasPlacementBox,
) {
  const firstWidth = positiveDimension(
    first.width,
    DEFAULT_CANVAS_NODE_WIDTH,
  );
  const firstHeight = positiveDimension(
    first.height,
    DEFAULT_CANVAS_NODE_HEIGHT,
  );
  const secondWidth = positiveDimension(
    second.width,
    DEFAULT_CANVAS_NODE_WIDTH,
  );
  const secondHeight = positiveDimension(
    second.height,
    DEFAULT_CANVAS_NODE_HEIGHT,
  );

  return !(
    first.x + firstWidth + CANVAS_NODE_GAP <= second.x ||
    second.x + secondWidth + CANVAS_NODE_GAP <= first.x ||
    first.y + firstHeight + CANVAS_NODE_GAP <= second.y ||
    second.y + secondHeight + CANVAS_NODE_GAP <= first.y
  );
}

export function hasExactCanvasPositionCollision(
  first: Pick<CanvasPlacementBox, "x" | "y">,
  second: Pick<CanvasPlacementBox, "x" | "y">,
) {
  return first.x === second.x && first.y === second.y;
}

export function findAvailableCanvasPosition(
  occupied: readonly CanvasPlacementBox[],
  preferredSize: Pick<CanvasPlacementBox, "width" | "height"> = {},
) {
  const validOccupied = occupied.filter(
    (placement) =>
      Number.isFinite(placement.x) && Number.isFinite(placement.y),
  );
  const horizontalStep =
    DEFAULT_CANVAS_NODE_WIDTH + CANVAS_NODE_GAP * 2;
  const verticalStep =
    DEFAULT_CANVAS_NODE_HEIGHT + CANVAS_NODE_GAP * 2;
  const attemptCount = Math.min(
    MAX_AUTOMATIC_POSITION_ATTEMPTS,
    Math.max(64, (validOccupied.length + 1) * 8),
  );

  for (let index = 0; index < attemptCount; index += 1) {
    const candidate = {
      x: (index % AUTOMATIC_COLUMNS) * horizontalStep,
      y: Math.floor(index / AUTOMATIC_COLUMNS) * verticalStep,
      width: positiveDimension(
        preferredSize.width,
        DEFAULT_CANVAS_NODE_WIDTH,
      ),
      height: positiveDimension(
        preferredSize.height,
        DEFAULT_CANVAS_NODE_HEIGHT,
      ),
    };
    if (
      validOccupied.every(
        (placement) => !overlapsWithGap(candidate, placement),
      )
    ) {
      return { x: candidate.x, y: candidate.y };
    }
  }

  return {
    x: 0,
    y: (validOccupied.length + 1) * verticalStep,
  };
}
