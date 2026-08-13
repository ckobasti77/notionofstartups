import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { MessageSquare, MessageSquareX, SquarePen } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useQuery } from 'convex/react';

import { ConversationRow } from '@/components/chat/conversation-row';
import { NewConversationSheet } from '@/components/chat/new-conversation-sheet';
import { SegmentedControl } from '@/components/chat/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import {
  channelsForSegment,
  CHAT_SEGMENTS,
  findChannelArea,
  type ChatChannel,
  type ChatSegmentId,
} from '@/lib/chat';
import type { StartupArea } from '@/lib/tasks';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';

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
  const [composing, setComposing] = useState(false);

  const startupArg = activeStartupId ? { startupId: activeStartupId } : 'skip';
  const channels = useQuery(api.chat.listChannels, startupArg);
  const directMessages = useQuery(api.chat.listDirectMessages, startupArg);
  const followedThreads = useQuery(api.chat.listFollowedThreads, startupArg);
  const profile = useQuery(api.profiles.getCurrent, {});
  // Oblasti su potrebne SAMO da red kanala oblasti dobije svoju ikonicu i boju
  // (P7/D12, pandan web `channel-list.tsx:118`). Convex deli ovu pretplatu sa
  // ostalim ekranima koji je već imaju (`prostor.tsx`, `danas.tsx`, `zadaci.tsx`),
  // pa nije nov mrežni saobraćaj po tabu.
  const startup = useQuery(api.startups.get, startupArg);

  const data: ChatChannel[] | undefined =
    segment === 'channels'
      ? channels && channelsForSegment(channels)
      : segment === 'direct'
        ? directMessages
        : followedThreads;

  const openConversation = (channelId: Id<'chatChannels'>) => {
    haptics.tap();
    router.push({ pathname: '/razgovor/[id]', params: { id: channelId } });
  };

  return (
    <TabScreen
      title="Chat"
      actions={
        <IconButton
          accessibilityLabel="Nova poruka"
          disabled={activeStartupId === null}
          onPress={() => {
            haptics.tap();
            setComposing(true);
          }}>
          <SquarePen
            size={22}
            color={activeStartupId === null ? colors.subtle : colors.foreground}
          />
        </IconButton>
      }
      // Segment je deo zaglavlja: jedan blok gore umesto treće trake ispod njega.
      below={<SegmentedControl options={CHAT_SEGMENTS} value={segment} onChange={setSegment} />}>
      <ConversationList
        channels={data}
        areas={startup?.areas}
        segment={segment}
        onOpen={openConversation}
      />
      {activeStartupId === null ? null : (
        <NewConversationSheet
          open={composing}
          startupId={activeStartupId}
          isAdmin={profile?.role === 'admin'}
          onClose={() => setComposing(false)}
          onOpened={openConversation}
        />
      )}
    </TabScreen>
  );
}

function ConversationList({
  channels,
  areas,
  segment,
  onOpen,
}: {
  channels: ChatChannel[] | undefined;
  /** `undefined` dok `startups.get` ne stigne — red tada crta generički `Hash`. */
  areas: StartupArea[] | undefined;
  segment: ChatSegmentId;
  onOpen: (channelId: Id<'chatChannels'>) => void;
}) {
  const colors = useThemeColors();
  const refreshControl = useListRefresh();

  if (channels !== undefined && channels.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare size={40} color={colors.mutedForeground} />}
        title="Još niko nije pisao. Budi prvi."
        description={EMPTY_DESCRIPTION[segment]}
      />
    );
  }

  return (
    <LoadingSwap
      loading={channels === undefined}
      // Isti oblik kao `ConversationRow`: kvadratni avatar 44 + ime + pregled poruke.
      skeleton={
        <SkeletonList
          count={6}
          style={styles.skeletonList}
          item={(index) => <SkeletonRow index={index} leading="square" subtitle trailing="value" />}
        />
      }>
      {channels ? (
        <FlatList
          data={channels}
          keyExtractor={(channel) => channel._id}
          // `FlatList` montira redove lenjo, pa `StaggerItem` sam prestaje da
          // animira posle prvog punjenja (vidi `ui/stagger.tsx`) — nema fade-a
          // usred skrola.
          renderItem={({ item, index }) => (
            <StaggerItem index={index}>
              <ConversationRow
                channel={item}
                area={findChannelArea(item, areas)}
                onPress={() => onOpen(item._id)}
              />
            </StaggerItem>
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        />
      ) : null}
    </LoadingSwap>
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
  listContent: {
    paddingBottom: 16,
  },
  skeletonList: {
    paddingTop: 6,
  },
});
