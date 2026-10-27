"use client";

import { useId, type ComponentType } from "react";
import { CheckSquare2, Inbox, LogOut, MessageCircle, NotebookPen, Sun, UserRound } from "lucide-react";

import { NumberRoll } from "@/components/motion/number-roll";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";
import { unreadMessagesPhrase, unreadPhrase } from "./scope";

export type MeNavKey = "me-today" | "me-tasks" | "me-inbox" | "me-chat" | "me-notes";

export type MeSidebarStartup = {
  id: Id<"startups">;
  name: string;
  logoUrl: string | null;
  /** Moji otvoreni dodeljeni zadaci (`countOpenByStartup`); `null` dok se učitava. */
  openCount: number | null;
  /** Lista u `myDay.overview` je odsečena — broj je donja granica („N+"). */
  capped: boolean;
};

export type MeSidebarProps = {
  profile: { displayName: string; avatarUrl: string | null };
  active: MeNavKey | null;
  counts: {
    /** Otvoreno za danas: prekoračeno + danas + planirano. */
    today: number | null;
    inbox: number | null;
    inboxCapped: boolean;
    chat: number | null;
  };
  startups: MeSidebarStartup[];
  onNavigate: (key: MeNavKey) => void;
  onOpenStartup: (id: Id<"startups">) => void;
  /** Mobilni meni nema traku, pa nosi profil, temu i odjavu. */
  account?: { onProfile: () => void; onSignOut: () => void };
  className?: string;
};

const NAV: Array<{ key: MeNavKey; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: "me-today", label: "Moj dan", icon: Sun },
  { key: "me-tasks", label: "Moji zadaci", icon: CheckSquare2 },
  { key: "me-inbox", label: "Inbox", icon: Inbox },
  { key: "me-chat", label: "Poruke", icon: MessageCircle },
  { key: "me-notes", label: "Beleške", icon: NotebookPen },
];

function countFor(key: MeNavKey, counts: MeSidebarProps["counts"]) {
  if (key === "me-today") return { value: counts.today, unread: false, capped: false };
  if (key === "me-inbox") return { value: counts.inbox, unread: true, capped: counts.inboxCapped };
  if (key === "me-chat") return { value: counts.chat, unread: true, capped: false };
  return { value: null, unread: false, capped: false };
}

function ariaCount(key: MeNavKey, value: number, capped: boolean) {
  if (key === "me-today") return capped || value > 99 ? "više od 99 za danas" : `${value} za danas`;
  if (key === "me-chat") return unreadMessagesPhrase(value, capped);
  return unreadPhrase(value, capped);
}

/**
 * Meni opsega „Ja" (PLAN §3.2): zaglavlje sa profilom, pet prikaza ličnog
 * nivoa i kratka lista startupa sa brojem mojih otvorenih zadataka — klik
 * prelazi u startup (Komandni centar).
 */
export function MeSidebar({
  profile,
  active,
  counts,
  startups,
  onNavigate,
  onOpenStartup,
  account,
  className,
}: MeSidebarProps) {
  const headingId = useId();
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground", className)}>
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <ProfileAvatar profile={profile} className="size-9" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.01em]">{profile.displayName}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">Moj prostor</p>
        </div>
      </div>

      <nav aria-label="Moj prostor" className="space-y-0.5 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const count = countFor(item.key, counts);
          const showCount = count.value !== null && count.value > 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={isActive ? "page" : undefined}
              aria-label={
                showCount && count.value !== null
                  ? `${item.label}, ${ariaCount(item.key, count.value, count.capped)}`
                  : item.label
              }
              onClick={() => onNavigate(item.key)}
              className={cn(
                "relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
              )}
            >
              {isActive ? (
                <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
              ) : null}
              <Icon className="size-[1.05rem] shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              {showCount && count.value !== null ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid min-w-5 shrink-0 place-items-center rounded-full px-1.5 py-0.5 font-mono text-[0.625rem] font-bold leading-4",
                    count.unread ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {count.capped ? "99+" : <NumberRoll value={count.value} />}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <section aria-labelledby={headingId} className="mt-5 flex min-h-0 flex-1 flex-col">
        <h2
          id={headingId}
          className="px-7 pb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Startupi
        </h2>
        <ul className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 pt-1">
          {startups.map((startup) => {
            const open = startup.openCount;
            const openLabel = open === null ? null : `${open}${startup.capped ? "+" : ""} otv.`;
            return (
              <li key={startup.id}>
                <button
                  type="button"
                  onClick={() => onOpenStartup(startup.id)}
                  aria-label={
                    open === null
                      ? `${startup.name}, otvori Komandni centar`
                      : `${startup.name}, moji otvoreni zadaci: ${open}${startup.capped ? " ili više" : ""}`
                  }
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors hover:bg-sidebar-accent/55"
                >
                  <StartupChip startup={startup} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{startup.name}</span>
                  {openLabel ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        open && open > 0 ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {openLabel}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {account ? (
        <div className="flex items-center gap-1 border-t border-sidebar-border/80 p-3">
          <Button type="button" variant="ghost" className="flex-1 justify-start" onClick={account.onProfile}>
            <UserRound aria-hidden="true" /> Moj profil
          </Button>
          <ThemeToggle />
          <Button type="button" variant="ghost" className="flex-1 justify-start text-destructive" onClick={account.onSignOut}>
            <LogOut aria-hidden="true" /> Odjavi se
          </Button>
        </div>
      ) : null}
    </div>
  );
}
