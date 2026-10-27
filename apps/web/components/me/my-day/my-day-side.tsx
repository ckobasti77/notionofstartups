"use client";

import { useId, type ReactNode } from "react";
import { ArrowRight, Hourglass, Inbox, MessageCircle } from "lucide-react";
import { formatDayRelative } from "@devotion/shared";

import { NumberRoll } from "@/components/motion/number-roll";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";
import { blockCount, type SideBlock, type SideChat, type SideInbox, type SidePending } from "./side-model";

export type MyDaySideProps = {
  now: number;
  inbox: SideBlock<SideInbox>;
  chat: SideBlock<SideChat>;
  pending: SideBlock<SidePending>;
  onOpenInbox: () => void;
  onOpenChat: () => void;
  /** „Glasaj": ideja u svom startupu (detalj na tabli Ideja). */
  onOpenPending: (item: { startupId: string; ideaId: string }) => void;
};

/**
 * Desna kolona Moj dan (≥ xl, plan K07 §1.2 i E11): Inbox ukratko,
 * nepročitane poruke i „Čeka tebe". Svaki blok ima svoje učitavanje i prazno
 * stanje; blok čiji upit ne postoji ili padne se ne prikazuje.
 */
export function MyDaySide({ now, inbox, chat, pending, onOpenInbox, onOpenChat, onOpenPending }: MyDaySideProps) {
  if (inbox.status === "hidden" && chat.status === "hidden" && pending.status === "hidden") return null;
  return (
    <aside aria-label="Sažetak" className="flex flex-col gap-3">
      {inbox.status !== "hidden" ? (
        <SideCard
          icon={Inbox}
          title="Inbox"
          count={blockCount(inbox, (data) => data.unread)}
          countLabel="nepročitanih obaveštenja"
          more={inbox.status === "ready" && inbox.data.capped}
          actionLabel="Otvori"
          onAction={onOpenInbox}
        >
          {inbox.status === "loading" ? (
            <BlockSkeleton />
          ) : inbox.data.items.length === 0 ? (
            <Empty>Nema nepročitanih obaveštenja.</Empty>
          ) : (
            <ul className="space-y-0.5">
              {inbox.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={onOpenInbox}
                    className="flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <StartupChip startup={item.startup} size="xs" className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-5">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.startup ? item.startup.name : "Lično"} · {formatDayRelative(item.createdAt, now)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SideCard>
      ) : null}

      {chat.status !== "hidden" ? (
        <SideCard
          icon={MessageCircle}
          title="Poruke"
          count={blockCount(chat, (data) => data.total)}
          countLabel="nepročitanih poruka"
          actionLabel="Otvori"
          onAction={onOpenChat}
        >
          {chat.status === "loading" ? (
            <BlockSkeleton rows={2} />
          ) : chat.data.total === 0 ? (
            <Empty>Sve poruke su pročitane.</Empty>
          ) : (
            <ul className="space-y-0.5">
              {chat.data.personal > 0 ? (
                <ChatLine startup={null} label="Lično" unread={chat.data.personal} onClick={onOpenChat} />
              ) : null}
              {chat.data.byStartup.map((entry) => (
                <ChatLine
                  key={entry.startup._id}
                  startup={entry.startup}
                  label={entry.startup.name}
                  unread={entry.unread}
                  onClick={onOpenChat}
                />
              ))}
            </ul>
          )}
        </SideCard>
      ) : null}

      {pending.status !== "hidden" ? (
        <SideCard
          icon={Hourglass}
          title="Čeka tebe"
          count={blockCount(pending, (data) => data.items.length)}
          countLabel="čeka tvoju odluku"
          more={pending.status === "ready" && pending.data.truncated}
          actionLabel="Inbox"
          onAction={onOpenInbox}
        >
          {pending.status === "loading" ? (
            <BlockSkeleton rows={2} />
          ) : pending.data.items.length === 0 ? (
            <Empty>Niko ne čeka tvoju odluku.</Empty>
          ) : (
            <ul className="space-y-0.5">
              {pending.data.items.slice(0, 4).map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onOpenPending({ startupId: item.startup._id, ideaId: item.ideaId })}
                    className="flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <StartupChip startup={item.startup} size="xs" className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-5">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.startup.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SideCard>
      ) : null}
    </aside>
  );
}

function SideCard({
  icon: Icon,
  title,
  count,
  countLabel,
  more = false,
  actionLabel,
  onAction,
  children,
}: {
  icon: typeof Inbox;
  title: string;
  count: number | null;
  /** Za čitač ekrana: „12 nepročitanih poruka". */
  countLabel: string;
  /** Izvor je odsečen: broj je donja granica („30+"). */
  more?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-workspace-enter
      className="desk-surface rounded-2xl border bg-card/80 p-3"
    >
      <div className="mb-1.5 flex min-h-8 items-center gap-2 px-1">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 id={headingId} className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h2>
        {count !== null && count > 0 ? (
          <span className="font-mono text-[0.6875rem] font-bold text-foreground">
            <NumberRoll value={count} aria-label={`${count}${more ? "+" : ""} ${countLabel}`} />
            {more ? <span aria-hidden="true">+</span> : null}
          </span>
        ) : null}
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            aria-label={`${actionLabel}: ${title}`}
            className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-accent"
          >
            {actionLabel}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ChatLine({
  startup,
  label,
  unread,
  onClick,
}: {
  startup: { name: string; logoUrl: string | null } | null;
  label: string;
  unread: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
      >
        <StartupChip startup={startup} size="xs" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="rounded-full bg-primary px-1.5 font-mono text-[0.6875rem] font-bold leading-5 text-primary-foreground">
          {unread > 99 ? "99+" : unread}
          <span className="sr-only"> nepročitanih</span>
        </span>
      </button>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1.5 text-sm text-muted-foreground">{children}</p>;
}

function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" className="space-y-1.5 px-2 py-1">
      <span className="sr-only">Učitavanje…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", index % 2 === 0 ? "w-full" : "w-2/3")} />
      ))}
    </div>
  );
}

export type MyDaySummaryChipsProps = Pick<MyDaySideProps, "inbox" | "chat" | "pending" | "onOpenInbox" | "onOpenChat"> & {
  /** Čip „Čeka tebe": prva ideja koja čeka glas. */
  onOpenFirstPending: () => void;
};

/**
 * Ispod `xl` (plan K07 E11): jedna traka sa 3 sažeta čipa umesto kolone —
 * čip se vidi samo kad ima nešto (> 0).
 */
export function MyDaySummaryChips({ inbox, chat, pending, onOpenInbox, onOpenChat, onOpenFirstPending }: MyDaySummaryChipsProps) {
  const chips = [
    { key: "inbox", label: "Inbox", icon: Inbox, count: blockCount(inbox, (data) => data.unread), onClick: onOpenInbox },
    { key: "chat", label: "Poruke", icon: MessageCircle, count: blockCount(chat, (data) => data.total), onClick: onOpenChat },
    {
      key: "pending",
      label: "Čeka tebe",
      icon: Hourglass,
      count: blockCount(pending, (data) => data.items.length),
      onClick: onOpenFirstPending,
    },
  ].filter((chip) => chip.count !== null && chip.count > 0);
  if (chips.length === 0) return null;
  return (
    <nav aria-label="Sažetak" className="flex flex-wrap gap-2 xl:hidden">
      {chips.map(({ key, label, icon: Icon, count, onClick }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-sm transition-colors hover:bg-muted/60"
        >
          <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {label}
          <span className="font-mono text-xs font-bold tabular-nums">{(count ?? 0) > 99 ? "99+" : count}</span>
        </button>
      ))}
    </nav>
  );
}
