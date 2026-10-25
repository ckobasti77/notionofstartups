import {
  formatInboxTime,
  hubChannelName,
  hubMentionLabel,
  hubRowPreview,
  hubUnreadLabel,
  type HubChannel,
  type HubGroup,
} from '@devotion/shared';
import { Hash, MessagesSquare, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NumberRoll } from '@/components/motion';
import { SectionChevron } from '@/components/me/section-header';
import { StartupChip } from '@/components/me/startup-chip';
import { Avatar } from '@/components/ui/avatar';
import { Row } from '@/components/ui/row';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import {
  fontWeight,
  MIN_TOUCH_TARGET,
  radius,
  spacing,
  text,
  type ColorTokens,
} from '@/theme/tokens';

import { hubGroupAccessibilityLabel, hubRowAccessibilityLabel } from './hub-model';

/**
 * Red razgovora u hubu Poruka (K16) — par web `HubRow` (`hub-list.tsx`): avatar
 * za DM, `Users` za ličnu grupu, `#` za kanal startupa (nit / agent:
 * `MessagesSquare`), ime, pregled poslednje poruke („Ti: …", „Ime: …"), vreme
 * i nepročitano (broj se kotrlja). Dodir otvara razgovor, dugi pritisak sheet
 * radnji. Sklopljen na deljenom `Row` primitivu (mobile-row-primitive).
 */
export function HubRow({
  channel,
  now,
  meId,
  place,
  onPress,
  onLongPress,
}: {
  channel: HubChannel;
  now: number;
  /** Moj profil — „Ti: …" u pregledu; `null` dok profil ne stigne. */
  meId: string | null;
  /** Ime grupe u kojoj je red („Lično" / startup) — samo za čitač ekrana. */
  place: string | null;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const colors = useThemeColors();
  const name = hubChannelName(channel);
  const preview = hubRowPreview(channel, meId);
  const hasMessages = channel.lastMessagePreview.trim().length > 0;
  const time = hasMessages ? formatInboxTime(channel.lastMessageAt, now) : '';

  return (
    <Row
      icon={<HubRowIcon channel={channel} colors={colors} />}
      title={name}
      subtitle={preview}
      value={
        <View style={styles.meta}>
          {time.length > 0 ? (
            <Text style={[styles.time, { color: colors.mutedForeground }]}>{time}</Text>
          ) : null}
          <HubUnreadMark channel={channel} colors={colors} />
        </View>
      }
      showChevron={false}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      onLongPress={
        onLongPress
          ? () => {
              haptics.select();
              onLongPress();
            }
          : undefined
      }
      accessibilityLabel={hubRowAccessibilityLabel(channel, { name, preview, time, place })}
      accessibilityHint={
        onLongPress ? 'Otvara razgovor. Dugi pritisak otvara radnje.' : 'Otvara razgovor'
      }
    />
  );
}

export function HubRowIcon({ channel, colors }: { channel: HubChannel; colors: ColorTokens }) {
  if (channel.kind === 'dm') {
    return channel.otherParticipant ? (
      <Avatar
        name={channel.otherParticipant.displayName}
        uri={channel.otherParticipant.avatarUrl}
        size={44}
      />
    ) : (
      <View style={[styles.iconBox, styles.round, { backgroundColor: colors.muted }]}>
        <Users size={20} color={colors.mutedForeground} />
      </View>
    );
  }
  if (channel.startupId === null) {
    return (
      <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
        <Users size={20} color={colors.mutedForeground} />
      </View>
    );
  }
  const Icon = channel.kind === 'thread' || channel.kind === 'agent' ? MessagesSquare : Hash;
  return (
    <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
      <Icon size={20} color={colors.primaryText} />
    </View>
  );
}

/**
 * Nepročitano u redu (isto kao web i lista startupa): pominjanja uvek nose
 * broj, kanal utišan na „samo @" dobija tihu tačku, inače broj.
 */
function HubUnreadMark({ channel, colors }: { channel: HubChannel; colors: ColorTokens }) {
  if (channel.mentionCount > 0) {
    return (
      <UnreadPill
        value={channel.mentionCount}
        prefix="@"
        accessibilityLabel={hubMentionLabel(channel.mentionCount)}
        colors={colors}
      />
    );
  }
  if (channel.unreadCount === 0) return null;
  if (channel.notificationLevel === 'mentions') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.dot, { backgroundColor: colors.primaryText }]}
      />
    );
  }
  return (
    <UnreadPill
      value={channel.unreadCount}
      accessibilityLabel={hubUnreadLabel(channel.unreadCount)}
      colors={colors}
    />
  );
}

/**
 * Pilula nepročitanog sa brojem koji se kotrlja (`NumberRoll`, trenutak 5).
 * Uvek stoji u roditelju čija labela već nosi broj (red, zaglavlje grupe, red
 * „Kanali"), pa je sakrivena od čitača ekrana — TalkBack ga inače pročita dvaput.
 */
export function UnreadPill({
  value,
  prefix,
  accessibilityLabel,
  colors,
}: {
  value: number;
  prefix?: string;
  accessibilityLabel: string;
  colors: ColorTokens;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pill, { backgroundColor: colors.primary }]}>
      {prefix ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.pillText, { color: colors.primaryForeground }]}>
          {prefix}
        </Text>
      ) : null}
      <NumberRoll
        value={value}
        accessibilityLabel={accessibilityLabel}
        style={[styles.pillText, { color: colors.primaryForeground }]}
      />
    </View>
  );
}

/**
 * Zaglavlje grupe huba: „Lično" (ne sklapa se) ili startup (sklopiv, pamti
 * se). Čip startupa, overline ime i nepročitano cele grupe.
 */
export function HubGroupHeader({
  group,
  onToggle,
}: {
  group: HubGroup;
  /** Bez njega (ili dok traje pretraga) zaglavlje nije dugme. */
  onToggle?: () => void;
}) {
  const colors = useThemeColors();
  const toggleable = group.collapsible && onToggle !== undefined;
  const content = (
    <>
      {toggleable ? (
        <SectionChevron collapsed={group.collapsed} color={colors.mutedForeground} />
      ) : null}
      <StartupChip startup={group.startup} size="sm" />
      <Text numberOfLines={1} style={[styles.groupTitle, { color: colors.mutedForeground }]}>
        {group.title}
      </Text>
      {group.unreadCount > 0 ? (
        <UnreadPill
          value={group.unreadCount}
          accessibilityLabel={hubUnreadLabel(group.unreadCount)}
          colors={colors}
        />
      ) : null}
    </>
  );

  if (toggleable) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !group.collapsed }}
        accessibilityLabel={hubGroupAccessibilityLabel(group)}
        accessibilityHint={
          group.collapsed ? 'Prikazuje razgovore ovog startupa' : 'Sklapa razgovore ovog startupa'
        }
        onPress={() => {
          haptics.select();
          onToggle();
        }}
        style={({ pressed }) => [
          styles.groupHeader,
          { backgroundColor: pressed ? colors.muted : colors.background },
        ]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={hubGroupAccessibilityLabel(group)}
      style={[styles.groupHeader, { backgroundColor: colors.background }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: {
    borderRadius: radius.pill,
  },
  meta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    minWidth: 40,
  },
  time: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
  },
  groupTitle: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flex: 1,
  },
});
