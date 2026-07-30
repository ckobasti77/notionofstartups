"use client";

import { Check, ChevronDown, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssigneeStack } from "@/components/workspace/assignee-stack";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { StartupMember } from "@/components/workspace/types";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const MAX_TASK_ASSIGNEES = 10;

/**
 * Višestruki izbor izvršilaca. Svi izvršioci su ravnopravni, pa lista nema
 * pojam „glavnog” — redosled je samo redosled priključivanja.
 */
export function AssigneePicker({
  members,
  value,
  onChange,
  disabled = false,
  id,
  triggerClassName,
  emptyLabel = "Nije dodeljen",
}: {
  members: StartupMember[] | undefined;
  value: Array<Id<"profiles">>;
  onChange: (next: Array<Id<"profiles">>) => void;
  disabled?: boolean;
  id?: string;
  triggerClassName?: string;
  emptyLabel?: string;
}) {
  const selected = members
    ? value.flatMap((profileId) => {
        const member = members.find(
          (candidate) => candidate.profile._id === profileId,
        );
        return member ? [member.profile] : [];
      })
    : [];
  const atLimit = value.length >= MAX_TASK_ASSIGNEES;

  function toggle(profileId: Id<"profiles">) {
    onChange(
      value.includes(profileId)
        ? value.filter((current) => current !== profileId)
        : [...value, profileId],
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between gap-2 px-3 font-normal",
            triggerClassName,
          )}
          aria-label={
            selected.length === 0
              ? `${emptyLabel} — izaberi izvršioce`
              : `Izvršioci: ${selected
                  .map((profile) => profile.displayName)
                  .join(", ")}`
          }
        >
          {selected.length === 0 ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="size-4 shrink-0" aria-hidden="true" />
              {emptyLabel}
            </span>
          ) : (
            <AssigneeStack assignees={selected} showLabel max={4} />
          )}
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Izvršioci</span>
          <span className="text-[0.6875rem] font-bold text-muted-foreground tabular-nums">
            {value.length}/{MAX_TASK_ASSIGNEES}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {members === undefined ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Učitavanje članova…
          </p>
        ) : members.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nema članova u ovom startupu.
          </p>
        ) : (
          members.map(({ profile }) => {
            const checked = value.includes(profile._id);
            return (
              <DropdownMenuCheckboxItem
                key={profile._id}
                checked={checked}
                disabled={!checked && atLimit}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggle(profile._id)}
                className="gap-2"
              >
                <ProfileAvatar profile={profile} className="size-6" />
                <span className="min-w-0 flex-1 truncate">
                  {profile.displayName}
                </span>
              </DropdownMenuCheckboxItem>
            );
          })
        )}
        {value.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => onChange([])}
            >
              <X className="size-3.5" aria-hidden="true" />
              Ukloni sve
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Kompaktna varijanta za redove tabele i toolbar-e. */
export function AssigneePickerCompact({
  members,
  value,
  onChange,
  disabled = false,
  label = "Izvršioci",
}: {
  members: StartupMember[] | undefined;
  value: Array<Id<"profiles">>;
  onChange: (next: Array<Id<"profiles">>) => void;
  disabled?: boolean;
  label?: string;
}) {
  const selected = members
    ? value.flatMap((profileId) => {
        const member = members.find(
          (candidate) => candidate.profile._id === profileId,
        );
        return member ? [member.profile] : [];
      })
    : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-compact="true"
          className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:border-border hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={label}
        >
          <AssigneeStack assignees={selected} showLabel max={3} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {members?.map(({ profile }) => {
          const checked = value.includes(profile._id);
          return (
            <DropdownMenuCheckboxItem
              key={profile._id}
              checked={checked}
              disabled={!checked && value.length >= MAX_TASK_ASSIGNEES}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() =>
                onChange(
                  checked
                    ? value.filter((current) => current !== profile._id)
                    : [...value, profile._id],
                )
              }
              className="gap-2"
            >
              <ProfileAvatar profile={profile} className="size-6" />
              <span className="min-w-0 flex-1 truncate">
                {profile.displayName}
              </span>
              {checked ? (
                <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
