import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import {
  AtSign,
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  ExternalLink,
  Hash,
  MessagesSquare,
  MoreVertical,
} from 'lucide-react-native';

import { Avatar } from '@/components/ui/avatar';
import { api } from '@/convex/_generated/api';
import { channelDisplayName, type ChatChannel } from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

type NotificationLevel = 'all' | 'mentions' | 'none';

const LEVELS: { level: NotificationLevel; label: string; Icon: typeof Bell }[] = [
  { level: 'all', label: 'Sva obaveštenja', Icon: Bell },
  { level: 'mentions', label: 'Samo pominjanja', Icon: AtSign },
  { level: 'none', label: 'Bez obaveštenja', Icon: BellOff },
];

function subtitle(channel: ChatChannel): string {
  switch (channel.kind) {
    case 'startup':
      return 'Ceo tim · svi članovi';
    case 'area':
      return 'Kanal oblasti';
    case 'custom':
      return channel.isPrivate ? 'Privatan kanal' : 'Kanal';
    case 'thread':
      return 'Diskusija';
    case 'dm':
      return 'Direktna poruka';
    default:
      return 'Razgovor';
  }
}

/**
 * Header ekrana razgovora: back, ikona/naslov/podnaslov, „otvori entitet" za
 * threadove zakačene za stranicu, i `⋯` meni sa nivoom obaveštenja. `onMeasure`
 * javlja visinu ekranu (za `keyboardVerticalOffset` na iOS).
 */
export function ConversationHeader({
  channel,
  onBack,
  onOpenAnchor,
  onMeasure,
}: {
  channel: ChatChannel;
  onBack: () => void;
  onOpenAnchor?: () => void;
  onMeasure?: (height: number) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const setNotificationLevel = useMutation(api.chat.setNotificationLevel);

  const activeLevel: NotificationLevel = channel.notificationLevel ?? 'all';
  const showAnchor = channel.kind === 'thread' && channel.anchorType === 'page' && !!onOpenAnchor;

  async function changeLevel(level: NotificationLevel) {
    setMenuOpen(false);
    try {
      await setNotificationLevel({ channelId: channel._id, level });
    } catch (error) {
      Alert.alert(
        'Greška',
        error instanceof Error ? error.message : 'Podešavanje nije sačuvano.',
      );
    }
  }

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => onMeasure?.(event.nativeEvent.layout.height)}
      style={[
        styles.header,
        {
          paddingTop: insets.top + 6,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={onBack}
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>

      <ConversationIcon channel={channel} colors={colors} />

      <View style={styles.titleWrap}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
          {channelDisplayName(channel)}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {subtitle(channel)}
        </Text>
      </View>

      {showAnchor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Otvori povezani entitet"
          onPress={onOpenAnchor}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
          <ExternalLink size={20} color={colors.foreground} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Opcije razgovora"
        onPress={() => setMenuOpen(true)}
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
        <MoreVertical size={22} color={colors.foreground} />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}>
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Zatvori"
          onPress={() => setMenuOpen(false)}
        />
        <View
          style={[
            styles.menu,
            {
              backgroundColor: colors.popover,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}>
          <Text style={[styles.menuTitle, { color: colors.mutedForeground }]}>Obaveštenja</Text>
          {LEVELS.map(({ level, label, Icon }) => (
            <Pressable
              key={level}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: activeLevel === level }}
              onPress={() => void changeLevel(level)}
              style={({ pressed }) => [
                styles.menuRow,
                pressed && { backgroundColor: colors.muted },
              ]}>
              <Icon size={20} color={colors.foreground} />
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{label}</Text>
              {activeLevel === level ? (
                <Check size={18} color={colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

function ConversationIcon({
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
        size={36}
      />
    );
  }
  const Icon = channel.kind === 'thread' ? MessagesSquare : Hash;
  return (
    <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
      <Icon size={18} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    fontSize: 12,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menu: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: 20,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
});
