"use client";

import { useState, type ReactNode, type Ref } from "react";
import { CircleDot, ExternalLink, LogIn, LogOut, Users } from "lucide-react";
import {
  STATUS_LABELS,
  type StartupMini,
  type TaskPermissions,
  type TaskPriorityKey,
  type TaskStatusKey,
} from "@devotion/shared";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";

import { MetaChip } from "../meta-chip";
import { StartupChip } from "../startup-chip";
import { DueMetaChip, PanelSection, PanelTitle, PlanToggle, PriorityChip } from "./panel-parts";

export type StartupTaskStatus = Exclude<TaskStatusKey, "open">;

export const STARTUP_STATUSES: ReadonlyArray<StartupTaskStatus> = ["backlog", "next", "in_progress", "blocked", "done"];

/** Najviše izvršilaca (isto kao `MAX_TASK_ASSIGNEES` na serveru). */
export const PANEL_MAX_ASSIGNEES = 10;

/** Najviše znakova instrukcija (server `MAX_TASK_INSTRUCTIONS_LENGTH`). */
export const PANEL_INSTRUCTIONS_MAX = 20_000;

export type PanelPerson = { _id: string; displayName: string; avatarUrl: string | null };

export type StartupTaskPanelChange = {
  status?: StartupTaskStatus;
  priority?: TaskPriorityKey;
  dueDate?: number | null;
  assigneeProfileIds?: string[];
  instructions?: string | null;
};

export type StartupTaskPanelViewProps = {
  now: number;
  task: {
    title: string;
    status: StartupTaskStatus;
    priority: TaskPriorityKey | null;
    dueDate: number | null;
    instructions: string | null;
    startup: StartupMini;
    areaLabel: string | null;
  };
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
  onOpenInStartup: () => void;
  /** Klik na zaključan čip (na dodiru nema tooltipa): kontejner pokaže razlog. */
  onDenied: (reason: string) => void;
  /** Koraci: postojeća lista checkpointa (`TaskCheckpointList`) ili kratak pregled. */
  checkpoints: ReactNode;
};

export type StartupTaskPanelHeaderProps = {
  task: StartupTaskPanelViewProps["task"];
  /** Naslov menja kreator (`pages.update`). */
  canEditTitle: boolean;
  onRename: (title: string) => void;
  titleRef?: Ref<HTMLElement>;
};

/** Zaglavlje panela startup zadatka: čip startupa · oblast, pa naslov. */
export function StartupTaskPanelHeader({ task, canEditTitle, onRename, titleRef }: StartupTaskPanelHeaderProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <StartupChip startup={task.startup} size="xs" />
        <span className="truncate">
          {task.startup.name}
          {task.areaLabel ? ` · ${task.areaLabel}` : ""}
        </span>
      </p>
      <PanelTitle value={task.title} editable={canEditTitle} onCommit={onRename} titleRef={titleRef} />
    </div>
  );
}

/**
 * Panel startup zadatka (plan K07 §1.4): čipovi Status / Prioritet / Rok /
 * Izvršioci kroz postojeće mutacije, „Dodaj u Moj dan", „Otvori u
 * startupu", koraci i instrukcije. Dozvole iz `tasks.updateMetadata` su
 * zaključani čipovi sa razlogom (E15), ne pasus teksta.
 */
