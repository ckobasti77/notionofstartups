import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import {
  Archive,
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
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import { channelDisplayName, type ChatChannel } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text, type ColorTokens } from '@/theme/tokens';

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
 * threadove zakačene za stranicu, i `⋯` meni sa nivoom obaveštenja i (za admina)
 * arhiviranjem razgovora (PARITET A7 — web `conversation-pane.tsx` drži isto u
 * svom meniju kanala). `onMeasure` javlja visinu ekranu (za
 * `keyboardVerticalOffset` na iOS).
 *
 * NAMERNO nije `ScreenHeader` sa `display` naslovom: u razgovoru lista poruka
 * nosi ekran, pa zaglavlje ostaje jednoredno i nisko (kao u svakom messengeru).
 * Tipografija i radijusi su ipak isti tokeni kao svugde.
 */
export function ConversationHeader({
  channel,
  canArchive,
  onBack,
  onOpenAnchor,
  onArchived,
  onMeasure,
}: {
  channel: ChatChannel;
  /**
   * Klijentski ogleda serverski gejt (`chat.archiveChannel`: admin, ne „Opšte").
   * OBAVEZAN — pozivalac mora da odluči, ne sme da se osloni na difolt.
   */
  canArchive: boolean;
  onBack: () => void;
  onOpenAnchor?: () => void;
  /** Po uspešnom arhiviranju (npr. povratak na listu razgovora). OBAVEZAN. */
  onArchived: () => void;
  onMeasure?: (height: number) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const setNotificationLevel = useMutation(api.chat.setNotificationLevel);
  const archiveChannel = useMutation(api.chat.archiveChannel);

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

  function requestArchive() {
    if (archiving) return;
    haptics.warning();
    Alert.alert(
      'Arhivirati razgovor?',
      `„${channelDisplayName(channel)}" se sklanja sa liste za ceo tim.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Arhiviraj',
          style: 'destructive',
          onPress: async () => {
            setArchiving(true);
            try {
              await archiveChannel({ channelId: channel._id });
              haptics.success();
              setMenuOpen(false);
              onArchived();
            } catch (error) {
              haptics.error();
              Alert.alert(
                'Greška',
                error instanceof Error ? error.message : 'Razgovor nije arhiviran.',
              );
            } finally {
              setArchiving(false);
            }
          },
        },
      ],
    );
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
        onPress={() => {
          haptics.tap();
          setMenuOpen(true);
        }}
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
        <MoreVertical size={22} color={colors.foreground} />
      </Pressable>

      {/* Meni nema unutrašnji skrol — prevlači se bilo gde po njemu. */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} dragAnywhere>
        <Text style={[styles.menuTitle, { color: colors.mutedForeground }]}>Obaveštenja</Text>
        {LEVELS.map(({ level, label, Icon }) => {
          const active = activeLevel === level;
          return (
            <Row
              key={level}
              icon={<Icon size={20} color={colors.foreground} />}
              title={label}
              value={active ? <Check size={18} color={colors.primary} /> : undefined}
              onPress={() => {
                haptics.select();
                void changeLevel(level);
              }}
              showChevron={false}
              accessibilityLabel={active ? `${label}, izabrano` : label}
            />
          );
        })}
        {canArchive ? (
          <>
            <View style={[styles.menuSeparator, { backgroundColor: colors.border }]} />
            <Row
              icon={<Archive size={20} color={colors.destructive} />}
              title="Arhiviraj razgovor"
              subtitle="Sklanja razgovor sa liste za ceo tim"
              onPress={requestArchive}
              disabled={archiving}
              showChevron={false}
              value={archiving ? <ActivityIndicator color={colors.primary} /> : undefined}
            />
          </>
        ) : null}
      </Sheet>
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
    borderRadius: radius.control,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    ...text.meta,
    fontWeight: fontWeight.regular,
  },
  menuTitle: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  menuSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
    marginHorizontal: 16,
  },
});
