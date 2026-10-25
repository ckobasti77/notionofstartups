"use client";

import { Component, useRef, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { toast } from "sonner";
import {
  inboxFeedArgs,
  inboxMarkAllArgs,
  inboxMarkedMessage,
  inboxScopeKey,
  inboxTarget,
  type InboxScope,
  type InboxSegment,
  type InboxTarget,
  type StartupMini,
} from "@devotion/shared";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { notificationDestination, type NotificationDestination } from "@/convex/lib/notificationTarget";
import { accessErrorMessage } from "@/lib/errors";
import { useShortcuts } from "@/components/shortcuts/shortcut-provider";
import { INBOX_SHORTCUTS } from "@/lib/shortcuts/registry";
import type { Today } from "@/lib/today";
import { useQueryTolerant } from "@/components/workspace/workspace-error-boundary";

import { useQueryState } from "../my-day/use-query-state";
import {
  InboxView,
  type InboxFeedState,
  type InboxItemModel,
  type InboxPendingModel,
  type InboxPendingState,
} from "./inbox-view";

/** Cilj klika kako ga razrešava `inboxTarget` (web ga otvara u ljusci). */
export type InboxNavigation = InboxTarget<NotificationDestination>;

export type InboxContainerProps = {
  today: Today;
  /** Moji aktivni startupi, redosledom ljuske (čipovi opsega). */
  startups: ReadonlyArray<StartupMini>;
  /** Otvara cilj u ljusci (startup cilj prebacuje opseg; lični chat → `me-chat`). */
  onNavigate: (target: InboxNavigation) => void;
  /** Dijalog „Obaveštenja i zvuci" (živi u ljusci). */
  onOpenSettings: () => void;
};

const PAGE_SIZE = 25;

type FeedArgs = { startupId?: Id<"startups"> | null; unreadOnly?: boolean };

/**
 * Inbox (K14): `inbox.feed` (paginirano), `inbox.unreadCounts`, `inbox.pending`
 * i `inbox.markAllRead`. Klik na red označi pročitano pa otvara cilj kroz
 * `inboxTarget` (ista logika kao telefon). Greška feed-a i greška „Čeka tebe"
 * su odvojene: feed baca iz `usePaginatedQuery`, pa ga hvata `FeedBoundary`,
 * a „Čeka tebe" ide kroz `useQueryState`. „Pokušaj ponovo" ponovo montira ceo
 * kontejner (nova pretplata).
 */
export function InboxContainer(props: InboxContainerProps) {
  const [attempt, setAttempt] = useState(0);
  // Segment i opseg žive iznad ponovnog montiranja: „Pokušaj ponovo“ ih ne vraća na „Sve / Svi“.
  const [segment, setSegment] = useState<InboxSegment>("all");
  const [scope, setScope] = useState<InboxScope>({ kind: "all" });
  return (
    <InboxContent
      key={attempt}
      {...props}
      retry={() => setAttempt((value) => value + 1)}
      segment={segment}
      setSegment={setSegment}
      scope={scope}
      setScope={setScope}
    />
  );
}

function InboxContent({
  today,
  startups,
  onNavigate,
  onOpenSettings,
  retry,
  segment,
  setSegment,
  scope,
  setScope,
}: InboxContainerProps & {
  retry: () => void;
  segment: InboxSegment;
  setSegment: (segment: InboxSegment) => void;
  scope: InboxScope;
  setScope: (scope: InboxScope) => void;
}) {
  const [markingAll, setMarkingAll] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useQueryTolerant(api.inbox.unreadCounts, {}) ?? null;
  const pendingQuery = useQueryState(api.inbox.pending, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.inbox.markAllRead);

  // Čip koji više ne postoji (napušten startup) vraća prikaz na „Svi".
  const effectiveScope: InboxScope =
    scope.kind === "startup" && !startups.some((startup) => startup._id === scope.startupId)
      ? { kind: "all" }
      : scope;

  const pending: InboxPendingState =
    pendingQuery.status === "loading"
      ? { status: "loading" }
      : pendingQuery.status === "error"
        ? { status: "error", retry }
        : {
            status: "ready",
            items: pendingQuery.data.items as ReadonlyArray<InboxPendingModel>,
            truncated: pendingQuery.data.truncated,
          };

  // Prečice: 1/2/3 menjaju segment, j/k pomeraju fokus kroz redove.
  useShortcuts(Object.values(INBOX_SHORTCUTS), (id) => {
    if (id === INBOX_SHORTCUTS.all.id) setSegment("all");
    else if (id === INBOX_SHORTCUTS.unread.id) setSegment("unread");
    else if (id === INBOX_SHORTCUTS.pending.id) setSegment("pending");
    else if (id === INBOX_SHORTCUTS.next.id || id === INBOX_SHORTCUTS.prev.id) {
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-row]") ?? []);
      if (rows.length === 0) return false;
      // Fokus na pomoćnom dugmetu reda (npr. „Označi kao pročitano“) računa se kao taj red.
      const active = document.activeElement as HTMLElement | null;
      const holder = active?.closest("li");
      const current = rows.findIndex((row) => row === active || (holder !== null && holder !== undefined && holder.contains(row)));
      const step = id === INBOX_SHORTCUTS.next.id ? 1 : -1;
      const next = current === -1 ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, current + step));
      rows[next]?.focus();
    }
  });

  const open = (item: InboxItemModel) => {
    if (item.readAt === null) {
      // Označavanje je „ispali i zaboravi": navigacija ne čeka mrežu.
      void markRead({ notificationId: item._id as Id<"notifications"> }).catch((error: unknown) =>
        toast.error(accessErrorMessage(error, "Označavanje nije uspelo.")),
      );
    }
    const target = inboxTarget(item, notificationDestination);
    if (target.kind === "none") {
      toast.info("Ovo obaveštenje nema odredište. Označeno je kao pročitano.");
      return;
    }
    onNavigate(target);
  };

  /** Najava se prvo isprazni, da čitač ekrana ponovi isti tekst. */
  const announce = (message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 50);
  };

  const markOne = (item: InboxItemModel) => {
    // Dugme i (u „Nepročitano“) ceo red nestaju: fokus ide na sledeći red, ili na prethodni.
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-row]") ?? []);
    const index = rows.findIndex((row) => row.closest("li")?.contains(document.activeElement));
    const neighbour = index === -1 ? null : (rows[index + 1] ?? rows[index - 1] ?? null);
    void markRead({ notificationId: item._id as Id<"notifications"> })
      .then(() => {
        announce("Označeno kao pročitano.");
        if (neighbour?.isConnected) neighbour.focus();
      })
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Označavanje nije uspelo.")));
  };

  const openPending = (item: InboxPendingModel) => {
    onNavigate(
      inboxTarget(
        { targetType: item.targetType, targetId: item.targetId, startupId: item.startup._id },
        notificationDestination,
      ),
    );
  };

  const markAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const result = await markAllRead(inboxMarkAllArgs(effectiveScope) as { startupId?: Id<"startups"> | null });
      const message = inboxMarkedMessage(result);
      toast.success(message);
      announce(message);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Označavanje nije uspelo."));
    } finally {
      setMarkingAll(false);
    }
  };

  const renderView = (feed: InboxFeedState) => (
    <InboxView
      now={today.now}
      segment={segment}
      onSegmentChange={setSegment}
      scope={effectiveScope}
      onScopeChange={setScope}
      startups={startups}
      counts={counts}
      feed={feed}
      pending={pending}
      onOpen={open}
      onMarkRead={markOne}
      onOpenPending={openPending}
      onMarkAllRead={() => void markAll()}
      markingAll={markingAll}
      onOpenSettings={onOpenSettings}
      announcement={announcement}
      listRef={listRef}
    />
  );

  return (
    <FeedBoundary retry={retry} render={renderView} resetKey={`${segment}|${inboxScopeKey(effectiveScope)}`}>
      <FeedBridge args={inboxFeedArgs(effectiveScope, segment) as FeedArgs} render={renderView} />
    </FeedBoundary>
  );
}

