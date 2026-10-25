"use client";

import type { ReactNode } from "react";
import { Bell, Plus, Search } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";

import { StartupChip } from "../startup-chip";
import { unreadPhrase } from "./scope";

export type MobileScopeHeaderProps = {
  /** Dugme mobilnog menija (`MobileWorkspaceMenu`). */
  menu: ReactNode;
  scope:
    | { kind: "me"; profile: { displayName: string; avatarUrl: string | null }; title: string }
    | {
        kind: "startup";
        startup: { name: string; logoUrl: string | null };
        subtitle: string;
        onSearch: () => void;
      };
  notifications: {
    /** „Inbox" u opsegu „Ja", „Obaveštenja" u startupu. */
    label: string;
    count: number;
    capped: boolean;
    onOpen: () => void;
  };
  /** Brzi unos (K10): dugme „+" u zaglavlju opsega „Ja" (umesto FAB-a na uskom ekranu). */
  onQuickAdd?: () => void;
};

/**
 * Zaglavlje ispod `lg` (PLAN §3.2): meni, identitet opsega (ja: avatar +
 * prikaz; startup: čip + ime), pretraga startupa, zvono i tema.
 */
export function MobileScopeHeader({ menu, scope, notifications, onQuickAdd }: MobileScopeHeaderProps) {
  const { count, capped } = notifications;
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-xl lg:hidden">
      {menu}
      {scope.kind === "me" ? (
        <>
          <ProfileAvatar profile={scope.profile} className="size-8" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{scope.title}</p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">Moj prostor</p>
          </div>
        </>
      ) : (
        <>
          <StartupChip startup={scope.startup} size="md" variant="solid" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{scope.startup.name}</p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">{scope.subtitle}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Pretraži" onClick={scope.onSearch}>
            <Search />
          </Button>
        </>
      )}
      {onQuickAdd ? (
        <Button variant="ghost" size="icon" aria-label="Brzi unos" aria-keyshortcuts="Q" onClick={onQuickAdd}>
          <Plus />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={count > 0 ? `${notifications.label}, ${unreadPhrase(count, capped)}` : notifications.label}
        onClick={notifications.onOpen}
      >
        <Bell />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[0.625rem] font-bold leading-4 tabular-nums text-primary-foreground"
          >
            {capped || count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Button>
      <ThemeToggle />
    </header>
  );
}
