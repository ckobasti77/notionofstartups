"use client";

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  ChevronDown,
  Hash,
  MessagesSquare,
  RefreshCw,
  Search,
  SquarePen,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import {
  formatInboxTime,
  hubChannelName,
  hubIsEmpty,
  hubMentionLabel,
  hubNavigableIds,
  hubRowPreview,
  hubUnreadLabel,
  type HubChannel,
  type HubGroup,
  type HubInput,
} from "@devotion/shared";

import { Collapse } from "@/components/motion/collapse";
import { NumberRoll } from "@/components/motion/number-roll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, ProfileAvatar } from "@/components/workspace/workspace-ui";
import { useEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";

/** Stanje liste razgovora (`chat.listConversations`). */
export type HubListState<C extends HubChannel = HubChannel> =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; input: HubInput<C>; capped: boolean };

export type HubListProps = {
  now: number;
  meId: string;
  state: HubListState;
  /** Grupe posle pretrage i sklapanja (`hubGroups`); prazno dok lista nije spremna. */
  groups: ReadonlyArray<HubGroup>;
  query: string;
  onQueryChange: (query: string) => void;
  onToggleGroup: (key: string) => void;
  activeChannelId: string | null;
  onSelect: (channelId: string) => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
};

/** Redovi i zaglavlja grupa kroz koje se kreće strelicama (bez sklopljenih). */
const NAV_SELECTOR = "[data-hub-nav]";

function navigable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(NAV_SELECTOR)).filter(
    (element) => element.closest("[inert]") === null,
  );
}

/**
 * Leva kolona Poruka (K15, plan K07 §1.6): zaglavlje sa „Nova poruka" i
 * „Nova grupa", pretraga po imenu, „Lično" pa grupe po startupima (sklopive,
 * sa nepročitanim). Prezentacija: podaci kroz props (izlog bez prijave).
 */
