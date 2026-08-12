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
import { clearUndo, useUndo, type UndoAction } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, SHADOW_COLOR, text } from '@/theme/tokens';

/** Traka stoji dovoljno dugo da se pročita i tapne — nije samonestajući toast od 2s. */
const AUTO_HIDE_MS = 8000;
/** Ispod ovoga traka ne ide ni kad je serverski rok kraći — da ne blesne-i-nestane. */
const MIN_VISIBLE_MS = 1000;

/**
 * Traka „Poništi" posle radnje koja je već upisana (PARITET A6) — JEDAN obrazac za
 * misli, ideje, veze ideja, checkpointe, doprinose i pomeranje kartica na kanvasu
 * (lanac 4: `pageMove`, jedini član koji ne vraća arhivirano nego pravi inverzan
 * potez). Montira se na svakom ekranu koji radnju pokreće (ili na koji se posle nje
 * vraća); stavku čita iz modul-store-a (`lib/undo.ts`), pa preživljava `router.back()`
 * sa detalja.
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
  const { activeStartupId } = useActiveStartup();
  const entry = useUndo();

  const restoreNodes = useMutation(api.thoughts.restoreNodes);
  const restoreEdges = useMutation(api.thoughts.restoreEdges);
  const restoreIdea = useMutation(api.ideas.restoreOwn);
  const connectIdeas = useMutation(api.ideas.connect);
  const restoreCheckpoint = useMutation(api.taskCheckpoints.restoreOwn);
  const restoreContribution = useMutation(api.collaboration.restoreOwnContribution);
  const movePages = useMutation(api.areasV2.movePages);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Promena startupa: stavka se odnosi na prošli kontekst — skloni je da traka na
  // tuđem ekranu ne nudi poništavanje nečega što korisnik više ne gleda.
  const startupRef = useRef(activeStartupId);
  useEffect(() => {
    if (startupRef.current !== activeStartupId) {
      startupRef.current = activeStartupId;
      clearUndo();
    }
  }, [activeStartupId]);

  // Tajmer po stavci (`key` raste na svaki push). Serverski rok (`undoUntil`) je
  // merodavan kad postoji. Dok poništavanje traje, tajmer ne sme da skloni traku
  // ispod prsta — guard kroz busyRef.
  useEffect(() => {
    if (entry === null) return;
    const ttl = entry.undoUntil
      ? Math.max(MIN_VISIBLE_MS, entry.undoUntil - Date.now())
      : AUTO_HIDE_MS;
    const timer = setTimeout(() => {
      if (!busyRef.current) clearUndo();
    }, ttl);
    return () => clearTimeout(timer);
  }, [entry]);

  if (entry === null) return null;

  const restore = async (action: UndoAction) => {
    switch (action.kind) {
      case 'thoughts':
        // Redosled je ugovor backenda: PRVO `restoreNodes` (sam vraća veze pale
        // uz čvor), PA `restoreEdges` — obrnuto baca „Obe misli moraju biti aktivne…".
        if (action.nodeIds.length > 0) await restoreNodes({ nodeIds: action.nodeIds });
        if (action.edgeIds.length > 0) await restoreEdges({ edgeIds: action.edgeIds });
        return;
      case 'idea':
        await restoreIdea({ startupId: action.startupId, ideaId: action.ideaId });
        return;
      case 'ideaEdge':
        // `connect` na postojećem pairKey OŽIVLJAVA arhiviranu vezu i ČUVA joj
        // label (`ideas.ts`), pa je ovo tačan inverz za `disconnect`.
        await connectIdeas({
          startupId: action.startupId,
          nodeAId: action.nodeAId,
          nodeBId: action.nodeBId,
        });
        return;
      case 'checkpoint':
        await restoreCheckpoint({ checkpointId: action.checkpointId });
        return;
      case 'contribution':
        await restoreContribution({ contributionId: action.contributionId });
        return;
      case 'pageMove':
        // Inverz poteza je isti poziv sa PRETHODNIM koordinatama (nema „restore"
        // mutacije za raspored). Server i ovde proverava vlasništvo kartice.
        await movePages({
          startupId: action.startupId,
          areaId: action.areaId,
          rootPageId: action.rootPageId,
          updates: action.updates,
        });
        return;
    }
  };

  const undo = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    haptics.tap();
    try {
      await restore(entry.action);
      haptics.success();
      AccessibilityInfo.announceForAccessibility('Vraćeno.');
      clearUndo();
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
        accessibilityLabel="Zatvori traku bez poništavanja"
        disabled={busy}
        onPress={() => {
          haptics.select();
          clearUndo();
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
