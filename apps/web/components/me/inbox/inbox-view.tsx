"use client";

import { useId, useRef, type RefObject } from "react";
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCheck,
  GitMerge,
  Hourglass,
  Inbox,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import {
  formatInboxTime,
  groupInboxByDay,
  INBOX_SEGMENTS,
  inboxCountLabel,
  inboxEmptyCopy,
  inboxPendingFor,
  inboxScopeKey,
  inboxUnreadFor,
  inboxUnreadWord,
  pendingIsVote,
  pendingKey,
  pendingTitle,
  type InboxCounts,
  type InboxScope,
  type InboxSegment,
  type PendingItemLike,
  type StartupMini,
} from "@devotion/shared";

import { NumberRoll } from "@/components/motion/number-roll";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOUD_TYPES, TYPE_ICON } from "@/components/workspace/notifications-panel";
import { EmptyState, ProfileAvatar } from "@/components/workspace/workspace-ui";
import { useEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";
import { InboxSkeleton } from "./inbox-skeleton";

/** Stavka feed-a (`inbox.feed`) onoliko koliko prikaz čita. */
export type InboxItemModel = {
  _id: string;
  type: string;
  title: string;
  body?: string;
  targetType: string;
  targetId: string | null;
  readAt: number | null;
  createdAt: number;
  /** `null` = lično obaveštenje (poruka iz ličnog razgovora). */
  startupId: string | null;
  startup: StartupMini | null;
  actor: { displayName: string; avatarUrl: string | null } | null;
};

/** Stavka „Čeka tebe" (`inbox.pending`) onoliko koliko prikaz čita. */
export type InboxPendingModel = PendingItemLike & {
  startup: StartupMini;
  createdAt: number;
  targetType: string;
  targetId: string;
};

export type InboxFeedState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      items: ReadonlyArray<InboxItemModel>;
      canLoadMore: boolean;
      loadingMore: boolean;
      onLoadMore: () => void;
    };

export type InboxPendingState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; items: ReadonlyArray<InboxPendingModel>; truncated: boolean };

export type InboxViewProps = {
  now: number;
  segment: InboxSegment;
  onSegmentChange: (segment: InboxSegment) => void;
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  startups: ReadonlyArray<StartupMini>;
  /** `null` dok brojači ne stignu (ili upit padne) — brojevi se tada ne prikazuju. */
  counts: InboxCounts | null;
  feed: InboxFeedState;
  pending: InboxPendingState;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
  onOpenPending: (item: InboxPendingModel) => void;
  onMarkAllRead: () => void;
  markingAll: boolean;
  onOpenSettings: () => void;
  /** Najava za čitač ekrana (npr. „Označeno kao pročitano: 3."). */
  announcement?: string;
  listRef?: RefObject<HTMLDivElement | null>;
};

const chipClass =
  "relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Inbox (K14, plan K07 §1.5): obaveštenja iz svih startupa i ličnih poruka na
 * jednom mestu, segmenti „Sve / Nepročitano / Čeka tebe", čipovi startupa,
 * grupe Danas / Juče / Ranije. Prezentacija: podaci i radnje kroz props (izlog
 * ga prikazuje bez prijave). Klik na red označava pročitano pa otvara cilj
 * (to radi kontejner).
 */
