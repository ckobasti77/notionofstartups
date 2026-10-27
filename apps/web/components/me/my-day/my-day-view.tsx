"use client";

import { useRef, type FocusEvent, type RefObject } from "react";
import { CalendarPlus, Coffee, PartyPopper, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import type { TaskRowModel } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { useEnter } from "@/lib/motion";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import { cn } from "@/lib/utils";

import { TaskSection } from "../section-header";
import { StartupChip } from "../startup-chip";
import { TaskRow, type TaskRowActions } from "../task-row";
import { MyDayHeader } from "./my-day-header";
import { plannedOrder, type MyDayGroupMode, type MyDayModel } from "./my-day-model";
import { MyDaySide, MyDaySummaryChips, type MyDaySideProps } from "./my-day-side";
import { MyDaySkeleton } from "./my-day-skeleton";

export type MyDayViewState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; model: MyDayModel };

export type MyDayViewProps = {
  now: number;
  firstName: string | null;
  state: MyDayViewState;
  groupMode: MyDayGroupMode;
  onGroupModeChange: (mode: MyDayGroupMode) => void;
  /** Desna kolona (≥ xl) i sažeti čipovi ispod nje; `null` = bez kolone. */
  side: Omit<MyDaySideProps, "now"> | null;
  /** Bez radnji redovi su samo za čitanje. */
  actions?: TaskRowActions;
  canOpen: (row: TaskRowModel) => boolean;
  onQuickAdd: () => void;
  onPlanDay: () => void;
  /** „Moji zadaci" iz praznog stanja kad je sve završeno. */
  onOpenTasks: () => void;
  /** Čip „Čeka tebe" ispod xl: prva ideja koja čeka glas (bez nje Inbox). */
  onOpenFirstPending?: () => void;
  /** Opseg za Flip (kontejner snima raspored pre promene). */
  listRef?: RefObject<HTMLDivElement | null>;
  /** Jedan `aria-live` region po prikazu („Završeno: …"). */
  announcement?: string;
  /** Prečice liste (K11): izabran red, red sa otvorenim panelom, zahtev `d`/`p`. */
  selectedKey?: string | null;
  activeKey?: string | null;
  request?: RowRequest | null;
  onListFocus?: (event: FocusEvent<HTMLElement>) => void;
};

/**
 * Moj dan (K10, plan K07 §1.2): zaglavlje sa prstenom, red „Dodaj
 * zadatak…", prekidač „Po vremenu / Po startupu", sekcije po P5 iz
 * `@devotion/shared` (prazne se preskaču; Blokirano i Završeno danas su
 * sklopljene) i desna kolona na širokom ekranu. Prezentacija: podaci i
 * radnje stižu kroz props (izlog ga prikazuje bez prijave).
 */
