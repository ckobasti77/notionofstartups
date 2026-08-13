import { Hash, MessagesSquare } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AreaIcon } from '@/components/ui/area-icon';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Row } from '@/components/ui/row';
import {
  channelDisplayName,
  channelPreview,
  formatListTimestamp,
  type ChannelArea,
  type ChatChannel,
} from '@/lib/chat';
import { areaColor } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

/** Red liste razgovora: ikonica/avatar, ime, pregled poruke, vreme i unread. */
export function ConversationRow({
  channel,
  area,
  onPress,
}: {
  channel: ChatChannel;
  /**
   * Oblast kanala. OBAVEZAN — web ima ikonicu oblasti i u listi
   * (`channel-list.tsx:167`), pa difolt `null` ovde znači tihi razlaz sa webom.
   */
  area: ChannelArea;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const name = channelDisplayName(channel);
  const time = formatListTimestamp(channel);

  return (
    <Row
      icon={<ChannelIcon channel={channel} area={area} colors={colors} />}
      title={name}
      subtitle={channelPreview(channel)}
      value={
        <View style={styles.meta}>
          {time.length > 0 ? (
            <Text style={[styles.time, { color: colors.mutedForeground }]}>{time}</Text>
          ) : null}
          <UnreadIndicator channel={channel} colors={colors} />
        </View>
      }
      onPress={onPress}
      showChevron={false}
      accessibilityLabel={name}
    />
  );
}

function ChannelIcon({
  channel,
  area,
  colors,
}: {
  channel: ChatChannel;
  area: ChannelArea;
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

  // Isto što web radi u listi (`channel-list.tsx:167`): kanal oblasti se u listi
  // prepoznaje po ikonici i boji, bez čitanja imena.
  if (channel.kind === 'area' && area !== null) {
    const tint = areaColor(colors, area.key);
    return (
      <View style={[styles.iconBox, { backgroundColor: `${tint}22` }]}>
        <AreaIcon areaKey={area.key} size={20} color={tint} />
      </View>
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
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 40,
  },
  time: {
    ...text.meta,
    fontWeight: fontWeight.regular,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
});
