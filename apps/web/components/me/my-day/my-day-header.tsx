"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CalendarPlus, Check, Plus } from "lucide-react";
import { formatDayHeading, type MyDaySectionId } from "@devotion/shared";

import { NumberRoll } from "@/components/motion/number-roll";
import { ProgressRing } from "@/components/motion/progress-ring";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { reducedFade, springTween, useTweenSlots } from "@/lib/motion";

import { daySummary, progressValueText } from "./my-day-model";

export type MyDayHeaderProps = {
  now: number;
  firstName: string | null;
  progress: { done: number; total: number };
  counts: Record<MyDaySectionId, number>;
  onQuickAdd: () => void;
  onPlanDay: () => void;
};

/**
 * Zaglavlje Moj dan (plan K07 §1.2): dan i datum, naslov, pozdrav sa
 * sažetkom, prsten napretka (puni se `smooth`, broj se kotrlja; pri 100 % u
 * centru iskoči kvačica — trenutak uspeha) i dve glavne radnje.
 */
export function MyDayHeader({ now, firstName, progress, counts, onQuickAdd, onPlanDay }: MyDayHeaderProps) {
  const { done, total } = progress;
  const complete = total > 0 && done >= total;
  // Kvačica u prstenu iskače samo pri PRELAZU na 100 % (ne pri svakom otvaranju
  // već završenog dana) — izvedeno stanje: „bio je nezavršen dok sam gledao".
  const [sawIncomplete, setSawIncomplete] = useState(!complete);
  if (!complete && !sawIncomplete) setSawIncomplete(true);
  return (
    <header data-workspace-enter className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{formatDayHeading(now)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Moj dan</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {firstName ? `Zdravo, ${firstName}. ` : ""}
            {daySummary(counts)}
          </p>
        </div>
        {total > 0 ? (
          <ProgressRing
            value={done / total}
            size={56}
            strokeWidth={5}
            label="Napredak dana"
            valueText={progressValueText(progress)}
            className="shrink-0"
          >
            {complete ? (
              <RingCheck animate={sawIncomplete} />
            ) : (
              <span className="text-xs font-semibold tabular-nums">
                <NumberRoll value={done} />/{total}
              </span>
            )}
          </ProgressRing>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onPlanDay} className="h-9">
          <CalendarPlus aria-hidden="true" />
          Isplaniraj dan
        </Button>
        <Button type="button" onClick={onQuickAdd} className="h-9" aria-keyshortcuts="Q">
          <Plus aria-hidden="true" />
          Brzi unos
          <span className="hidden sm:inline-flex" aria-hidden="true">
            <Kbd>Q</Kbd>
          </span>
        </Button>
      </div>
    </header>
  );
}

/** Kvačica u centru prstena: iskoči `bouncy` kad se dan upravo završi. */
function RingCheck({ animate }: { animate: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const play = useTweenSlots();
  const [animateOnMount] = useState(animate);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !animateOnMount) return;
    play("pop", ({ gsap, reduced }) =>
      reduced
        ? gsap.fromTo(element, { opacity: 0 }, { opacity: 1, ...reducedFade() })
        : gsap.fromTo(element, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, ...springTween("bouncy") }),
    );
  }, [play, animateOnMount]);
  return (
    <span ref={ref} className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
      <Check className="size-4" aria-hidden="true" />
    </span>
  );
}