export function MyDayView({
  now,
  firstName,
  state,
  groupMode,
  onGroupModeChange,
  side,
  actions,
  canOpen,
  onQuickAdd,
  onPlanDay,
  onOpenTasks,
  onOpenFirstPending,
  listRef,
  announcement = "",
  selectedKey = null,
  activeKey = null,
  request = null,
  onListFocus,
}: MyDayViewProps) {
  const rowState = { selectedKey, activeKey, request };
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;
  // Ulaz liste samo na prvo punjenje i promenu grupisanja (plan K07 §4.1, tačka 8).
  useEnter(scopeRef, { key: `${state.status}:${groupMode}` });

  if (state.status === "loading") return <MyDaySkeleton withSide={side !== null} />;
  if (state.status === "error") return <MyDayError retry={state.retry} />;

  const { model } = state;
  const visible = model.sections.filter((section) => section.rows.length > 0);
  const openRows = visible.filter((section) => section.id !== "doneToday").length;
  const doneToday = model.counts.doneToday;
  const order = plannedOrder(model);
  const movableOf = (row: TaskRowModel, sectionId: string) => {
    if (sectionId !== "planned" || row.planEntryId === null) return undefined;
    const index = order.indexOf(row.planEntryId);
    return { up: index > 0, down: index !== -1 && index < order.length - 1 };
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <MyDayHeader
        now={now}
        firstName={firstName}
        progress={model.progress}
        counts={model.counts}
        onQuickAdd={onQuickAdd}
        onPlanDay={onPlanDay}
      />

      <div className="mt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-5">
          <div data-workspace-enter className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onQuickAdd}
              className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card hover:text-foreground"
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Dodaj zadatak…</span>
            </button>
            <GroupModeToggle value={groupMode} onChange={onGroupModeChange} />
          </div>

          {side ? (
            <MyDaySummaryChips
              inbox={side.inbox}
              chat={side.chat}
              pending={side.pending}
              onOpenInbox={side.onOpenInbox}
              onOpenChat={side.onOpenChat}
              onOpenFirstPending={onOpenFirstPending ?? side.onOpenInbox}
            />
          ) : null}

          <div ref={scopeRef} data-workspace-enter onFocus={onListFocus} className="space-y-5">
            {openRows === 0 ? (
              doneToday > 0 ? (
                <EmptyState
                  headingAs="h2"
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
                <EmptyState
                  headingAs="h2"
                  icon={Coffee}
                  title="Danas je mirno"
                  description="Nema rokova ni planova za danas."
                  action={
                    <Button type="button" variant="outline" onClick={onPlanDay}>
                      <CalendarPlus aria-hidden="true" />
                      Isplaniraj dan
                    </Button>
                  }
                />
              )
            ) : null}

            {groupMode === "time"
              ? visible.map((section) => (
                  <TaskSection
                    key={section.id}
                    title={section.title}
                    count={section.rows.length}
                    collapsible={section.collapsedByDefault}
                    defaultCollapsed={section.collapsedByDefault}
                    tone={section.id === "overdue" ? "danger" : "default"}
                  >
                    <RowList
                      sectionId={section.id}
                      rows={section.rows}
                      now={now}
                      actions={actions}
                      canOpen={canOpen}
                      movable={(row) => movableOf(row, section.id)}
                      rowState={rowState}
                    />
                  </TaskSection>
                ))
              : (
                  <>
                    {model.byStartup.groups.map((group) => (
                      <TaskSection
                        key={group.key}
                        title={group.title}
                        count={group.rows.length}
                        leading={<StartupChip startup={group.startup} size="sm" />}
                      >
                        <RowList sectionId={group.key} rows={group.rows} now={now} actions={actions} canOpen={canOpen} showStartup={false} rowState={rowState} />
                      </TaskSection>
                    ))}
                    {model.byStartup.doneToday.length > 0 ? (
                      <TaskSection title="Završeno danas" count={model.byStartup.doneToday.length} collapsible defaultCollapsed>
                        <RowList sectionId="doneToday" rows={model.byStartup.doneToday} now={now} actions={actions} canOpen={canOpen} rowState={rowState} />
                      </TaskSection>
                    ) : null}
                  </>
                )}

            {model.capped ? (
              <p className="px-2 text-xs text-muted-foreground">Prikazan je deo zadataka. Sve nađi u Mojim zadacima.</p>
            ) : null}
          </div>
        </div>

        {side ? (
          <div className="hidden xl:block">
            <MyDaySide now={now} {...side} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RowList({
  sectionId,
  rows,
  now,
  actions,
  canOpen,
  showStartup = true,
  movable,
  rowState,
}: {
  rowState: { selectedKey: string | null; activeKey: string | null; request: RowRequest | null };
  /** Za vraćanje fokusa kad red pređe u skupljenu sekciju. */
  sectionId: string;
  rows: TaskRowModel[];
  now: number;
  actions?: TaskRowActions;
  canOpen: (row: TaskRowModel) => boolean;
  showStartup?: boolean;
  movable?: (row: TaskRowModel) => { up: boolean; down: boolean } | undefined;
}) {
  return (
    <ul data-section={sectionId} className="space-y-0.5">
      {rows.map((row) => (
        <li key={row.key} data-flip-id={row.key}>
          <TaskRow
            row={row}
            now={now}
            actions={actions}
            canOpen={canOpen(row)}
            showStartup={showStartup}
            movable={movable?.(row)}
            selected={rowState.selectedKey === row.key}
            active={rowState.activeKey === row.key}
            request={rowState.request?.key === row.key ? rowState.request : null}
          />
        </li>
      ))}
    </ul>
  );
}

/** „Po vremenu / Po startupu" — pamti se lokalno (kontejner). */
function GroupModeToggle({ value, onChange }: { value: MyDayGroupMode; onChange: (mode: MyDayGroupMode) => void }) {
  const options: Array<{ value: MyDayGroupMode; label: string }> = [
    { value: "time", label: "Po vremenu" },
    { value: "startup", label: "Po startupu" },
  ];
  return (
    <div role="group" aria-label="Grupisanje" className="inline-flex shrink-0 self-start rounded-xl border bg-card p-0.5 sm:self-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MyDayError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div role="alert" className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/45 px-6 py-10 text-center">
        <span className="mb-4 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-sm font-semibold">Moj dan se ne može učitati</h1>
        <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Proveri vezu i pokušaj ponovo.</p>
        <Button type="button" variant="outline" className="mt-5" onClick={retry}>
          <RefreshCw aria-hidden="true" />
          Pokušaj ponovo
        </Button>
      </div>
    </div>
  );
}
