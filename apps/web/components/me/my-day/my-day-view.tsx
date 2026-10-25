"use client";

import { useId, useRef, useState } from "react";
import { ChevronRight, Coffee, PartyPopper } from "lucide-react";
import { formatDayHeading } from "@devotion/shared";

import { Collapse } from "@/components/motion/collapse";
import { NumberRoll } from "@/components/motion/number-roll";
import { ProgressRing } from "@/components/motion/progress-ring";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { useEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { TaskRow, type TaskRowData } from "../task-row";
import { daySummary, type MyDayModel, type MyDaySectionModel } from "./my-day-model";
import { MyDaySkeleton } from "./my-day-skeleton";

export type MyDayViewState = { status: "loading" } | { status: "ready"; model: MyDayModel };

export type MyDayViewProps = {
  now: number;
  firstName: string | null;
  state: MyDayViewState;
  /** Otvori stavku; bez rukovaoca (ili kad vrati `false` za red) red je samo za čitanje. */
  onOpen: (row: TaskRowData) => void;
  canOpen: (row: TaskRowData) => boolean;
  /** „Moji zadaci" iz praznog stanja kad je sve završeno. */
  onOpenTasks: () => void;
};

/**
 * Moj dan (v1, K08): dan i datum, pozdrav sa sažetkom, prsten napretka i
 * sekcije po P5 iz `@devotion/shared` (prazne se preskaču; Blokirano i Završeno
 * danas su sklopljene). K10 dodaje kvačicu, radnje, brzi unos i desnu kolonu.
 */
export function MyDayView({ now, firstName, state, onOpen, canOpen, onOpenTasks }: MyDayViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEnter(listRef, { key: state.status });

  if (state.status === "loading") return <MyDaySkeleton />;

  const { model } = state;
  const visible = model.sections.filter((section) => section.rows.length > 0);
  const openSections = visible.filter((section) => section.id !== "doneToday");
  const doneToday = model.counts.doneToday;
  const { done, total } = model.progress;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <header data-workspace-enter className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{formatDayHeading(now)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Moj dan</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {firstName ? `Zdravo, ${firstName}. ` : ""}
            {daySummary(model.counts)}
          </p>
        </div>
        {total > 0 ? (
          <ProgressRing
            value={done / total}
            size={52}
            strokeWidth={5}
            label="Napredak dana"
            valueText={done === total ? "Dan je završen." : `${done} od ${total} završeno`}
            className="shrink-0"
          >
            <span className="text-[0.6875rem] font-semibold tabular-nums">
              <NumberRoll value={done} />/{total}
            </span>
          </ProgressRing>
        ) : null}
      </header>

      <div ref={listRef} data-workspace-enter className="mt-6 space-y-6">
        {openSections.length === 0 ? (
          doneToday > 0 ? (
            <EmptyState
              icon={PartyPopper}
              title="Sve za danas je završeno"
              description={`Završeno danas: ${doneToday}. Pogledaj šta je sledeće.`}
              action={
                <Button type="button" variant="outline" onClick={onOpenTasks}>
                  Moji zadaci
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Coffee} title="Danas je mirno" description="Nema rokova ni planova za danas." />
          )
        ) : null}

        {visible.map((section) => (
          <TaskSection key={section.id} section={section} now={now} onOpen={onOpen} canOpen={canOpen} />
        ))}

        {model.capped ? (
          <p className="text-xs text-muted-foreground">
            Prikazan je deo zadataka. Sve nađi u Mojim zadacima.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TaskSection({
  section,
  now,
  onOpen,
  canOpen,
}: {
  section: MyDaySectionModel;
  now: number;
  onOpen: (row: TaskRowData) => void;
  canOpen: (row: TaskRowData) => boolean;
}) {
  const headingId = useId();
  const listId = useId();
  const [open, setOpen] = useState(!section.collapsedByDefault);
  const count = section.rows.length;

  const list = (
    <ul className="space-y-0.5">
      {section.rows.map((row) => (
        <li key={row.key}>
          <TaskRow row={row} now={now} onOpen={canOpen(row) ? onOpen : undefined} />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby={headingId}>
      {section.collapsedByDefault ? (
        <h2 id={headingId} className="mb-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-3.5 transition-transform", open && "rotate-90")}
            />
            {section.title}
            <span className="font-mono tabular-nums">{count}</span>
          </button>
        </h2>
      ) : (
        <h2
          id={headingId}
          className={cn(
            "mb-1 flex items-center gap-2 px-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em]",
            section.id === "overdue" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {section.title}
          <span className="font-mono tabular-nums">{count}</span>
        </h2>
      )}
      {section.collapsedByDefault ? (
        <Collapse open={open} id={listId}>
          {list}
        </Collapse>
      ) : (
        list
      )}
    </section>
  );
}
