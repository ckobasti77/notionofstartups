"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { springTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

type ProgressRingProps = {
  /** 0…1 (van opsega se seče). */
  value: number;
  /** Prečnik u px. */
  size?: number;
  strokeWidth?: number;
  /** Šta prsten meri, za čitač ekrana (npr. „Završeno danas"). */
  label: string;
  /** Sadržaj u sredini (npr. „3/5"); čitač ekrana ga ne čita — ponovi ga u `valueText`. */
  children?: ReactNode;
  /** Tekst vrednosti za čitač ekrana (npr. „3 od 5"); podrazumevano procenat. */
  valueText?: string;
  className?: string;
};

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Prsten napretka (PLAN §6, tačka 5): puni se `smooth` springom, pri prvom
 * prikazu od nule. Smanjen pokret: vrednost se postavlja odmah.
 */
export function ProgressRing({
  value,
  size = 44,
  strokeWidth = 4,
  label,
  children,
  valueText,
  className,
}: ProgressRingProps) {
  const progress = clampUnit(value);
  const arcRef = useRef<SVGCircleElement>(null);
  const play = useTweenSlots();
  const radius = (size - strokeWidth) / 2;

  useLayoutEffect(() => {
    const arc = arcRef.current;
    if (!arc) return;
    play("arc", ({ gsap, reduced }) => {
      // Na nuli se luk sakrije: zaobljen kraj bi inače ostavio tačku.
      const target = { strokeDashoffset: 1 - progress, opacity: progress > 0 ? 1 : 0 };
      return reduced ? gsap.set(arc, target) : gsap.to(arc, { ...target, ...springTween("smooth") });
    });
  }, [progress, play]);

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuetext={valueText}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          className="stroke-primary"
          style={{ strokeDashoffset: 1, opacity: 0 }}
        />
      </svg>
      {children ? <span className="absolute inset-0 grid place-items-center">{children}</span> : null}
    </span>
  );
}
