"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { COMMAND_BLOCK_TEXT, pendingIdeaVotes } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { useQueryResult } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";

import { Block, type BlockStatus, useBlockRetry } from "./block";

/** Najviše ideja u bloku (K07 §5.2); ostale su na ekranu Ideje. */
export const WAITING_LIMIT = 5;

const BLOCK_ID = "cc-ceka-tebe";

export type WaitingItem = {
  ideaId: string;
  title: string;
  authorName: string | null;
  upvotes: number;
  downvotes: number;
};

export type WaitingViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  items: ReadonlyArray<WaitingItem>;
  /** Ukupno ideja koje čekaju glas (može biti više od prikazanih). */
  total: number;
  /** Server je odsekao listu: broj uz naslov je „N+". */
  truncated?: boolean;
  /** Ideje čiji se glas upravo šalje (dugmad tih redova su neaktivna). */
  busyIds: ReadonlySet<string>;
  /** Poruka za čitač ekrana posle glasa. */
  announcement: string;
  onVote: (item: WaitingItem, voteType: "up" | "down") => void;
  onOpenIdea: (ideaId: string) => void;
  onOpenAll: () => void;
};

/**
 * „Čeka tebe" — prezentacija (izlog `komandni-centar`): ideje ovog startupa u
 * fazi „Razmatra se" za koje još nisam glasao, sa „Za" / „Protiv" u redu. Posle
 * glasa red nestaje, a fokus ide na ideju koja je preuzela njegovo mesto (ili na blok).
 */
export function WaitingView({
  status,
  onRetry,
  items,
  total,
  truncated = false,
  busyIds,
  announcement,
  onVote,
  onOpenIdea,
  onOpenAll,
}: WaitingViewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Za koju ideju je glas poslat i na kom mestu je bila: kad red nestane, fokus ide na isto mesto.
  const voted = useRef<{ ideaId: string; index: number } | null>(null);
  useEffect(() => {
    const last = voted.current;
    if (last === null || items.some((item) => item.ideaId === last.ideaId)) return;
    voted.current = null;
    const titles = listRef.current?.querySelectorAll<HTMLElement>("[data-waiting-title]");
    const next = titles && titles.length > 0 ? titles[Math.min(last.index, titles.length - 1)] : null;
    (next ?? document.getElementById(BLOCK_ID))?.focus({ preventScroll: true });
  }, [items]);

  const shown = items.slice(0, WAITING_LIMIT);
  return (
    <Block
      id={BLOCK_ID}
      title="Čeka tebe"
      count={truncated ? `${total}+` : total}
      status={status}
      errorText={COMMAND_BLOCK_TEXT.waitingError}
      onRetry={onRetry}
      skeletonRows={2}
    >
      {shown.length === 0 ? (
        <EmptyState size="section" title="Nema ideja koje čekaju tvoj glas." />
      ) : (
        <>
          <ul ref={listRef} className="space-y-0.5">
            {shown.map((item, index) => {
              const busy = busyIds.has(item.ideaId);
              const vote = (voteType: "up" | "down") => {
                if (busy) return;
                voted.current = { ideaId: item.ideaId, index };
                onVote(item, voteType);
              };
              return (
                <li key={item.ideaId} className="rounded-lg px-2 py-1 hover:bg-muted/60 focus-within:bg-muted/60">
                  <button
                    type="button"
                    data-waiting-title
                    onClick={() => onOpenIdea(item.ideaId)}
                    className="block w-full min-w-0 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.authorName ?? "Član tima"}
                      {item.upvotes + item.downvotes > 0 ? ` · ${item.upvotes} za · ${item.downvotes} protiv` : ""}
                    </span>
                  </button>
                  <div className="mt-0.5 flex gap-2 pb-1">
                    {/* aria-disabled, ne disabled: fokus ostaje na dugmetu dok glas stiže ili ne uspe. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-disabled={busy}
                      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                      aria-label={`Glasaj za: ${item.title}`}
                      onClick={() => vote("up")}
                    >
                      <ThumbsUp aria-hidden="true" />
                      Za
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-disabled={busy}
                      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                      aria-label={`Glasaj protiv: ${item.title}`}
                      onClick={() => vote("down")}
                    >
                      <ThumbsDown aria-hidden="true" />
                      Protiv
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {total > shown.length || truncated ? (
            <Button variant="ghost" size="sm" className="mt-1" onClick={onOpenAll}>
              Sve ideje
            </Button>
          ) : null}
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Block>
  );
}

/**
 * Kontejner „Čeka tebe": `inbox.pending` (UZ `include: ["idea_vote"]`, bez toga je
 * lista prazna) + `ideas.vote`. Glas skida red reaktivno.
 */
export function WaitingBlock({
  startupId,
  onOpenIdea,
  onOpenAll,
}: {
  startupId: Id<"startups">;
  onOpenIdea: (ideaId: Id<"ideaNodes">) => void;
  onOpenAll: () => void;
}) {
  const retry = useBlockRetry();
  const result = useQueryResult(api.inbox.pending, { startupId, include: ["idea_vote"] });
  const vote = useMutation(api.ideas.vote);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");

  const items: WaitingItem[] =
    result.data === undefined
      ? []
      : pendingIdeaVotes(result.data.items).map((item) => ({
          ideaId: item.ideaId,
          title: item.title,
          authorName: item.authorName,
          upvotes: item.upvotes,
          downvotes: item.downvotes,
        }));

  const setBusy = (ideaId: string, busy: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(ideaId);
      else next.delete(ideaId);
      return next;
    });

  const onVote = (item: WaitingItem, voteType: "up" | "down") => {
    setBusy(item.ideaId, true);
    vote({ startupId, ideaId: item.ideaId as Id<"ideaNodes">, voteType })
      // Isti tekst dvaput ne menja živi region: naizmenični razmak ga ponovo najavljuje.
      .then(() => setAnnouncement((previous) => (previous === "Glas je sačuvan." ? "Glas je sačuvan. " : "Glas je sačuvan.")))
      // Greška ide samo kroz toast (on je već živi region), ne i kroz najavu bloka.
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Glas nije sačuvan.")))
      .finally(() => setBusy(item.ideaId, false));
  };

  return (
    <WaitingView
      status={result.failed ? "error" : result.data === undefined ? "loading" : "ready"}
      onRetry={retry}
      items={items}
      total={items.length}
      truncated={result.data?.truncated ?? false}
      busyIds={busyIds}
      announcement={announcement}
      onVote={onVote}
      onOpenIdea={(ideaId) => onOpenIdea(ideaId as Id<"ideaNodes">)}
      onOpenAll={onOpenAll}
    />
  );
}
