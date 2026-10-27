"use client";

import { useId, useMemo } from "react";
import { ChevronDown, FolderClosed, ListChecks, Users } from "lucide-react";
import {
  assigneesChipValue,
  NO_AREA_REASON,
  TASK_CREATE_INSTRUCTIONS_MAX,
  TASK_CREATE_MAX_ASSIGNEES,
  taskCreateExtrasCount,
  toggleTaskAssignee,
  type Perm,
  type TaskCreateDraft,
} from "@devotion/shared";

import { LockedMetaChip, MetaChip } from "@/components/me/meta-chip";
import { DueMetaChip, PriorityChip } from "@/components/me/task-panel/panel-parts";
import { StatusChip, type PanelPerson } from "@/components/me/task-panel/startup-task-panel-view";
import { Collapse } from "@/components/motion/collapse";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaskCheckpointDraftList } from "@/components/workspace/task-checkpoint-list";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";

const ALLOWED: Perm = { allowed: true, reason: null };

/** Zašto se oblast ne bira: stranica se pravi u oblasti (ili ispod stranice) odakle je pokrenuta. */
export const AREA_LOCKED_REASON = "Oblast je zadata mestom gde praviš zadatak.";

export type TaskQuickCreateProps = {
  now: number;
  profileId: string;
  title: string;
  onTitleChange: (title: string) => void;
  draft: TaskCreateDraft;
  onDraftChange: (patch: Partial<TaskCreateDraft>) => void;
  areas: ReadonlyArray<{ _id: string; label: string }>;
  /** Oblast je zadata (dijalog otvoren iz oblasti ili stranice). */
  areaLocked: boolean;
  /** Članovi startupa; `undefined` dok se učitavaju. */
  members: PanelPerson[] | undefined;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  /** Dodir na zaključan čip (na dodiru nema tooltipa): razlog kao toast. */
  onDenied?: (reason: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * „Nova stranica → Zadatak" (K17, plan K07 §2): naslov prvi i Enter pravi
 * zadatak; status, prioritet, rok, izvršioci i oblast su čipovi sa
 * podrazumevanim vrednostima (shared `defaultTaskDraft`); instrukcije i
 * koraci su iza „Više opcija". Prezentacija — vrednosti kroz props.
 */
export function TaskQuickCreate({
  now,
  profileId,
  title,
  onTitleChange,
  draft,
  onDraftChange,
  areas,
  areaLocked,
  members,
  moreOpen,
  onMoreOpenChange,
  onDenied,
  disabled = false,
  autoFocus = true,
}: TaskQuickCreateProps) {
  const checkpointsHeadingId = useId();
  const titleId = useId();
  const hintId = useId();
  const moreId = useId();
  const instructionsId = useId();
  const extras = taskCreateExtrasCount(draft);
  const area = areas.find((item) => item._id === draft.areaId) ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={titleId} className="sr-only">
          Naslov zadatka
        </Label>
        <input
          id={titleId}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Naslov zadatka — Enter pravi zadatak"
          aria-describedby={hintId}
          maxLength={200}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base font-semibold tracking-[-0.01em] outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          Enter pravi zadatak. Ostalo menjaš čipovima ili kasnije u zadatku.
        </p>
      </div>

      <div role="group" aria-label="Podaci zadatka" className="flex flex-wrap gap-2">
        <StatusChip value={draft.status} perm={ALLOWED} onChange={(status) => onDraftChange({ status })} />
        <PriorityChip
          value={draft.priority}
          perm={ALLOWED}
          allowNone={false}
          onChange={(priority) => {
            if (priority !== null) onDraftChange({ priority });
          }}
        />
        <DueMetaChip value={draft.dueDate} now={now} perm={ALLOWED} onChange={(dueDate) => onDraftChange({ dueDate })} />
        <AssigneesPicker
          profileId={profileId}
          value={draft.assigneeProfileIds}
          members={members}
          onChange={(assigneeProfileIds) => onDraftChange({ assigneeProfileIds })}
        />
        {areas.length === 0 ? null : areaLocked ? (
          <LockedMetaChip
            label="Oblast"
            value={area?.label ?? "Oblast"}
            icon={FolderClosed}
            reason={AREA_LOCKED_REASON}
            onDenied={onDenied}
          />
        ) : (
          <MetaChip label="Oblast" value={area?.label ?? "Izaberi"} icon={FolderClosed} perm={ALLOWED}>
            {(trigger) => (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>Oblast</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={draft.areaId ?? ""} onValueChange={(areaId) => onDraftChange({ areaId })}>
                    {areas.map((item) => (
                      <DropdownMenuRadioItem key={item._id} value={item._id} className="pointer-coarse:min-h-11">
                        {item.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </MetaChip>
        )}
      </div>
      {areas.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {NO_AREA_REASON}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => onMoreOpenChange(!moreOpen)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:h-11"
        >
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden="true" />
          {moreOpen ? "Manje opcija" : "Više opcija"}
          {!moreOpen && extras > 0 ? (
            <span className="rounded-full bg-muted px-1.5 font-mono text-[0.6875rem] tabular-nums text-foreground">
              {extras}
              <span className="sr-only"> popunjeno</span>
            </span>
          ) : null}
        </button>
        <Collapse open={moreOpen} id={moreId}>
          <div className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label htmlFor={instructionsId}>Instrukcije (opciono)</Label>
              <Textarea
                id={instructionsId}
                value={draft.instructions}
                onChange={(event) => onDraftChange({ instructions: event.target.value })}
                placeholder="Napiši šta treba uraditi i koji rezultat se očekuje…"
                className="min-h-20"
                rows={3}
                maxLength={TASK_CREATE_INSTRUCTIONS_MAX}
              />
            </div>
            <div role="group" aria-labelledby={checkpointsHeadingId} className="space-y-2">
              <p id={checkpointsHeadingId} className="flex items-center gap-1.5 text-sm font-medium">
                <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" /> Koraci
              </p>
              <TaskCheckpointDraftList
                items={draft.checkpoints}
                onChange={(checkpoints) => onDraftChange({ checkpoints })}
              />
            </div>
          </div>
        </Collapse>
      </div>
    </div>
  );
}

/** Čip izvršilaca za nov zadatak: kvačice nad članovima, granica 10 (kao server). */
function AssigneesPicker({
  profileId,
  value,
  members,
  onChange,
}: {
  profileId: string;
  value: string[];
  members: PanelPerson[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const names = useMemo(() => new Map((members ?? []).map((person) => [person._id, person.displayName] as const)), [members]);
  const atLimit = value.length >= TASK_CREATE_MAX_ASSIGNEES;
  // Ja prvi, pa ostali kako ih server šalje.
  const ordered = useMemo(
    () => [...(members ?? [])].sort((a, b) => Number(b._id === profileId) - Number(a._id === profileId)),
    [members, profileId],
  );
  return (
    <MetaChip label="Izvršioci" value={assigneesChipValue(value, profileId, names)} icon={Users} perm={ALLOWED}>
      {(trigger) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto">
            <DropdownMenuLabel>Izvršioci</DropdownMenuLabel>
            {members === undefined ? (
              <DropdownMenuItem disabled>Učitavanje članova…</DropdownMenuItem>
            ) : (
              ordered.map((person) => {
                const checked = value.includes(person._id);
                return (
                  <DropdownMenuCheckboxItem
                    key={person._id}
                    checked={checked}
                    disabled={!checked && atLimit}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => onChange(toggleTaskAssignee(value, person._id))}
                    className="gap-2 pointer-coarse:min-h-11"
                  >
                    <ProfileAvatar profile={person} className="size-6" />
                    <span className="min-w-0 flex-1 truncate">
                      {person.displayName}
                      {person._id === profileId ? <span className="text-muted-foreground"> (ja)</span> : null}
                    </span>
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