export function StartupTaskPanelView({
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
  onOpenInStartup,
  onDenied,
  checkpoints,
}: StartupTaskPanelViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <MetaChip label="Status" value={STATUS_LABELS[task.status]} icon={CircleDot} perm={permissions.status} onDenied={onDenied}>
          {(trigger) => (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={task.status}
                  onValueChange={(status) => onChange({ status: status as StartupTaskStatus })}
                >
                  {STARTUP_STATUSES.map((status) => (
                    <DropdownMenuRadioItem key={status} value={status} className="pointer-coarse:min-h-11">
                      {STATUS_LABELS[status]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </MetaChip>
        <PriorityChip
          value={task.priority}
          perm={permissions.priority}
          allowNone={false}
          onDenied={onDenied}
          onChange={(priority) => {
            if (priority !== null) onChange({ priority });
          }}
        />
        <DueMetaChip
          value={task.dueDate}
          now={now}
          perm={permissions.due}
          onDenied={onDenied}
          onChange={(dueDate) => onChange({ dueDate })}
        />
        <AssigneesChip
          assignees={assignees}
          members={members}
          selfOnly={permissions.assignees.selfOnly}
          reason={permissions.assignees.reason}
          isSelfAssigned={isSelfAssigned}
          onChange={(assigneeProfileIds) => onChange({ assigneeProfileIds })}
          onJoin={onJoin}
          onLeave={onLeave}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <PlanToggle planned={planned} onToggle={onTogglePlan} />
        <Button type="button" variant="outline" className="rounded-full pointer-coarse:h-11" onClick={onOpenInStartup}>
          <ExternalLink aria-hidden="true" />
          Otvori u startupu
        </Button>
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
        lockedReason={permissions.checkpoints.allowed ? null : permissions.checkpoints.reason}
        onDenied={onDenied}
      >
        {checkpoints}
      </PanelSection>

      <InstructionsSection
        value={task.instructions}
        editable={permissions.instructions.allowed}
        lockedReason={permissions.instructions.allowed ? null : permissions.instructions.reason}
        onDenied={onDenied}
        onSave={(instructions) => onChange({ instructions })}
      />
    </div>
  );
}

function AssigneesChip({
  assignees,
  members,
  selfOnly,
  reason,
  isSelfAssigned,
  onChange,
  onJoin,
  onLeave,
}: {
  assignees: PanelPerson[];
  members: PanelPerson[] | undefined | "error";
  selfOnly: boolean;
  reason: string | null;
  isSelfAssigned: boolean;
  onChange: (profileIds: string[]) => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const value = assignees.length === 0 ? "Niko" : String(assignees.length);
  const selected = assignees.map((person) => person._id);
  const atLimit = selected.length >= PANEL_MAX_ASSIGNEES;
  return (
    <MetaChip label="Izvršioci" value={value} icon={Users} perm={{ allowed: true, reason: null }}>
      {(trigger) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto">
            <DropdownMenuLabel>Izvršioci</DropdownMenuLabel>
            {selfOnly ? (
              <>
                {assignees.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">Niko još nije dodeljen.</p>
                ) : (
                  assignees.map((person) => (
                    <div key={person._id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                      <ProfileAvatar profile={person} className="size-6" />
                      <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                    </div>
                  ))
                )}
                <DropdownMenuSeparator />
                <p className="px-2 py-1 text-xs leading-4 text-muted-foreground">{reason}</p>
                <DropdownMenuItem className="pointer-coarse:min-h-11" onSelect={isSelfAssigned ? onLeave : onJoin}>
                  {isSelfAssigned ? <LogOut aria-hidden="true" /> : <LogIn aria-hidden="true" />}
                  {isSelfAssigned ? "Napusti zadatak" : "Priključi se"}
                </DropdownMenuItem>
              </>
            ) : members === undefined ? (
              <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">
                Učitavanje članova…
              </p>
            ) : members === "error" ? (
              <p role="alert" className="px-2 py-1.5 text-sm text-destructive">
                Članovi se ne mogu učitati. Zatvori i ponovo otvori panel.
              </p>
            ) : (
              members.map((person) => {
                const checked = selected.includes(person._id);
                return (
                  <DropdownMenuCheckboxItem
                    key={person._id}
                    checked={checked}
                    disabled={!checked && atLimit}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() =>
                      onChange(checked ? selected.filter((id) => id !== person._id) : [...selected, person._id])
                    }
                    className={cn("gap-2 pointer-coarse:min-h-11")}
                  >
                    <ProfileAvatar profile={person} className="size-6" />
                    <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                  </DropdownMenuCheckboxItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </MetaChip>
  );
}

/** Instrukcije: kreator menja u mestu (čuva na blur), ostali čitaju. */
function InstructionsSection({
  value,
  editable,
  lockedReason,
  onDenied,
  onSave,
}: {
  value: string | null;
  editable: boolean;
  lockedReason: string | null;
  onDenied: (reason: string) => void;
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused) setDraft(value ?? "");
  }
  const near = draft.length >= PANEL_INSTRUCTIONS_MAX - 500;

  return (
    <PanelSection
      title="Instrukcije"
      lockedReason={lockedReason}
      onDenied={onDenied}
      aside={
        editable && near ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {draft.length}/{PANEL_INSTRUCTIONS_MAX}
          </span>
        ) : null
      }
    >
      {editable ? (
        <Textarea
          value={draft}
          maxLength={PANEL_INSTRUCTIONS_MAX}
          aria-label="Instrukcije"
          placeholder="Dodaj instrukcije…"
          onFocus={() => setFocused(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            setFocused(false);
            const next = draft.trim() ? draft : null;
            if ((next ?? null) !== (value ?? null)) onSave(next);
          }}
          className="min-h-24 rounded-xl bg-card text-sm leading-6"
        />
      ) : value ? (
        <p className="whitespace-pre-wrap rounded-xl bg-muted/40 px-3 py-2 text-sm leading-6">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Nema instrukcija.</p>
      )}
    </PanelSection>
  );
}
