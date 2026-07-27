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

import { layoutCircularText } from "./circular-text-layout";
import orbitalStyles from "./orbital-node.module.css";

const DEFAULT_FONT = '500 13px "Geist", "Segoe UI", sans-serif';
const DEFAULT_LINE_HEIGHT = 20;

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
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [font, setFont] = useState(DEFAULT_FONT);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const rect = viewport.getBoundingClientRect();
      setSize({
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      });
      const style = window.getComputedStyle(viewport);
      setFont(
        `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    void document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, []);

  const prepared = useMemo(() => {
    if (typeof window === "undefined" || !text) return null;
    if (!("Segmenter" in Intl)) return null;
    try {
      return prepareWithSegments(text, font, { whiteSpace: "pre-wrap" });
    } catch {
      return null;
    }
  }, [font, text]);

  const layout = useMemo(() => {
    if (!prepared || size.width <= 0 || size.height <= 0) {
      return null;
    }
    return layoutCircularText({
      prepared,
      width: size.width,
      height: size.height,
      lineHeight: DEFAULT_LINE_HEIGHT,
    });
  }, [prepared, size.height, size.width]);

  return (
    <div
      ref={viewportRef}
      className={cn(
        orbitalStyles.textViewport,
        "nowheel nodrag scrollbar-thin",
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
                lineHeight: `${DEFAULT_LINE_HEIGHT}px`,
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
