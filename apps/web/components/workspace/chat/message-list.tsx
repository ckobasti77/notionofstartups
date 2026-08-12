"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePaginatedQuery } from "convex/react";
import { ChevronDown, LoaderCircle, MessagesSquare } from "lucide-react";

import { MessageRow } from "@/components/workspace/chat/message-row";
import { EmptyState } from "@/components/workspace/workspace-ui";
import type {
  ProfileWithAvatar,
  StartupMember,
} from "@/components/workspace/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import {
  formatDaySeparator,
  sameDay,
  shouldGroupWithPrevious,
  type ChatChannel,
  type ChatMessage,
} from "@/lib/chat";

export function MessageList({
  channel,
  profile,
  members,
  onReply,
  scrollToBottomSignal = 0,
}: {
  channel: ChatChannel;
  profile: ProfileWithAvatar;
  members: StartupMember[] | undefined;
  onReply: (message: ChatMessage) => void;
  /**
   * Broj koji roditelj uveća kad korisnik POŠALJE poruku. Bitna je samo promena,
   * ne vrednost — skok na dno tako ne čeka da poruka obiđe server.
   */
  scrollToBottomSignal?: number;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.messages,
    { channelId: channel._id },
    { initialNumItems: 30 },
  );

  // Backend vraća najnovije prvo; chat se čita odozdo, pa render obrćemo
  // (najstarije gore, najnovije dole) i „starije" učitavamo skrolom nagore.
  const ordered = useMemo(() => [...results].reverse(), [results]);
  // Citirana poruka odgovora — razrešava se iz već učitanog prozora.
  const byId = useMemo(
    () => new Map(results.map((message) => [message._id, message])),
    [results],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const newestIdRef = useRef<string | null>(null);
  const firstSignalRef = useRef(true);
  /** Koliko je TUĐIH poruka stiglo dok korisnik nije gledao dno. */
  const [newCount, setNewCount] = useState(0);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
    setNewCount(0);
    setShowJump(false);
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distanceFromBottom < 120;
    setShowJump(distanceFromBottom > 240);
    // Vratio se na dno = video je sve; brojač nema više šta da broji.
    if (nearBottomRef.current) setNewCount(0);
    if (
      el.scrollTop < 120 &&
      status === "CanLoadMore" &&
      !loadingOlderRef.current
    ) {
      loadingOlderRef.current = true;
      prevScrollHeightRef.current = el.scrollHeight;
      prevScrollTopRef.current = el.scrollTop;
      loadMore(30);
    }
  }

  // Očuvanje pozicije skrola: starije poruke ne smeju da „skoče" prikaz, a nova
  // poruka drži dno ako korisnik već gleda dno.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingOlderRef.current) {
      el.scrollTop =
        prevScrollTopRef.current +
        (el.scrollHeight - prevScrollHeightRef.current);
      loadingOlderRef.current = false;
      return;
    }
    if (!didInitialScrollRef.current && ordered.length > 0) {
      el.scrollTop = el.scrollHeight;
      didInitialScrollRef.current = true;
      return;
    }
    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [ordered.length]);

  /**
   * Slanje poruke uvek vraća na dno. Bez ovoga korisnik napiše poruku dok čita
   * stariji deo razgovora, poruka ode — a on je ne vidi i deluje kao da nije
   * poslata.
   */
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false;
      return;
    }
    scrollToBottom();
  }, [scrollToBottomSignal, scrollToBottom]);

  /**
   * Nove poruke dok korisnik čita gore. `results[0]` je najnovija (backend vraća
   * najnovije prvo), pa se promena vrha poredi sa zapamćenim id-jem — reakcije i
   * izmene menjaju `results` bez nove poruke i ne smeju da broje.
   */
  useEffect(() => {
    const newest = results[0];
    if (!newest) return;

    const previousId = newestIdRef.current;
    newestIdRef.current = newest._id;

    if (previousId === null) return; // prvo punjenje
    if (newest._id === previousId) return; // nema nove poruke

    if (newest.authorProfileId === profile._id) {
      scrollToBottom();
      return;
    }
    if (nearBottomRef.current) return; // već gleda dno

    const index = results.findIndex((message) => message._id === previousId);
    setNewCount((count) => count + (index === -1 ? 1 : index));
  }, [results, profile._id, scrollToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
      >
        {status === "LoadingFirstPage" ? (
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="flex gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title="Još niko nije pisao"
              description="Budi prvi — napiši poruku da započneš razgovor."
              className="max-w-md border-none bg-transparent"
            />
          </div>
        ) : (
          <div
            className="mx-auto flex w-full max-w-3xl flex-col"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Poruke"
          >
            {status === "CanLoadMore" || status === "LoadingMore" ? (
              <div className="flex justify-center py-2">
                {status === "LoadingMore" ? (
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full text-xs text-muted-foreground"
                    onClick={() => loadMore(30)}
                  >
                    Učitaj starije
                  </Button>
                )}
              </div>
            ) : null}

            {ordered.map((message, index) => {
              const previous = ordered[index - 1];
              const showDay =
                index === 0 || !sameDay(message.createdAt, previous.createdAt);
              const grouped =
                !showDay && shouldGroupWithPrevious(message, previous);
              return (
                <Fragment key={message._id}>
                  {showDay ? (
                    <DaySeparator timestamp={message.createdAt} />
                  ) : null}
                  <MessageRow
                    message={message}
                    grouped={grouped}
                    profile={profile}
                    members={members}
                    repliedTo={
                      message.replyToMessageId
                        ? (byId.get(message.replyToMessageId) ?? null)
                        : null
                    }
                    onReply={onReply}
                  />
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Dugme se vidi i kad korisnik nije daleko od dna, samo ako ima novih
          poruka — brojač bez dugmeta koje ga nosi nema smisla. */}
      {showJump || newCount > 0 ? (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={
            newCount > 0
              ? `${newCount} ${newCount === 1 ? "nova poruka" : "novih poruka"}, skoči na dno`
              : "Skoči na najnovije poruke"
          }
          className="absolute bottom-4 right-4 grid size-11 place-items-center rounded-full border border-border/70 bg-card text-foreground shadow-lg transition-colors hover:bg-accent"
        >
          <ChevronDown className="size-5" />
          {newCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 grid h-[22px] min-w-[22px] place-items-center rounded-full border-2 border-background bg-primary px-1.5 text-[0.6875rem] font-bold tabular-nums text-primary-foreground">
              {newCount > 99 ? "99+" : newCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}

function DaySeparator({ timestamp }: { timestamp: number }) {
  return (
    <div className="my-3 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border/70" />
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {formatDaySeparator(timestamp)}
      </span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  );
}
