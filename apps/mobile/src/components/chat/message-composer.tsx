import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { insertAtTop, useMutation } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Camera,
  FileUp,
  ImageIcon,
  Pencil,
  Plus,
  Reply,
  Send,
  X,
} from 'lucide-react-native';

import { MentionAutocomplete } from '@/components/chat/mention-autocomplete';
import { VoiceRecorder, type RecordedVoice } from '@/components/chat/voice-recorder';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { maxPageFileBytesFor, pageFileCategoryFor } from '@/convex/lib/page_files';
import { haptics } from '@/lib/haptics';
import {
  OPTIMISTIC_ID_PREFIX,
  resolveMentions,
  type ChatChannel,
  type ChatMember,
  type ChatMessage,
} from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

type CurrentProfile = {
  _id: Id<'profiles'>;
  displayName: string;
  avatarUrl: string | null;
};

type SendArgs = {
  channelId: Id<'chatChannels'>;
  body: string;
  kind?: 'text' | 'file' | 'voice' | 'system';
  mentions?: Id<'profiles'>[];
  replyToMessageId?: Id<'chatMessages'>;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// Van komponente: `Date.now()` je nečist, ali se zove tek pri slanju, ne u renderu.
let optimisticCounter = 0;
function nextOptimisticId(): Id<'chatMessages'> {
  optimisticCounter += 1;
  return `${OPTIMISTIC_ID_PREFIX}${Date.now()}-${optimisticCounter}` as Id<'chatMessages'>;
}

function buildOptimisticTextMessage(
  args: SendArgs,
  channel: ChatChannel,
  profile: CurrentProfile,
): ChatMessage {
  const now = Date.now();
  return {
    _id: nextOptimisticId(),
    _creationTime: now,
    channelId: args.channelId,
    startupId: channel.startupId,
    authorProfileId: profile._id,
    body: args.body,
    mentions: args.mentions ?? [],
    kind: 'text',
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    voiceDurationMs: null,
    replyToMessageId: args.replyToMessageId ?? null,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
    deleted: false,
    author: {
      _id: profile._id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    },
    reactions: [],
    attachmentUrl: null,
  };
}

/** Aktivni `@` token na kraju unosa (ime članova može imati razmak). */
function mentionQuery(text: string): { active: boolean; query: string; start: number } {
  const at = text.lastIndexOf('@');
  if (at === -1) return { active: false, query: '', start: -1 };
  const before = at === 0 ? ' ' : text[at - 1];
  if (!/\s/.test(before)) return { active: false, query: '', start: -1 };
  const query = text.slice(at + 1);
  if (query.includes('\n') || query.length > 40) {
    return { active: false, query: '', start: -1 };
  }
  return { active: true, query, start: at };
}

/**
 * Unos poruke: tekst (optimistički), odgovor, izmena, prilozi (galerija/kamera/
 * fajl) i glasovna poruka. Samo tekst ide kroz Convex optimistic update
 * (`insertAtTop`); prilozi/glas čekaju upload pa se pojave kad server potvrdi.
 */
export function MessageComposer({
  channel,
  currentProfile,
  members,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSent,
}: {
  channel: ChatChannel;
  currentProfile: CurrentProfile;
  members: ChatMember[] | undefined;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSent: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Kad je tastatura otvorena, ne dodaji `insets.bottom` (home indicator je pod
  // tastaturom) — inače ostaje prazan razmak između unosa i tastature.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const send = useMutation(api.chat.sendMessage).withOptimisticUpdate((store, args) => {
    if ((args.kind ?? 'text') !== 'text') return;
    insertAtTop({
      paginatedQuery: api.chat.messages,
      argsToMatch: { channelId: args.channelId },
      localQueryStore: store,
      item: buildOptimisticTextMessage(args as SendArgs, channel, currentProfile),
    });
  });
  const editMessage = useMutation(api.chat.editMessage);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);

  // Ulazak u izmenu popunjava unos tekstom poruke.
  useEffect(() => {
    if (editing) setDraft(editing.body);
  }, [editing]);

  const mention = useMemo(() => mentionQuery(draft), [draft]);
  const mentionCandidates = useMemo(() => {
    if (!mention.active || !members) return [];
    const query = mention.query.trim().toLowerCase();
    const list =
      query.length === 0
        ? members
        : members.filter((member) =>
            member.profile.displayName.toLowerCase().includes(query),
          );
    return list.slice(0, 6);
  }, [mention, members]);

  function selectMention(member: ChatMember) {
    setDraft(draft.slice(0, mention.start) + '@' + member.profile.displayName + ' ');
  }

  function cancelEdit() {
    onCancelEdit();
    setDraft('');
  }

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    if (submitting) return;

    // Slanje je primarna akcija ovog ekrana — haptika ide ODMAH, ne po potvrdi
    // servera: poruka se optimistički već pojavila u listi.
    haptics.tap();

    if (editing) {
      setSubmitting(true);
      try {
        await editMessage({ messageId: editing._id, body });
        setDraft('');
        onCancelEdit();
      } catch (error) {
        haptics.error();
        Alert.alert('Greška', errorMessage(error, 'Izmena nije sačuvana.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const mentions = resolveMentions(body, members ?? []);
    const replyId = replyTo?._id;
    setDraft('');
    onCancelReply();
    try {
      await send({ channelId: channel._id, body, mentions, replyToMessageId: replyId });
      onSent();
    } catch (error) {
      haptics.error();
      setDraft(body);
      Alert.alert('Greška', errorMessage(error, 'Poruka nije poslata.'));
    }
  }

  async function uploadAndSend(input: {
    uri: string;
    name: string;
    mimeType: string;
    size: number | null;
    kind: 'file' | 'voice';
    voiceDurationMs?: number;
  }) {
    // Ista granica koju server ponavlja (`chat.sendMessage` → `resolveAttachment`).
    // Ovde je da fajl koji će ionako biti odbijen ne ode kroz upload i ne ostavi
    // siroč blob — poruka je namerno identična serverskoj.
    const category = pageFileCategoryFor(input.mimeType || undefined, input.name);
    if (category === null) {
      haptics.error();
      Alert.alert(
        'Prilog',
        `Ovaj tip fajla nije podržan${input.mimeType ? `: ${input.mimeType}` : ''}.`,
      );
      return;
    }
    const maxBytes = maxPageFileBytesFor(category);
    if (input.size !== null && input.size > maxBytes) {
      haptics.error();
      Alert.alert(
        'Prilog',
        `Prilog može imati najviše ${Math.round(maxBytes / (1024 * 1024))} MB.`,
      );
      return;
    }
    setUploading(true);
    const replyId = replyTo?._id;
    try {
      const uploadUrl = await generateUploadUrl({ channelId: channel._id });
      const fileResponse = await fetch(input.uri);
      const blob = await fileResponse.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': input.mimeType },
        body: blob,
      });
      if (!uploadResponse.ok) throw new Error('Otpremanje nije uspelo.');
      const { storageId } = (await uploadResponse.json()) as { storageId: Id<'_storage'> };
      await send({
        channelId: channel._id,
        body: '',
        kind: input.kind,
        attachmentStorageId: storageId,
        attachmentName: input.name,
        attachmentType: input.mimeType,
        attachmentSize: input.size ?? undefined,
        voiceDurationMs: input.voiceDurationMs,
        replyToMessageId: replyId,
      });
      haptics.success();
      onCancelReply();
      onSent();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', errorMessage(error, 'Prilog nije poslat.'));
    } finally {
      setUploading(false);
    }
  }

  async function pickImage(fromCamera: boolean) {
    setAttachOpen(false);
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        haptics.warning();
        Alert.alert(
          'Dozvola',
          fromCamera ? 'Pristup kameri je odbijen.' : 'Pristup galeriji je odbijen.',
        );
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      await uploadAndSend({
        uri: asset.uri,
        name: asset.fileName ?? 'slika.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize ?? null,
        kind: 'file',
      });
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', errorMessage(error, 'Slika nije poslata.'));
    }
  }

  async function pickDocument() {
    setAttachOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      await uploadAndSend({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? null,
        kind: 'file',
      });
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', errorMessage(error, 'Fajl nije poslat.'));
    }
  }

  function handleRecorded(voice: RecordedVoice) {
    void uploadAndSend({
      uri: voice.uri,
      name: `glasovna-poruka-${Math.round(voice.durationMs)}.m4a`,
      mimeType: 'audio/m4a',
      size: null,
      kind: 'voice',
      voiceDurationMs: voice.durationMs,
    });
  }

  const canSubmit = draft.trim().length > 0 || editing !== null;

  return (
    <View
      style={[
        styles.wrap,
        {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          paddingBottom: keyboardUp ? 8 : insets.bottom + 8,
        },
      ]}>
      {mention.active && mentionCandidates.length > 0 ? (
        <MentionAutocomplete candidates={mentionCandidates} onSelect={selectMention} />
      ) : null}

      {editing ? (
        <ComposerBanner
          icon={<Pencil size={14} color={colors.mutedForeground} />}
          label="Izmena poruke"
          snippet={editing.body}
          onCancel={cancelEdit}
          colors={colors}
        />
      ) : replyTo ? (
        <ComposerBanner
          icon={<Reply size={14} color={colors.mutedForeground} />}
          label={`Odgovor ${replyTo.author?.displayName ?? 'članu'}`}
          snippet={replyTo.deleted ? 'Poruka je obrisana' : replyTo.body || 'prilog'}
          onCancel={onCancelReply}
          colors={colors}
        />
      ) : null}

      <View style={styles.inputRow}>
        {!recording ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Priloži"
            disabled={uploading}
            onPress={() => {
              haptics.tap();
              setAttachOpen(true);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { backgroundColor: colors.muted },
            ]}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Plus size={24} color={colors.foreground} />
            )}
          </Pressable>
        ) : null}

        {!recording ? (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Napiši poruku…  (@ za pominjanje)"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Poruka"
          multiline
            textAlignVertical="top"
          />
        ) : null}

        {canSubmit && !recording ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Sačuvaj izmenu' : 'Pošalji poruku'}
            disabled={uploading || submitting}
            onPress={() => void submit()}
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}>
            <Send size={18} color={colors.primaryForeground} />
          </Pressable>
        ) : (
          <VoiceRecorder
            disabled={uploading}
            onActiveChange={setRecording}
            onRecorded={handleRecorded}
          />
        )}
      </View>

      <AttachMenu
        visible={attachOpen}
        colors={colors}
        onClose={() => setAttachOpen(false)}
        onGallery={() => void pickImage(false)}
        onCamera={() => void pickImage(true)}
        onFile={() => void pickDocument()}
      />
    </View>
  );
}

