import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { MessagesSquare, Send, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { porukaWord } from '@/lib/chat';
import type { PageKind } from '@/lib/page-kinds';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/**
 * Entitet za koji je diskusija zakačena. Diskriminisana unija, a ne dva labava
 * propa: `pageKind` ima smisla samo za stranicu, pa TS ne sme da dozvoli
 * `{ type: 'idea', pageKind: 'task' }`. Backend prima `anchorId` kao `v.string()`
 * (`chat.channelForAnchor`), pa oba id-ja idu bez konverzije.
 */
export type DiscussionAnchor =
  | { type: 'page'; id: Id<'pages'>; pageKind: PageKind }
  | { type: 'idea'; id: Id<'ideaNodes'> };

/** Poziv na diskusiju mora da imenuje pravu vrstu stranice (bag E6). */
const DISCUSSION_SUBTITLE: Record<PageKind, string> = {
  task: 'Otvori razgovor tima o ovom zadatku.',
  note: 'Otvori razgovor tima o ovoj beleški.',
  table: 'Otvori razgovor tima o ovoj tabeli.',
  file: 'Otvori razgovor tima o ovom prilogu.',
};

function subtitleFor(anchor: DiscussionAnchor): string {
  return anchor.type === 'idea'
    ? 'Otvori razgovor tima o ovoj ideji.'
    : DISCUSSION_SUBTITLE[anchor.pageKind];
}

/**
 * Red diskusije nad entitetom (docs/mobile/02-EKRANI.md §9.2) — mobilni pandan
 * web `chat/entity-discussion-panel.tsx`, koji isti `anchorType` par troši i za
 * stranicu i za ideju. Thread se pravi lenjo — `channelForAnchor` je `null` dok
 * neko ne pošalje prvu poruku (04-CHAT.md §4). Ako postoji → link na pun razgovor;
 * ako ne → dugme koje ga pravi prvom porukom kroz `sendToAnchor`. Posle slanja
 * reaktivni upit sam pretvori red u link.
 *
 * Živi u `components/chat/`, a ne u `components/zadatak/`: montiraju ga zadatak,
 * beleška/tabela/prilog I ideja, pa je vezan za chat, ne za jedan tip stranice.
 */
export function DiscussionLink({
  anchor,
  startupId,
}: {
  anchor: DiscussionAnchor;
  startupId: Id<'startups'>;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const channel = useQuery(api.chat.channelForAnchor, {
    startupId,
    anchorType: anchor.type,
    anchorId: anchor.id,
  });
  const sendToAnchor = useMutation(api.chat.sendToAnchor);

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    haptics.tap();
    try {
      await sendToAnchor({
        startupId,
        anchorType: anchor.type,
        anchorId: anchor.id,
        body,
      });
      haptics.success();
      setDraft('');
      setComposerOpen(false);
    } catch (error) {
      haptics.error();
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
        <Row
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          icon={
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}17` }]}>
              <MessagesSquare size={18} color={colors.primary} />
            </View>
          }
          title="Diskusija"
          subtitle={`${channel.messageCount} ${porukaWord(channel.messageCount)}`}
          onPress={() => router.push({ pathname: '/razgovor/[id]', params: { id: channel._id } })}
          accessibilityLabel={`Diskusija, ${channel.messageCount} ${porukaWord(channel.messageCount)}`}
        />
      ) : (
        <Row
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          icon={
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}17` }]}>
              <MessagesSquare size={18} color={colors.primary} />
            </View>
          }
          title="Započni diskusiju"
          subtitle={subtitleFor(anchor)}
          onPress={() => setComposerOpen(true)}
          showChevron={false}
        />
      )}

      <ComposerSheet
        open={composerOpen}
        draft={draft}
        sending={sending}
        onChange={setDraft}
        onClose={() => setComposerOpen(false)}
        onSend={() => void send()}
      />
    </>
  );
}

function ComposerSheet({
  open,
  draft,
  sending,
  onChange,
  onClose,
  onSend,
}: {
  open: boolean;
  draft: string;
  sending: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const colors = useThemeColors();
  const canSend = Boolean(draft.trim()) && !sending;

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard style={styles.sheet}>
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
    </Sheet>
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
  sheet: {
    paddingHorizontal: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    ...text.title,
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
