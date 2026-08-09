import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Clock, Reply } from 'lucide-react-native';

import { MessageAttachment } from '@/components/chat/message-attachment';
import { Avatar } from '@/components/ui/avatar';
import { haptics } from '@/lib/haptics';
import {
  formatMessageTime,
  isOptimisticId,
  splitMentions,
  type ChatMessage,
} from '@/lib/chat';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

const AVATAR = 32;
const REPLY_THRESHOLD = 56;
const MAX_PULL = 84;

/**
 * Jedan mehurić razgovora. Sopstvene poruke desno (primarni mehurić), tuđe levo
 * (avatar + ime kad grupa počinje). Svajp desno preko praga → odgovor (haptika +
 * `onReply`); long-press → akcioni sheet. Sistemske poruke su tiha centrirana
 * linija. Optimistička poruka („šalje se") se prepoznaje po privremenom id-ju.
 */
export function MessageBubble({
  message,
  grouped,
  currentProfileId,
  mentionNames,
  repliedTo,
  onReply,
  onLongPress,
  onToggleReaction,
}: {
  message: ChatMessage;
  grouped: boolean;
  currentProfileId: Id<'profiles'>;
  mentionNames: string[];
  repliedTo: ChatMessage | null;
  onReply: (message: ChatMessage) => void;
  onLongPress: (message: ChatMessage) => void;
  onToggleReaction: (messageId: Id<'chatMessages'>, emoji: string) => void;
}) {
  const colors = useThemeColors();
  const translateX = useSharedValue(0);
  const triggered = useSharedValue(false);

  const isSystem = message.kind === 'system' || message.authorProfileId === null;
  const isOwn = message.authorProfileId === currentProfileId;
  const sending = isOptimisticId(message._id);

  const fireReply = () => onReply(message);
  const fireHaptic = () => haptics.threshold();

  // Svajp-desno-za-odgovor. `activeOffsetX` traži horizontalni pomak (ne krade
  // tap/long-press), `failOffsetY` prepušta vertikalni skrol listi, a ivični
  // swipe-back ostaje netaknut (nije uključen full-screen gest).
  const pan = Gesture.Pan()
    .enabled(!isSystem && !message.deleted)
    .activeOffsetX(14)
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      'worklet';
      const x = Math.max(0, Math.min(event.translationX, MAX_PULL));
      translateX.value = x;
      if (x >= REPLY_THRESHOLD && !triggered.value) {
        triggered.value = true;
        runOnJS(fireHaptic)();
      } else if (x < REPLY_THRESHOLD && triggered.value) {
        triggered.value = false;
      }
    })
    .onEnd(() => {
      'worklet';
      if (triggered.value) runOnJS(fireReply)();
      triggered.value = false;
      translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
    });

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const revealStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, translateX.value / REPLY_THRESHOLD),
  }));

  if (isSystem) {
    return (
      <View style={styles.systemWrap}>
        <Text style={[styles.systemText, { color: colors.mutedForeground }]}>
          {message.body}
        </Text>
      </View>
    );
  }

  const bodyColor = isOwn ? colors.primaryForeground : colors.foreground;
  const metaColor = isOwn ? colors.primaryForeground : colors.mutedForeground;

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.row, { marginTop: grouped ? 2 : 10 }]}>
        <Animated.View style={[styles.reveal, revealStyle]} pointerEvents="none">
          <View style={[styles.revealCircle, { backgroundColor: colors.accent }]}>
            <Reply size={16} color={colors.primary} />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.rowInner,
            slideStyle,
            { justifyContent: isOwn ? 'flex-end' : 'flex-start' },
          ]}>
          {isOwn ? null : (
            <View style={styles.avatarCol}>
              {grouped ? null : (
                <Avatar
                  name={message.author?.displayName}
                  uri={message.author?.avatarUrl ?? null}
                  size={AVATAR}
                />
              )}
            </View>
          )}

          <View
            style={[styles.stack, { alignItems: isOwn ? 'flex-end' : 'flex-start' }]}>
            {!grouped && !isOwn ? (
              <Text
                numberOfLines={1}
                style={[styles.author, { color: colors.mutedForeground }]}>
                {message.author?.displayName ?? 'Član'}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="text"
              onLongPress={() => {
                haptics.select();
                onLongPress(message);
              }}
              delayLongPress={280}
              disabled={message.deleted}
              style={[
                styles.bubble,
                isOwn
                  ? {
                      backgroundColor: colors.primary,
                      borderTopRightRadius: grouped ? radius.xl : radius.sm,
                    }
                  : {
                      backgroundColor: colors.secondary,
                      borderTopLeftRadius: grouped ? radius.xl : radius.sm,
                    },
              ]}>
              {repliedTo || message.replyToMessageId ? (
                <ReplyPreview repliedTo={repliedTo} isOwn={isOwn} colors={colors} />
              ) : null}

              {message.deleted ? (
                <Text style={[styles.deleted, { color: metaColor }]}>
                  Poruka je obrisana
                </Text>
              ) : (
                <>
                  {message.body ? (
                    <Text style={[styles.body, { color: bodyColor }]}>
                      {splitMentions(message.body, mentionNames).map((segment, index) =>
                        segment.kind === 'mention' ? (
                          <Text
                            key={index}
                            style={[
                              styles.mention,
                              { color: isOwn ? colors.primaryForeground : colors.primary },
                            ]}>
                            {segment.value}
                          </Text>
                        ) : (
                          <Text key={index}>{segment.value}</Text>
                        ),
                      )}
                    </Text>
                  ) : null}
                  <MessageAttachment message={message} mine={isOwn} />
                </>
              )}

              <View style={[styles.meta, { opacity: isOwn ? 0.75 : 1 }]}>
                {message.editedAt && !message.deleted ? (
                  <Text style={[styles.metaText, { color: metaColor }]}>izmenjeno</Text>
                ) : null}
                {sending ? (
                  <Clock size={11} color={metaColor} />
                ) : (
                  <Text style={[styles.metaText, { color: metaColor }]}>
                    {formatMessageTime(message.createdAt)}
                  </Text>
                )}
              </View>
            </Pressable>

            {!message.deleted && message.reactions.length > 0 ? (
              <View
                style={[
                  styles.reactions,
                  { justifyContent: isOwn ? 'flex-end' : 'flex-start' },
                ]}>
                {message.reactions.map((reaction) => (
                  <Pressable
                    key={reaction.emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`${reaction.emoji}, ${reaction.count}`}
                    accessibilityState={{ selected: reaction.mine }}
                    hitSlop={10}
                    onPress={() => onToggleReaction(message._id, reaction.emoji)}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: reaction.mine ? colors.accent : colors.card,
                        borderColor: reaction.mine ? colors.primary : colors.border,
                      },
                    ]}>
                    <Text style={styles.pillEmoji}>{reaction.emoji}</Text>
                    <Text
                      style={[
                        styles.pillCount,
                        { color: reaction.mine ? colors.primary : colors.mutedForeground },
                      ]}>
                      {reaction.count}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function ReplyPreview({
  repliedTo,
  isOwn,
  colors,
}: {
  repliedTo: ChatMessage | null;
  isOwn: boolean;
  colors: ColorTokens;
}) {
  const author = repliedTo?.author?.displayName ?? 'Član';
  const snippet = repliedTo
    ? repliedTo.deleted
      ? 'Poruka je obrisana'
      : repliedTo.body || 'prilog'
    : 'Odgovor na poruku';
  const accent = isOwn ? colors.primaryForeground : colors.primary;
  const textColor = isOwn ? colors.primaryForeground : colors.mutedForeground;

  return (
    <View style={[styles.reply, { borderLeftColor: accent, opacity: isOwn ? 0.9 : 1 }]}>
      <Text numberOfLines={1} style={[styles.replyText, { color: textColor }]}>
        {repliedTo ? (
          <Text style={{ fontWeight: fontWeight.semibold }}>{author} </Text>
        ) : null}
        {snippet}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  systemWrap: {
    marginVertical: 6,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  systemText: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    textAlign: 'center',
  },
  row: {
    paddingHorizontal: 10,
  },
  reveal: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  revealCircle: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  avatarCol: {
    width: AVATAR,
    justifyContent: 'flex-end',
  },
  stack: {
    maxWidth: '80%',
    gap: 3,
  },
  author: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.xl,
  },
  reply: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    marginBottom: 4,
  },
  replyText: {
    ...text.meta,
    fontWeight: fontWeight.regular,
  },
  body: {
    ...text.body,
  },
  mention: {
    fontWeight: fontWeight.semibold,
    textDecorationLine: 'underline',
  },
  deleted: {
    ...text.body,
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillEmoji: {
    fontSize: 13,
  },
  pillCount: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
