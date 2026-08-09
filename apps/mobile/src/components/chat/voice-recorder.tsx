import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Mic, Send, Trash2 } from 'lucide-react-native';

import { formatVoiceDuration } from '@/lib/chat';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

export type RecordedVoice = { uri: string; durationMs: number };

/**
 * Glasovna poruka (`expo-audio`). Idle je dugme-mikrofon; tokom snimanja zauzima
 * ceo red (tajmer + otkaži + pošalji). `onActiveChange` javlja composeru da sakrije
 * unos dok snimanje traje. Snimak kraći od ~0.4s se odbacuje.
 */
export function VoiceRecorder({
  disabled,
  onActiveChange,
  onRecorded,
}: {
  disabled?: boolean;
  onActiveChange: (active: boolean) => void;
  onRecorded: (voice: RecordedVoice) => void;
}) {
  const colors = useThemeColors();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(id);
  }, [recording]);

  async function start() {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        haptics.warning();
        Alert.alert('Mikrofon', 'Pristup mikrofonu je odbijen.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      onActiveChange(true);
      haptics.tap();
    } catch {
      haptics.error();
      Alert.alert('Greška', 'Snimanje nije počelo.');
    }
  }

  async function finish(shouldSend: boolean) {
    const durationMs = Date.now() - startedAtRef.current;
    setRecording(false);
    onActiveChange(false);
    try {
      await recorder.stop();
    } catch {
      // Ignoriši — svakako gasimo snimanje.
    }
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (shouldSend && uri && durationMs > 400) {
      onRecorded({ uri, durationMs });
    }
  }

  if (!recording) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Snimi glasovnu poruku"
        disabled={disabled}
        onPress={() => void start()}
        style={({ pressed }) => [
          styles.iconBtn,
          pressed && { backgroundColor: colors.muted },
        ]}>
        <Mic size={22} color={colors.foreground} />
      </Pressable>
    );
  }

  return (
    <View style={styles.recording}>
      <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
      <Text style={[styles.timer, { color: colors.foreground }]}>
        {formatVoiceDuration(elapsed)}
      </Text>
      <View style={styles.spacer} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Otkaži snimanje"
        // Bacanje snimka je destruktivno — snimak se ne vraća.
        onPress={() => {
          haptics.warning();
          void finish(false);
        }}
        style={({ pressed }) => [
          styles.iconBtn,
          pressed && { backgroundColor: colors.muted },
        ]}>
        <Trash2 size={20} color={colors.destructive} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pošalji glasovnu poruku"
        onPress={() => {
          haptics.tap();
          void finish(true);
        }}
        style={[styles.sendBtn, { backgroundColor: colors.primary }]}>
        <Send size={18} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  recording: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  timer: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  spacer: {
    flex: 1,
  },
  sendBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
