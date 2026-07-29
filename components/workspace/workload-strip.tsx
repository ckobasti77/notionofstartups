"use client";

import { UserRound, Users } from "lucide-react";

import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";
import { tasksWord } from "@/lib/workspace";

export type WorkloadFilter = string | null;

export type WorkloadEntry = {
  key: string;
  name: string;
  avatar: { displayName: string; avatarUrl?: string | null } | null;
  open: number;
  overdue: number;
  urgent: number;
};

/**
 * Ko šta nosi, u jednom redu. Članovi bez zadataka ostaju u traci s prigušenom
 * nulom — prazna kolona je informacija (ima kapaciteta), ne šum.
 */
export function WorkloadStrip({
  entries,
  totalOpen,
  activeKey,
  onSelect,
}: {
  entries: Array<WorkloadEntry>;
  totalOpen: number;
  activeKey: WorkloadFilter;
  onSelect: (key: WorkloadFilter) => void;
}) {
  return (
    <div
      className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10"
      role="group"
      aria-label="Opterećenje tima"
    >
      <WorkloadChip
        active={activeKey === null}
        label="Svi"
        description={`Svi zadaci: ${totalOpen} ${tasksWord(totalOpen)}`}
        onClick={() => onSelect(null)}
        icon={<Users className="size-4 text-muted-foreground" aria-hidden="true" />}
        stats={<Stat value={totalOpen} label="otvoreno" />}
      />
      {entries.map((entry) => (
        <WorkloadChip
          key={entry.key}
          active={activeKey === entry.key}
          label={entry.name}
          description={`${entry.name}: ${entry.open} ${tasksWord(entry.open)}${
            entry.overdue > 0 ? `, ${entry.overdue} kasni` : ""
          }`}
          onClick={() => onSelect(activeKey === entry.key ? null : entry.key)}
          icon={
            entry.avatar === null ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <ProfileAvatar profile={entry.avatar} />
            )
          }
          stats={
            <>
              <Stat value={entry.open} label="otvoreno" />
              {entry.overdue > 0 ? (
                <Stat value={entry.overdue} label="kasni" tone="danger" />
              ) : null}
              {entry.urgent > 0 ? (
                <Stat value={entry.urgent} label="hitno" tone="urgent" />
              ) : null}
            </>
          }
        />
      ))}
    </div>
  );
}

function WorkloadChip({
  active,
  label,
  description,
  onClick,
  icon,
  stats,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
  icon: React.ReactNode;
  stats: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={description}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2 text-left transition-colors hover:border-primary/35 hover:bg-accent/25",
        active && "border-primary/60 bg-accent/35",
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block max-w-36 truncate text-sm font-semibold">{label}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          {stats}
        </span>
      </span>
    </button>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "danger" | "urgent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1",
        value === 0 && "opacity-55",
        tone === "danger" && "font-semibold text-destructive",
        tone === "urgent" && "font-semibold text-warning-foreground dark:text-warning",
      )}
    >
      <span className="font-mono tabular-nums">{value}</span>
      {label}
    </span>
  );
}
