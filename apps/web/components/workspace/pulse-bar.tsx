"use client";

import { motion, useReducedMotion } from "framer-motion";

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
 * Potpisni element aplikacije: sastav posla u jednoj traci od 10px. Postoji da
 * bi se stanje pročitalo periferno, pre teksta — zato je sve oko nje tiho.
 * Ista komponenta služi i dnevnoj trijaži i nedeljnom Pulsu.
 */
export function PulseBar({
  segments,
  label,
  emptyLabel = "Nema otvorenih zadataka",
  pulseTone = "danger",
  className,
}: {
  segments: Array<PulseSegment>;
  label: string;
  emptyLabel?: string;
  /** Ton koji jednom „otkuca” na montiranju. `null` isključuje pokret. */
  pulseTone?: PulseTone | null;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
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
        const shouldBeat =
          pulseTone !== null &&
          segment.tone === pulseTone &&
          !prefersReducedMotion;

        const bar = (
          <motion.span
            aria-hidden="true"
            className={cn(
              "block h-3 w-full rounded-[3px] md:h-2.5",
              TONE_CLASS[segment.tone],
              segment.active === false && "opacity-40",
            )}
            {...(shouldBeat
              ? {
                  initial: { opacity: 0.55 },
                  animate: { opacity: [0.55, 1, 0.75, 1] },
                  transition: { duration: 0.9, ease: "easeOut" },
                }
              : {})}
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