export function HubList({
  now,
  meId,
  state,
  groups,
  query,
  onQueryChange,
  onToggleGroup,
  activeChannelId,
  onSelect,
  onNewMessage,
  onNewGroup,
  searchRef,
}: HubListProps) {
  const ownSearchRef = useRef<HTMLInputElement>(null);
  const inputRef = searchRef ?? ownSearchRef;
  const navRef = useRef<HTMLElement>(null);
  const searchId = useId();
  // Ulaz liste samo na prvo punjenje; kucanje u pretrazi i reaktivna
  // osvežavanja menjaju listu bez animacije (plan K07 §4.1, tačka 8).
  useEnter(navRef, { key: state.status });

  const empty = state.status === "ready" && hubIsEmpty(state.input);
  const searching = query.trim().length > 0;

  // Roving tabindex: lista je JEDNO Tab mesto (izabran razgovor, inače prvi
  // element); strelice pomeraju fokus, a mesto prati poslednji fokusiran element.
  const [rovingKey, setRovingKey] = useState<string | null>(null);
  const navKeys = groups.flatMap((group) => [
    ...(group.collapsible && !searching ? [`grupa:${group.key}`] : []),
    ...(group.collapsed ? [] : group.channels.map((channel) => `red:${channel._id}`)),
  ]);
  const defaultKey =
    activeChannelId !== null && hubNavigableIds(groups).includes(activeChannelId)
      ? `red:${activeChannelId}`
      : (navKeys[0] ?? null);
  const tabKey = rovingKey !== null && navKeys.includes(rovingKey) ? rovingKey : defaultKey;

  function onNavKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = navigable(navRef.current);
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    // Strelica gore sa prvog elementa vraća u pretragu.
    if (event.key === "ArrowUp" && current <= 0) {
      inputRef.current?.focus();
      return;
    }
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : current === -1
            ? 0
            : Math.min(items.length - 1, current + (event.key === "ArrowDown" ? 1 : -1));
    items[next]?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">Moj prostor</p>
          <h1 className="truncate text-lg font-bold tracking-[-0.02em]">Poruke</h1>
        </div>
        <Button type="button" size="sm" className="h-8 shrink-0" onClick={onNewMessage}>
          <SquarePen aria-hidden="true" />
          Nova poruka
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Nova grupa"
              onClick={onNewGroup}
            >
              <Users aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nova grupa</TooltipContent>
        </Tooltip>
      </header>

      <div className="px-3 pt-3">
        <label htmlFor={searchId} className="sr-only">
          Pretraži razgovore
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                // Prvi Esc briše upit, drugi izlazi iz polja.
                event.preventDefault();
                if (query) onQueryChange("");
                else event.currentTarget.blur();
              } else if (event.key === "ArrowDown") {
                const first = navigable(navRef.current)[0];
                if (first) {
                  event.preventDefault();
                  first.focus();
                }
              } else if (event.key === "Enter" && searching) {
                // Enter otvara prvi pogodak pretrage.
                const firstRow = navigable(navRef.current).find((element) => element.dataset.channelId);
                if (firstRow?.dataset.channelId) {
                  event.preventDefault();
                  onSelect(firstRow.dataset.channelId);
                }
              }
            }}
            data-hub-search=""
            placeholder="Pretraži razgovore…"
            autoComplete="off"
            className="h-9 pl-8 pr-9 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                inputRef.current?.focus();
              }}
              aria-label="Obriši pretragu"
              className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : (
            <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 md:pointer-fine:block" aria-hidden="true">
              <Kbd>/</Kbd>
            </span>
          )}
        </div>
      </div>

      <nav
        ref={navRef}
        aria-label="Razgovori"
        onKeyDown={onNavKeyDown}
        onFocus={(event) => {
          const key = (event.target as HTMLElement).dataset.navKey;
          if (key) setRovingKey(key);
        }}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-3"
      >
        {state.status === "loading" ? (
          <div role="status" className="space-y-1.5 px-1">
            <span className="sr-only">Učitavanje razgovora…</span>
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex items-center gap-2.5 px-1.5 py-1.5" aria-hidden="true">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : state.status === "error" ? (
          <div role="alert" className="mx-1 rounded-2xl border border-dashed border-border/80 bg-card/45 px-4 py-8 text-center">
            <span className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold">Razgovori se ne mogu učitati</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Proveri vezu i pokušaj ponovo.</p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={state.retry}>
              <RefreshCw aria-hidden="true" />
              Pokušaj ponovo
            </Button>
          </div>
        ) : empty ? (
          <>
            <EmptyState
              icon={MessagesSquare}
              title="Još nemaš razgovora"
              description="Pošalji poruku nekome iz tima ili napravi grupu."
              action={
                <Button type="button" size="sm" onClick={onNewMessage}>
                  <SquarePen aria-hidden="true" />
                  Nova poruka
                </Button>
              }
              className="mx-1 xl:hidden"
            />
            <p className="hidden px-3 py-4 text-sm text-muted-foreground xl:block">Još nemaš razgovora.</p>
          </>
        ) : searching && groups.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="break-words text-sm text-muted-foreground">Nema razgovora za „{query.trim()}“.</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                onQueryChange("");
                inputRef.current?.focus();
              }}
            >
              Obriši pretragu
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <HubGroupSection
                key={group.key}
                group={group}
                now={now}
                meId={meId}
                activeChannelId={activeChannelId}
                searching={searching}
                tabKey={tabKey}
                onSelect={onSelect}
                onToggle={() => onToggleGroup(group.key)}
              />
            ))}
            {state.capped ? (
              <p className="px-3 text-xs leading-5 text-muted-foreground">
                Prikazani su samo najsvežiji razgovori. Stariji su u chatu svakog startupa.
              </p>
            ) : null}
          </div>
        )}
      </nav>
    </div>
  );
}

function UnreadCount({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[0.625rem] font-bold leading-4 text-primary-foreground",
        className,
      )}
    >
      <NumberRoll value={count} aria-label={hubUnreadLabel(count)} />
    </span>
  );
}

