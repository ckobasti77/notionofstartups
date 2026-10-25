"use client";

import { AlignLeft, ListChecks } from "lucide-react";
import {
  PERMISSION_REASONS,
  type StartupTaskStatus,
  type TaskPermissions,
  type TaskPriorityKey,
} from "@devotion/shared";

import { LockedMetaChip } from "@/components/me/meta-chip";
import { DueMetaChip, PriorityChip } from "@/components/me/task-panel/panel-parts";
import { AssigneesChip, StatusChip, type PanelPerson } from "@/components/me/task-panel/startup-task-panel-view";
import { cn } from "@/lib/utils";

export type TaskMetaField = "status" | "priority" | "due" | "assignees";

export type TaskMetaChange = {
  status?: StartupTaskStatus;
  priority?: TaskPriorityKey;
  dueDate?: number | null;
  assigneeProfileIds?: string[];
};

export type TaskMetaChipsProps = {
  now: number;
  status: StartupTaskStatus;
  priority: TaskPriorityKey;
  dueDate: number | null;
  assignees: PanelPerson[];
  /** Članovi za izbor izvršilaca; `undefined` dok se učitavaju. */
  members: PanelPerson[] | undefined | "error";
  permissions: TaskPermissions;
  isSelfAssigned: boolean;
  onChange: (change: TaskMetaChange) => void;
  onJoin: () => void;
  onLeave: () => void;
  /** Klik na zaključan čip (na dodiru nema tooltipa): razlog kao toast. */
  onDenied: (reason: string) => void;
  /** Koji čipovi (podrazumevano sva četiri, redom). */
  fields?: ReadonlyArray<TaskMetaField>;
  className?: string;
};

const ALL_FIELDS: ReadonlyArray<TaskMetaField> = ["status", "priority", "due", "assignees"];

/**
 * Metapodaci zadatka u detalju stranice (K17, plan K07 §2): čipovi Status /
 * Prioritet / Rok / Izvršioci umesto `Select`-ova i izvornog datumskog inputa.
 * Zabranjen čip je zaključan sa razlogom u tooltipu i `aria-describedby`
 * (E15) — pravila su ogledalo servera, ne menjaju se.
 */
export function TaskMetaChips({
  now,
  status,
  priority,
  dueDate,
  assignees,
  members,
  permissions,
  isSelfAssigned,
  onChange,
  onJoin,
  onLeave,
  onDenied,
  fields = ALL_FIELDS,
  className,
}: TaskMetaChipsProps) {
  return (
    <div role="group" aria-label="Podaci zadatka" className={cn("flex flex-wrap gap-2", className)}>
      {fields.map((field) =>
        field === "status" ? (
          <StatusChip key={field} value={status} perm={permissions.status} onDenied={onDenied} onChange={(next) => onChange({ status: next })} />
        ) : field === "priority" ? (
          <PriorityChip
            key={field}
            value={priority}
            perm={permissions.priority}
            allowNone={false}
            onDenied={onDenied}
            onChange={(next) => {
              if (next !== null) onChange({ priority: next });
            }}
          />
        ) : field === "due" ? (
          <DueMetaChip
            key={field}
            value={dueDate}
            now={now}
            perm={permissions.due}
            onDenied={onDenied}
            onChange={(next) => onChange({ dueDate: next })}
          />
        ) : (
          <AssigneesChip
            key={field}
            assignees={assignees}
            members={members}
            selfOnly={permissions.assignees.selfOnly}
            reason={permissions.assignees.reason}
            isSelfAssigned={isSelfAssigned}
            onChange={(assigneeProfileIds) => onChange({ assigneeProfileIds })}
            onJoin={onJoin}
            onLeave={onLeave}
          />
        ),
      )}
    </div>
  );
}

/** Razlog za korake (ne-kreator): ko šta sme, umesto pasusa teksta. */
export const CHECKPOINTS_LOCKED_REASON = `${PERMISSION_REASONS.checkpoints} Izvršilac označava urađeno, a svaki član može da doda doprinos.`;

/**
 * Šta ne-kreator ne menja u instrukcijama i koracima — zaključani čipovi sa
 * razlogom (E15) umesto pasusa „Autor uređuje checkpoint…".
 */
export function TaskContentLocks({ onDenied, className }: { onDenied?: (reason: string) => void; className?: string }) {
  return (
    <div role="group" aria-label="Samo za čitanje" className={cn("flex flex-wrap gap-2", className)}>
      <LockedMetaChip
        label="Instrukcije"
        value="samo čitanje"
        icon={AlignLeft}
        reason={PERMISSION_REASONS.instructions}
        onDenied={onDenied}
      />
      <LockedMetaChip label="Koraci" value="menja kreator" icon={ListChecks} reason={CHECKPOINTS_LOCKED_REASON} onDenied={onDenied} />
    </div>
  );
}