/** Pretplata na feed; stanje daje prikazu (bacanje greške hvata `FeedBoundary`). */
function FeedBridge({ args, render }: { args: FeedArgs; render: (feed: InboxFeedState) => ReactNode }) {
  const { results, status, loadMore } = usePaginatedQuery(api.inbox.feed, args, { initialNumItems: PAGE_SIZE });
  const feed: InboxFeedState =
    status === "LoadingFirstPage"
      ? { status: "loading" }
      : {
          status: "ready",
          items: results as ReadonlyArray<InboxItemModel>,
          canLoadMore: status === "CanLoadMore",
          loadingMore: status === "LoadingMore",
          onLoadMore: () => loadMore(PAGE_SIZE),
        };
  return <>{render(feed)}</>;
}

/**
 * `usePaginatedQuery` baca grešku servera tokom rendera. Granica je ovde, oko
 * samo feed-a, da zaglavlje, segmenti i „Čeka tebe" ostanu živi i da greška
 * feed-a bude odvojena od greške „Čeka tebe" (plan K07 §1.5).
 */
class FeedBoundary extends Component<
  {
    children: ReactNode;
    retry: () => void;
    render: (feed: InboxFeedState) => ReactNode;
    /** Promena segmenta ili opsega je nova pretplata: greška starog filtera ne važi. */
    resetKey: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.render({ status: "error", retry: this.props.retry });
    return this.props.children;
  }
}
