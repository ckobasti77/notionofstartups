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

import { useUndoRunner } from '@/hooks/use-undo-runner';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { hideUndoBar, popUndo, useUndoBarEntry } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, SHADOW_COLOR, text } from '@/theme/tokens';

/** Traka stoji dovoljno dugo da se pročita i tapne — nije samonestajući toast od 2s. */
const AUTO_HIDE_MS = 8000;
/** Ispod ovoga traka ne ide ni kad je serverski rok kraći — da ne blesne-i-nestane. */
const MIN_VISIBLE_MS = 1000;

/**
 * Traka „Poništi" posle radnje koja je već upisana (PARITET A6) — JEDAN obrazac za
 * misli, ideje, veze ideja, checkpointe, doprinose i uređivanje kanvasa (lanac 4:
 * `pageMove`, `pageResize`, `pageEdgeConnect`, `pageEdgeDisconnect`, a od K4 i
 * `checkpointResize`, `checkpointEdgeConnect`, `checkpointEdgeDisconnect` — članovi
 * koji ne vraćaju arhivirano nego prave inverzan potez). Montira se na svakom ekranu koji
 * radnju pokreće (ili na koji se posle nje vraća); stavku čita iz modul-store-a
 * (`lib/undo.ts`), pa preživljava `router.back()` sa detalja.
 *
 * Konvencija app-a izbegava samonestajuće toast-ove (`contribution-thread.tsx`), pa
 * traka stoji 8s I ima eksplicitno ✕ — a Alert potvrda PRE arhiviranja ostaje na
 * svakom mestu koje arhivira. Ovo nije zamena za potvrdu nego izlaz posle nje.
 * Kad server vrati `undoUntil`, tajmer poštuje NJEGA (checkpoint/doprinos imaju
 * tvrdi serverski rok od 8s — traka ne sme da nadživi dugme koje nudi).
 */
export function UndoBar({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const entry = useUndoBarEntry();
  const runUndo = useUndoRunner();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Promena aktivnog startupa prazni CEO stek — to radi provajder
  // (`context/active-startup.tsx`, `setActiveStartupId`), ne ovaj komponent.

  // Tajmer po stavci (`key` raste na svaki push). Serverski rok (`undoUntil`) je
  // merodavan kad postoji. Dok poništavanje traje, tajmer ne sme da skloni traku
  // ispod prsta — guard kroz busyRef. Istek SAMO sklanja traku — stavka ostaje u
  // steku, dostupna kroz „Istoriju radnji".
  useEffect(() => {
    if (entry === null) return;
    const ttl = entry.undoUntil
      ? Math.max(MIN_VISIBLE_MS, entry.undoUntil - Date.now())
      : AUTO_HIDE_MS;
    const timer = setTimeout(() => {
      if (!busyRef.current) hideUndoBar();
    }, ttl);
    return () => clearTimeout(timer);
  }, [entry]);

  if (entry === null) return null;

  const undo = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    haptics.tap();
    try {
      await runUndo(entry.action);
      haptics.success();
      AccessibilityInfo.announceForAccessibility('Vraćeno.');
      // Traka odmah nudi SLEDEĆU stavku (ako ima) — višekoračno poništavanje u
      // mestu, isto što `Ctrl+Z` radi ponovljen na webu.
      popUndo(entry.key, { advertiseNext: true });
    } catch (error) {
      // Traka namerno OSTAJE — serverska poruka („Vreme za Undo je isteklo.",
      // limit checkpointa…) se prikaže, a korisnik traku zatvara sam.
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
        accessibilityLabel="Sakrij traku — radnja ostaje u Istoriji radnji"
        disabled={busy}
        onPress={() => {
          haptics.select();
          hideUndoBar();
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
