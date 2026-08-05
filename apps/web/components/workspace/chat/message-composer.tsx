"use client";

import { useEffect, useRef, useState } from "react";
import { insertAtTop, useMutation } from "convex/react";
import { toast } from "sonner";
import { LoaderCircle, Mic, Paperclip, Reply, Send, Trash2, X } from "lucide-react";

import { MentionTextarea } from "@/components/workspace/chat/mention-textarea";
import type { ProfileWithAvatar, StartupMember } from "@/components/workspace/types";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatVoiceDuration,
  resolveMentions,
  type ChatChannel,
  type ChatMessage,
} from "@/lib/chat";
import { cn } from "@/lib/utils";

// Van komponente: `Date.now()`/`crypto` su nečiste, ali se pozivaju tek pri
// slanju (u optimističkom callback-u), ne tokom rendera.
function buildOptimisticTextMessage(
  args: {
    channelId: Id<"chatChannels">;
    body: string;
    mentions?: Id<"profiles">[];
    replyToMessageId?: Id<"chatMessages">;
  },
  channel: ChatChannel,
  profile: ProfileWithAvatar,
): ChatMessage {
  const now = Date.now();
  return {
    _id: crypto.randomUUID() as Id<"chatMessages">,
    _creationTime: now,
    channelId: args.channelId,
    startupId: channel.startupId,
    authorProfileId: profile._id,
    body: args.body,
    mentions: args.mentions ?? [],
    kind: "text",
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    voiceDurationMs: null,
    replyToMessageId: args.replyToMessageId ?? null,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
    deleted: false,
    author: {
      _id: profile._id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    },
    reactions: [],
    attachmentUrl: null,
  };
}

export function MessageComposer({
  channel,
  profile,
  members,
  replyTo,
  onCancelReply,
  onSent,
}: {
  channel: ChatChannel;
  profile: ProfileWithAvatar;
  members: StartupMember[] | undefined;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Optimistički unos samo za tekst — prilog/glas čekaju upload, pa se šalju bez
  // optimizma (poruka se pojavi kad server potvrdi).
  const send = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    (store, args) => {
      if ((args.kind ?? "text") !== "text") return;
      insertAtTop({
        paginatedQuery: api.chat.messages,
        argsToMatch: { channelId: args.channelId },
        localQueryStore: store,
        item: buildOptimisticTextMessage(args, channel, profile),
      });
    },
  );
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);

  async function sendText() {
    const body = draft.trim();
    if (!body) return;
    const mentions = resolveMentions(body, members ?? []);
    const replyId = replyTo?._id;
    setDraft("");
    onCancelReply();
    try {
      await send({
        channelId: channel._id,
        body,
        mentions,
        replyToMessageId: replyId,
      });
      onSent();
    } catch (error) {
      setDraft(body);
      toast.error(error instanceof Error ? error.message : "Poruka nije poslata.");
    }
  }

  async function sendAttachment(
    file: File,
    kind: "file" | "voice",
    voiceDurationMs?: number,
  ) {
    setUploading(true);
    const replyId = replyTo?._id;
    try {
      const uploadUrl = await generateUploadUrl({ channelId: channel._id });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("Otpremanje nije uspelo.");
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      await send({
        channelId: channel._id,
        body: "",
        kind,
        attachmentStorageId: storageId,
        attachmentName: file.name,
        attachmentType: file.type || "application/octet-stream",
        attachmentSize: file.size,
        voiceDurationMs,
        replyToMessageId: replyId,
      });
      onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Prilog nije poslat.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border/70 bg-background px-3 py-3 sm:px-5">
      {replyTo ? (
        <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 text-xs">
          <Reply className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Odgovor{" "}
            <span className="font-semibold text-foreground">
              {replyTo.author?.displayName ?? "Član"}
            </span>
            : {replyTo.deleted ? "Poruka je obrisana" : replyTo.body || "prilog"}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Otkaži odgovor"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void sendAttachment(file, "file");
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          aria-label="Priloži fajl"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
        </Button>

        <MentionTextarea
          value={draft}
          onChange={setDraft}
          members={members}
          onSubmit={() => void sendText()}
          placeholder="Napiši poruku…  (@ za pominjanje)"
        />

        {draft.trim() ? (
          <Button
            type="button"
            size="icon"
            className="size-10 shrink-0"
            aria-label="Pošalji poruku"
            onClick={() => void sendText()}
          >
            <Send className="size-4" />
          </Button>
        ) : (
          <VoiceRecorder
            disabled={uploading}
            onRecorded={(file, durationMs) =>
              void sendAttachment(file, "voice", durationMs)
            }
          />
        )}
      </div>
    </div>
  );
}

function VoiceRecorder({
  disabled,
  onRecorded,
}: {
  disabled: boolean;
  onRecorded: (file: File, durationMs: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(interval);
  }, [recording]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        stream.getTracks().forEach((track) => track.stop());
        if (cancelledRef.current) return;
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `glasovna-poruka-${startedAtRef.current}.webm`, {
          type,
        });
        onRecorded(file, durationMs);
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Mikrofon nije dostupan.");
    }
  }

  function stop(cancel: boolean) {
    cancelledRef.current = cancel;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  if (!recording) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 shrink-0"
        aria-label="Snimi glasovnu poruku"
        disabled={disabled}
        onClick={() => void start()}
      >
        <Mic className="size-4" />
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-2 py-1">
      <span
        className={cn("size-2 rounded-full bg-destructive", "animate-pulse")}
        aria-hidden="true"
      />
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatVoiceDuration(elapsed)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Otkaži snimanje"
        onClick={() => stop(true)}
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
      <Button
        type="button"
        size="icon"
        className="size-8"
        aria-label="Pošalji glasovnu poruku"
        onClick={() => stop(false)}
      >
        <Send className="size-4" />
      </Button>
    </div>
  );
}
