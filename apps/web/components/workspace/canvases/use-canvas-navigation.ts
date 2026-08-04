"use client";

import { useEffect, useMemo, useState } from "react";

const DISABLED_PAN_GUARD_CLASS = "__canvas_pan_guard_disabled__";
const DISABLED_WHEEL_GUARD_CLASS = "__canvas_wheel_guard_disabled__";

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], .nokey',
    ),
  );
}

export function isCanvasSpacePanActive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest('[data-canvas-space-pan="true"]') !== null
  );
}

export function useCanvasNavigation() {
  const [spacePressed, setSpacePressed] = useState(false);
  const [zoomModifierPressed, setZoomModifierPressed] = useState(false);

  useEffect(() => {
    const reset = () => {
      setSpacePressed(false);
      setZoomModifierPressed(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTextEntryTarget(event.target)) {
        setSpacePressed(true);
      }
      if (event.key === "Control" || event.key === "Meta") {
        setZoomModifierPressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
      if (event.key === "Control" || event.key === "Meta") {
        setZoomModifierPressed(event.ctrlKey || event.metaKey);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") reset();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  return useMemo(
    () => ({
      spacePressed,
      zoomModifierPressed,
      noPanClassName: spacePressed
        ? DISABLED_PAN_GUARD_CLASS
        : "nopan",
      noWheelClassName:
        spacePressed || zoomModifierPressed
          ? DISABLED_WHEEL_GUARD_CLASS
          : "nowheel",
    }),
    [spacePressed, zoomModifierPressed],
  );
}
