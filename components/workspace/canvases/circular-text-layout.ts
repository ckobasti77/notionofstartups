import {
  layoutNextLineRange,
  materializeLineRange,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

export type CircularTextLine = {
  key: string;
  text: string;
  left: number;
  top: number;
  width: number;
  page: number;
};

export type CircularTextLayout = {
  height: number;
  lines: CircularTextLine[];
  pageCount: number;
};

export type CircularTextObstacle = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  shape?: "rectangle" | "ellipse";
};

type CircularTextSlot = {
  left: number;
  top: number;
  width: number;
};

export function ellipseLineBounds({
  width,
  height,
  lineCenterY,
  horizontalInset = 14,
  verticalInset = 14,
  shapePower = 2.35,
}: {
  width: number;
  height: number;
  lineCenterY: number;
  horizontalInset?: number;
  verticalInset?: number;
  shapePower?: number;
}) {
  const radiusX = Math.max(1, width / 2 - horizontalInset);
  const radiusY = Math.max(1, height / 2 - verticalInset);
  const distance = Math.abs(lineCenterY - height / 2);
  const normalized = Math.min(1, distance / radiusY);
  const power = Math.max(2, shapePower);
  const halfChord =
    radiusX
    * Math.pow(Math.max(0, 1 - normalized ** power), 1 / power);
  const availableWidth = Math.max(0, halfChord * 2);

  return {
    left: Math.max(0, width / 2 - availableWidth / 2),
    width: Math.min(width, availableWidth),
  };
}

export function availableLineSegments({
  width,
  height,
  lineTop,
  lineHeight,
  shapeWidth = width,
  shapeHeight = height,
  shapeOffsetLeft = 0,
  shapeOffsetTop = 0,
  obstacles = [],
  obstacleGap = 7,
}: {
  width: number;
  height: number;
  lineTop: number;
  lineHeight: number;
  shapeWidth?: number;
  shapeHeight?: number;
  shapeOffsetLeft?: number;
  shapeOffsetTop?: number;
  obstacles?: CircularTextObstacle[];
  obstacleGap?: number;
}) {
  const shapeBounds = ellipseLineBounds({
    width: shapeWidth,
    height: shapeHeight,
    lineCenterY: shapeOffsetTop + lineTop + lineHeight / 2,
  });
  const shapeLeft = shapeBounds.left - shapeOffsetLeft;
  const shapeRight = shapeLeft + shapeBounds.width;
  let segments = [{
    left: Math.max(0, shapeLeft),
    right: Math.min(width, shapeRight),
  }].filter((segment) => segment.right > segment.left);
  const lineBottom = lineTop + lineHeight;

  for (const obstacle of obstacles) {
    let blockedLeft: number;
    let blockedRight: number;

    if (obstacle.shape === "ellipse") {
      const centerX = (obstacle.left + obstacle.right) / 2;
      const centerY = (obstacle.top + obstacle.bottom) / 2;
      const radiusX =
        Math.max(1, (obstacle.right - obstacle.left) / 2) + obstacleGap;
      const radiusY =
        Math.max(1, (obstacle.bottom - obstacle.top) / 2)
        + obstacleGap
        + lineHeight / 2;
      const lineCenterY = lineTop + lineHeight / 2;
      const normalized = Math.abs(lineCenterY - centerY) / radiusY;
      if (normalized >= 1) continue;
      const shapePower = 2.35;
      const halfChord =
        radiusX
        * Math.pow(
          Math.max(0, 1 - normalized ** shapePower),
          1 / shapePower,
        );
      blockedLeft = centerX - halfChord;
      blockedRight = centerX + halfChord;
    } else {
      if (
        obstacle.bottom + obstacleGap <= lineTop
        || obstacle.top - obstacleGap >= lineBottom
      ) {
        continue;
      }
      blockedLeft = obstacle.left - obstacleGap;
      blockedRight = obstacle.right + obstacleGap;
    }

    segments = segments.flatMap((segment) => {
      if (
        blockedRight <= segment.left
        || blockedLeft >= segment.right
      ) {
        return [segment];
      }

      const remaining = [];
      if (blockedLeft > segment.left) {
        remaining.push({
          left: segment.left,
          right: Math.min(blockedLeft, segment.right),
        });
      }
      if (blockedRight < segment.right) {
        remaining.push({
          left: Math.max(blockedRight, segment.left),
          right: segment.right,
        });
      }
      return remaining;
    });
  }

  return segments
    .map((segment) => ({
      left: segment.left,
      width: segment.right - segment.left,
    }))
    .filter((segment) => segment.width > 0);
}

function safeLineSegments(
  segments: Array<{ left: number; width: number }>,
) {
  return segments
    .filter((segment) => segment.width >= 48)
    .sort((segmentA, segmentB) => segmentA.left - segmentB.left)
    .map((segment) => {
      const paintSafety = Math.min(3, segment.width * 0.04);
      return {
        left: segment.left + paintSafety / 2,
        width: segment.width - paintSafety,
      };
    });
}

