"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { CornerUpLeft, FileText, Pencil, Reply, Trash2 } from "lucide-react";

import { ReactionPicker } from "@/components/workspace/chat/reaction-picker";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import type { ProfileWithAvatar, StartupMember } from "@/components/workspace/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
// Jedna konstanta za ceo proizvod (nalaz A.1): mobilni `message-actions-sheet.tsx`
// uvozi istu, a server je već koristi u `chat.editMessage`.
import { CHAT_EDIT_WINDOW_MS } from "@/convex/lib/validators";
import {
  formatMessageTime,
  splitMentions,
  formatVoiceDuration,
  type ChatMessage,
} from "@/lib/chat";
import { formatFileSize } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";

export function MessageRow({
  message,
  grouped,
  profile,
  members,
  repliedTo,
  onReply,
}: {
  message: ChatMessage;
  grouped: boolean;
  profile: ProfileWithAvatar;
  members: StartupMember[] | undefined;
  repliedTo?: ChatMessage | null;
  onReply: (message: ChatMessage) => void;
}) {
  const toggleReaction = useMutation(api.chat.toggleReaction);
  const editMessage = useMutation(api.chat.editMessage);
  const deleteMessage = useMutation(api.chat.deleteMessage);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);

  // Sistemska poruka: tiha centrirana linija (ne nosi autora ni akcije).
  if (message.kind === "system" || message.authorProfileId === null) {
    return (
      <div className="my-1.5 flex justify-center px-4">
        <p className="text-center text-xs text-muted-foreground">{message.body}</p>
      </div>
    );
  }

  const isOwn = message.authorProfileId === profile._id;
  const isAdmin = profile.role === "admin";
  // Prozor izmene (15 min) proverava se pri kliku, ne tokom rendera — backend
  // je konačni čuvar; ovde je samo prijateljska poruka ako je prošlo.
  const canEdit = isOwn && !message.deleted;
  const canDelete = (isOwn || isAdmin) && !message.deleted;

  function beginEdit() {
    if (Date.now() - message.createdAt >= CHAT_EDIT_WINDOW_MS) {
      toast.error("Poruka se može izmeniti samo u prvih 15 minuta.");
      return;
    }
    setEditText(message.body);
    setEditing(true);
  }

  const mentionNames = message.mentions.flatMap((id) => {
    const name = members?.find((member) => member.profile._id === id)?.profile
      .displayName;
    return name ? [name] : [];
  });

  function react(emoji: string) {
    void toggleReaction({ messageId: message._id, emoji }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Reakcija nije sačuvana."),
    );
  }

  async function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await editMessage({ messageId: message._id, body: trimmed });
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Izmena nije sačuvana.");
    }
  }

  function remove() {
    if (!window.confirm("Obrisati poruku?")) return;
    void deleteMessage({ messageId: message._id }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Poruka nije obrisana."),
    );
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 rounded-lg px-2 transition-colors hover:bg-muted/40",
        grouped ? "py-0.5" : "mt-3 py-1",
      )}
    >
      <div className="w-9 shrink-0">
        {grouped ? (
          <span className="mt-1 flex justify-end text-[0.625rem] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {formatMessageTime(message.createdAt)}
          </span>
        ) : message.author ? (
          <ProfileAvatar profile={message.author} className="size-9" />
        ) : (
          <span className="grid size-9 place-items-center rounded-full bg-muted text-xs font-bold">
            —
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold">
              {message.author?.displayName ?? "Član"}
            </span>
            <time
              className="text-[0.6875rem] text-muted-foreground"
              dateTime={new Date(message.createdAt).toISOString()}
            >
              {formatMessageTime(message.createdAt)}
            </time>
            {message.editedAt ? (
              <span className="text-[0.625rem] text-muted-foreground">
                (izmenjeno)
              </span>
            ) : null}
          </div>
        )}

        {repliedTo ? (
          <div className="mt-1 flex items-center gap-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground">
            <CornerUpLeft className="size-3 shrink-0" />
            <span className="truncate">
              <span className="font-semibold">
                {repliedTo.author?.displayName ?? "Član"}
              </span>{" "}
              {repliedTo.deleted ? "Poruka je obrisana" : repliedTo.body || "prilog"}
            </span>
          </div>
        ) : message.replyToMessageId ? (
          <div className="mt-1 flex items-center gap-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground">
            <CornerUpLeft className="size-3 shrink-0" /> Odgovor na poruku
          </div>
        ) : null}

        {message.deleted ? (
          <p className="mt-0.5 text-sm italic text-muted-foreground">
            Poruka je obrisana
          </p>
        ) : editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              autoFocus
              className="min-h-16 rounded-lg bg-background text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void saveEdit();
                } else if (event.key === "Escape") {
                  setEditing(false);
                  setEditText(message.body);
                }
              }}
            />
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditText(message.body);
                }}
              >
                Otkaži
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!editText.trim()}
                onClick={() => void saveEdit()}
              >
                Sačuvaj
              </Button>
            </div>
          </div>
        ) : (
          <>
            {message.body ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                {splitMentions(message.body, mentionNames).map((segment, index) =>
                  segment.kind === "mention" ? (
                    <span
                      key={index}
                      className="rounded bg-primary/10 px-1 font-medium text-primary"
                    >
                      {segment.value}
                    </span>
                  ) : (
                    <span key={index}>{segment.value}</span>
                  ),
                )}
              </p>
            ) : null}

            <Attachment message={message} />

            {message.reactions.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => react(reaction.emoji)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors",
                      reaction.mine
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                    aria-pressed={reaction.mine}
                  >
                    <span className="text-sm leading-none">{reaction.emoji}</span>
                    {reaction.count}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {message.deleted || editing ? null : (
        // Dostupno tastaturom, dodirom i SR-om: uvek u toku dokumenta (nije
        // `display:none`). Na velikom ekranu se krije dok nema hover/fokusa;
        // na malom (bez hovera) stoji vidljivo.
        <div className="absolute -top-3 right-2 flex items-center gap-0.5 rounded-lg border border-border/70 bg-popover p-0.5 shadow-sm transition-opacity focus-within:opacity-100 lg:pointer-events-none lg:opacity-0 lg:focus-within:pointer-events-auto lg:focus-within:opacity-100 lg:group-hover:pointer-events-auto lg:group-hover:opacity-100">
          <ReactionPicker onSelect={react} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Odgovori"
            onClick={() => onReply(message)}
          >
            <Reply className="size-4" />
          </Button>
          {canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Izmeni poruku"
              onClick={beginEdit}
            >
              <Pencil className="size-4" />
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              aria-label="Obriši poruku"
              onClick={remove}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Attachment({ message }: { message: ChatMessage }) {
  if (!message.attachmentUrl) return null;

  if (message.kind === "voice") {
    return (
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border/70 bg-card p-2">
        <audio controls src={message.attachmentUrl} className="h-9 max-w-full" />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatVoiceDuration(message.voiceDurationMs)}
        </span>
      </div>
    );
  }

  const isImage = message.attachmentType?.startsWith("image/");
  if (isImage) {
    return (
      <a
        href={message.attachmentUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block w-fit"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.attachmentUrl}
          alt={message.attachmentName ?? "Prilog"}
          className="max-h-80 max-w-full rounded-xl border border-border/70 object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={message.attachmentUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 flex w-fit max-w-full items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2 transition-colors hover:bg-accent"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {message.attachmentName ?? "Prilog"}
        </span>
        {message.attachmentSize !== null ? (
          <span className="block text-xs text-muted-foreground">
            {formatFileSize(message.attachmentSize)}
          </span>
        ) : null}
      </span>
    </a>
  );
}
