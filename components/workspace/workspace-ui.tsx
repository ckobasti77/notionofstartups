import type { ComponentType } from "react";
import {
  Blocks,
  Code2,
  Megaphone,
  MoreHorizontal,
  ShoppingBag,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type AreaKey,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/workspace";

export const AREA_ICONS: Record<AreaKey, ComponentType<{ className?: string }>> = {
  dev: Code2,
  marketing: Megaphone,
  sales: ShoppingBag,
  other: MoreHorizontal,
};

export const AREA_TINTS: Record<AreaKey, string> = {
  dev: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  marketing: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  sales: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  other: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ProfileAvatar({
  profile,
  className,
}: {
  profile: { displayName: string; avatarUrl?: string | null };
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {profile.avatarUrl ? (
        <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
      ) : null}
      <AvatarFallback>{getInitials(profile.displayName)}</AvatarFallback>
    </Avatar>
  );
}

const statusVariants: Record<
  TaskStatus,
  "secondary" | "outline" | "warning" | "success"
> = {
  backlog: "outline",
  next: "secondary",
  in_progress: "warning",
  blocked: "warning",
  done: "success",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant={statusVariants[status]} className="gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          status === "done"
            ? "bg-success"
            : status === "blocked"
              ? "bg-destructive"
              : status === "in_progress"
                ? "bg-warning"
                : "bg-primary/65",
        )}
      />
      {TASK_STATUS_META[status].label}
    </Badge>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", TASK_PRIORITY_META[priority].dotClass)} />
      {TASK_PRIORITY_META[priority].label}
    </span>
  );
}

export function EmptyState({
  icon: Icon = Blocks,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/45 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function formatActivityTime(timestamp: number) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function isToday(timestamp: number | null) {
  if (timestamp === null) return false;
  const date = new Date(timestamp);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function memberById(
  members: Array<{ profile: Doc<"profiles"> }>,
  profileId: Doc<"profiles">["_id"] | null,
) {
  if (profileId === null) return null;
  return members.find((member) => member.profile._id === profileId)?.profile ?? null;
}
