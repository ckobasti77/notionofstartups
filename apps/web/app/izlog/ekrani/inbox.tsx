"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  inboxMarkedMessage,
  type InboxScope,
  type InboxSegment,
} from "@devotion/shared";

import { InboxView, type InboxFeedState, type InboxItemModel, type InboxPendingState } from "@/components/me/inbox/inbox-view";
import { ShortcutProvider } from "@/components/shortcuts/shortcut-provider";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";
import {
  IZLOG_INBOX_ITEMS,
  IZLOG_INBOX_PENDING,
  IZLOG_INBOX_STARTUPS,
  izlogInboxCounts,
} from "../fixtures/inbox";

const noop = () => {};

/**
 * Inbox u izlogu (K14): isti `InboxView` kao u aplikaciji, sa lokalnim
 * podacima umesto upita — segmenti, čipovi opsega, „Označi sve" i klik na red
 * (označi pročitano) rade nad stanjem u memoriji.
 */
function IzlogInbox({
  initialSegment,
  items: initialItems,
  pending,
  feedOverride,
  pendingOverride,
}: {
  initialSegment: InboxSegment;
  items: InboxItemModel[];
  pending: typeof IZLOG_INBOX_PENDING;
  feedOverride?: InboxFeedState;
  pendingOverride?: InboxPendingState;
}) {
  const [segment, setSegment] = useState<InboxSegment>(initialSegment);
  const [scope, setScope] = useState<InboxScope>({ kind: "all" });
  const [items, setItems] = useState(initialItems);
  const [markingAll, setMarkingAll] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => izlogInboxCounts(items), [items]);
  const visible = useMemo(
    () =>
      items.filter((entry) => {
        if (segment === "unread" && entry.readAt !== null) return false;
        if (scope.kind === "personal") return entry.startupId === null;
        if (scope.kind === "startup") return entry.startupId === scope.startupId;
        return true;
      }),
    [items, scope, segment],
  );

  const markRead = (target: InboxItemModel) =>
    setItems((current) =>
      current.map((entry) => (entry._id === target._id ? { ...entry, readAt: IZLOG_NOW } : entry)),
    );

  const feed: InboxFeedState = feedOverride ?? {
    status: "ready",
    items: visible,
    canLoadMore: false,
    loadingMore: false,
    onLoadMore: noop,
  };

  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <InboxView
        now={IZLOG_NOW}
        segment={segment}
        onSegmentChange={setSegment}
        scope={scope}
        onScopeChange={setScope}
        startups={IZLOG_INBOX_STARTUPS}
        counts={counts}
        feed={feed}
        pending={pendingOverride ?? { status: "ready", items: pending, truncated: false }}
        onOpen={(target) => {
          markRead(target);
          toast.info(`Otvara: ${target.title}`);
        }}
        onMarkRead={(target) => {
          markRead(target);
          setAnnouncement("Označeno kao pročitano.");
        }}
        onOpenPending={(target) => toast.info(`Odobrenja: ${target.startup.name}`)}
        onMarkAllRead={() => {
          setMarkingAll(true);
          const toMark = visible.filter((entry) => entry.readAt === null);
          setItems((current) =>
            current.map((entry) => (toMark.some((marked) => marked._id === entry._id) ? { ...entry, readAt: IZLOG_NOW } : entry)),
          );
          const message = inboxMarkedMessage({ marked: toMark.length, hasMore: false });
          toast.success(message);
          setAnnouncement(message);
          setMarkingAll(false);
        }}
        markingAll={markingAll}
        onOpenSettings={noop}
        announcement={announcement}
        listRef={listRef}
      />
    </div>
  );
}

export default function InboxEkran({ varijanta }: IzlogEkranProps) {
  const mixed = IZLOG_INBOX_ITEMS;
  return (
    <ShortcutProvider>
      {varijanta === "prazno" ? (
        <IzlogInbox key={varijanta} initialSegment="all" items={[]} pending={[]} />
      ) : varijanta === "ucitavanje" ? (
        <IzlogInbox key={varijanta} initialSegment="all" items={mixed} pending={IZLOG_INBOX_PENDING} feedOverride={{ status: "loading" }} />
      ) : varijanta === "greska" ? (
        <IzlogInbox
          key={varijanta}
          initialSegment="all"
          items={mixed}
          pending={IZLOG_INBOX_PENDING}
          feedOverride={{ status: "error", retry: noop }}
        />
      ) : varijanta === "neprocitano" ? (
        <IzlogInbox key={varijanta} initialSegment="unread" items={mixed} pending={IZLOG_INBOX_PENDING} />
      ) : varijanta === "ceka-tebe-ucitavanje" ? (
        <IzlogInbox key={varijanta} initialSegment="pending" items={mixed} pending={[]} pendingOverride={{ status: "loading" }} />
      ) : varijanta === "ceka-tebe-greska" ? (
        <IzlogInbox
          key={varijanta}
          initialSegment="pending"
          items={mixed}
          pending={[]}
          pendingOverride={{ status: "error", retry: noop }}
        />
      ) : varijanta === "ceka-tebe" ? (
        <IzlogInbox key={varijanta} initialSegment="pending" items={mixed} pending={IZLOG_INBOX_PENDING} />
      ) : (
        <IzlogInbox key={varijanta} initialSegment="all" items={mixed} pending={IZLOG_INBOX_PENDING} />
      )}
    </ShortcutProvider>
  );
}
