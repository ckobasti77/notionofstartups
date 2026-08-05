import { Hash, MessagesSquare } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  channelDisplayName,
  channelPreview,
  formatListTimestamp,
  type ChatChannel,
} from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, type ColorTokens } from '@/theme/tokens';

/** Red liste razgovora: ikonica/avatar, ime, pregled poruke, vreme i unread. */
export function ConversationRow({
  channel,
  onPress,
}: {
  channel: ChatChannel;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const name = channelDisplayName(channel);
  const time = formatListTimestamp(channel);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.muted },
      ]}>
      <ChannelIcon channel={channel} colors={colors} />

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={[styles.name, { color: colors.foreground }]}>
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.preview, { color: colors.mutedForeground }]}>
          {channelPreview(channel)}
        </Text>
      </View>

      <View style={styles.meta}>
        {time.length > 0 ? (
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{time}</Text>
        ) : null}
        <UnreadIndicator channel={channel} colors={colors} />
      </View>
    </Pressable>
  );
}

function ChannelIcon({
  channel,
  colors,
}: {
  channel: ChatChannel;
  colors: ColorTokens;
}) {
  if (channel.kind === 'dm') {
    return (
      <Avatar
        name={channel.otherParticipant?.displayName}
        uri={channel.otherParticipant?.avatarUrl ?? null}
        size={44}
      />
    );
  }

  const Icon = channel.kind === 'thread' ? MessagesSquare : Hash;
  return (
    <View
      style={[styles.iconBox, { backgroundColor: colors.accent }]}>
      <Icon size={20} color={colors.primary} />
    </View>
  );
}

/**
 * Unread: pominjanja uvek nose broj (bitna su); kanal utišan na „samo @" dobija
 * tihu tačku umesto broja; inače brojčani badge (04-CHAT.md §5).
 */
function UnreadIndicator({
  channel,
  colors,
}: {
  channel: ChatChannel;
  colors: ColorTokens;
}) {
  if (channel.mentionCount > 0) {
    return <Badge label={`@${channel.mentionCount > 99 ? '99+' : channel.mentionCount}`} />;
  }
  if (channel.unreadCount > 0) {
    if (channel.notificationLevel === 'mentions') {
      return (
        <View
          accessible
          accessibilityLabel="Nova poruka"
          style={[styles.dot, { backgroundColor: colors.primary }]}
        />
      );
    }
    return (
      <Badge label={channel.unreadCount > 99 ? '99+' : String(channel.unreadCount)} />
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 64,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: fontWeight.semibold,
  },
  preview: {
    fontSize: 14,
    lineHeight: 18,
  },
  meta: {
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 40,
  },
  time: {
    fontSize: 12,
    lineHeight: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
});
