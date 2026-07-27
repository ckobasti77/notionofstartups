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

export function ellipseLineBounds({
  width,
  height,
  lineCenterY,
  horizontalInset = 9,
  verticalInset = 7,
}: {
  width: number;
  height: number;
  lineCenterY: number;
  horizontalInset?: number;
  verticalInset?: number;
}) {
  const radiusX = Math.max(1, width / 2 - horizontalInset);
  const radiusY = Math.max(1, height / 2 - verticalInset);
  const distance = Math.abs(lineCenterY - height / 2);
  const normalized = Math.min(1, distance / radiusY);
  const halfChord = radiusX * Math.sqrt(Math.max(0, 1 - normalized ** 2));
  const availableWidth = Math.max(32, halfChord * 2);

  return {
    left: Math.max(0, width / 2 - availableWidth / 2),
    width: Math.min(width, availableWidth),
  };
}

export function layoutCircularText({
  prepared,
  width,
  height,
  lineHeight,
}: {
  prepared: PreparedTextWithSegments;
  width: number;
  height: number;
  lineHeight: number;
}): CircularTextLayout {
  const safeWidth = Math.max(80, width);
  const safeHeight = Math.max(lineHeight * 3, height);
  const pageHeight = safeHeight;
  const lines: CircularTextLine[] = [];
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let page = 0;
  let y = 8;
  let safety = 0;

  while (safety < 20_000) {
    safety += 1;
    const lineCenterY = y + lineHeight / 2;
    if (lineCenterY > safeHeight - 8) {
      page += 1;
      y = 8;
      continue;
    }

    const bounds = ellipseLineBounds({
      width: safeWidth,
      height: safeHeight,
      lineCenterY,
    });
    const range = layoutNextLineRange(prepared, cursor, bounds.width);
    if (range === null) break;
    const line = materializeLineRange(prepared, range);

    lines.push({
      key: `${page}:${cursor.segmentIndex}:${cursor.graphemeIndex}`,
      text: line.text,
      left: Math.max(bounds.left, (safeWidth - line.width) / 2),
      top: page * pageHeight + y,
      width: Math.min(line.width, bounds.width),
      page,
    });

    cursor = range.end;
    y += lineHeight;
  }

  const pageCount = Math.max(1, page + 1);
  const lastLine = lines.at(-1);
  return {
    lines,
    pageCount,
    height: Math.max(
      lineHeight,
      lastLine ? lastLine.top + lineHeight + 8 : lineHeight,
    ),
  };
}
