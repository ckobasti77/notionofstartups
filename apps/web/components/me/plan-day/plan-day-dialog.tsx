"use client";

import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CalendarCheck2, Plus, RefreshCw, Undo2, X } from "lucide-react";

import { MotionDialog } from "@/components/motion/motion-dialog";
import { NumberRoll } from "@/components/motion/number-roll";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFlip } from "@/lib/motion";

import { FLIP_MAX_ROWS } from "../my-day/my-day-model";
import { cn } from "@/lib/utils";

import { DueChip } from "../due-chip";
import { StartupChip } from "../startup-chip";
import { groupSuggestions, type PlanDayCarryRow, type PlanDayModel, type PlanDaySuggestionRow } from "./plan-day-model";

export type PlanDayState = { status: "loading" } | { status: "error"; retry: () => void } | { status: "ready"; model: PlanDayModel };

export type PlanDayDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now: number;
  state: PlanDayState;
  onAdd: (row: PlanDaySuggestionRow["row"]) => void;
  onCarryOver: (keys: string[]) => void;
  onDismiss: (keys: string[]) => void;
};

/**
 * „Isplaniraj dan" (plan K07 §2): „Preneto od ranije" (Vrati / Skloni / Vrati
 * sve u danas) i predlozi po razlogu sa „+". Ništa se ne prenosi samo.
 * Tastatura: ↑/↓ kroz redove, Enter ili Space dodaje (vraća), Delete sklanja.
 * Dodata stavka izlazi iz liste, ostali se Flip-om razmaknu; brojač se kotrlja.
 */
export function PlanDayDialog({ open, onOpenChange, now, state, onAdd, onCarryOver, onDismiss }: PlanDayDialogProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const { capture } = useFlip(listRef);
  const total =
    state.status === "ready" ? state.model.carryOver.length + state.model.suggestions.length : 0;
  // Red koji nestane posle radnje: fokus ide na red koji je stao na njegovo mesto.
  const refocusIndex = useRef<number | null>(null);
  const runWithFlip = (event: { currentTarget: EventTarget } | undefined, run: () => void) => {
    const root = listRef.current;
    if (root && event?.currentTarget instanceof HTMLElement && root.contains(event.currentTarget)) {
      const row = event.currentTarget.closest("[data-flip-id]");
      const primaries = Array.from(root.querySelectorAll("[data-plan-primary]"));
      const index = row ? primaries.findIndex((element) => row.contains(element)) : -1;
      refocusIndex.current = index === -1 ? null : index;
    }
    if (total <= FLIP_MAX_ROWS) capture();
    run();
  };
  // Layout efekat: pre Radix FocusScope-a (MutationObserver) koji bi fokus vratio na sam dijalog.
  useLayoutEffect(() => {
    const index = refocusIndex.current;
    const root = listRef.current;
    if (index === null || !root) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      // Korisnik je već negde drugde (npr. „Gotovo"): fokus se ne otima.
      if (!root.contains(active)) refocusIndex.current = null;
      return;
    }
    refocusIndex.current = null;
    const primaries = root.querySelectorAll<HTMLElement>("[data-plan-primary]");
    (primaries[Math.min(index, primaries.length - 1)] ?? root.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  });
  const full = state.status === "ready" && state.model.plannedCount >= state.model.max;
  const fullId = useId();

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const root = listRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-plan-primary]"));
    // Fokus može biti i na „Skloni" ili „Vrati sve": red se nalazi po najbližem redu.
    const active = document.activeElement;
    const activeRow = active instanceof HTMLElement ? active.closest("[data-flip-id]") : null;
    const index = targets.findIndex((element) => element === active || (activeRow !== null && activeRow.contains(element)));
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    if (next < 0 || next >= targets.length) return;
    event.preventDefault();
    targets[next].focus();
  };

  return (
    <MotionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Isplaniraj dan"
      description="Izaberi šta radiš danas. Ništa se ne prenosi samo."
      width="36rem"
      position="top"
      // Prvi red („Vrati" ili „+"), da tastatura odmah radi u listi; bez redova Radix bira sam.
      initialFocus={() => listRef.current?.querySelector<HTMLElement>("[data-plan-primary]") ?? null}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {state.status === "ready" ? (
              <>
                U planu: <NumberRoll value={state.model.plannedCount} className="font-semibold text-foreground" /> od{" "}
                {state.model.max}
              </>
            ) : null}
          </p>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Gotovo
          </Button>
        </div>
      }
    >
      {state.status === "loading" ? (
        <div role="status" aria-label="Učitavanje predloga" className="space-y-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="flex flex-col items-start gap-3 py-2">
          <p className="text-sm text-muted-foreground">Predlozi se ne mogu učitati.</p>
          <Button type="button" variant="outline" onClick={state.retry}>
            <RefreshCw aria-hidden="true" />
            Pokušaj ponovo
          </Button>
        </div>
      ) : (
        <div ref={listRef} onKeyDown={onListKeyDown} className="space-y-5">
          {state.model.carryOver.length > 0 ? (
            <PlanSection
              title="Preneto od ranije"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  aria-disabled={full || undefined}
                  aria-describedby={full ? fullId : undefined}
                  onClick={(event) => {
                    if (!full) runWithFlip(event, () => onCarryOver(state.model.carryOver.map((item) => item.row.key)));
                  }}
                >
                  <Undo2 aria-hidden="true" />
                  Vrati sve u danas
                </Button>
              }
            >
              {state.model.carryOver.map((item) => (
                <CarryRow
                  key={item.row.key}
                  item={item}
                  now={now}
                  full={full ? fullId : null}
                  onReturn={(event) => runWithFlip(event, () => onCarryOver([item.row.key]))}
                  onDismiss={(event) => runWithFlip(event, () => onDismiss([item.row.key]))}
                />
              ))}
            </PlanSection>
          ) : null}

          {state.model.suggestions.length > 0 ? (
            groupSuggestions(state.model.suggestions).map((group, index) => (
              <PlanSection key={group.reason} title={index === 0 ? `Predlozi · ${group.label}` : group.label}>
                {group.rows.map((item) => (
                  <SuggestionRow
                    key={item.row.key}
                    item={item}
                    now={now}
                    full={full ? fullId : null}
                    onAdd={(event) => runWithFlip(event, () => onAdd(item.row))}
                  />
                ))}
              </PlanSection>
            ))
          ) : state.model.carryOver.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                <CalendarCheck2 className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">Nema predloga. Sve važno je već u planu.</p>
            </div>
          ) : null}

          {full ? (
            <p id={fullId} role="status" className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              Moj dan može imati najviše {state.model.max} stavki.
            </p>
          ) : null}
        </div>
      )}
    </MotionDialog>
  );
}

function PlanSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-1 flex min-h-8 items-center justify-between gap-2 px-1">
        <h3 id={headingId} className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

const rowClass =
  "flex min-h-12 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60 focus-within:bg-muted/60";

function RowBody({ row, now, meta }: { row: PlanDaySuggestionRow["row"]; now: number; meta: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-sm" title={row.title}>
        {row.title}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <StartupChip startup={row.startup} size="xs" showName className="max-w-[10rem]" nameClassName="text-xs" />
        {row.areaLabel ? <span className="truncate">· {row.areaLabel}</span> : null}
        {meta}
        <DueChip dueDate={row.dueDate} now={now} className="ml-auto" />
      </span>
    </span>
  );
}

function CarryRow({
  item,
  now,
  full,
  onReturn,
  onDismiss,
}: {
  item: PlanDayCarryRow;
  now: number;
  /** Plan je pun: id poruke sa razlogom (E15: aria-disabled, ne disabled). */
  full: string | null;
  onReturn: (event?: { currentTarget: EventTarget }) => void;
  onDismiss: (event?: { currentTarget: EventTarget }) => void;
}) {
  return (
    <li data-flip-id={item.row.key} className={rowClass}>
      <RowBody row={item.row} now={now} meta={<span className="shrink-0">· iz {item.fromLabel}</span>} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        data-plan-primary
        aria-disabled={full !== null || undefined}
        aria-describedby={full ?? undefined}
        aria-label={`Vrati u danas: ${item.row.title}`}
        onClick={(event) => {
          if (full === null) onReturn(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Delete") {
            event.preventDefault();
            onDismiss(event);
          }
        }}
      >
        Vrati
      </Button>
      <button
        type="button"
        aria-label={`Skloni: ${item.row.title}`}
        title="Skloni"
        onClick={onDismiss}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function SuggestionRow({
  item,
  now,
  full,
  onAdd,
}: {
  item: PlanDaySuggestionRow;
  now: number;
  full: string | null;
  onAdd: (event?: { currentTarget: EventTarget }) => void;
}) {
  return (
    <li data-flip-id={item.row.key} className={rowClass}>
      <RowBody row={item.row} now={now} meta={null} />
      <button
        type="button"
        data-plan-primary
        aria-disabled={full !== null || undefined}
        aria-describedby={full ?? undefined}
        aria-label={`Dodaj u Moj dan: ${item.row.title}`}
        title="Dodaj u Moj dan"
        onClick={(event) => {
          if (full === null) onAdd(event);
        }}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground aria-disabled:cursor-not-allowed aria-disabled:hover:border-border aria-disabled:hover:bg-card aria-disabled:hover:text-foreground",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
