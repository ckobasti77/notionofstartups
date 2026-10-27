import type { ComponentType } from "react";
import {
  Blocks,
  Code2,
  Megaphone,
  MoreHorizontal,
  ShoppingBag,
} from "lucide-react";

import { startupSolidToneClass } from "@/components/me/startup-chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Doc } from "@/convex/_generated/dataModel";
import { pageKindMeta, type PageKind } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";
import {
  AREA_META,
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

/**
 * Oblasti nemaju boju (PROSTOR P17): boja u chrome-u je samo indigo za radnju i
 * ton startupa kao identitet. Ključevi ostaju zbog postojećih poziva.
 */
const AREA_NEUTRAL = "text-muted-foreground";

export const AREA_TINTS: Record<AreaKey, string> = {
  dev: AREA_NEUTRAL,
  marketing: AREA_NEUTRAL,
  sales: AREA_NEUTRAL,
  other: AREA_NEUTRAL,
};

export function getAreaTint(key: string): string {
  return AREA_TINTS[key as AreaKey] || AREA_NEUTRAL;
}

export function getAreaDescription(key: string): string {
  return AREA_META[key as AreaKey]?.description || "Korisnički definisana oblast startupa";
}



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

/** Značka vrste stranice: ista mirna pločica za svaku vrstu (PROSTOR P17). */
export function PageKindBadge({
  kind,
  className,
}: {
  kind: PageKind;
  className?: string;
}) {
  const meta = pageKindMeta(kind);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md bg-muted/70",
        meta.textClass,
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  );
}

export function StartupLogo({
  startup,
  className,
}: {
  startup: { name: string; logoUrl?: string | null };
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8 rounded-lg", className)}>
      {startup.logoUrl ? (
        <AvatarImage src={startup.logoUrl} alt={`Logo startupa ${startup.name}`} />
      ) : null}
      <AvatarFallback className={startupSolidToneClass(startup.name)}>
        {startup.name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
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

/**
 * Prazno stanje (`docs/prostor/DIZAJN-SMIRENJE.md` §1.5): jedna rečenica i
 * jedna radnja, bez ilustracije. `screen` = ceo prikaz je prazan (isprekidan
 * okvir); `section` = prazna sekcija (jedan red, bez okvira).
 */
export function EmptyState({
  icon: Icon = Blocks,
  title,
  description,
  action,
  className,
  size = "screen",
  headingAs: Heading = "h3",
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: "screen" | "section";
  /** Nivo naslova: „h2" kad je prazno stanje odmah ispod h1 prikaza (bez preskoka nivoa). */
  headingAs?: "h2" | "h3";
}) {
  if (size === "section") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-sm", className)}>
        <p className="text-muted-foreground">
          {title}
          {description ? ` ${description}` : null}
        </p>
        {action}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-8 text-center",
        className,
      )}
    >
      <Icon className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
      <Heading className="text-sm font-semibold">{title}</Heading>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Zaglavlje ekrana (DIZAJN-SMIRENJE §1.5): jedan `h1` + meta u istom redu,
 * radnje desno, opcioni red kartica ili filtera ispod. Bez nadnaslova i bez
 * podnaslova-rečenice.
 */
export function ScreenHeader({
  title,
  meta,
  actions,
  below,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  below?: React.ReactNode;
  className?: string;
}) {
  return (
    <header data-workspace-enter className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-[-0.02em] lg:text-2xl">{title}</h1>
          {meta !== undefined && meta !== null ? (
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{meta}</span>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {below ? <div className="mt-4">{below}</div> : null}
    </header>
  );
}

/** Naslov sekcije (DIZAJN-SMIRENJE §1.2): `text-sm font-semibold`, normalna slova, broj kao meta. */
export function SectionHeading({
  id,
  title,
  count,
  action,
  as: Heading = "h2",
  className,
}: {
  id?: string;
  title: React.ReactNode;
  count?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex min-h-8 items-center justify-between gap-3", className)}>
      <Heading id={id} className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-foreground">
        <span className="min-w-0 truncate">{title}</span>
        {count !== undefined && count !== null ? (
          <span className="shrink-0 font-normal tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </Heading>
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
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
