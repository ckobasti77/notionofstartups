import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { FileText, Pause, Play } from 'lucide-react-native';

import { formatFileSize, formatVoiceDuration, type ChatMessage } from '@/lib/chat';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

/**
 * Prilog poruke: slika (`expo-image`), fajl (ikona + ime + veličina) ili glasovna
 * poruka (play/pauza + trajanje, `expo-audio`). `mine` bira boje za primarni
 * (sopstveni) mehurić naspram tuđeg.
 */
export function MessageAttachment({
  message,
  mine,
}: {
  message: ChatMessage;
  mine: boolean;
}) {
  const colors = useThemeColors();
  const url = message.attachmentUrl;
  if (!url) return null;

  if (message.kind === 'voice') {
    return (
      <VoiceAttachment
        uri={url}
        durationMs={message.voiceDurationMs}
        colors={colors}
        mine={mine}
      />
    );
  }

  if (message.attachmentType?.startsWith('image/')) {
    return (
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={message.attachmentName ?? 'Slika'}
        onPress={() => void Linking.openURL(url)}
        style={styles.imageWrap}>
        <Image
          source={{ uri: url }}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Otvori ${message.attachmentName ?? 'prilog'}`}
      onPress={() => void Linking.openURL(url)}
      style={[styles.file, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.fileIcon, { backgroundColor: colors.accent }]}>
        <FileText size={18} color={colors.primary} />
      </View>
      <View style={styles.fileMeta}>
        <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>
          {message.attachmentName ?? 'Prilog'}
        </Text>
        {formatFileSize(message.attachmentSize) ? (
          <Text style={[styles.fileSize, { color: colors.mutedForeground }]}>
            {formatFileSize(message.attachmentSize)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function VoiceAttachment({
  uri,
  durationMs,
  colors,
  mine,
}: {
  uri: string;
  durationMs: number | null;
  colors: ColorTokens;
  mine: boolean;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const fg = mine ? colors.primaryForeground : colors.foreground;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Da se čuje i kad je telefon na nemom (iOS inače priguši reprodukciju).
    void setAudioModeAsync({ playsInSilentMode: true });
    // Kad je stigla do kraja, vrati na početak pre ponovnog puštanja.
    if (status.duration && status.currentTime >= status.duration - 0.15) {
      player.seekTo(0);
    }
    player.play();
  };

  return (
    <View style={styles.voice}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pauziraj' : 'Pusti glasovnu poruku'}
        onPress={toggle}
        style={[
          styles.voiceBtn,
          { backgroundColor: mine ? colors.primaryForeground : colors.accent },
        ]}>
        {status.playing ? (
          <Pause size={18} color={colors.primary} />
        ) : (
          <Play size={18} color={colors.primary} />
        )}
      </Pressable>
      <Text style={[styles.voiceTime, { color: fg }]}>
        {formatVoiceDuration(durationMs)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    marginTop: 6,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: radius.lg,
  },
  file: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 180,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileMeta: {
    flexShrink: 1,
    gap: 2,
  },
  fileName: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
  fileSize: {
    fontSize: 12,
  },
  voice: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  voiceBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTime: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
    fontVariant: ['tabular-nums'],
  },
});
