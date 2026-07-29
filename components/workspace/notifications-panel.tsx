"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  BellRing,
  CalendarClock,
  CheckSquare2,
  Flame,
  Gavel,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ProfileAvatar, formatActivityTime, isToday } from "@/components/workspace/workspace-ui";
import { usePushNotifications, type PushState } from "@/hooks/use-push-notifications";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type NotificationTargetType = "page" | "ideas" | "approvals" | "puls";

export type NotificationItem = {
  _id: Id<"notifications">;
  type: string;
  title: string;
  body?: string;
  targetType: NotificationTargetType;
  targetId: string | null;
  readAt: number | null;
  createdAt: number;
  actor: { displayName: string; avatarUrl: string | null } | null;
};

const TYPE_ICON: Record<string, typeof CheckSquare2> = {
  task_assigned: CheckSquare2,
  task_status_changed: CheckSquare2,
  task_due_soon: CalendarClock,
  task_due_today: CalendarClock,
  task_overdue: Flame,
  idea_voted: Lightbulb,
  idea_converted: Sparkles,
  vote_requested: Gavel,
  request_resolved: Gavel,
  puls_ready: Sparkles,
};

/** Prekoračen rok je jedini tip koji sme da nosi crvenu. */
const LOUD_TYPES = new Set(["task_overdue"]);

