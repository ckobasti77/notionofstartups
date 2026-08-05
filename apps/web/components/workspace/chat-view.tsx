"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { MessagesSquare } from "lucide-react";

import { ChannelList } from "@/components/workspace/chat/channel-list";
import { ConversationPane } from "@/components/workspace/chat/conversation-pane";
import { EmptyState } from "@/components/workspace/workspace-ui";
import type {
  ProfileWithAvatar,
  StartupMember,
  StartupWithAreas,
} from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export function ChatView({
  startup,
  profile,
  channelId,
  onSelectChannel,
  onOpenList,
  onOpenPage,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  channelId?: Id<"chatChannels">;
  onSelectChannel: (channelId: Id<"chatChannels">) => void;
  onOpenList: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const channels = useQuery(api.chat.listChannels, { startupId: startup._id });
  const members = useQuery(api.startups.listMembers, {
    startupId: startup._id,
    limit: 50,
  }) as StartupMember[] | undefined;

  const activeChannel = useMemo(
    () => channels?.find((channel) => channel._id === channelId) ?? null,
    [channels, channelId],
  );

  // Mobilni drill-down: izabran kanal skriva listu, prazan izbor skriva
  // razgovor. Na `lg+` obe kolone stoje jedna pored druge.
  return (
    <div className="flex h-full min-h-0 bg-background">
      <div
        data-workspace-enter
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-r border-border/70 bg-sidebar/40 lg:flex lg:w-80 lg:min-w-72",
          channelId ? "hidden lg:flex" : "flex",
        )}
      >
        <ChannelList
          startup={startup}
          profile={profile}
          channels={channels}
          members={members}
          activeChannelId={channelId}
          onSelectChannel={onSelectChannel}
        />
      </div>

      <div
        data-workspace-enter
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col",
          channelId ? "flex" : "hidden lg:flex",
        )}
      >
        {activeChannel ? (
          <ConversationPane
            key={activeChannel._id}
            startup={startup}
            profile={profile}
            channel={activeChannel}
            members={members}
            onOpenList={onOpenList}
            onOpenPage={onOpenPage}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={MessagesSquare}
              title="Izaberi razgovor"
              description="Otvori kanal, diskusiju ili direktnu poruku iz liste sa leve strane da započneš razgovor."
              className="max-w-md border-none bg-transparent"
            />
          </div>
        )}
      </div>
    </div>
  );
}