function buildLineSlots({
  width,
  height,
  lineHeight,
  shapeWidth,
  shapeHeight,
  shapeOffsetLeft,
  shapeOffsetTop,
  obstacles,
}: {
  width: number;
  height: number;
  lineHeight: number;
  shapeWidth: number;
  shapeHeight: number;
  shapeOffsetLeft: number;
  shapeOffsetTop: number;
  obstacles: CircularTextObstacle[];
}) {
  const slots: CircularTextSlot[] = [];
  const verticalPadding = 7;

  for (
    let top = verticalPadding;
    top + lineHeight <= height - verticalPadding + 0.5;
    top += lineHeight
  ) {
    const segments = safeLineSegments(
      availableLineSegments({
        width,
        height,
        lineTop: top,
        lineHeight,
        shapeWidth,
        shapeHeight,
        shapeOffsetLeft,
        shapeOffsetTop,
        obstacles,
      }),
    );
    slots.push(...segments.map((segment) => ({ ...segment, top })));
  }

  return slots;
}

function isTextExhausted(
  prepared: PreparedTextWithSegments,
  cursor: LayoutCursor,
) {
  return layoutNextLineRange(
    prepared,
    cursor,
    Number.POSITIVE_INFINITY,
  ) === null;
}

function findCenteredStart(
  prepared: PreparedTextWithSegments,
  slots: CircularTextSlot[],
  lineHeight: number,
  height: number,
) {
  let best:
    | { startIndex: number; score: number }
    | null = null;

  for (let startIndex = 0; startIndex < slots.length; startIndex += 1) {
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    let lineCount = 0;

    for (
      let slotIndex = startIndex;
      slotIndex < slots.length;
      slotIndex += 1
    ) {
      const range = layoutNextLineRange(
        prepared,
        cursor,
        slots[slotIndex].width,
      );
      if (range === null) break;
      cursor = range.end;
      lineCount += 1;
    }

    if (lineCount === 0 || !isTextExhausted(prepared, cursor)) continue;
    const lastSlot = slots[startIndex + lineCount - 1];
    const blockCenter =
      (slots[startIndex].top + lastSlot.top + lineHeight) / 2;
    const score =
      Math.abs(blockCenter - height / 2)
      + lineCount * 0.001;

    if (!best || score < best.score) {
      best = { startIndex, score };
    }
  }

  return best?.startIndex ?? 0;
}

export function layoutCircularText({
  prepared,
  width,
  height,
  lineHeight,
  shapeWidth = width,
  shapeHeight = height,
  shapeOffsetLeft = 0,
  shapeOffsetTop = 0,
  obstacles = [],
  verticalAlign = "center",
}: {
  prepared: PreparedTextWithSegments;
  width: number;
  height: number;
  lineHeight: number;
  shapeWidth?: number;
  shapeHeight?: number;
  shapeOffsetLeft?: number;
  shapeOffsetTop?: number;
  obstacles?: CircularTextObstacle[];
  verticalAlign?: "start" | "center";
}): CircularTextLayout {
  const safeWidth = Math.max(80, width);
  const safeHeight = Math.max(lineHeight * 3, height);
  const pageHeight = safeHeight;
  const slots = buildLineSlots({
    width: safeWidth,
    height: safeHeight,
    lineHeight,
    shapeWidth: Math.max(safeWidth, shapeWidth),
    shapeHeight: Math.max(safeHeight, shapeHeight),
    shapeOffsetLeft,
    shapeOffsetTop,
    obstacles,
  });
  const lines: CircularTextLine[] = [];
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let page = 0;
  let exhausted = false;
  let safety = 0;
  let startIndex =
    verticalAlign === "center"
      ? findCenteredStart(prepared, slots, lineHeight, safeHeight)
      : 0;

  while (slots.length > 0 && safety < 20_000 && !exhausted) {
    safety += 1;

    for (
      let slotIndex = startIndex;
      slotIndex < slots.length;
      slotIndex += 1
    ) {
      const slot = slots[slotIndex];
      const range = layoutNextLineRange(prepared, cursor, slot.width);
      if (range === null) {
        exhausted = true;
        break;
      }
      const line = materializeLineRange(prepared, range);

      lines.push({
        key: `${page}:${cursor.segmentIndex}:${cursor.graphemeIndex}`,
        text: line.text,
        left: slot.left + Math.max(0, (slot.width - line.width) / 2),
        top: page * pageHeight + slot.top,
        width: Math.min(line.width, slot.width),
        page,
      });
      cursor = range.end;
    }

    if (!exhausted) {
      exhausted = isTextExhausted(prepared, cursor);
    }
    if (!exhausted) {
      page += 1;
      startIndex = 0;
    }
  }

  const lastPage = lines.at(-1)?.page;
  const pageCount = lastPage === undefined ? 1 : lastPage + 1;
  const lastLine = lines.at(-1);
  return {
    lines,
    pageCount,
    height: Math.max(
      lineHeight,
      lastLine ? lastLine.top + lineHeight + 7 : lineHeight,
    ),
  };
}
