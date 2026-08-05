"use client";

import { Hash, MessagesSquare } from "lucide-react";

import { NewConversation } from "@/components/workspace/chat/new-conversation";
import {
  AREA_ICONS,
  EmptyState,
  getAreaTint,
  ProfileAvatar,
} from "@/components/workspace/workspace-ui";
import type {
  ProfileWithAvatar,
  StartupMember,
  StartupWithAreas,
} from "@/components/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CHAT_SECTIONS,
  channelDisplayName,
  channelSection,
  type ChatChannel,
} from "@/lib/chat";
import type { AreaKey } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export function ChannelList({
  startup,
  profile,
  channels,
  members,
  activeChannelId,
  onSelectChannel,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  channels: ChatChannel[] | undefined;
  members: StartupMember[] | undefined;
  activeChannelId?: Id<"chatChannels">;
  onSelectChannel: (channelId: Id<"chatChannels">) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">
            {startup.name}
          </p>
          <h1 className="truncate text-lg font-bold tracking-[-0.02em]">
            Razgovori
          </h1>
        </div>
        <NewConversation
          startup={startup}
          profile={profile}
          members={members}
          onCreated={onSelectChannel}
        />
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {channels === undefined ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Nema razgovora"
            description="Započni novi razgovor pomoću dugmeta iznad."
            className="mx-1 border-none bg-transparent"
          />
        ) : (
          CHAT_SECTIONS.map((section) => {
            const sectionChannels = channels.filter(
              (channel) => channelSection(channel.kind) === section.id,
            );
            if (sectionChannels.length === 0) return null;
            return (
              <section key={section.id} className="space-y-0.5">
                <p className="px-3 pb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {section.label}
                </p>
                {sectionChannels.map((channel) => (
                  <ChannelRow
                    key={channel._id}
                    startup={startup}
                    channel={channel}
                    active={channel._id === activeChannelId}
                    onSelect={() => onSelectChannel(channel._id)}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChannelRow({
  startup,
  channel,
  active,
  onSelect,
}: {
  startup: StartupWithAreas;
  channel: ChatChannel;
  active: boolean;
  onSelect: () => void;
}) {
  const name = channelDisplayName(channel);
  const areaKey =
    channel.kind === "area"
      ? startup.areas.find((area) => area._id === channel.areaId)?.key
      : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-foreground/80 hover:bg-sidebar-accent/50",
      )}
    >
      <ChannelIcon channel={channel} areaKey={areaKey} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {channel.lastMessagePreview || "Bez poruka"}
        </span>
      </span>
      <UnreadIndicator channel={channel} />
    </button>
  );
}

function ChannelIcon({
  channel,
  areaKey,
}: {
  channel: ChatChannel;
  areaKey: string | undefined;
}) {
  if (channel.kind === "dm") {
    return channel.otherParticipant ? (
      <ProfileAvatar
        profile={channel.otherParticipant}
        className="size-8 shrink-0"
      />
    ) : (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Hash className="size-4" />
      </span>
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

/**
 * Nepročitano: pominjanja uvek nose broj (bitna su); kanal utišan na „samo @"
 * dobija tihu tačku umesto broja; inače brojčani badge (04-CHAT.md §5).
 */
function UnreadIndicator({ channel }: { channel: ChatChannel }) {
  if (channel.mentionCount > 0) {
    return (
      <Badge variant="default" className="tabular-nums">
        @{channel.mentionCount > 99 ? "99+" : channel.mentionCount}
      </Badge>
    );
  }
  if (channel.unreadCount > 0) {
    if (channel.notificationLevel === "mentions") {
      return (
        <span
          aria-label="Nova poruka"
          className="size-2 shrink-0 rounded-full bg-primary/70"
        />
      );
    }
    return (
      <Badge variant="default" className="tabular-nums">
        {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
      </Badge>
    );
  }
  return null;
}
