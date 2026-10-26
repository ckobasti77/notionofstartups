"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Bell, ChevronDown, LoaderCircle, LogOut, Plus, UserRound } from "lucide-react";

import { StartupChip } from "@/components/me/startup-chip";
import {
  railKey,
  unreadPhrase,
  type RailBadges,
  type RailScope,
  type RailStartup,
} from "@/components/me/shell/scope";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { useRailIndicator } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type WorkspaceRailProps = {
  profile: { displayName: string; avatarUrl: string | null; email?: string };
  startups: RailStartup[];
  active: RailScope;
  isAdmin: boolean;
  badges: RailBadges;
  onSelectMe: () => void;
  onSelectStartup: (id: Id<"startups">) => void;
  onCreateStartup?: () => void;
  /** Još startupa na serveru (paginirana lista). */
  onLoadMore?: () => void;
  /** Sledeća strana startupa se učitava (dugme ostaje, zauzeto). */
  loadingMore?: boolean;
  onProfile: () => void;
  /** „Obaveštenja i zvuci" (PROSTOR P11: zvono više nije u meniju startupa). */
  onNotificationSettings?: () => void;
  onSignOut: () => void;
  className?: string;
};

const tileButton =
  "relative grid size-11 place-items-center rounded-[30%] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

function countLabel(value: number, capped: boolean) {
  return capped || value > 99 ? "99+" : String(value);
}

/**
 * Traka „Ja + startupi" (PLAN §3.2, O1), od `lg`: 72 px. Gore „Ja", pa
 * pločice startupa (logo ili inicijali na tonu), „+" za admina, dole tema i
 * profil. Indikator izabranog opsega klizi do nove pločice (`snappy`).
 * Tastatura: traka je jedno mesto u redosledu fokusa; strelice, Home/End,
 * Enter/Space.
 */
