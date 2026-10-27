"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import {
  AtSign,
  BellRing,
  CalendarClock,
  CheckSquare2,
  Flame,
  Gavel,
  Lightbulb,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePushNotifications, type PushState } from "@/hooks/use-push-notifications";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type NotificationTargetType =
  | "page"
  | "ideas"
  | "approvals"
  | "puls"
  | "chat"
  | "area";

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

export const TYPE_ICON: Record<string, typeof CheckSquare2> = {
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
  // Chat: pominjanje nosi @, DM je razgovor jedan-na-jedan, poruka u kanalu je
  // opšti balončić. Ikona je fallback — chat obaveštenja obično imaju avatar autora.
  chat_message: MessageCircle,
  chat_mention: AtSign,
  chat_dm: MessageSquare,
  // Komentari (PROSTOR P5): pominjanje nosi @ kao u chatu, nov komentar oblačić sa tekstom.
  comment_mention: AtSign,
  comment_added: MessageSquareText,
};

/** Prekoračen rok je jedini tip koji sme da nosi crvenu. */
export const LOUD_TYPES = new Set(["task_overdue"]);

const PUSH_COPY: Record<
  PushState,
  { title: string; description: string } | null
> = {
  checking: null,
  unsupported: {
    title: "Ovaj pregledač ne može da prima obaveštenja",
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
    title: "Obaveštenja su blokirana u pregledaču",
    description:
      "Klikni na ikonu levo od adrese, izaberi Obaveštenja i prebaci na „Dozvoli”, pa osveži stranicu.",
  },
};

/**
 * Prijem obaveštenja na ovom uređaju (web push). Od K08 se zvono startupa više
 * ne montira, pa prekidač živi i u dijalogu „Obaveštenja i zvuci" (K23).
 */
export function PushToggle() {
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
