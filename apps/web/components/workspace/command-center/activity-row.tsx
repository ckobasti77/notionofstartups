"use client";

import {
  Calendar,
  Circle,
  History,
  Lightbulb,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  MoveRight,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ActivityIcon, ActivityTarget, ActivityTone } from "@devotion/shared";

import { cn } from "@/lib/utils";

const ICONS: Record<ActivityIcon, LucideIcon> = {
  edit: Pencil,
  create: Plus,
  move: MoveRight,
  trash: Trash2,
  restore: RotateCcw,
  lock: Lock,
  unlock: LockOpen,
  comment: MessageSquare,
  idea: Lightbulb,
  member: UserRound,
  invite: Mail,
  history: History,
  calendar: Calendar,
  other: Circle,
};

const TONE_CLASS: Record<ActivityTone, string> = {
  neutral: "text-muted-foreground",
  danger: "text-destructive",
  success: "text-success",
};

/** Jedan unos aktivnosti, već formatiran (shared `formatActivity`). */
export type ActivityEntry = {
  id: string;
  sentence: string;
  icon: ActivityIcon;
  tone: ActivityTone;
  /** „pre 5 min", „danas u 14:05" (shared `formatEditTime`). */
  time: string;
  target: ActivityTarget;
};

/**
 * Red aktivnosti: ikonica vrste, rečenica (do dva reda) i vreme. Unos koji vodi
 * negde (stranica, ideja, oblast) je dugme, ostali su obični redovi.
 */
export function ActivityRow({
  entry,
  onOpen,
}: {
  entry: ActivityEntry;
  onOpen: (target: ActivityTarget) => void;
}) {
  const Icon = ICONS[entry.icon];
  const content = (
    <>
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_CLASS[entry.tone])} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-5">{entry.sentence}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{entry.time}</span>
      </span>
    </>
  );
  const className = "flex min-h-10 w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left";
  if (entry.target.kind === "none") return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.target)}
      className={cn(
        className,
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
      )}
    >
      {content}
    </button>
  );
}
