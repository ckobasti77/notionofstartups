import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { usePaginatedQuery, useMutation } from 'convex/react';
import { ChevronDown, MessageSquare } from 'lucide-react-native';

import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageActionsSheet } from '@/components/chat/message-actions-sheet';
import { EmptyState } from '@/components/empty-state';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { SkeletonList, SkeletonMessage } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import {
  formatDaySeparator,
  sameDay,
  shouldGroupWithPrevious,
  type ChatMember,
  type ChatMessage,
} from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, type ColorTokens } from '@/theme/tokens';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Obrnuta (inverted) lista poruka. Backend vraća najnovije prvo, pa `inverted`
 * crta `results[0]` na dnu; „starije" se učitavaju pri skrolu nagore preko
 * `onEndReached` (na inverted listi „kraj" je vrh). Grupisanje i dnevni separatori
 * računaju se svesni obrnutog niza: starija poruka za `results[i]` je `results[i+1]`.
 */
export function MessageList({
  channelId,
  currentProfileId,
  isAdmin,
  members,
  onReplyTo,
  onEdit,
}: {
  channelId: Id<'chatChannels'>;
  currentProfileId: Id<'profiles'>;
  isAdmin: boolean;
  members: ChatMember[] | undefined;
  onReplyTo: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
}) {
  const colors = useThemeColors();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [showJump, setShowJump] = useState(false);

  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.messages,
    { channelId },
    { initialNumItems: 30 },
  );

  const toggleReaction = useMutation(api.chat.toggleReaction);
  const deleteMessage = useMutation(api.chat.deleteMessage);

  // Razrešavanje citirane poruke i imena pomenutih iz već učitanog prozora.
  const byId = useMemo(
    () => new Map(results.map((message) => [message._id, message])),
    [results],
  );
  const memberNameById = useMemo(
    () => new Map((members ?? []).map((member) => [member.profile._id, member.profile.displayName])),
    [members],
  );

  const handleToggleReaction = useCallback(
    (messageId: Id<'chatMessages'>, emoji: string) => {
      void toggleReaction({ messageId, emoji }).catch((error) => {
        haptics.error();
        Alert.alert('Reakcija', errorMessage(error, 'Reakcija nije sačuvana.'));
      });
    },
    [toggleReaction],
  );

  const handleDelete = useCallback(() => {
    const target = actionsFor;
    if (!target) return;
    setActionsFor(null);
    const own = target.authorProfileId === currentProfileId;
    Alert.alert(
      own ? 'Obrisati poruku?' : 'Obrisati tuđu poruku?',
      own
        ? 'Poruka će ostati kao „Poruka je obrisana".'
        : 'Moderacija: poruka će ostati kao „Poruka je obrisana", a autor neće biti obavešten.',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Obriši',
          style: 'destructive',
          onPress: () =>
            void deleteMessage({ messageId: target._id })
              .then(() => haptics.success())
              .catch((error) => {
                haptics.error();
                Alert.alert('Greška', errorMessage(error, 'Poruka nije obrisana.'));
              }),
        },
      ],
    );
  }, [actionsFor, currentProfileId, deleteMessage]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Na inverted listi je dno na offset 0; prikaži „skoči na dno" kad se odmakne.
      setShowJump(event.nativeEvent.contentOffset.y > 280);
    },
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const older = results[index + 1];
      const showDay = !older || !sameDay(item.createdAt, older.createdAt);
      const grouped = !showDay && shouldGroupWithPrevious(item, older);
      const mentionNames = item.mentions
        .map((id) => memberNameById.get(id))
        .filter((name): name is string => Boolean(name));
      const repliedTo = item.replyToMessageId
        ? byId.get(item.replyToMessageId) ?? null
        : null;

      return (
        <>
          {showDay ? <DaySeparator ts={item.createdAt} colors={colors} /> : null}
          <MessageBubble
            message={item}
            grouped={grouped}
            currentProfileId={currentProfileId}
            mentionNames={mentionNames}
            repliedTo={repliedTo}
            onReply={onReplyTo}
            onLongPress={setActionsFor}
            onToggleReaction={handleToggleReaction}
          />
        </>
      );
    },
    [results, byId, memberNameById, colors, currentProfileId, onReplyTo, handleToggleReaction],
  );

  const loading = status === 'LoadingFirstPage';

  if (!loading && results.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare size={40} color={colors.mutedForeground} />}
        title="Još niko nije pisao. Budi prvi."
        description="Napiši poruku ispod da započneš razgovor."
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Skeleton: mehurići naizmenično levo/desno — isti raspored koji stiže.
          Bez pull-to-refresh: lista je `inverted`, pa bi se spinner pojavio na DNU,
          tamo gde se piše poruka. Nove poruke ionako stižu kroz pretplatu. */}
      <LoadingSwap
        loading={loading}
        skeleton={
          <SkeletonList
            count={7}
            gap={6}
            style={styles.content}
            item={(index) => <SkeletonMessage index={index} own={index % 3 === 1} />}
          />
        }>
        {loading ? null : (
          <FlatList
            ref={listRef}
            data={results}
            inverted
            keyExtractor={(message) => message._id}
            renderItem={renderItem}
            onEndReached={() => {
              if (status === 'CanLoadMore') loadMore(30);
            }}
            onEndReachedThreshold={0.4}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={styles.content}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListFooterComponent={
              status === 'LoadingMore' ? (
                <View style={styles.loadingOlder}>
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                </View>
              ) : null
            }
          />
        )}
      </LoadingSwap>

      {showJump ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skoči na najnovije poruke"
          onPress={() => {
            haptics.tap();
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
          style={[styles.jump, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ChevronDown size={22} color={colors.foreground} />
        </Pressable>
      ) : null}

      <MessageActionsSheet
        message={actionsFor}
        currentProfileId={currentProfileId}
        isAdmin={isAdmin}
        onReact={(emoji) => {
          if (actionsFor) handleToggleReaction(actionsFor._id, emoji);
          setActionsFor(null);
        }}
        onReply={() => {
          if (actionsFor) onReplyTo(actionsFor);
          setActionsFor(null);
        }}
        onEdit={() => {
          if (actionsFor) onEdit(actionsFor);
          setActionsFor(null);
        }}
        onDelete={handleDelete}
        onClose={() => setActionsFor(null)}
      />
    </View>
  );
}

function DaySeparator({ ts, colors }: { ts: number; colors: ColorTokens }) {
  return (
    <View style={styles.day} accessibilityRole="header">
      <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
      <Text
        style={[
          styles.dayLabel,
          { backgroundColor: colors.muted, color: colors.mutedForeground },
        ]}>
        {formatDaySeparator(ts)}
      </Text>
      <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingVertical: 12,
  },
  loadingOlder: {
    paddingVertical: 12,
  },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginVertical: 10,
  },
  dayLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  jump: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
