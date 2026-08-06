import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { ChevronRight, MessagesSquare, Send, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { porukaWord } from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

/**
 * Red diskusije zadatka (docs/mobile/02-EKRANI.md §9.2). Thread se pravi lenjo —
 * `channelForAnchor` je `null` dok neko ne pošalje prvu poruku (04-CHAT.md §4).
 * Ako postoji → link na pun razgovor; ako ne → dugme koje ga pravi prvom porukom
 * kroz `sendToAnchor`. Posle slanja reaktivni upit sam pretvori red u link.
 */
export function DiscussionLink({
  pageId,
  startupId,
}: {
  pageId: Id<'pages'>;
  startupId: Id<'startups'>;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const channel = useQuery(api.chat.channelForAnchor, {
    startupId,
    anchorType: 'page',
    anchorId: pageId,
  });
  const sendToAnchor = useMutation(api.chat.sendToAnchor);

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendToAnchor({ startupId, anchorType: 'page', anchorId: pageId, body });
      setDraft('');
      setComposerOpen(false);
    } catch (error) {
      Alert.alert('Poruka nije poslata', error instanceof Error ? error.message : 'Pokušaj ponovo.');
    } finally {
      setSending(false);
    }
  };

  if (channel === undefined) {
    return <Skeleton height={56} borderRadius={radius.xl} />;
  }

  return (
    <>
      {channel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Diskusija, ${channel.messageCount} ${porukaWord(channel.messageCount)}`}
          onPress={() => router.push({ pathname: '/razgovor/[id]', params: { id: channel._id } })}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
          ]}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}17` }]}>
            <MessagesSquare size={18} color={colors.primary} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: colors.foreground }]}>Diskusija</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {channel.messageCount} {porukaWord(channel.messageCount)}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Započni diskusiju"
          onPress={() => setComposerOpen(true)}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
          ]}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}17` }]}>
            <MessagesSquare size={18} color={colors.primary} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: colors.foreground }]}>Započni diskusiju</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Otvori razgovor tima o ovom zadatku.
            </Text>
          </View>
        </Pressable>
      )}

      <Modal
        visible={composerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerOpen(false)}>
        <Pressable
          accessibilityLabel="Zatvori"
          style={styles.backdrop}
          onPress={() => setComposerOpen(false)}
        />
        <KeyboardAvoidingView
          // `padding` na oba: Expo SDK 57 edge-to-edge (Android) razbija OS
          // `adjustResize` (isto kao quick-add-sheet / razgovor).
          behavior="padding"
          style={styles.kav}
          pointerEvents="box-none">
          <ComposerSheet
            draft={draft}
            sending={sending}
            onChange={setDraft}
            onClose={() => setComposerOpen(false)}
            onSend={() => void send()}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function ComposerSheet({
  draft,
  sending,
  onChange,
  onClose,
  onSend,
}: {
  draft: string;
  sending: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const canSend = Boolean(draft.trim()) && !sending;

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: colors.popover,
          borderColor: colors.border,
          paddingBottom: insets.bottom + 12,
        },
      ]}>
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Prva poruka</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zatvori"
          onPress={onClose}
          hitSlop={8}
          style={styles.sheetClose}>
          <X size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.composerRow}>
        <Input
          value={draft}
          onChangeText={onChange}
          placeholder="Napiši prvu poruku…"
          multiline
          autoFocus
          style={styles.composerInput}
          accessibilityLabel="Prva poruka diskusije"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pošalji"
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: colors.primary, opacity: canSend ? (pressed ? 0.85 : 1) : 0.5 },
          ]}>
          <Send size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET + 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: 13,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
  },
  sheetClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  composerInput: {
    flex: 1,
    maxHeight: 140,
  },
  sendButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
