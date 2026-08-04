"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarClock, CircleDashed, Flame } from "lucide-react";

import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  classifyDeadline,
  deadlineAriaLabel,
  deadlineLabel,
  type DeadlineUrgency,
} from "@/lib/deadline";
import type { TaskStatus } from "@/lib/workspace";

type BadgeVariant = "destructive" | "warning" | "info" | "outline" | "success";

/**
 * Tekst na tintiranoj podlozi mešamo ka `--foreground` da bismo dostigli WCAG AA
 * (izmereno: 4.2:1 → 5.2:1 u svetloj, 4.4:1 → 5.3:1 u tamnoj temi). Jedan izraz
 * radi u obe teme jer se `--foreground` obrće sa temom.
 */
function readableToken(token: string) {
  return `color-mix(in oklab, var(${token}) 85%, var(--foreground))`;
}

const URGENCY_STYLE: Record<
  DeadlineUrgency,
  {
    variant: BadgeVariant;
    icon: typeof Flame;
    className?: string;
    color?: string;
  }
> = {
  overdue: {
    variant: "destructive",
    icon: Flame,
    color: readableToken("--destructive"),
  },
  today: { variant: "warning", icon: CalendarClock },
  tomorrow: { variant: "info", icon: CalendarDays },
  week: { variant: "info", icon: CalendarDays },
  later: { variant: "outline", icon: CalendarDays, className: "text-muted-foreground" },
  none: { variant: "outline", icon: CircleDashed, className: "text-muted-foreground" },
  done: {
    variant: "success",
    icon: CalendarDays,
    color: readableToken("--success"),
  },
};

/** Nivoi koji se prikazuju i na gustim površinama (stablo, kanvas čvorovi). */
const LOUD_URGENCIES = new Set<DeadlineUrgency>(["overdue", "today"]);

export type DeadlineBadgeProps = {
  dueDate: number | null;
  taskStatus: TaskStatus | null;
  /** Prosleđuje se kad više redova deli isti trenutak — inače se čita jednom. */
  now?: number;
  size?: "sm" | "md";
  showIcon?: boolean;
  /** Na gustim površinama prikazuje samo ono što gori ili je za danas. */
  calmHidden?: boolean;
  className?: string;
};

/**
 * Jedina oznaka roka u aplikaciji. Boja, ikona i tekst nose isto značenje, pa
 * poruka preživi i sivu štampu i daltonizam; tekst je u monospace ritmu da se
 * kolona skenira, a ne čita.
 */
export function DeadlineBadge({
  dueDate,
  taskStatus,
  now,
  size = "md",
  showIcon = true,
  calmHidden = false,
  className,
}: DeadlineBadgeProps) {
  const [fallbackNow] = useState(() => Date.now());
  const resolvedNow = now ?? fallbackNow;

  const classification = useMemo(
    () => classifyDeadline({ dueDate, taskStatus, now: resolvedNow }),
    [dueDate, taskStatus, resolvedNow],
  );

  if (calmHidden && !LOUD_URGENCIES.has(classification.urgency)) return null;
  if (classification.urgency === "none" && size === "sm") return null;

  const style = URGENCY_STYLE[classification.urgency];
  const Icon = style.icon;
  const label = deadlineLabel(classification, dueDate);
  const ariaLabel = deadlineAriaLabel(classification, dueDate);

  const content = (
    <>
      {showIcon ? <Icon aria-hidden="true" /> : null}
      <span className="font-mono tabular-nums">{label}</span>
    </>
  );

  const badgeClassName = cn(
    badgeVariants({ variant: style.variant }),
    style.className,
    size === "sm" && "h-4 gap-0.5 px-1.5 text-[0.625rem]",
    className,
  );

  const colorStyle =
    style.color === undefined ? undefined : { color: style.color };

  if (dueDate === null) {
    return (
      <span
        data-slot="badge"
        className={badgeClassName}
        style={colorStyle}
        aria-label={ariaLabel}
      >
        {content}
      </span>
    );
  }

  return (
    <time
      data-slot="badge"
      className={badgeClassName}
      style={colorStyle}
      dateTime={new Date(dueDate).toISOString()}
      aria-label={ariaLabel}
    >
      {content}
    </time>
  );
}
