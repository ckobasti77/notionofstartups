import { CheckCircle2, Circle } from "lucide-react";
import type { TaskPriorityKey, TaskStatusKey } from "@devotion/shared";

import { cn } from "@/lib/utils";

import { DueChip } from "./due-chip";
import { StartupChip } from "./startup-chip";

/**
 * Podaci reda zadatka. Podskup `TaskRowModel` iz plana K07 §1 (shared
 * `task-row.ts`, K10) — K10 dodaje dozvole, plan i radnje, a ovaj oblik ostaje
 * kompatibilan.
 */
export type TaskRowData = {
  /** `refKey`: "task:<id>" | "personal:<id>". */
  key: string;
  kind: "task" | "personal";
  id: string;
  title: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey | null;
  dueDate: number | null;
  /** `null` = „Lično". */
  startup: { _id: string; name: string; logoUrl: string | null } | null;
  areaLabel: string | null;
  done: boolean;
};

export type TaskRowProps = {
  row: TaskRowData;
  now: number;
  /** Bez rukovaoca red je samo za čitanje (npr. lični zadatak pre panela, K11). */
  onOpen?: (row: TaskRowData) => void;
  showStartup?: boolean;
  className?: string;
};

/**
 * Red zadatka ličnog nivoa (v1, K08): stanje, naslov, čip startupa ili
 * „Lično", oblast i rok. Na širokom ekranu jedan red od 44 px, na uskom dva
 * reda (≥ 56 px). K10 dodaje kvačicu i radnje.
 */
export function TaskRow({ row, now, onOpen, showStartup = true, className }: TaskRowProps) {
  const StatusIcon = row.done ? CheckCircle2 : Circle;
  const body = (
    <>
      <StatusIcon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0 md:mt-0",
          row.done ? "text-primary" : "text-muted-foreground/70",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
        <span
          className={cn(
            "min-w-0 truncate text-sm md:flex-1",
            row.done && "text-muted-foreground line-through decoration-muted-foreground/60",
          )}
          title={row.title}
        >
          {row.title}
          {row.done ? <span className="sr-only"> (završeno)</span> : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:max-w-[50%] md:shrink-0">
          {showStartup ? (
            <StartupChip
              startup={row.startup}
              size="xs"
              showName
              className="max-w-[11rem]"
              nameClassName="text-xs"
            />
          ) : null}
          {row.areaLabel ? (
            <span className="min-w-0 truncate">
              <span aria-hidden="true">· </span>
              {row.areaLabel}
            </span>
          ) : null}
          <DueChip dueDate={row.dueDate} now={now} done={row.done} className="ml-auto md:ml-1" />
        </span>
      </span>
    </>
  );

  const base = cn(
    "flex w-full min-h-14 items-start gap-3 rounded-xl px-2 py-2 text-left md:min-h-11 md:items-center md:py-1.5",
    className,
  );

  if (!onOpen) {
    return (
      <div data-motion-enter className={base}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-motion-enter
      onClick={() => onOpen(row)}
      className={cn(base, "transition-colors hover:bg-muted/60 focus-visible:bg-muted/60")}
    >
      {body}
    </button>
  );
}