export function WorkspaceRail({
  profile,
  startups,
  active,
  isAdmin,
  badges,
  onSelectMe,
  onSelectStartup,
  onCreateStartup,
  onLoadMore,
  loadingMore = false,
  onProfile,
  onNotificationSettings,
  onSignOut,
  className,
}: WorkspaceRailProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeKey = railKey(active);
  const indicatorRef = useRailIndicator(listRef, activeKey);
  const keys = ["me", ...startups.map((startup) => startup.id as string)];
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // Mesto u Tab redosledu je izabrani opseg; dok je fokus u traci, prati ga.
  const tabStopKey =
    focusKey !== null && keys.includes(focusKey) ? focusKey : keys.includes(activeKey) ? activeKey : "me";

  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    // Samo pločice opsega su roving grupa („Učitaj još" i „+" nisu).
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-rail-key]");
    if (!item) return;
    const current = keys.indexOf(item.getAttribute("data-rail-key") ?? "");
    if (current === -1) return;
    let next = current;
    if (event.key === "ArrowDown") next = Math.min(keys.length - 1, current + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, current - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = keys.length - 1;
    else return;
    event.preventDefault();
    const key = keys[next];
    setFocusKey(key);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-rail-key="${CSS.escape(key)}"] button`)
      ?.focus();
  }

  const meBadge = badges.me ?? 0;
  const meLabel =
    meBadge > 0
      ? `Ja — moj prostor, ${unreadPhrase(meBadge, badges.meCapped)}`
      : "Ja — moj prostor";

  return (
    <div
      className={cn(
        "hidden h-dvh w-[4.5rem] shrink-0 flex-col items-stretch border-r border-sidebar-border bg-sidebar lg:flex",
        className,
      )}
    >
      <nav
        ref={listRef}
        aria-label="Opsezi"
        onKeyDown={moveFocus}
        onBlur={(event) => {
          // Fokus je izašao iz trake: sledeći ulaz Tab-om staje na izabrani opseg.
          if (!listRef.current?.contains(event.relatedTarget as Node | null)) setFocusKey(null);
        }}
        className="scrollbar-thin relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-3"
      >
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0"
          style={{ opacity: 0 }}
        >
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
        </span>

        <div data-rail-key="me" className="relative flex h-12 shrink-0 items-center justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                tabIndex={tabStopKey === "me" ? 0 : -1}
                aria-current={active.kind === "me" ? "true" : undefined}
                aria-label={meLabel}
                onFocus={() => setFocusKey("me")}
                onClick={onSelectMe}
                className={cn(tileButton, "rounded-full")}
              >
                <ProfileAvatar
                  profile={profile}
                  className={cn(
                    "size-10 transition-shadow",
                    active.kind === "me" && "ring-2 ring-primary/45 ring-offset-2 ring-offset-sidebar",
                  )}
                />
                {meBadge > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 grid min-w-[1.125rem] place-items-center rounded-full bg-primary px-1 font-mono text-[0.625rem] font-bold leading-[1.125rem] tabular-nums text-primary-foreground ring-2 ring-sidebar"
                  >
                    {countLabel(meBadge, badges.meCapped)}
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Ja · Moj prostor</TooltipContent>
          </Tooltip>
        </div>

        <div aria-hidden="true" className="mx-auto my-2 h-px w-8 shrink-0 bg-sidebar-border" />

        {startups.map((startup) => {
          const key = startup.id as string;
          const isActive = active.kind === "startup" && active.startupId === startup.id;
          const dot = badges.startupDots[key] === true;
          return (
            <div
              key={key}
              data-rail-key={key}
              className="relative flex h-12 shrink-0 items-center justify-center"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    tabIndex={tabStopKey === key ? 0 : -1}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={dot ? `${startup.name}, ima nepročitano` : startup.name}
                    onFocus={() => setFocusKey(key)}
                    onClick={() => onSelectStartup(startup.id)}
                    className={tileButton}
                  >
                    <StartupChip
                      startup={startup}
                      size="rail"
                      variant="solid"
                      className={cn(
                        "rounded-[30%] transition-shadow",
                        isActive && "ring-2 ring-primary/45 ring-offset-2 ring-offset-sidebar",
                      )}
                    />
                    {dot ? (
                      <span
                        aria-hidden="true"
                        className="absolute right-0 top-0 size-2.5 rounded-full bg-primary ring-2 ring-sidebar"
                      />
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <span className="block font-medium">{startup.name}</span>
                  {dot ? <span className="block text-[0.6875rem] text-background/70">Ima nepročitano</span> : null}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}

        {onLoadMore ? (
          <div className="flex h-12 shrink-0 items-center justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={loadingMore ? undefined : onLoadMore}
                  aria-disabled={loadingMore || undefined}
                  aria-busy={loadingMore || undefined}
                  aria-label={loadingMore ? "Učitavam startupove…" : "Učitaj još startupova"}
                  className={cn(tileButton, "text-muted-foreground hover:bg-sidebar-accent")}
                >
                  {loadingMore ? (
                    <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-5" aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {loadingMore ? "Učitavam startupove…" : "Učitaj još startupova"}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        {isAdmin && onCreateStartup ? (
          <div className="flex h-12 shrink-0 items-center justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onCreateStartup}
                  aria-label="Dodaj startup"
                  className={cn(
                    tileButton,
                    "size-10 border border-dashed border-sidebar-border text-muted-foreground hover:border-primary/50 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <Plus className="size-5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Dodaj startup</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-sidebar-border/80 py-3">
        <ThemeToggle className="size-10 rounded-xl border-transparent bg-transparent shadow-none" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Meni profila"
                  className={cn(tileButton, "size-10 rounded-xl text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground")}
                >
                  <UserRound className="size-5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">Profil</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="end" className="w-60">
            <DropdownMenuLabel>
              <span className="block truncate">{profile.displayName}</span>
              {profile.email ? (
                <span className="block truncate text-xs font-normal text-muted-foreground">{profile.email}</span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onProfile}>
              <UserRound /> Moj profil
            </DropdownMenuItem>
            {onNotificationSettings ? (
              <DropdownMenuItem onSelect={onNotificationSettings}>
                <Bell /> Obaveštenja i zvuci
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onSignOut} variant="destructive">
              <LogOut /> Odjavi se
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
