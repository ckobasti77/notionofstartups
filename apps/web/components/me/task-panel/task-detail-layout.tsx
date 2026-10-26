"use client";

import type { ReactNode } from "react";
import { ExternalLink, LogIn, LogOut, Maximize2 } from "lucide-react";
import type { TaskPermissions } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { TaskMetaChips } from "@/components/workspace/startup-tasks/task-meta-chips";

import { PanelSection, PlanToggle } from "./panel-parts";
import type { PanelPerson, StartupTaskPanelChange, StartupTaskView } from "./startup-task-panel-view";

/** Radnja uz plan u panelu: „Puni prikaz" (iz liste u startupu) ili „Otvori u startupu". */
export type TaskDetailOpenAction = { kind: "full" | "startup"; onSelect: () => void };

export type TaskDetailLayoutProps = {
  /**
   * `panel` (fioka): kompaktni Komentari ispod instrukcija. `page`: Komentari,
   * Povezano i podaci o stranici su u okviru dokumenta (`PageDocument`), pa
   * raspored ima samo čipove, korake i instrukcije.
   */
  variant: "panel" | "page";
  now: number;
  task: Pick<StartupTaskView, "status" | "priority" | "dueDate">;
  assignees: PanelPerson[];
  /** Članovi startupa (izbor izvršilaca); `undefined` dok se učitavaju, `"error"` kad upit padne. */
  members: PanelPerson[] | undefined | "error";
  permissions: TaskPermissions;
  isSelfAssigned: boolean;
  planned: boolean;
  onChange: (change: StartupTaskPanelChange) => void;
  onJoin: () => void;
  onLeave: () => void;
  onTogglePlan: () => void;
  /** Klik na zaključan čip (na dodiru nema tooltipa): kontejner pokaže razlog. */
  onDenied: (reason: string) => void;
  openAction?: TaskDetailOpenAction | null;
  /** Koraci: `TaskCheckpointList`. */
  checkpoints: ReactNode;
  /** Instrukcije: `InstructionsSection` (ili `PanelInstructions`). */
  instructions: ReactNode;
  /** Samo panel: kompaktni Komentari. */
  comments?: ReactNode;
};

/**
 * Raspored zadatka (PROSTOR P14, plan K07 §5.7) koji dele panel zadatka i puna
 * strana: čipovi Status · Prioritet · Rok · Izvršioci (menja ih svaki član dok
 * zadatak nije zaključan), „Dodaj u Moj dan", Koraci, Instrukcije. Zaključan
 * zadatak ima katanac sa razlogom na čipu ili sekciji (E15), ne pasus teksta.
 * Prezentacija: bez upita i mutacija.
 */
export function TaskDetailLayout({
  variant,
  now,
  task,
  assignees,
  members,
  permissions,
  isSelfAssigned,
  planned,
  onChange,
  onJoin,
  onLeave,
  onTogglePlan,
  onDenied,
  openAction,
  checkpoints,
  instructions,
  comments,
}: TaskDetailLayoutProps) {
  // Izvršilac na zaključanom zadatku ipak završava korake (`status` mu je dozvoljen).
  const checkpointsReason = permissions.checkpoints.allowed
    ? null
    : permissions.status.allowed
      ? `${permissions.checkpoints.reason ?? ""} Izvršilac može da završava korake.`.trim()
      : permissions.checkpoints.reason;
  return (
    <div className="space-y-6">
      <TaskMetaChips
        now={now}
        status={task.status}
        // Zadatak u startupu uvek ima prioritet; stari zapis bez njega je „Srednji" (kao u listama).
        priority={task.priority ?? "medium"}
        dueDate={task.dueDate}
        assignees={assignees}
        members={members}
        permissions={permissions}
        isSelfAssigned={isSelfAssigned}
        onChange={onChange}
        onJoin={onJoin}
        onLeave={onLeave}
        onDenied={onDenied}
      />

      <div className="flex flex-wrap gap-2">
        <PlanToggle planned={planned} onToggle={onTogglePlan} />
        {openAction ? (
          <Button type="button" variant="outline" className="rounded-full pointer-coarse:h-11" onClick={openAction.onSelect}>
            {openAction.kind === "full" ? <Maximize2 aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}
            {openAction.kind === "full" ? "Puni prikaz" : "Otvori u startupu"}
          </Button>
        ) : null}
        {permissions.assignees.selfOnly ? (
          isSelfAssigned ? (
            <Button type="button" variant="ghost" className="rounded-full pointer-coarse:h-11" onClick={onLeave}>
              <LogOut aria-hidden="true" />
              Napusti zadatak
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="rounded-full pointer-coarse:h-11" onClick={onJoin}>
              <LogIn aria-hidden="true" />
              Priključi se
            </Button>
          )
        ) : null}
      </div>

      <PanelSection
        title="Koraci"
        as={variant === "page" ? "h2" : "h3"}
        lockedReason={checkpointsReason}
        onDenied={onDenied}
      >
        {checkpoints}
      </PanelSection>

      {instructions}

      {variant === "panel" ? comments : null}
    </div>
  );
}