function ComposerBanner({
  icon,
  label,
  snippet,
  onCancel,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  snippet: string;
  onCancel: () => void;
  colors: ColorTokens;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      {icon}
      <Text numberOfLines={1} style={styles.bannerText}>
        <Text style={[styles.bannerLabel, { color: colors.foreground }]}>{label}: </Text>
        <Text style={{ color: colors.mutedForeground }}>{snippet}</Text>
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Otkaži"
        onPress={onCancel}
        hitSlop={12}
        style={styles.bannerClose}>
        <X size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function AttachMenu({
  visible,
  colors,
  onClose,
  onGallery,
  onCamera,
  onFile,
}: {
  visible: boolean;
  colors: ColorTokens;
  onClose: () => void;
  onGallery: () => void;
  onCamera: () => void;
  onFile: () => void;
}) {
  const options = [
    { key: 'gallery', label: 'Galerija', icon: <ImageIcon size={20} color={colors.foreground} />, onPress: onGallery },
    { key: 'camera', label: 'Kamera', icon: <Camera size={20} color={colors.foreground} />, onPress: onCamera },
    { key: 'file', label: 'Fajl', icon: <FileUp size={20} color={colors.foreground} />, onPress: onFile },
  ];
  return (
    // Tri reda bez skrola — prevlačenje hvata ceo sheet.
    <Sheet visible={visible} onClose={onClose} dragAnywhere>
      {options.map((option) => (
        <Row
          key={option.key}
          icon={option.icon}
          title={option.label}
          onPress={() => {
            haptics.tap();
            option.onPress();
          }}
          showChevron={false}
        />
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
  },
  bannerLabel: {
    fontWeight: fontWeight.semibold,
  },
  bannerClose: {
    padding: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