export function InboxView({
  now,
  segment,
  onSegmentChange,
  scope,
  onScopeChange,
  startups,
  counts,
  feed,
  pending,
  onOpen,
  onMarkRead,
  onOpenPending,
  onMarkAllRead,
  markingAll,
  onOpenSettings,
  announcement = "",
  listRef,
}: InboxViewProps) {
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;
  // Ulaz liste samo na prvo punjenje i promenu segmenta/opsega; reaktivna
  // osvežavanja ne okidaju stagger (plan K07 §4.1, E12).
  const stateKey = `${segment}|${inboxScopeKey(scope)}|${segment === "pending" ? pending.status : feed.status}`;
  useEnter(scopeRef, { key: stateKey });

  const scoped = counts ? inboxUnreadFor(counts, scope) : null;
  const total = counts?.total ?? null;
  const pendingScoped = pending.status === "ready" ? inboxPendingFor(pending.items, scope) : null;
  const pendingAll = pending.status === "ready" ? pending.items.length : null;
  const tabId = useId();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <header data-workspace-enter className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === null ? (
              "Obaveštenja iz svih startupa i ličnih poruka"
            ) : total.count === 0 ? (
              "Sve je pročitano"
            ) : (
              <>
                <span className="font-mono font-semibold text-foreground">
                  <NumberRoll value={total.count} aria-label={`${total.count}${total.capped ? "+" : ""}`} />
                  {total.capped ? <span aria-hidden="true">+</span> : null}
                </span>{" "}
                {inboxUnreadWord(total.count)}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            onClick={onMarkAllRead}
            // U „Čeka tebe“ se vide samo odluke, pa masovno označavanje obaveštenja tu ne važi.
            disabled={markingAll || segment === "pending" || scoped === null || scoped.count === 0}
            aria-label="Označi sve kao pročitano"
            title="Označi sve kao pročitano"
          >
            <CheckCheck aria-hidden="true" />
            <span className="hidden sm:inline">Označi sve kao pročitano</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Podešavanja obaveštenja"
            title="Podešavanja obaveštenja"
          >
            <SlidersHorizontal aria-hidden="true" />
          </Button>
        </div>
      </header>

      <Tabs
        ref={scopeRef as RefObject<HTMLDivElement>}
        value={segment}
        onValueChange={(value) => onSegmentChange(value as InboxSegment)}
        className="mt-5"
      >
        <TabsList aria-label="Prikaz Inboxa" className="h-10 w-full sm:w-auto pointer-coarse:h-12">
          {INBOX_SEGMENTS.map(({ key, label }) => {
            const count = key === "unread" ? scoped : key === "pending" ? (pendingScoped ? { count: pendingScoped.length, capped: false } : null) : null;
            return (
              <TabsTrigger
                key={key}
                value={key}
                id={`${tabId}-${key}`}
                className="h-8 flex-1 gap-2 px-3 sm:flex-none pointer-coarse:h-11"
              >
                {label}
                {count !== null && count.count > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 font-mono text-[0.6875rem] font-bold leading-5 tabular-nums text-primary-foreground">
                    {inboxCountLabel(count.count, count.capped)}
                    <span className="sr-only">
                      {" "}
                      {key === "unread" ? inboxUnreadWord(count.count) : "za tvoju odluku"}
                    </span>
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {startups.length > 0 ? (
          <div
            role="group"
            aria-label="Opseg obaveštenja"
            className="scrollbar-thin -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 py-1"
          >
            <ScopeChip
              active={scope.kind === "all"}
              onClick={() => onScopeChange({ kind: "all" })}
              unread={total}
              pendingCount={pendingAll}
              segment={segment}
            >
              Svi
            </ScopeChip>
            <ScopeChip
              active={scope.kind === "personal"}
              onClick={() => onScopeChange({ kind: "personal" })}
              unread={counts?.personal ?? null}
              pendingCount={0}
              segment={segment}
              leading={<StartupChip startup={null} size="xs" />}
            >
              Lično
            </ScopeChip>
            {startups.map((startup) => {
              const startupScope: InboxScope = { kind: "startup", startupId: startup._id };
              return (
                <ScopeChip
                  key={startup._id}
                  active={scope.kind === "startup" && scope.startupId === startup._id}
                  onClick={() => onScopeChange(startupScope)}
                  unread={counts ? inboxUnreadFor(counts, startupScope) : null}
                  pendingCount={pending.status === "ready" ? inboxPendingFor(pending.items, startupScope).length : null}
                  segment={segment}
                  leading={<StartupChip startup={startup} size="xs" />}
                >
                  <span className="max-w-32 truncate">{startup.name}</span>
                </ScopeChip>
              );
            })}
          </div>
        ) : null}

        {INBOX_SEGMENTS.map(({ key }) => (
          <TabsContent
            key={key}
            value={key}
            aria-labelledby={`${tabId}-${key}`}
            className="mt-4"
          >
            {segment === key ? (
              <div data-workspace-enter>
                {key === "pending" ? (
                  <PendingPanel state={pending} scope={scope} segment={segment} now={now} onOpen={onOpenPending} />
                ) : (
                  <FeedPanel state={feed} scope={scope} segment={segment} now={now} onOpen={onOpen} onMarkRead={onMarkRead} />
                )}
              </div>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  unread,
  pendingCount,
  segment,
  leading,
  children,
}: {
  active: boolean;
  onClick: () => void;
  unread: { count: number; capped: boolean } | null;
  pendingCount: number | null;
  segment: InboxSegment;
  leading?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Broj na čipu prati segment: „Čeka tebe" broji odluke, ostalo nepročitano.
  const shown = segment === "pending" ? (pendingCount === null ? null : { count: pendingCount, capped: false }) : unread;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        chipClass,
        active
          ? "border-primary/40 bg-accent text-accent-foreground"
          : "border-border bg-card/60 text-foreground hover:bg-muted/60",
      )}
    >
      {leading}
      {children}
      {shown !== null && shown.count > 0 ? (
        <span className="font-mono text-[0.6875rem] font-bold tabular-nums text-muted-foreground">
          {inboxCountLabel(shown.count, shown.capped)}
          <span className="sr-only"> {segment === "pending" ? "za tvoju odluku" : inboxUnreadWord(shown.count)}</span>
        </span>
      ) : null}
    </button>
  );
}

function FeedPanel({
  state,
  scope,
  segment,
  now,
  onOpen,
  onMarkRead,
}: {
  state: InboxFeedState;
  scope: InboxScope;
  segment: InboxSegment;
  now: number;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
}) {
  if (state.status === "loading") return <InboxSkeleton />;
  if (state.status === "error") {
    return <InboxError title="Inbox se ne može učitati" retry={state.retry} />;
  }
  if (state.items.length === 0) {
    const copy = inboxEmptyCopy(segment, scope);
    // Backend filtrira stavke POSLE paginacije: stranica može doći prazna, a da ima još.
    const more = state.canLoadMore || state.loadingMore;
    return (
      <EmptyState
        headingAs="h2"
        icon={segment === "unread" ? Check : Inbox}
        title={more ? "Nema ništa na ovoj strani" : copy.title}
        description={more ? "Ostalo može biti dalje u istoriji." : copy.description}
        action={
          more ? (
            <Button type="button" variant="outline" disabled={state.loadingMore} onClick={state.onLoadMore}>
              {state.loadingMore ? "Učitavam…" : "Učitaj još"}
            </Button>
          ) : undefined
        }
      />
    );
  }
  const groups = groupInboxByDay(state.items, now);
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <InboxGroup key={group.key} title={group.title} count={group.items.length}>
          {group.items.map((item) => (
            <li key={item._id} data-flip-id={item._id}>
              <InboxRow item={item} now={now} onOpen={onOpen} onMarkRead={onMarkRead} />
            </li>
          ))}
        </InboxGroup>
      ))}
      {state.canLoadMore || state.loadingMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={state.loadingMore}
          onClick={state.onLoadMore}
        >
          {state.loadingMore ? "Učitavam…" : "Učitaj još"}
        </Button>
      ) : null}
    </div>
  );
}

function InboxGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-1.5 px-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground"
      >
        {title}
        <span className="sr-only">, {count}</span>
      </h2>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function InboxRow({
  item,
  now,
  onOpen,
  onMarkRead,
}: {
  item: InboxItemModel;
  now: number;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
}) {
  const Icon = TYPE_ICON[item.type] ?? BellRing;
  const unread = item.readAt === null;
  const loud = LOUD_TYPES.has(item.type);
  const time = formatInboxTime(item.createdAt, now);
  const place = item.startup === null ? "Lično" : item.startup.name;

  return (
    <div
      data-motion-enter
      className={cn(
        "group/row relative flex items-start rounded-xl border border-transparent transition-colors hover:bg-muted/60 focus-within:bg-muted/60",
        unread && "border-border/60 bg-card",
      )}
    >
      <button
        type="button"
        data-inbox-row
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
            loud ? "bg-destructive/12 text-destructive" : "bg-primary/8 text-primary",
          )}
        >
          {item.actor === null ? (
            <Icon className="size-4" aria-hidden="true" />
          ) : (
            <ProfileAvatar profile={item.actor} className="size-8" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm leading-5 [overflow-wrap:anywhere]", unread ? "font-semibold" : "text-muted-foreground")}>
            {unread ? <span className="sr-only">Nepročitano. </span> : null}
            {item.title}
          </span>
          {item.body ? (
            <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{item.body}</span>
          ) : null}
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <StartupChip startup={item.startup} size="xs" />
            <span className="min-w-0 truncate">{place}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 tabular-nums">{time}</time>
          </span>
        </span>
        {unread ? (
          <span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-primary" />
        ) : null}
      </button>
      {unread ? (
        <button
          type="button"
          aria-label={`Označi kao pročitano: ${item.title}`}
          title="Označi kao pročitano"
          onClick={() => onMarkRead(item)}
          className="mr-1.5 mt-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:pointer-fine:opacity-0 md:pointer-fine:group-hover/row:opacity-100 md:pointer-fine:group-focus-within/row:opacity-100"
        >
          <Check className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function PendingPanel({
  state,
  scope,
  segment,
  now,
  onOpen,
}: {
  state: InboxPendingState;
  scope: InboxScope;
  segment: InboxSegment;
  now: number;
  onOpen: (item: InboxPendingModel) => void;
}) {
  if (state.status === "loading") return <InboxSkeleton />;
  if (state.status === "error") {
    return <InboxError title="„Čeka tebe“ se ne može učitati" retry={state.retry} />;
  }
  const items = inboxPendingFor(state.items, scope);
  if (items.length === 0) {
    const copy = inboxEmptyCopy(segment, scope);
    return <EmptyState headingAs="h2" icon={Hourglass} title={copy.title} description={copy.description} />;
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={pendingKey(item)} data-flip-id={pendingKey(item)}>
            <PendingRow item={item} now={now} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {state.truncated ? (
        <p className="px-1 text-xs text-muted-foreground">
          Prikazan je samo deo. Ostalo je u Odobrenjima.
        </p>
      ) : null}
    </div>
  );
}

function PendingRow({
  item,
  now,
  onOpen,
}: {
  item: InboxPendingModel;
  now: number;
  onOpen: (item: InboxPendingModel) => void;
}) {
  // PROSTOR P22: ideja čeka glas („Glasaj"); stari tipovi ostaju prepoznati.
  const vote = pendingIsVote(item);
  const Icon = item.kind === "idea_vote" ? Lightbulb : vote ? ShieldCheck : GitMerge;
  const title = pendingTitle(item);
  return (
    <div
      data-motion-enter
      className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{title}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <StartupChip startup={item.startup} size="xs" />
          <span className="min-w-0 truncate">{item.startup.name}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 tabular-nums">{formatInboxTime(item.createdAt, now)}</time>
        </span>
      </span>
      <Button
        type="button"
        size="sm"
        variant={vote ? "default" : "outline"}
        data-inbox-row
        className="shrink-0"
        onClick={() => onOpen(item)}
        aria-label={`${vote ? "Glasaj" : "Pogledaj"}: ${title}`}
      >
        {vote ? "Glasaj" : "Pogledaj"}
        <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  );
}

function InboxError({ title, retry }: { title: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/45 px-6 py-10 text-center"
    >
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Proveri vezu i pokušaj ponovo.</p>
      <Button type="button" variant="outline" className="mt-5" onClick={retry}>
        <RefreshCw aria-hidden="true" />
        Pokušaj ponovo
      </Button>
    </div>
  );
}
