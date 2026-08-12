"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  AtSign,
  Bell,
  BellOff,
  Check,
  ExternalLink,
  Hash,
  MessagesSquare,
  MoreVertical,
  Upload,
} from "lucide-react";

import { MessageComposer } from "@/components/workspace/chat/message-composer";
import { MessageList } from "@/components/workspace/chat/message-list";
import { useAttachmentSender } from "@/components/workspace/chat/use-attachment-sender";
import { useChatPresence } from "@/components/workspace/chat/use-chat-presence";
import {
  AREA_ICONS,
  getAreaTint,
  ProfileAvatar,
} from "@/components/workspace/workspace-ui";
import type {
  ProfileWithAvatar,
  StartupMember,
  StartupWithAreas,
} from "@/components/workspace/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  channelDisplayName,
  type ChatChannel,
  type ChatMessage,
} from "@/lib/chat";
import type { AreaKey } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const NOTIFICATION_OPTIONS = [
  { level: "all" as const, label: "Sva obaveštenja", icon: Bell },
  { level: "mentions" as const, label: "Samo pominjanja", icon: AtSign },
  { level: "none" as const, label: "Bez obaveštenja", icon: BellOff },
];

export function ConversationPane({
  startup,
  profile,
  channel,
  members,
  onOpenList,
  onOpenPage,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  channel: ChatChannel;
  members: StartupMember[] | undefined;
  onOpenList: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  /**
   * Broji poslate poruke. Samo signal za `MessageList` da skoči na dno —
   * raste pri svakom slanju, vrednost ne znači ništa osim „upravo je poslato".
   */
  const [sentTick, setSentTick] = useState(0);
  /**
   * Gleda li korisnik dno ovog razgovora. Jedini potrošač je prisustvo: dok je
   * `true` (i prozor vidljiv), nova poruka u OVOM kanalu ne pravi obaveštenje —
   * korisnik ju je video uživo (`docs/mobile/lanac5/PLAN.md` §1.3).
   */
  const [atBottom, setAtBottom] = useState(true);
  /** Brojač `dragenter`/`dragleave` — ulazak u dete-element inače gasi overlay. */
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const markChannelRead = useMutation(api.chat.markChannelRead);
  const setNotificationLevel = useMutation(api.chat.setNotificationLevel);
  const archiveChannel = useMutation(api.chat.archiveChannel);

  // Otvaranje kanala i svaka nova poruka (lastMessageAt) čiste nepročitano —
  // prikaz je u prvom planu dok je montiran (04-CHAT.md §5).
  useEffect(() => {
    void markChannelRead({ channelId: channel._id }).catch(() => {
      // Neuspelo označavanje ne sme da blokira čitanje.
    });
  }, [channel._id, channel.lastMessageAt, markChannelRead]);

  useChatPresence(channel._id, atBottom);

  const handleSent = useCallback(() => {
    setReplyTo(null);
    setSentTick((tick) => tick + 1);
  }, []);

  const { uploading, sendAttachment, sendFiles } = useAttachmentSender({
    channel,
    replyTo,
    onSent: handleSent,
  });

  const name = channelDisplayName(channel);
  const areaKey =
    channel.kind === "area"
      ? startup.areas.find((area) => area._id === channel.areaId)?.key
      : undefined;

  async function changeLevel(level: "all" | "mentions" | "none") {
    try {
      await setNotificationLevel({ channelId: channel._id, level });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Podešavanje nije sačuvano.",
      );
    }
  }

  async function archive() {
    if (!window.confirm(`Arhivirati razgovor „${name}"?`)) return;
    try {
      await archiveChannel({ channelId: channel._id });
      toast.success("Razgovor je arhiviran.");
      onOpenList();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Razgovor nije arhiviran.",
      );
    }
  }

  const canArchive = profile.role === "admin" && channel.kind !== "startup";

  /** Ima li drag uopšte fajlove — prevučen tekst ne sme da otvori zonu za slanje. */
  function dragHasFiles(event: React.DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-background"
      onDragEnter={(event) => {
        if (!dragHasFiles(event)) return;
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        // Bez ovoga pregledač otvori fajl umesto da ga preda `onDrop`-u.
        if (!dragHasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!dragHasFiles(event)) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!dragHasFiles(event)) return;
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
        sendFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 bg-background/90 px-3 backdrop-blur-xl sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 lg:hidden"
          aria-label="Nazad na razgovore"
          onClick={onOpenList}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <ConversationIcon channel={channel} areaKey={areaKey} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            {conversationSubtitle(channel, areaKey, startup)}
          </p>
        </div>

        {channel.kind === "thread" && channel.anchorType === "page" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => onOpenPage(channel.anchorId as Id<"pages">)}
          >
            <ExternalLink className="size-4" /> Otvori
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Opcije razgovora"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Obaveštenja</DropdownMenuLabel>
            {NOTIFICATION_OPTIONS.map((option) => {
              const active = channel.notificationLevel === option.level;
              const Icon = option.icon;
              return (
                <DropdownMenuItem
                  key={option.level}
                  onSelect={() => void changeLevel(option.level)}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{option.label}</span>
                  {active ? (
                    <Check className="size-4 text-primary" aria-hidden="true" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
            {canArchive ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => void archive()}
                >
                  <Archive className="size-4" /> Arhiviraj razgovor
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <MessageList
        channel={channel}
        profile={profile}
        members={members}
        onReply={setReplyTo}
        onAtBottomChange={setAtBottom}
        scrollToBottomSignal={sentTick}
      />

      <MessageComposer
        channel={channel}
        profile={profile}
        members={members}
        replyTo={replyTo}
        uploading={uploading}
        sendAttachment={sendAttachment}
        sendFiles={sendFiles}
        onCancelReply={() => setReplyTo(null)}
        onSent={handleSent}
      />

      {/* Zona za puštanje pokriva CEO prozor razgovora — fajl se ne mora spustiti
          baš na spajalicu. `pointer-events-none` da ne pojede `dragover` roditelja
          (bez toga overlay treperi dok se prelazi preko njega). */}
      {dragging ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="size-8" aria-hidden="true" />
            <p className="text-sm font-semibold">Pusti da pošalješ</p>
            <p className="text-xs text-muted-foreground">
              Više fajlova odjednom je u redu — idu kao zasebne poruke.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConversationIcon({
  channel,
  areaKey,
}: {
  channel: ChatChannel;
  areaKey: string | undefined;
}) {
  if (channel.kind === "dm" && channel.otherParticipant) {
    return (
      <ProfileAvatar
        profile={channel.otherParticipant}
        className="size-8 shrink-0"
      />
    );
  }
  if (channel.kind === "area" && areaKey) {
    const Icon = AREA_ICONS[areaKey as AreaKey] ?? Hash;
    return (
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          getAreaTint(areaKey),
        )}
      >
        <Icon className="size-4" />
      </span>
    );
  }
  const Icon = channel.kind === "thread" ? MessagesSquare : Hash;
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-4" />
    </span>
  );
}

function conversationSubtitle(
  channel: ChatChannel,
  areaKey: string | undefined,
  startup: StartupWithAreas,
): string {
  switch (channel.kind) {
    case "startup":
      return "Ceo tim · svi članovi";
    case "area": {
      const area = startup.areas.find((item) => item.key === areaKey);
      return area ? `Kanal oblasti · ${area.label}` : "Kanal oblasti";
    }
    case "custom":
      return channel.isPrivate ? "Privatan kanal" : "Kanal";
    case "thread":
      return "Diskusija";
    case "dm":
      return "Direktna poruka";
    default:
      return "Razgovor";
  }
}
