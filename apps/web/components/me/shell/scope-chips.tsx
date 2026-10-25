"use client";

import { useLayoutEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";
import { unreadPhrase, type RailBadges, type RailScope, type RailStartup } from "./scope";

export type ScopeChipsProps = {
  profile: { displayName: string; avatarUrl: string | null };
  startups: RailStartup[];
  active: RailScope;
  badges: RailBadges;
  onSelectMe: () => void;
  onSelectStartup: (id: Id<"startups">) => void;
  onCreateStartup?: () => void;
  className?: string;
};

const chipBase =
  "relative inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl border px-2.5 text-sm font-medium transition-colors";

/**
 * Red „Ja" + čipovi startupa na vrhu mobilnog menija (ispod `lg`, PLAN §3.2).
 * Vodoravni skrol u svom redu, bez skrola cele stranice.
 */
export function ScopeChips({
  profile,
  startups,
  active,
  badges,
  onSelectMe,
  onSelectStartup,
  onCreateStartup,
  className,
}: ScopeChipsProps) {
  const meActive = active.kind === "me";
  const meBadge = badges.me ?? 0;
  const rowRef = useRef<HTMLDivElement>(null);
  const activeKey = active.kind === "me" ? "me" : active.startupId;
  // Izabrani opseg je vidljiv i kad ima mnogo startupa (skrol samo u redu).
  useLayoutEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !chip) return;
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, left - 12);
    }
  }, [activeKey]);
  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Opsezi"
      className={cn("scrollbar-thin relative flex snap-x scroll-px-3 gap-1.5 overflow-x-auto px-3 py-2", className)}
    >
      <button
        type="button"
        onClick={onSelectMe}
        aria-current={meActive ? "true" : undefined}
        aria-label={meBadge > 0 ? `Ja, ${unreadPhrase(meBadge, badges.meCapped)}` : "Ja"}
        className={cn(
          chipBase,
          meActive
            ? "border-primary/40 bg-accent text-accent-foreground"
            : "border-sidebar-border bg-card/60 text-sidebar-foreground hover:bg-card",
        )}
      >
        <ProfileAvatar profile={profile} className="size-6" />
        Ja
        {meBadge > 0 ? (
          <span
            aria-hidden="true"
            className="grid min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[0.625rem] font-bold leading-4 tabular-nums text-primary-foreground"
          >
            {badges.meCapped || meBadge > 99 ? "99+" : meBadge}
          </span>
        ) : null}
      </button>
      {startups.map((startup) => {
        const isActive = active.kind === "startup" && active.startupId === startup.id;
        const dot = badges.startupDots[startup.id] === true;
        return (
          <button
            key={startup.id}
            type="button"
            onClick={() => onSelectStartup(startup.id)}
            aria-current={isActive ? "true" : undefined}
            aria-label={dot ? `${startup.name}, ima nepročitano` : startup.name}
            className={cn(
              chipBase,
              "max-w-[11rem]",
              isActive
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-sidebar-border bg-card/60 text-sidebar-foreground hover:bg-card",
            )}
          >
            <StartupChip startup={startup} size="sm" variant="solid" />
            <span className="min-w-0 truncate">{startup.name}</span>
            {dot ? (
              <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-sidebar" />
            ) : null}
          </button>
        );
      })}
      {onCreateStartup ? (
        <button
          type="button"
          onClick={onCreateStartup}
          aria-label="Dodaj startup"
          className={cn(chipBase, "border-dashed border-sidebar-border px-3 text-muted-foreground hover:bg-card")}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
