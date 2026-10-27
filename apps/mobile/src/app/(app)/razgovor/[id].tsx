import { chatConversationPermissions } from '@devotion/shared';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { ChevronLeft, MessagesSquare, MessageSquareX } from 'lucide-react-native';

import { ConversationHeader } from '@/components/chat/conversation-header';
import { MessageComposer } from '@/components/chat/message-composer';
import { MessageList } from '@/components/chat/message-list';
import { EmptyState } from '@/components/empty-state';
import { GroupSettingsController } from '@/components/me/chat/group-settings-controller';
import { conversationContextLabel } from '@/components/me/chat/hub-model';
import { UndoBar } from '@/components/undo-bar';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { useChatPresence } from '@/hooks/use-chat-presence';
import { useQueryState } from '@/hooks/use-query-state';
import { useRetained } from '@/hooks/use-retained';
import type { Id } from '@/convex/_generated/dataModel';
import { findChannelArea, type ChatMember, type ChatMessage } from '@/lib/chat';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text, type ColorTokens } from '@/theme/tokens';

/** Koliko članova startupa chat čita za pominjanja i imena autora (isto kao pre K16). */
const STARTUP_MEMBERS_LIMIT = 50;

/**
 * Ekran razgovora — full-screen, van tabova (docs/mobile/02-EKRANI.md §6,
 * 04-CHAT.md §7). Obrnuta lista poruka + unos u `KeyboardAvoidingView`, svajp za
 * odgovor i long-press za reakcije.
 *
 * Od K16 kanal se razrešava po id-ju iz rute kroz `chat.getChannel` — za
 * razgovor BILO KOG opsega, bez aktivnog startupa: lični DM i lična grupa
 * (`startupId: null`) i kanal bilo kog mog startupa (hub Poruka, push, Inbox).
 * Članovi za pominjanja dolaze po opsegu kanala: `chat.channelMembers` za lični
 * razgovor (pominju se samo njegovi članovi), `startups.listMembers` za startup
 * KANALA (ne aktivnog startupa). Otvaranje razgovora ne menja aktivan startup.
 */
