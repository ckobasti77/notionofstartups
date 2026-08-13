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
import { UndoBar } from '@/components/undo-bar';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { useChatPresence } from '@/hooks/use-chat-presence';
import type { Id } from '@/convex/_generated/dataModel';
import type { ChatMessage } from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, type ColorTokens } from '@/theme/tokens';

/**
 * Ekran razgovora — full-screen, van tabova (docs/mobile/02-EKRANI.md §6,
 * 04-CHAT.md §7). Obrnuta lista poruka + unos u `KeyboardAvoidingView`, svajp za
 * odgovor i long-press za reakcije. Kanal se razrešava iz `listChannels` po id-ju
 * iz rute; header nosi kontekst (za threadove i „otvori entitet").
 */
export default function ConversationScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const channelId = id as Id<'chatChannels'>;
  const { activeStartupId } = useActiveStartup();

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

  const channels = useQuery(
    api.chat.listChannels,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const members = useQuery(
    api.startups.listMembers,
    activeStartupId ? { startupId: activeStartupId, limit: 50 } : 'skip',
  );
  const profile = useQuery(api.profiles.getCurrent, {});
  const markChannelRead = useMutation(api.chat.markChannelRead);

  const channel = channels?.find((item) => item._id === channelId) ?? null;
  const lastMessageAt = channel?.lastMessageAt;

  // Označi pročitanim na fokus i kad stigne nova poruka dok je ekran u prvom planu
  // (04-CHAT.md §5). `useFocusEffect` se ponovo pokreće kad se `lastMessageAt` promeni.
  useFocusEffect(
    useCallback(() => {
      void markChannelRead({ channelId }).catch(() => {
        // Neuspelo označavanje ne sme da blokira čitanje.
      });
    }, [channelId, lastMessageAt, markChannelRead]),
  );

  // Fokus ekrana kao STANJE (ne samo efekat): prisustvo mora da se ugasi čim se
  // ode na drugi ekran, inače bi do isteka TTL-a poruke iz ovog kanala ćutale.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useChatPresence(channelId, focused && atBottom);

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
    router.push({ pathname: '/stranica/[id]', params: { id: channel.anchorId } });
  }

  if (profile == null || channels === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MinimalHeader title="Razgovor" onBack={() => router.back()} colors={colors} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje razgovora" />
        </View>
      </View>
    );
  }

  if (channel === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MinimalHeader title="Razgovor" onBack={() => router.back()} colors={colors} />
        <EmptyState
          icon={<MessagesSquare size={40} color={colors.mutedForeground} />}
          title="Razgovor nije pronađen"
          description="Možda je arhiviran ili nemaš pristup ovom razgovoru."
        />
      </View>
    );
  }

  const currentProfile = {
    _id: profile._id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? null,
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ConversationHeader
          channel={channel}
          // Klijentski ogleda serverski gejt (`chat.archiveChannel`): samo admin,
          // a „Opšte" (kind `startup`) se ne arhivira nikad. Oba podatka ekran
          // već drži — nema novog upita.
          canArchive={profile.role === 'admin' && channel.kind !== 'startup'}
          // Ogledalo gejta iz `chat.setChannelMembers`: samo admin i samo kanal
          // vrste `custom` — članstvo ostalih vrsta je izvedeno iz pristupa.
          canManageMembers={profile.role === 'admin' && channel.kind === 'custom'}
          onBack={() => router.back()}
          onOpenAnchor={openAnchor}
          onArchived={() => router.back()}
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
          <MessageList
            channelId={channelId}
            currentProfileId={profile._id}
            isAdmin={profile.role === 'admin'}
            members={members}
            onReplyTo={beginReply}
            onEdit={beginEdit}
            onAtBottomChange={setAtBottom}
            scrollToBottomSignal={sentTick}
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
        </KeyboardAvoidingView>

        {/* Traka „Poništi" posle izmene članova kanala (⋯ → Članovi kanala). Van
            `KeyboardAvoidingView`-a i iznad kompozera — `bottomOffset` je visina
            reda za unos, pa traka ne pokriva polje za pisanje. */}
        <UndoBar bottomOffset={MIN_TOUCH_TARGET + 16} />
      </View>
    </GestureHandlerRootView>
  );
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
 * Greška stanje: `messages`/`listChannels` prolaze kroz `requireChannelAccess` i
 * bacaju kad korisnik nije član — expo-router to hvata ovde umesto pada ekrana.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ConversationErrorState message={error.message} onRetry={retry} />;
}

function ConversationErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MinimalHeader title="Razgovor" onBack={() => router.back()} colors={colors} />
      <EmptyState
        icon={<MessageSquareX size={40} color={colors.destructive} />}
        title="Razgovor se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju razgovora.'}
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
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
});
