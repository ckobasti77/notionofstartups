import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { MessageSquare, MessageSquareX, SquarePen } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useQuery } from 'convex/react';

import { ConversationRow } from '@/components/chat/conversation-row';
import { SegmentedControl } from '@/components/chat/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  channelsForSegment,
  CHAT_SEGMENTS,
  type ChatChannel,
  type ChatSegmentId,
} from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/**
 * Tab „Chat" — kanali, direktne poruke i praćeni threadovi
 * (docs/mobile/02-EKRANI.md §6). Tri segmenta nad tri realtime upita; tap na red
 * otvara ekran razgovora (za sad placeholder).
 */
export default function ChatScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { activeStartupId } = useActiveStartup();
  const [segment, setSegment] = useState<ChatSegmentId>('channels');

  const startupArg = activeStartupId ? { startupId: activeStartupId } : 'skip';
  const channels = useQuery(api.chat.listChannels, startupArg);
  const directMessages = useQuery(api.chat.listDirectMessages, startupArg);
  const followedThreads = useQuery(api.chat.listFollowedThreads, startupArg);

  const data: ChatChannel[] | undefined =
    segment === 'channels'
      ? channels && channelsForSegment(channels)
      : segment === 'direct'
        ? directMessages
        : followedThreads;

  const openConversation = (channelId: Id<'chatChannels'>) => {
    router.push({ pathname: '/razgovor/[id]', params: { id: channelId } });
  };

  return (
    <TabScreen
      title="Chat"
      actions={
        <IconButton
          accessibilityLabel="Nova poruka"
          onPress={() => {
            // Kreiranje razgovora stiže u kasnijem koraku faze 1
            // (docs/mobile/02-EKRANI.md §12, red 4).
          }}>
          <SquarePen size={22} color={colors.foreground} />
        </IconButton>
      }>
      <View style={styles.segmentWrap}>
        <SegmentedControl
          options={CHAT_SEGMENTS}
          value={segment}
          onChange={setSegment}
        />
      </View>

      <ConversationList
        channels={data}
        segment={segment}
        onOpen={openConversation}
      />
    </TabScreen>
  );
}

function ConversationList({
  channels,
  segment,
  onOpen,
}: {
  channels: ChatChannel[] | undefined;
  segment: ChatSegmentId;
  onOpen: (channelId: Id<'chatChannels'>) => void;
}) {
  const colors = useThemeColors();

  if (channels === undefined) {
    return (
      <View style={styles.skeletonList}>
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <View key={item} style={styles.skeletonRow}>
            <Skeleton width={44} height={44} borderRadius={radius.lg} />
            <View style={styles.skeletonBody}>
              <Skeleton width="55%" height={16} />
              <Skeleton width="80%" height={13} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare size={40} color={colors.mutedForeground} />}
        title="Još niko nije pisao. Budi prvi."
        description={EMPTY_DESCRIPTION[segment]}
      />
    );
  }

  return (
    <FlatList
      data={channels}
      keyExtractor={(channel) => channel._id}
      renderItem={({ item }) => (
        <ConversationRow channel={item} onPress={() => onOpen(item._id)} />
      )}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
    />
  );
}

/**
 * Greška stanje za ceo tab. Sva tri upita prolaze kroz `requireStartupMember`,
 * koji baca kad korisnik nije član aktivnog startupa (npr. uklonjen, ili je
 * `activeStartupId` zastareo) — `useQuery` tada baca pri renderu. expo-router
 * hvata to ovde i prikazuje oporavljivu grešku umesto pada ekrana
 * (.claude/rules/mobile.md: prazno/učitavanje/greška za svaki prikaz).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ChatErrorState message={error.message} onRetry={retry} />;
}

function ChatErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  return (
    <TabScreen title="Chat">
      <EmptyState
        icon={<MessageSquareX size={40} color={colors.destructive} />}
        title="Razgovori se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju razgovora.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </TabScreen>
  );
}

const EMPTY_DESCRIPTION: Record<ChatSegmentId, string> = {
  channels: 'Kanali po oblastima i opšti kanal tima pojaviće se ovde.',
  direct: 'Direktne poruke sa članovima tima idu ovde.',
  threads: 'Diskusije uz zadatke, stranice i ideje koje pratiš idu ovde.',
};

const styles = StyleSheet.create({
  segmentWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  listContent: {
    paddingBottom: 16,
  },
  skeletonList: {
    paddingTop: 6,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 64,
  },
  skeletonBody: {
    flex: 1,
    gap: 8,
  },
});