export default function ConversationScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const channelId = id as Id<'chatChannels'>;
  // Samo za prefiks imena startupa u zaglavlju i „Otvori u startupu" — razgovor
  // se NE učitava po aktivnom startupu.
  const { activeStartupId, setActiveStartupId } = useActiveStartup();

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  /**
   * Broji poslate poruke. Samo signal za `MessageList` da skoči na dno — raste
   * pri svakom slanju, vrednost ne znači ništa osim „upravo je poslato".
   */
  const [sentTick, setSentTick] = useState(0);
  /**
   * Gleda li korisnik dno ovog razgovora i da li je ekran u prvom planu. Jedini
   * potrošač je prisustvo: dok su oba tačna, nova poruka u OVOM kanalu ne pravi
   * obaveštenje — korisnik ju je video uživo (`docs/mobile/lanac5/PLAN.md` §1.3).
   */
  const [atBottom, setAtBottom] = useState(true);
  const [focused, setFocused] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  /**
   * Izlazim iz grupe sa ovog ekrana (od trenutka PRE poziva mutacije; ostaje i
   * posle uspeha, dok traje povratak na listu). Pretplate na kanal se gase pre
   * nego što bi ih server odbio, lista poruka i kompozitor se sklanjaju (lista
   * baca grešku kad pristup nestane), a zaglavlje ostaje sa poslednjim kanalom —
   * bez treptaja „nije pronađen". Neuspeh vraća sve (`onLeaveFailed`).
   */
  const [leaving, setLeaving] = useState(false);

  const fetched = useQueryState(api.chat.getChannel, leaving ? 'skip' : { channelId });
  // Poslednji učitan kanal ostaje dok `leaving` gasi pretplatu (greška ide granom ispod).
  const liveChannel = fetched.status === 'ready' ? fetched.data : null;
  const retainedChannel = useRetained(liveChannel);
  const channel = leaving ? retainedChannel : liveChannel;
  const channelStartupId = channel?.startupId ?? null;
  const personal = channel !== null && channelStartupId === null;

  const channelMembers = useQueryState(
    api.chat.channelMembers,
    personal && !leaving ? { channelId } : 'skip',
  );
  const startupMembers = useQueryState(
    api.startups.listMembers,
    channelStartupId !== null
      ? { startupId: channelStartupId, limit: STARTUP_MEMBERS_LIMIT }
      : 'skip',
  );
  const members: ChatMember[] | undefined = personal
    ? channelMembers.status === 'ready'
      ? channelMembers.data
      : undefined
    : startupMembers.status === 'ready'
      ? startupMembers.data
      : undefined;
  // Oblasti — samo za ikonicu i naziv oblasti u zaglavlju kanala oblasti (P7/D12,
  // pandan web `conversation-pane.tsx:118`), iz startupa KANALA.
  // Kao stanje (ne baca): gubitak pristupa startupu ne sme da obori ekran pre
  // grane „nije pronađen" — ikonica tada pada na generički `Hash`.
  const startup = useQueryState(
    api.startups.get,
    channel !== null && channel.kind === 'area' && channelStartupId !== null
      ? { startupId: channelStartupId }
      : 'skip',
  );
  const profile = useQuery(api.profiles.getCurrent, {});
  const markChannelRead = useMutation(api.chat.markChannelRead);

  const lastMessageAt = channel?.lastMessageAt;

  // Označi pročitanim na fokus i kad stigne nova poruka dok je ekran u prvom planu
  // (04-CHAT.md §5). `useFocusEffect` se ponovo pokreće kad se `lastMessageAt` promeni.
  useFocusEffect(
    useCallback(() => {
      if (leaving) return;
      void markChannelRead({ channelId }).catch(() => {
        // Neuspelo označavanje ne sme da blokira čitanje.
      });
    }, [channelId, lastMessageAt, markChannelRead, leaving]),
  );

  // Fokus ekrana kao STANJE (ne samo efekat): prisustvo mora da se ugasi čim se
  // ode na drugi ekran, inače bi do isteka TTL-a poruke iz ovog kanala ćutale.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useChatPresence(channelId, focused && atBottom && !leaving);

  const beginReply = useCallback((message: ChatMessage) => {
    setEditing(null);
    setReplyTo(message);
  }, []);

  const beginEdit = useCallback((message: ChatMessage) => {
    setReplyTo(null);
    setEditing(message);
  }, []);

  /**
   * Thread je zakačen za stranicu (`anchorType === 'page'`). Zadatak je isto
   * `pages` red, ali ima svoj ekran — `/stranica/[id]` ga sam preusmeri, pa se
   * `kind` ovde ne mora znati. Pandan `onOpenPage` iz web `conversation-pane`.
   */
  function openAnchor() {
    if (channel === null || channel.anchorId === null) return;
    router.push({
      pathname: '/stranica/[id]',
      params: { id: channel.anchorId },
    });
  }

  // `chat.getChannel` baca samo kad razgovor ne postoji, arhiviran je ili nisam
  // član (prekid veze ne baca — Convex čeka i ponavlja). Zato je svaka greška
  // „nije pronađen", kao na webu (`HubConversation`); u produkciji Convex ionako
  // skriva tekst obične serverske greške, pa se slučajevi ne bi ni razlikovali.
  if (fetched.status === 'error') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MinimalHeader title="Razgovor" onBack={() => goBack(router)} colors={colors} />
        <EmptyState
          icon={<MessagesSquare size={20} color={colors.mutedForeground} />}
          title="Razgovor nije pronađen"
          description="Možda je arhiviran ili više nisi član."
          actionLabel="Nazad na razgovore"
          onAction={() => goBack(router)}
        />
      </View>
    );
  }

  if (profile == null || channel === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MinimalHeader title="Razgovor" onBack={() => goBack(router)} colors={colors} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje razgovora" />
        </View>
      </View>
    );
  }

  const currentProfile = {
    _id: profile._id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? null,
  };
  // Isto pravilo kao web (`@devotion/shared`): lični razgovor se ne arhivira i
  // nema admin-članstvo; grupom upravlja vlasnik kroz „Podešavanja grupe".
  const permissions = chatConversationPermissions(profile.role, channel);
  const contextLabel = conversationContextLabel(
    channelStartupId,
    activeStartupId,
    channel.startup?.name,
  );

  /**
   * „Otvori u startupu" (par web `onOpenInStartup`): samo za kanal startupa koji
   * NIJE aktivan — u chatu aktivnog startupa meni ostaje kakav je bio. Prebaci
   * aktivan startup, pa Prostor (lista oblasti) → Kanali tog startupa (obrazac
   * „navigate na tab + push detalja" kao `lib/notifications/navigate.ts`).
   */
  const openInStartup =
    contextLabel !== null && channelStartupId !== null
      ? () => {
          setActiveStartupId(channelStartupId);
          // Bez parametra segmenta: Prostor ga troši posle fokusa, a tada je
          // fokusirana ruta već `kanali` (`setParams` bi gađao pogrešan ekran).
          router.navigate('/prostor');
          router.push('/kanali');
        }
      : undefined;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ConversationHeader
          channel={channel}
          area={findChannelArea(
            channel,
            startup.status === 'ready' ? startup.data.areas : undefined,
          )}
          // Klijentski ogleda serverski gejt (`chat.archiveChannel`): samo admin,
          // samo kanal startupa, a „Opšte" (kind `startup`) se ne arhivira nikad.
          canArchive={permissions.canArchive}
          // Ogledalo gejta iz `chat.setChannelMembers`: samo admin i samo kanal
          // startupa vrste `custom` — članstvo ostalih vrsta je izvedeno iz pristupa.
          canManageMembers={permissions.canManageMembers}
          contextLabel={contextLabel}
          onOpenInStartup={openInStartup}
          memberCount={
            personal && channelMembers.status === 'ready' ? channelMembers.data.length : null
          }
          onOpenGroupSettings={
            permissions.canOpenGroupSettings ? () => setGroupSettingsOpen(true) : undefined
          }
          onBack={() => goBack(router)}
          onOpenAnchor={openAnchor}
          onArchived={() => goBack(router)}
          onMeasure={setHeaderHeight}
        />

        <KeyboardAvoidingView
          style={styles.flex}
          // `padding` na oba: Expo SDK 57 ima edge-to-edge (Android) po defaultu,
          // što razbija OS `adjustResize` — pa se oslanjamo na JS keyboard evente.
          // Offset kompenzuje visinu headera iznad KAV-a (na iOS); na Androidu je
          // keyboard visina merena od dna, pa je offset 0.
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
          {/* Izlazak iz grupe: lista (baca kad pristup nestane) i kompozitor se
              sklanjaju pre poziva mutacije; ostaje samo zaglavlje do povratka. */}
          {leaving ? null : (
            <>
              <MessageList
                channelId={channelId}
                currentProfileId={profile._id}
                // Brisanje tuđih poruka i dalje gleda opseg PORUKE (`canDeleteChatMessage`):
                // admin moderira samo kanale startupa.
                isAdmin={profile.role === 'admin'}
                members={members}
                onReplyTo={beginReply}
                onEdit={beginEdit}
                onAtBottomChange={setAtBottom}
                scrollToBottomSignal={sentTick}
                // Jedan ekran za sve opsege (hub, Kanali, push), pa pristigla poruka
                // ulazi podizanjem u svakom razgovoru (K16; web zasad samo u Porukama).
                animateArrivals
              />
              <MessageComposer
                channel={channel}
                currentProfile={currentProfile}
                members={members}
                replyTo={replyTo}
                editing={editing}
                onCancelReply={() => setReplyTo(null)}
                onCancelEdit={() => setEditing(null)}
                onSent={() => {
                  setReplyTo(null);
                  setEditing(null);
                  setSentTick((tick) => tick + 1);
                }}
              />
            </>
          )}
        </KeyboardAvoidingView>

        {/* Traka „Poništi" posle izmene članova kanala ili grupe. Van
            `KeyboardAvoidingView`-a i iznad kompozera — `bottomOffset` je visina
            reda za unos, pa traka ne pokriva polje za pisanje. */}
        <UndoBar bottomOffset={MIN_TOUCH_TARGET + 16} />

        {permissions.canOpenGroupSettings ? (
          <GroupSettingsController
            channelId={channelId}
            open={groupSettingsOpen}
            onClose={() => setGroupSettingsOpen(false)}
            meId={profile._id}
            onLeaveStart={() => setLeaving(true)}
            onLeaveFailed={() => setLeaving(false)}
            onLeft={() => goBack(router)}
          />
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * „Nazad" sa rezervom: razgovor otvoren direktnim linkom (`devotion://razgovor/<id>`)
 * nema prethodni ekran — tada vodi u hub Poruka.
 */
function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.navigate('/chat');
}

/** Lagani header za stanja učitavanja / greške (kad kanal još nije razrešen). */
function MinimalHeader({
  title,
  onBack,
  colors,
}: {
  title: string;
  onBack: () => void;
  colors: ColorTokens;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.minimalHeader,
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
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.minimalTitle, { color: colors.foreground }]}>
        {title}
      </Text>
    </View>
  );
}

/**
 * Greška stanje: `messages` (paginirano) prolazi kroz `requireChannelAccess` i
 * baca kad korisnik nije član — expo-router to hvata ovde umesto pada ekrana.
 * Greška samog kanala (`getChannel`) je stanje ekrana iznad („nije pronađen").
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ConversationErrorState
      message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')}
      onRetry={retry}
    />
  );
}

function ConversationErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MinimalHeader title="Razgovor" onBack={() => goBack(router)} colors={colors} />
      <EmptyState
        icon={<MessageSquareX size={20} color={colors.destructive} />}
        title="Razgovor nije učitan."
        description={message || 'Proveri vezu i pokušaj ponovo.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  minimalTitle: {
    ...text.title,
  },
});
