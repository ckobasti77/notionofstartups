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
  Settings2,
  Upload,
  Users,
} from "lucide-react";
import { chatConversationPermissions, personalSubtitle } from "@devotion/shared";

import { ChannelMembersDialog } from "@/components/workspace/chat/channel-members-dialog";
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
  type ChatMember,
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
  splitAt = "lg",
  contextLabel,
  onOpenInStartup,
  onOpenGroupSettings,
  preview,
  animateArrivals = false,
}: {
  /** Startup kanala; `null` za lični razgovor (ili startup van liste ljuske). */
  startup: StartupWithAreas | null;
  profile: ProfileWithAvatar;
  channel: ChatChannel;
  /**
   * Članovi opsega: tim (`startups.listMembers`) za kanal startupa, članovi
   * razgovora (`chat.channelMembers`) za lični razgovor.
   */
  members: ChatMember[] | undefined;
  onOpenList: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  /** Od koje širine lista i razgovor stoje jedno pored drugog (tada se „Nazad“ krije). */
  splitAt?: "lg" | "xl";
  /** Ispred podnaslova (globalne Poruke: ime startupa kanala). */
  contextLabel?: string;
  /** Stavka menija „Otvori u startupu“ (globalne Poruke, kanal startupa). */
  onOpenInStartup?: () => void;
  /** Stavka menija „Podešavanja grupe“ (lična grupa). */
  onOpenGroupSettings?: () => void;
  /** Izlog: statične poruke, bez pretplate, čitanja i prisustva. */
  preview?: ChatMessage[];
  /** Nova poruka ulazi kratkim springom (globalne Poruke). */
  animateArrivals?: boolean;
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
  const [membersOpen, setMembersOpen] = useState(false);
  const markChannelRead = useMutation(api.chat.markChannelRead);
  const setNotificationLevel = useMutation(api.chat.setNotificationLevel);
  const archiveChannel = useMutation(api.chat.archiveChannel);

  // Otvaranje kanala i svaka nova poruka (lastMessageAt) čiste nepročitano —
  // prikaz je u prvom planu dok je montiran (04-CHAT.md §5).
  const live = preview === undefined;
  useEffect(() => {
    if (!live) return;
    void markChannelRead({ channelId: channel._id }).catch(() => {
      // Neuspelo označavanje ne sme da blokira čitanje.
    });
  }, [channel._id, channel.lastMessageAt, markChannelRead, live]);

  useChatPresence(channel._id, atBottom && live);

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
  const personal = channel.startupId === null;
  const areaKey =
    channel.kind === "area"
      ? startup?.areas.find((area) => area._id === channel.areaId)?.key
      : undefined;
  const baseSubtitle = personal
    ? personalSubtitle(
        channel.kind,
        channel.kind === "custom" ? (members?.length ?? null) : null,
      )
    : conversationSubtitle(channel, areaKey, startup);
  const subtitle = contextLabel ? `${contextLabel} · ${baseSubtitle}` : baseSubtitle;

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

  // Lični razgovor se ne arhivira i nema admin-članstvo (D4): grupom upravlja
  // njen vlasnik kroz „Podešavanja grupe“. Admin radnje su ogledalo serverskih
  // gejtova (`chat.archiveChannel`, `chat.setChannelMembers`: samo admin i samo
  // `custom` kanal) — isto pravilo koristi i telefon (`@devotion/shared`).
  const permissions = chatConversationPermissions(profile.role, channel);
  const canArchive = permissions.canArchive;
  const canManageMembers = permissions.canManageMembers;
  const showGroupSettings =
    permissions.canOpenGroupSettings && onOpenGroupSettings !== undefined;
  const showOpenInStartup = !personal && onOpenInStartup !== undefined;

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
          className={cn("size-9 shrink-0", splitAt === "xl" ? "xl:hidden" : "lg:hidden")}
          aria-label="Nazad na razgovore"
          onClick={onOpenList}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <ConversationIcon channel={channel} areaKey={areaKey} personal={personal} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            {subtitle}
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
            {showOpenInStartup || showGroupSettings ? (
              <>
                {showOpenInStartup ? (
                  <DropdownMenuItem onSelect={() => onOpenInStartup?.()}>
                    <ExternalLink className="size-4" /> Otvori u startupu
                  </DropdownMenuItem>
                ) : null}
                {showGroupSettings ? (
                  <DropdownMenuItem onSelect={() => onOpenGroupSettings?.()}>
                    <Settings2 className="size-4" /> Podešavanja grupe
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
              </>
            ) : null}
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
            {canManageMembers ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setMembersOpen(true)}>
                  <Users className="size-4" /> Članovi kanala
                </DropdownMenuItem>
              </>
            ) : null}
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
        preview={preview}
        animateArrivals={animateArrivals}
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

      {/* Jedini ulaz je stavka „Članovi kanala" u meniju iznad. */}
      {canManageMembers ? (
        <ChannelMembersDialog
          open={membersOpen}
          onOpenChange={setMembersOpen}
          channel={channel}
          profile={profile}
          members={members}
        />
      ) : null}

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
  personal,
}: {
  channel: ChatChannel;
  areaKey: string | undefined;
  personal: boolean;
}) {
  if (personal && channel.kind === "custom") {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Users className="size-4" aria-hidden="true" />
      </span>
    );
  }
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
  startup: StartupWithAreas | null,
): string {
  switch (channel.kind) {
    case "startup":
      return "Ceo tim · svi članovi";
    case "area": {
      const area = startup?.areas.find((item) => item.key === areaKey);
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
