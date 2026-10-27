"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, LoaderCircle, MessagesSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { StartupMember } from "@/components/workspace/types";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatMessageTime, porukaWord, resolveMentions } from "@/lib/chat";

/**
 * „Diskusija" nad entitetom (stranica/zadatak/ideja). Zove `chat.channelForAnchor`;
 * kanal ne postoji dok neko ne pošalje prvu poruku, pa slanje uvek ide preko
 * `chat.sendToAnchor` (lazy kreiranje threada — 04-CHAT.md 4). Kad kanal postoji,
 * panel prikazuje broj poruka i vodi na pun razgovor u `view=chat`.
 *
 * Isti API troše web i mobilni klijent — ovo je samo web prikaz nad njim.
 */
export function EntityDiscussionPanel({
  startupId,
  anchorType,
  anchorId,
  members,
  onOpenChannel,
  className,
}: {
  startupId: Id<"startups">;
  anchorType: "page" | "idea";
  anchorId: string;
  /** Kad je prosleđeno, `@Ime` u brzoj poruci razrešava pominjanja. */
  members?: StartupMember[];
  onOpenChannel?: (channelId: Id<"chatChannels">) => void;
  className?: string;
}) {
  const channel = useQuery(api.chat.channelForAnchor, {
    startupId,
    anchorType,
    anchorId,
  });
  const sendToAnchor = useMutation(api.chat.sendToAnchor);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const loading = channel === undefined;
  const messageCount = channel?.messageCount ?? 0;

  const send = async () => {
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    try {
      await sendToAnchor({
        startupId,
        anchorType,
        anchorId,
        body,
        ...(members ? { mentions: resolveMentions(body, members) } : {}),
      });
      setDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Poruka nije poslata.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={className} aria-label="Diskusija">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <MessagesSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Diskusija</h3>
            <p className="truncate text-xs leading-5 text-muted-foreground">
              {loading
                ? "Učitavanje…"
                : messageCount === 0
                  ? "Nema poruka."
                  : `${messageCount} ${porukaWord(messageCount)}`}
            </p>
          </div>
        </div>
        {channel && onOpenChannel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-xl"
            onClick={() => onOpenChannel(channel._id)}
          >
            Otvori razgovor
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-14 rounded-lg" />
      ) : channel && channel.lastMessagePreview ? (
        <button
          type="button"
          disabled={!onOpenChannel}
          onClick={() => onOpenChannel?.(channel._id)}
          className="mt-3 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
        >
          {channel.lastMessageAuthor ? (
            <ProfileAvatar
              profile={channel.lastMessageAuthor}
              className="size-6 shrink-0"
            />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-xs font-semibold">
                {channel.lastMessageAuthor?.displayName ?? "Sistem"}
              </span>
              <time
                className="shrink-0 text-xs text-muted-foreground"
                dateTime={new Date(channel.lastMessageAt).toISOString()}
              >
                {formatMessageTime(channel.lastMessageAt)}
              </time>
            </span>
            <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {channel.lastMessagePreview}
            </span>
          </span>
        </button>
      ) : null}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          aria-label="Poruka u diskusiji"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={
            messageCount === 0 ? "Napiši prvu poruku…" : "Napiši poruku…"
          }
          rows={1}
          disabled={loading}
          className="min-h-10 resize-none rounded-xl bg-background text-sm"
        />
        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0 rounded-xl"
          aria-label="Pošalji poruku"
          disabled={loading || pending || !draft.trim()}
          onClick={() => void send()}
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </section>
  );
}