export function NotificationsSheet({
  open,
  onOpenChange,
  startupId,
  onOpenNotification,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startupId: Id<"startups">;
  onOpenNotification: (item: NotificationItem) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.list,
    open ? { startupId } : "skip",
    { initialNumItems: 25 },
  );
  const unread = useQuery(
    api.notifications.unreadCount,
    open ? { startupId } : "skip",
  );
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [markingAll, setMarkingAll] = useState(false);

  const items = results as unknown as Array<NotificationItem>;
  const groups = useMemo(() => {
    const today: Array<NotificationItem> = [];
    const earlier: Array<NotificationItem> = [];
    for (const item of items) {
      (isToday(item.createdAt) ? today : earlier).push(item);
    }
    return { today, earlier };
  }, [items]);

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllRead({ startupId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Označavanje nije uspelo.",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = unread?.count ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/70 px-5 py-4 pr-14">
          <SheetTitle className="text-base">Obaveštenja</SheetTitle>
          <SheetDescription>
            {unreadCount === 0
              ? "Sve je pročitano."
              : `${unreadCount}${unread?.capped ? "+" : ""} nepročitano.`}
          </SheetDescription>
        </SheetHeader>

        <div className="border-b border-border/70 px-5 py-3">
          <PushToggle />
        </div>

        {unreadCount > 0 ? (
          <div className="flex justify-end border-b border-border/70 px-5 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={markingAll}
              onClick={handleMarkAll}
            >
              Označi sve kao pročitane
            </Button>
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4">
            {status === "LoadingFirstPage" ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={BellRing}
                title="Još nema obaveštenja"
                description="Kada ti neko dodeli zadatak, izglasa ideju ili se rok približi, javićemo ti ovde."
                className="min-h-40"
              />
            ) : (
              <div className="space-y-5">
                {groups.today.length > 0 ? (
                  <NotificationGroup
                    label="Danas"
                    items={groups.today}
                    onOpenNotification={onOpenNotification}
                  />
                ) : null}
                {groups.earlier.length > 0 ? (
                  <NotificationGroup
                    label="Ranije"
                    items={groups.earlier}
                    onOpenNotification={onOpenNotification}
                  />
                ) : null}
                {status === "CanLoadMore" || status === "LoadingMore" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={status === "LoadingMore"}
                    onClick={() => loadMore(25)}
                  >
                    {status === "LoadingMore" ? "Učitavam…" : "Učitaj još"}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function NotificationGroup({
  label,
  items,
  onOpenNotification,
}: {
  label: string;
  items: Array<NotificationItem>;
  onOpenNotification: (item: NotificationItem) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item._id}>
            <NotificationRow item={item} onOpen={onOpenNotification} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  const Icon = TYPE_ICON[item.type] ?? BellRing;
  const unread = item.readAt === null;
  const loud = LOUD_TYPES.has(item.type);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-accent/35",
        unread && "border-border/60 bg-card",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          loud
            ? "bg-destructive/12 text-destructive"
            : "bg-primary/8 text-primary",
        )}
      >
        {item.actor === null ? (
          <Icon className="size-4" aria-hidden="true" />
        ) : (
          <ProfileAvatar profile={item.actor} className="size-8" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm leading-5",
            unread ? "font-semibold" : "text-muted-foreground",
          )}
        >
          {item.title}
        </span>
        {item.body ? (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {item.body}
          </span>
        ) : null}
        <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
          {formatActivityTime(item.createdAt)}
        </span>
      </span>
      {unread ? (
        <span
          aria-label="Nepročitano"
          className="mt-2 size-2 shrink-0 rounded-full bg-primary"
        />
      ) : null}
    </button>
  );
}

const PUSH_COPY: Record<
  PushState,
  { title: string; description: string } | null
> = {
  checking: null,
  unsupported: {
    title: "Ovaj browser ne može da prima obaveštenja",
    description:
      "Otvori aplikaciju u Chrome-u na računaru ili je dodaj na početni ekran na telefonu.",
  },
  unconfigured: {
    title: "Obaveštenja nisu podešena",
    description: "Nedostaje javni VAPID ključ u okruženju aplikacije.",
  },
  idle: {
    title: "Uključi obaveštenja na ovom uređaju",
    description:
      "Dobijaćeš zvuk i poruku i kada je aplikacija zatvorena — za dodeljene zadatke i rokove koji stižu.",
  },
  permitted: {
    title: "Uključi obaveštenja na ovom uređaju",
    description:
      "Dozvola postoji, ali ovaj uređaj još nije prijavljen za prijem.",
  },
  enabled: {
    title: "Obaveštenja su uključena",
    description: "Ovaj uređaj prima obaveštenja i kada je aplikacija zatvorena.",
  },
  blocked: {
    title: "Obaveštenja su blokirana u browseru",
    description:
      "Klikni na ikonu levo od adrese, izaberi Obaveštenja i prebaci na „Dozvoli”, pa osveži stranicu.",
  },
};

function PushToggle() {
  const { state, busy, error, enable, disable } = usePushNotifications();
  const deviceCount = useQuery(api.pushSubscriptions.myDeviceCount, {});
  const copy = PUSH_COPY[state];

  if (state === "checking" || copy === null) {
    return <Skeleton className="h-16 rounded-xl" />;
  }

  const canEnable = state === "idle" || state === "permitted";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3",
        state === "enabled"
          ? "border-success/35 bg-success/[0.06]"
          : state === "blocked"
            ? "border-destructive/35 bg-destructive/[0.05]"
            : "border-border/70 bg-muted/25",
      )}
    >
      <div className="flex items-start gap-2.5">
        <BellRing
          className={cn(
            "mt-0.5 size-4 shrink-0",
            state === "enabled"
              ? "text-success"
              : state === "blocked"
                ? "text-destructive"
                : "text-primary",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{copy.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {copy.description}
          </p>
          {state === "enabled" && (deviceCount ?? 0) > 1 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Uređaja koji primaju:{" "}
              <span className="font-mono tabular-nums">{deviceCount}</span>
            </p>
          ) : null}
          {error === null ? null : (
            <p className="mt-1.5 text-xs leading-5 text-destructive">{error}</p>
          )}
          {canEnable ? (
            <Button
              size="sm"
              className="mt-2.5 h-8 text-xs"
              disabled={busy}
              onClick={() => void enable()}
            >
              {busy ? "Uključujem…" : "Uključi obaveštenja"}
            </Button>
          ) : state === "enabled" ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5 h-8 text-xs"
              disabled={busy}
              onClick={() => void disable()}
            >
              {busy ? "Isključujem…" : "Isključi na ovom uređaju"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Toast za obaveštenje koje stigne dok je aplikacija otvorena. Montira se jednom
 * u shell-u. Ne javlja se za ono što je već bilo tu pri učitavanju — inače bi
 * svako osvežavanje stranice zasulo ekran starim obaveštenjima.
 */
export function useNotificationToasts({
  startupId,
  onOpen,
}: {
  startupId: Id<"startups"> | undefined;
  onOpen: (item: NotificationItem) => void;
}) {
  const latest = useQuery(
    api.notifications.latest,
    startupId === undefined ? "skip" : { startupId },
  );
  // `Date.now()` se čita samo u efektu: React zabranjuje nečiste pozive u renderu.
  const mountedAtRef = useRef<number | null>(null);
  const seenRef = useRef(new Set<string>());
  const startupRef = useRef(startupId);
  // Hook sam drži svežu verziju callback-a, pa pozivaoc ne mora da ga memoizuje.
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    if (startupRef.current !== startupId) {
      startupRef.current = startupId;
      mountedAtRef.current = Date.now();
      seenRef.current = new Set();
    }
  }, [startupId]);

  useEffect(() => {
    if (latest === undefined) return;
    if (mountedAtRef.current === null) mountedAtRef.current = Date.now();
    const mountedAt = mountedAtRef.current;
    const items = latest as unknown as Array<NotificationItem>;

    for (const item of items) {
      if (seenRef.current.has(item._id)) continue;
      seenRef.current.add(item._id);
      if (item.createdAt <= mountedAt) continue;
      if (item.readAt !== null) continue;

      toast(item.title, {
        description: item.body,
        action: { label: "Otvori", onClick: () => onOpenRef.current(item) },
      });
    }
  }, [latest]);
}