function HubGroupSection({
  group,
  now,
  meId,
  activeChannelId,
  searching,
  tabKey,
  onSelect,
  onToggle,
}: {
  group: HubGroup;
  now: number;
  meId: string;
  activeChannelId: string | null;
  /** Dok traje pretraga ništa nije sklopljeno, pa se zaglavlje ne sklapa. */
  searching: boolean;
  /** Ključ jedinog Tab mesta u listi (roving tabindex). */
  tabKey: string | null;
  onSelect: (channelId: string) => void;
  onToggle: () => void;
}) {
  const headingId = useId();
  const listId = useId();
  const toggleable = group.collapsible && !searching;
  const headerKey = `grupa:${group.key}`;
  const rows = (
    <ul id={listId} className="space-y-0.5">
      {group.channels.map((channel) => (
        <HubRow
          key={channel._id}
          channel={channel}
          now={now}
          meId={meId}
          active={channel._id === activeChannelId}
          tabbable={tabKey === `red:${channel._id}`}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );

  return (
    <div role="group" aria-labelledby={headingId}>
      {toggleable ? (
        <h2 id={headingId}>
          <button
            type="button"
            data-hub-nav=""
            data-nav-key={headerKey}
            data-motion-enter=""
            tabIndex={tabKey === headerKey ? 0 : -1}
            aria-expanded={!group.collapsed}
            aria-controls={listId}
            onClick={onToggle}
            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-sidebar-accent/50"
          >
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                group.collapsed && "-rotate-90",
              )}
              aria-hidden="true"
            />
            <GroupTitle group={group} />
          </button>
        </h2>
      ) : (
        <h2 id={headingId} data-motion-enter="" className="flex min-h-9 items-center gap-2 px-2">
          <GroupTitle group={group} />
        </h2>
      )}
      {group.collapsible ? <Collapse open={!group.collapsed}>{rows}</Collapse> : rows}
    </div>
  );
}

function GroupTitle({ group }: { group: HubGroup }) {
  return (
    <>
      {group.startup ? <StartupChip startup={group.startup} size="sm" /> : null}
      <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {group.title}
      </span>
      {group.unreadCount > 0 ? <UnreadCount count={group.unreadCount} /> : null}
    </>
  );
}

function HubRow({
  channel,
  now,
  meId,
  active,
  tabbable,
  onSelect,
}: {
  channel: HubChannel;
  now: number;
  meId: string;
  active: boolean;
  tabbable: boolean;
  onSelect: (channelId: string) => void;
}) {
  const name = hubChannelName(channel);
  const unread = channel.unreadCount > 0 || channel.mentionCount > 0;
  const hasMessages = channel.lastMessagePreview.trim().length > 0;
  return (
    <li>
      <button
        type="button"
        data-hub-nav=""
        data-nav-key={`red:${channel._id}`}
        data-motion-enter=""
        data-channel-id={channel._id}
        tabIndex={tabbable ? 0 : -1}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(channel._id)}
        className={cn(
          "flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors",
          active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50",
        )}
      >
        <HubRowIcon channel={channel} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold" : "font-medium text-foreground/90")}>
              {name}
            </span>
            {hasMessages ? (
              <time
                dateTime={new Date(channel.lastMessageAt).toISOString()}
                className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground"
              >
                {formatInboxTime(channel.lastMessageAt, now)}
              </time>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-xs", unread ? "text-foreground/80" : "text-muted-foreground")}>
              {hubRowPreview(channel, meId)}
            </span>
            <UnreadMark channel={channel} />
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Nepročitano u redu (isto kao lista startupa): pominjanja uvek nose broj,
 * kanal utišan na „samo @" dobija tihu tačku, inače broj.
 */
function UnreadMark({ channel }: { channel: HubChannel }) {
  if (channel.mentionCount > 0) {
    return (
      <span className="inline-flex h-[1.125rem] shrink-0 items-center rounded-full bg-primary px-1.5 font-mono text-[0.625rem] font-bold leading-4 text-primary-foreground">
        <span aria-hidden="true">@</span>
        <NumberRoll value={channel.mentionCount} aria-label={hubMentionLabel(channel.mentionCount)} />
      </span>
    );
  }
  if (channel.unreadCount === 0) return null;
  if (channel.notificationLevel === "mentions") {
    return (
      <span className="flex shrink-0 items-center">
        <span className="size-2 rounded-full bg-primary/70" aria-hidden="true" />
        <span className="sr-only">Ima novih poruka</span>
      </span>
    );
  }
  return <UnreadCount count={channel.unreadCount} />;
}

function HubRowIcon({ channel }: { channel: HubChannel }) {
  if (channel.kind === "dm") {
    return channel.otherParticipant ? (
      <ProfileAvatar profile={channel.otherParticipant} className="size-9 shrink-0" />
    ) : (
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <Users className="size-4" aria-hidden="true" />
      </span>
    );
  }
  if (channel.startupId === null) {
    return (
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Users className="size-4" aria-hidden="true" />
      </span>
    );
  }
  const Icon = channel.kind === "thread" || channel.kind === "agent" ? MessagesSquare : Hash;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}
