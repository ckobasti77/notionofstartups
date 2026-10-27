import { personalSubtitle } from '@devotion/shared';
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
  FolderOpen,
  Hash,
  MessagesSquare,
  MoreVertical,
  Settings,
  Users,
} from 'lucide-react-native';

import { ChannelMembersSheet } from '@/components/chat/channel-members-sheet';
import { AreaIcon } from '@/components/ui/area-icon';
import { Avatar } from '@/components/ui/avatar';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import { channelDisplayName, type ChannelArea, type ChatChannel } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { areaColor } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text, type ColorTokens } from '@/theme/tokens';

type NotificationLevel = 'all' | 'mentions' | 'none';

/**
 * Pauza između zatvaranja menija i otvaranja sheet-a članova. Dva istovremena RN
 * `Modal`-a na Androidu umeju da progutaju `onRequestClose` (isti obrazac i ista
 * konstanta kao `ideja/[id].tsx:41–45`).
 */
const SHEET_HANDOFF_MS = 320;

const LEVELS: { level: NotificationLevel; label: string; Icon: typeof Bell }[] = [
  { level: 'all', label: 'Sva obaveštenja', Icon: Bell },
  { level: 'mentions', label: 'Samo pominjanja', Icon: AtSign },
  { level: 'none', label: 'Bez obaveštenja', Icon: BellOff },
];

function subtitle(channel: ChatChannel, area: ChannelArea, memberCount: number | null): string {
  // Lični razgovor (K16, isti tekst kao web): „Lična poruka" / „Lična grupa · 3 člana".
  if (channel.startupId === null) {
    return personalSubtitle(channel.kind, channel.kind === 'custom' ? memberCount : null);
  }
  switch (channel.kind) {
    case 'startup':
      return 'Ceo tim · svi članovi';
    case 'area':
      // Doslovno web `conversation-pane.tsx:367-368`: naziv oblasti kad je poznata,
      // inače goli „Kanal oblasti".
      return area === null ? 'Kanal oblasti' : `Kanal oblasti · ${area.label}`;
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
  area,
  canArchive,
  canManageMembers,
  onBack,
  onOpenAnchor,
  onArchived,
  onMeasure,
  contextLabel = null,
  memberCount = null,
  onOpenGroupSettings,
  onOpenInStartup,
}: {
  channel: ChatChannel;
  /**
   * Oblast kanala (`channel.areaId` → `{key, label}`). OBAVEZAN iz istog razloga
   * kao `canArchive`: pozivalac drži `startups.get`, pa mora da odluči — difolt
   * `null` bi tiho vratio generički `Hash` i „Kanal oblasti" bez naziva.
   */
  area: ChannelArea;
  /**
   * Klijentski ogleda serverski gejt (`chat.archiveChannel`: admin, ne „Opšte").
   * OBAVEZAN — pozivalac mora da odluči, ne sme da se osloni na difolt.
   */
  canArchive: boolean;
  /**
   * Klijentski ogleda serverski gejt (`chat.setChannelMembers`: admin + kanal
   * vrste `custom`). OBAVEZAN, iz istog razloga kao `canArchive`.
   */
  canManageMembers: boolean;
  onBack: () => void;
  onOpenAnchor?: () => void;
  /** Po uspešnom arhiviranju (npr. povratak na listu razgovora). OBAVEZAN. */
  onArchived: () => void;
  onMeasure?: (height: number) => void;
  /**
   * Ime startupa ispred podnaslova — kad je kanal iz startupa koji NIJE aktivan
   * (razgovor otvoren iz huba Poruka ili push-a, K16). `null` = bez prefiksa.
   */
  contextLabel?: string | null;
  /** Broj članova lične grupe za podnaslov („Lična grupa · 3 člana"); `null` dok ne stigne. */
  memberCount?: number | null;
  /** „Podešavanja grupe" u meniju — samo lična grupa (K16); bez njega stavka ne postoji. */
  onOpenGroupSettings?: () => void;
  /**
   * „Otvori u startupu" (K16, par web `onOpenInStartup`): prebacuje aktivan
   * startup na startup kanala i vodi u njegove Kanale. Bez njega stavka ne postoji.
   */
  onOpenInStartup?: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
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

      <ConversationIcon channel={channel} area={area} colors={colors} />

      <View style={styles.titleWrap}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
          {channelDisplayName(channel)}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {contextLabel
            ? `${contextLabel} · ${subtitle(channel, area, memberCount)}`
            : subtitle(channel, area, memberCount)}
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
              value={active ? <Check size={18} color={colors.primaryText} /> : undefined}
              onPress={() => {
                haptics.select();
                void changeLevel(level);
              }}
              showChevron={false}
              accessibilityLabel={active ? `${label}, izabrano` : label}
            />
          );
        })}
        {onOpenInStartup ? (
          <>
            <View style={[styles.menuSeparator, { backgroundColor: colors.border }]} />
            <Row
              icon={<FolderOpen size={20} color={colors.foreground} />}
              title="Otvori u startupu"
              subtitle={contextLabel ? `Kanali startupa ${contextLabel}` : 'Kanali ovog startupa'}
              onPress={() => {
                haptics.tap();
                setMenuOpen(false);
                onOpenInStartup();
              }}
              showChevron={false}
            />
          </>
        ) : null}
        {onOpenGroupSettings ? (
          <>
            <View style={[styles.menuSeparator, { backgroundColor: colors.border }]} />
            <Row
              icon={<Settings size={20} color={colors.foreground} />}
              title="Podešavanja grupe"
              subtitle="Ime, članovi i napuštanje grupe"
              onPress={() => {
                haptics.tap();
                // Isti razmak između dva `Modal`-a kao za „Članovi kanala".
                setMenuOpen(false);
                setTimeout(onOpenGroupSettings, SHEET_HANDOFF_MS);
              }}
              showChevron={false}
            />
          </>
        ) : null}
        {canManageMembers ? (
          <>
            <View style={[styles.menuSeparator, { backgroundColor: colors.border }]} />
            <Row
              icon={<Users size={20} color={colors.foreground} />}
              title="Članovi kanala"
              subtitle="Dodaj ili ukloni članove ovog kanala"
              onPress={() => {
                haptics.tap();
                // Dva RN `Modal`-a se ne otvaraju istovremeno: meni prvo ode,
                // pa tek onda ulazi sheet članova.
                setMenuOpen(false);
                setTimeout(() => setMembersOpen(true), SHEET_HANDOFF_MS);
              }}
              showChevron={false}
            />
          </>
        ) : null}
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

      {/* Jedini ulaz u sheet je red iznad — zato oboje živi u istom fajlu i pod
          istim uslovom (isto što web `conversation-pane.tsx` radi sa dijalogom). */}
      {canManageMembers ? (
        <ChannelMembersSheet
          open={membersOpen}
          channel={channel}
          onClose={() => setMembersOpen(false)}
        />
      ) : null}
    </View>
  );
}

