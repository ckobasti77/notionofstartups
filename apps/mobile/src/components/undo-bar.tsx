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
  const { activeStartupId } = useActiveStartup();
  const entry = useUndo();

  const restoreNodes = useMutation(api.thoughts.restoreNodes);
  const restoreEdges = useMutation(api.thoughts.restoreEdges);
  const restoreIdea = useMutation(api.ideas.restoreOwn);
  const connectIdeas = useMutation(api.ideas.connect);
  const disconnectIdeas = useMutation(api.ideas.disconnect);
  const updateIdeaPositions = useMutation(api.ideas.updatePositions);
  const updateIdeaLayout = useMutation(api.ideas.updateLayout);
  const resetIdeaLayoutSize = useMutation(api.ideas.resetLayoutSize);
  const moveThoughtNodes = useMutation(api.thoughts.moveNodes);
  const updateThoughtLayout = useMutation(api.thoughts.updateNodeLayout);
  const resetThoughtLayoutSize = useMutation(api.thoughts.resetNodeLayoutSize);
  const archiveThoughtEdges = useMutation(api.thoughts.archiveEdges);
  const restoreCheckpoint = useMutation(api.taskCheckpoints.restoreOwn);
  const restoreContribution = useMutation(api.collaboration.restoreOwnContribution);
  const movePages = useMutation(api.areasV2.movePages);
  const resizePage = useMutation(api.areasV2.resizePage);
  const connectPages = useMutation(api.areasV2.connectPages);
  const disconnectPages = useMutation(api.areasV2.disconnectPages);
  const saveCheckpointPlacement = useMutation(api.taskCheckpoints.saveCanvasPlacement);
  const resetCheckpointCanvasSize = useMutation(api.taskCheckpoints.resetCanvasSize);
  const connectCheckpointEdge = useMutation(api.taskCheckpointCanvasEdges.connect);
  const disconnectCheckpointEdge = useMutation(api.taskCheckpointCanvasEdges.disconnect);
  const updatePage = useMutation(api.areasV2.updatePage);
  const setChannelMembers = useMutation(api.chat.setChannelMembers);
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
        if (action.updates.length > 0) {
          await movePages({
            startupId: action.startupId,
            areaId: action.areaId,
            rootPageId: action.rootPageId,
            updates: action.updates,
          });
        }
        // Isti potez je mogao da ponese i korake (K4) — server prima jedan po pozivu.
        // BEZ `width`/`height`: potez ih nije ni menjao, a `patch` bez njih ih čuva.
        for (const checkpoint of action.checkpoints ?? []) {
          await saveCheckpointPlacement({
            checkpointId: checkpoint.checkpointId,
            canvasRootPageId: action.rootPageId,
            x: checkpoint.x,
            y: checkpoint.y,
          });
        }
        return;
      case 'pageResize':
        // Inverz i za potez ručkom i za „Vrati podrazumevanu veličinu": isti poziv sa
        // dimenzijama od pre radnje. `x`/`y` idu samo ako su OBA poznata (potez ručkom
        // pomera i rub) — server odbija jedno bez drugog.
        await resizePage({
          startupId: action.startupId,
          areaId: action.areaId,
          rootPageId: action.rootPageId,
          pageId: action.pageId,
          width: action.width,
          height: action.height,
          ...(action.x !== undefined && action.y !== undefined
            ? { x: action.x, y: action.y }
            : {}),
        });
        return;
      case 'pageEdgeConnect':
        // Inverz pravljenja veze. Ako je server vratio TUĐU postojeću ivicu (neko je
        // isti par povezao u međuvremenu), ovo pukne sa „Možete ukloniti samo vezu
        // koju ste napravili." — traka tada ostaje i pokaže tu poruku.
        await disconnectPages({
          startupId: action.startupId,
          areaId: action.areaId,
          rootPageId: action.rootPageId,
          edgeId: action.edgeId,
        });
        return;
      case 'pageEdgeDisconnect':
        // `connectPages` NE oživljava arhiviranu ivicu, pa se pravi nova — sa istim
        // parom i istim nazivom (zato ga stavka i nosi).
        await connectPages({
          startupId: action.startupId,
          areaId: action.areaId,
          rootPageId: action.rootPageId,
          sourcePageId: action.sourcePageId,
          targetPageId: action.targetPageId,
          ...(action.label ? { label: action.label } : {}),
        });
        return;
      case 'checkpointResize':
        // USLOVAN inverz (§4 P5 plana K4): korak koji PRE radnje nije imao ručnu
        // veličinu se ne vraća samo dimenzijama — one bi ostale zauvek. Vrati poziciju,
        // pa obriši dimenzije; tek to je stanje od pre radnje. Desktop radi identično.
        if (action.manuallySized) {
          await saveCheckpointPlacement({
            checkpointId: action.checkpointId,
            canvasRootPageId: action.canvasRootPageId,
            x: action.x,
            y: action.y,
            width: action.width,
            height: action.height,
          });
          return;
        }
        await saveCheckpointPlacement({
          checkpointId: action.checkpointId,
          canvasRootPageId: action.canvasRootPageId,
          x: action.x,
          y: action.y,
        });
        await resetCheckpointCanvasSize({
          checkpointId: action.checkpointId,
          canvasRootPageId: action.canvasRootPageId,
        });
        return;
      case 'checkpointEdgeConnect':
        // Ako je server vratio TUĐU postojeću ivicu (neko je isti par povezao u
        // međuvremenu), ovo pukne sa „Možete ukloniti samo vezu koju ste napravili." —
        // traka tada ostaje i pokaže poruku.
        await disconnectCheckpointEdge({
          startupId: action.startupId,
          areaId: action.areaId,
          rootPageId: action.rootPageId,
          edgeId: action.edgeId,
        });
        return;
      case 'checkpointEdgeDisconnect':
        // `connect` NE oživljava arhiviranu ivicu (indeks traži `archivedAt: null`),
        // pa se pravi NOVA — sa istim parom endpointa.
        await connectCheckpointEdge({
          startupId: action.startupId,
          areaId: action.areaId,
          rootPageId: action.rootPageId,
          source: action.source,
          target: action.target,
        });
        return;
      case 'ideaMove':
        // Inverz poteza je isti poziv sa PRETHODNIM (stored) koordinatama.
        if (action.updates.length > 0) {
          await updateIdeaPositions({
            startupId: action.startupId,
            updates: action.updates,
          });
        }
        return;
      case 'ideaResize':
        // USLOVAN inverz: kartica koja pre poteza nije imala ručnu veličinu mora da
        // je i IZGUBI, inače ostaje ručno dimenzionisana zauvek. `resetLayoutSize`
        // ne dira poziciju, pa se ona vraća zasebno.
        if (action.manuallySized) {
          await updateIdeaLayout({
            startupId: action.startupId,
            ideaId: action.ideaId,
            x: action.x,
            y: action.y,
            width: action.width,
            height: action.height,
          });
          return;
        }
        await updateIdeaPositions({
          startupId: action.startupId,
          updates: [{ id: action.ideaId, x: action.x, y: action.y }],
        });
        await resetIdeaLayoutSize({
          startupId: action.startupId,
          ideaId: action.ideaId,
        });
        return;
      case 'ideaEdgeConnect':
        await disconnectIdeas({
          startupId: action.startupId,
          edgeId: action.edgeId,
        });
        return;
      case 'thoughtMove':
        if (action.moves.length > 0) await moveThoughtNodes({ moves: action.moves });
        return;
      case 'thoughtResize':
        if (action.manuallySized) {
          await updateThoughtLayout({
            nodeId: action.nodeId,
            x: action.x,
            y: action.y,
            width: action.width,
            height: action.height,
          });
          return;
        }
        await moveThoughtNodes({
          moves: [{ nodeId: action.nodeId, x: action.x, y: action.y }],
        });
        await resetThoughtLayoutSize({ nodeId: action.nodeId });
        return;
      case 'thoughtEdgeConnect':
        // Inverz PRAVLJENJA veze je arhiviranje — ne `restoreEdges`.
        await archiveThoughtEdges({ edgeIds: [action.edgeId] });
        return;
      case 'channelMembers':
        // Inverz je ISTI poziv sa spiskom od pre izmene. Ako je kanal u
        // međuvremenu arhiviran ili je neko izgubio članstvo u startupu, ovo baci
        // serversku poruku — traka tada namerno OSTAJE (ista konvencija kao gore).
        await setChannelMembers({
          channelId: action.channelId,
          memberProfileIds: action.profileIds,
        });
        return;
      case 'pageRename':
        // Ako je neko u međuvremenu izmenio stranicu, ovo baci `KONFLIKT_IZMENA` —
        // traka tada namerno OSTAJE i pokaže poruku (ista konvencija kao gore).
        await updatePage({
          startupId: action.startupId,
          pageId: action.pageId,
          expectedRevision: action.expectedRevision,
          title: action.title,
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
