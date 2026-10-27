"use client";

import { cn } from "@/lib/utils";
import { tasksWord } from "@/lib/workspace";

export type PulseTone = "danger" | "warn" | "info" | "muted" | "success";

const TONE_CLASS: Record<PulseTone, string> = {
  danger: "bg-destructive",
  warn: "bg-warning",
  info: "bg-info",
  muted: "bg-muted-foreground/35",
  success: "bg-success",
};

export type PulseSegment = {
  key: string;
  label: string;
  count: number;
  tone: PulseTone;
  onSelect?: () => void;
  /** `undefined` kad filter nije aktivan; `false` zatamnjuje neizabrane. */
  active?: boolean;
};

/**
 * Sastav posla u jednoj traci od 10px — stanje se čita periferno, pre teksta.
 * Od PROSTOR K19 je samo u Pulsu nedelje; K21 je skinuo „otkucaj” na montiranju
 * (ukrasni pokret, DIZAJN-SMIRENJE U10) i framer-motion.
 */
export function PulseBar({
  segments,
  label,
  emptyLabel = "Nema otvorenih zadataka",
  className,
}: {
  segments: Array<PulseSegment>;
  label: string;
  emptyLabel?: string;
  className?: string;
}) {
  const visible = segments.filter((segment) => segment.count > 0);
  const total = visible.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return (
      <div
        role="img"
        aria-label={emptyLabel}
        title={emptyLabel}
        className={cn(
          "h-2.5 w-full rounded-sm bg-muted-foreground/20 md:h-2.5",
          className,
        )}
      />
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex w-full items-center gap-[2px]", className)}
    >
      {visible.map((segment) => {
        const description = `${segment.label}: ${segment.count} ${tasksWord(segment.count)}`;
        const bar = (
          <span
            aria-hidden="true"
            className={cn(
              "block h-3 w-full rounded-[3px] md:h-2.5",
              TONE_CLASS[segment.tone],
              segment.active === false && "opacity-40",
            )}
          />
        );

        const flexStyle = {
          flexGrow: segment.count,
          flexBasis: 0,
          minWidth: "4%",
        } as const;

        if (segment.onSelect === undefined) {
          return (
            <div
              key={segment.key}
              style={flexStyle}
              role="img"
              aria-label={description}
              title={description}
            >
              {bar}
            </div>
          );
        }

        return (
          <button
            key={segment.key}
            type="button"
            data-compact="true"
            style={flexStyle}
            aria-pressed={segment.active}
            aria-label={description}
            title={description}
            onClick={segment.onSelect}
            className="flex items-center rounded-sm py-2"
          >
            {bar}
          </button>
        );
      })}
    </div>
  );
}