function ConversationIcon({
  channel,
  area,
  colors,
}: {
  channel: ChatChannel;
  area: ChannelArea;
  colors: ColorTokens;
}) {
  // Lična grupa (K16): ista prigušena `Users` pločica kao web i red huba.
  if (channel.startupId === null && channel.kind === 'custom') {
    return (
      <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
        <Users size={18} color={colors.mutedForeground} />
      </View>
    );
  }
  if (channel.kind === 'dm') {
    return (
      <Avatar
        name={channel.otherParticipant?.displayName}
        uri={channel.otherParticipant?.avatarUrl ?? null}
        size={36}
      />
    );
  }
  // Kanal oblasti nosi ikonicu I boju svoje oblasti — pandan web `AREA_ICONS` +
  // `getAreaTint` (`conversation-pane.tsx:338`, `:343`). Do P7 je ovde uvek bio
  // generički `Hash`, pa su svi kanali izgledali isto.
  if (channel.kind === 'area' && area !== null) {
    const tint = areaColor(colors, area.key);
    return (
      <View style={styles.iconBox}>
        <AreaIcon areaKey={area.key} size={18} color={tint} />
      </View>
    );
  }
  const Icon = channel.kind === 'thread' ? MessagesSquare : Hash;
  return (
    <View style={styles.iconBox}>
      <Icon size={18} color={colors.mutedForeground} />
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
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  menuSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
    marginHorizontal: 16,
  },
});
