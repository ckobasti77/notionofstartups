"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prepareWithSegments } from "@chenglou/pretext";

import { cn } from "@/lib/utils";

import {
  layoutCircularText,
  type CircularTextObstacle,
} from "./circular-text-layout";
import orbitalStyles from "./orbital-node.module.css";

const DEFAULT_FONT = '500 13px "Geist", "Segoe UI", sans-serif';
const DEFAULT_LINE_HEIGHT = 20;

type CircularTextGeometry = {
  width: number;
  height: number;
  shapeWidth: number;
  shapeHeight: number;
  shapeOffsetLeft: number;
  shapeOffsetTop: number;
  obstacles: CircularTextObstacle[];
};

const EMPTY_GEOMETRY: CircularTextGeometry = {
  width: 0,
  height: 0,
  shapeWidth: 0,
  shapeHeight: 0,
  shapeOffsetLeft: 0,
  shapeOffsetTop: 0,
  obstacles: [],
};

function nearlyEqual(valueA: number, valueB: number) {
  return Math.abs(valueA - valueB) < 0.25;
}

function sameGeometry(
  geometryA: CircularTextGeometry,
  geometryB: CircularTextGeometry,
) {
  if (
    !nearlyEqual(geometryA.width, geometryB.width)
    || !nearlyEqual(geometryA.height, geometryB.height)
    || !nearlyEqual(geometryA.shapeWidth, geometryB.shapeWidth)
    || !nearlyEqual(geometryA.shapeHeight, geometryB.shapeHeight)
    || !nearlyEqual(geometryA.shapeOffsetLeft, geometryB.shapeOffsetLeft)
    || !nearlyEqual(geometryA.shapeOffsetTop, geometryB.shapeOffsetTop)
    || geometryA.obstacles.length !== geometryB.obstacles.length
  ) {
    return false;
  }

  return geometryA.obstacles.every((obstacle, index) => {
    const comparison = geometryB.obstacles[index];
    return (
      nearlyEqual(obstacle.left, comparison.left)
      && nearlyEqual(obstacle.top, comparison.top)
      && nearlyEqual(obstacle.right, comparison.right)
      && nearlyEqual(obstacle.bottom, comparison.bottom)
    );
  });
}

export function CircularTextFlow({
  text,
  children,
  className,
  contentClassName,
  ariaLabel,
}: {
  text: string;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] =
    useState<CircularTextGeometry>(EMPTY_GEOMETRY);
  const [font, setFont] = useState(DEFAULT_FONT);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const shell =
      viewport.closest<HTMLElement>("[data-circular-text-shell]")
      ?? viewport.parentElement;
    if (!shell) return;
    let cancelled = false;

    const update = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const scaleX = viewportRect.width > 0 && width > 0
        ? viewportRect.width / width
        : 1;
      const scaleY = viewportRect.height > 0 && height > 0
        ? viewportRect.height / height
        : scaleX;
      const obstacles = Array.from(
        shell.querySelectorAll<HTMLElement>("[data-circular-text-obstacle]"),
      ).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: (rect.left - viewportRect.left) / scaleX,
          top: (rect.top - viewportRect.top) / scaleY,
          right: (rect.right - viewportRect.left) / scaleX,
          bottom: (rect.bottom - viewportRect.top) / scaleY,
        };
      });
      const nextGeometry = {
        width,
        height,
        shapeWidth: shell.clientWidth,
        shapeHeight: shell.clientHeight,
        shapeOffsetLeft: (viewportRect.left - shellRect.left) / scaleX,
        shapeOffsetTop: (viewportRect.top - shellRect.top) / scaleY,
        obstacles,
      };
      setGeometry((current) => (
        sameGeometry(current, nextGeometry) ? current : nextGeometry
      ));

      const style = window.getComputedStyle(viewport);
      const nextFont =
        `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const nextLetterSpacing = Number.parseFloat(style.letterSpacing) || 0;
      const nextLineHeight =
        Number.parseFloat(style.lineHeight) || DEFAULT_LINE_HEIGHT;
      setFont((current) => current === nextFont ? current : nextFont);
      setLetterSpacing((current) => (
        nearlyEqual(current, nextLetterSpacing) ? current : nextLetterSpacing
      ));
      setLineHeight((current) => (
        nearlyEqual(current, nextLineHeight) ? current : nextLineHeight
      ));
    };

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(shell);
    shell
      .querySelectorAll<HTMLElement>("[data-circular-text-obstacle]")
      .forEach((element) => observer.observe(element));
    update();
    void document.fonts?.ready.then(() => {
      if (!cancelled) update();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  const prepared = useMemo(() => {
    if (typeof window === "undefined" || !text) return null;
    if (!("Segmenter" in Intl)) return null;
    try {
      return prepareWithSegments(text, font, {
        letterSpacing,
        whiteSpace: "pre-wrap",
      });
    } catch {
      return null;
    }
  }, [font, letterSpacing, text]);

  const layout = useMemo(() => {
    if (!prepared || geometry.width <= 0 || geometry.height <= 0) {
      return null;
    }
    return layoutCircularText({
      prepared,
      ...geometry,
      lineHeight,
      verticalAlign: children ? "start" : "center",
    });
  }, [children, geometry, lineHeight, prepared]);

  return (
    <div
      ref={viewportRef}
      className={cn(
        orbitalStyles.textViewport,
        "nowheel scrollbar-thin",
        className,
      )}
      tabIndex={0}
      role="region"
      aria-label={ariaLabel ?? "Tekst oblačića"}
    >
      <span className="sr-only">{text}</span>
      {layout ? (
        <div
          aria-hidden="true"
          className={cn(orbitalStyles.measuredText, contentClassName)}
          style={{ height: layout.height }}
        >
          {layout.lines.map((line) => (
            <span
              key={line.key}
              className={orbitalStyles.measuredLine}
              style={{
                left: line.left,
                top: line.top,
                width: line.width,
                lineHeight: `${lineHeight}px`,
              }}
            >
              {line.text || "\u00a0"}
            </span>
          ))}
        </div>
      ) : (
        <p
          aria-hidden="true"
          className={cn(orbitalStyles.fallbackText, contentClassName)}
        >
          {text}
        </p>
      )}
      {children ? <div className={orbitalStyles.flowChildren}>{children}</div> : null}
    </div>
  );
}
