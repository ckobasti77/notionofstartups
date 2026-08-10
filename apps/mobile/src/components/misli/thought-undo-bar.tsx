import { useMutation } from 'convex/react';
import { X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { clearThoughtUndo, useThoughtUndo } from '@/lib/thought-undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, SHADOW_COLOR, text } from '@/theme/tokens';

/** Traka stoji dovoljno dugo da se pročita i tapne — nije samonestajući toast od 2s. */
const AUTO_HIDE_MS = 8000;

/**
 * Traka „Poništi" posle arhiviranja misli/veze (PARITET A6). Montira se na svakom
 * ekranu misli (lista, detalj, kanvas); stavku čita iz modul-store-a
 * (`lib/thought-undo.ts`), pa preživljava `router.back()` sa detalja.
 *
 * Konvencija app-a izbegava samonestajuće toast-ove (`contribution-thread.tsx`), pa
 * traka stoji 8s I ima eksplicitno ✕ — a Alert potvrda PRE arhiviranja ostaje na
 * svakom mestu koje arhivira. Ovo nije zamena za potvrdu nego izlaz posle nje.
 *
 * Redosled vraćanja je ugovor backenda: PRVO `restoreNodes` (sam vraća veze pale
 * uz čvor), PA `restoreEdges` — obrnuto baca „Obe misli moraju biti aktivne…".
 */
export function ThoughtUndoBar({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();
  const entry = useThoughtUndo();

  const restoreNodes = useMutation(api.thoughts.restoreNodes);
  const restoreEdges = useMutation(api.thoughts.restoreEdges);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Promena startupa: stavka se odnosi na prošli kontekst — skloni je da traka na
  // tuđem ekranu ne nudi poništavanje nečega što korisnik više ne gleda.
  const startupRef = useRef(activeStartupId);
  useEffect(() => {
    if (startupRef.current !== activeStartupId) {
      startupRef.current = activeStartupId;
      clearThoughtUndo();
    }
  }, [activeStartupId]);

  // Tajmer po stavci (`key` raste na svaki push). Dok poništavanje traje, tajmer
  // ne sme da skloni traku ispod prsta — guard kroz busyRef.
  useEffect(() => {
    if (entry === null) return;
    const timer = setTimeout(() => {
      if (!busyRef.current) clearThoughtUndo();
    }, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [entry]);

  if (entry === null) return null;

  const undo = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    haptics.tap();
    try {
      if (entry.nodeIds.length > 0) await restoreNodes({ nodeIds: entry.nodeIds });
      if (entry.edgeIds.length > 0) await restoreEdges({ edgeIds: entry.edgeIds });
      haptics.success();
      AccessibilityInfo.announceForAccessibility('Vraćeno.');
      clearThoughtUndo();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Vraćanje nije uspelo.'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        {
          bottom: insets.bottom + 16 + bottomOffset,
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          shadowColor: SHADOW_COLOR,
        },
      ]}>
      <Text numberOfLines={2} style={[styles.label, { color: colors.foreground }]}>
        {entry.label}
      </Text>
      {busy ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Vraćanje u toku" />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Poništi — ${entry.label}`}
          onPress={() => void undo()}
          style={({ pressed }) => [styles.undoBtn, pressed && { backgroundColor: colors.muted }]}>
          <Text style={[styles.undoText, { color: colors.primaryText }]}>Poništi</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori traku bez poništavanja"
        disabled={busy}
        onPress={() => {
          haptics.select();
          clearThoughtUndo();
        }}
        style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: colors.muted }]}>
        <X size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 6,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    // Traka lebdi nad sadržajem — ista dozvola za senku kao sheet/FAB.
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  label: {
    ...text.body,
    flex: 1,
  },
  undoBtn: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  undoText: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  closeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
});
