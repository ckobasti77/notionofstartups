"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { COMMAND_BLOCK_TEXT, currentWeekBounds, weekPulseFacts, type WeekPulseFact } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { useQueryResult } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { Block, type BlockStatus, useBlockRetry } from "./block";
import { useLastReady } from "./use-triage-data";

export type PulseViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  facts: ReadonlyArray<WeekPulseFact>;
  onOpen: () => void;
};

/**
 * „Puls nedelje" — prezentacija (izlog `komandni-centar`): jedini istaknut blok na
 * ekranu (DIZAJN-SMIRENJE §5.4) — Završeno · Novo · Zapelo i „Otvori Puls".
 */
export function PulseView({ status, onRetry, facts, onOpen }: PulseViewProps) {
  return (
    <Block
      id="cc-puls"
      title="Puls nedelje"
      status={status}
      errorText={COMMAND_BLOCK_TEXT.pulseError}
      onRetry={onRetry}
      skeletonRows={2}
    >
      <div className="rounded-lg border bg-card p-3">
        <dl className="grid grid-cols-3 gap-3">
          {facts.map((fact) => (
            <div key={fact.key} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{fact.label}</dt>
              <dd
                className={cn(
                  "text-xl font-semibold tabular-nums",
                  fact.key === "stuck" && fact.value > 0 && "text-warning-foreground dark:text-warning",
                )}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        <Button variant="ghost" size="sm" className="-mx-2 mt-2" onClick={onOpen}>
          Otvori Puls
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </Block>
  );
}

/**
 * Kontejner „Puls nedelje": `puls.getWeekly` za tekuću nedelju (granice računa
 * klijent, upit ne čita sat). Dok se `now` osvežava poslednji odgovor važi.
 */
export function PulseBlock({ startupId, now, onOpen }: { startupId: Id<"startups">; now: number; onOpen: () => void }) {
  const retry = useBlockRetry();
  const bounds = useMemo(() => currentWeekBounds(now), [now]);
  const result = useQueryResult(api.puls.getWeekly, { startupId, ...bounds });
  const data = useLastReady(result.data);
  const facts = useMemo(() => (data === undefined ? [] : weekPulseFacts(data.summary)), [data]);
  return (
    <PulseView
      status={result.failed ? "error" : data === undefined ? "loading" : "ready"}
      onRetry={retry}
      facts={facts}
      onOpen={onOpen}
    />
  );
}
