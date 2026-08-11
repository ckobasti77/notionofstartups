import { useMutation, usePaginatedQuery } from 'convex/react';
import {
  Archive,
  Check,
  ChevronLeft,
  Copy,
  Crown,
  FolderInput,
  Link2,
  Scaling,
  Scissors,
  Send,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { THOUGHT_SWATCH } from '@/lib/thought-colors';
import {
  activeThoughtSizePreset,
  THOUGHT_SIZE_DIMENSIONS,
  THOUGHT_SIZE_LABEL,
  THOUGHT_SIZE_PRESETS,
  thoughtDisplayTitle,
} from '@/lib/thought-layout';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

/** Web ofset pri dupliranju (`thoughts-canvas-view.tsx`, `duplicateSelection`). */
const DUPLICATE_OFFSET = 38;

export type ThoughtActionsView = 'menu' | 'connect' | 'nest' | 'size';

const VIEW_TITLE: Record<Exclude<ThoughtActionsView, 'menu'>, string> = {
  connect: 'Poveži sa misli',
  nest: 'Ugnjezdi u…',
  size: 'Veličina oblačića',
};

/**
 * Akcije nad jednom misli (PARITET A1) — mobilni pandan web context meniju i
 * NodeToolbar-u sa kanvasa: povezivanje, ugnježdavanje, izdvajanje, glavna misao,
 * dupliranje, veličina oblačića, slanje u Ideje, arhiviranje. Isti obrazac kao
 * `page-actions-sheet.tsx`: JEDAN sheet sa pod-prikazima („akcija → cilj"), ne
 * ugnježdeni modali (Android guta `onRequestClose`); `busyId` brava; lenji upiti.
 *
 * `node` je snimak u trenutku otvaranja — sheet se posle svake akcije zatvara, pa
 * zastarelost ne stigne da se vidi.
 */
export function ThoughtActionsSheet({
  open,
  node,
  startupId,
  initialView = 'menu',
  onClose,
  onConvert,
  onBeforeArchive,
  onArchived,
  onArchiveFailed,
}: {
  open: boolean;
  node: Doc<'thoughtNodes'> | null;
  startupId: Doc<'thoughtNodes'>['startupId'];
  /** Korak na kom se sheet otvara — „Poveži sa misli…" sa detalja preskače meni. */
  initialView?: ThoughtActionsView;
  onClose: () => void;
  /**
   * „Pošalji u Ideje": roditelj zatvara OVAJ sheet pa (uz pauzu) otvara konverzioni
   * — dva istovremena modala na Androidu gutaju `onRequestClose`.
   */
  onConvert: (nodes: Doc<'thoughtNodes'>[]) => void;
  /** Detalj misli: prebaci upit na `skip` PRE mutacije (trka sa ErrorBoundary). */
  onBeforeArchive?: () => void;
  onArchived?: () => void;
  onArchiveFailed?: () => void;
}) {
  const colors = useThemeColors();
  const [view, setView] = useState<ThoughtActionsView>(initialView);
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Roditelj na zatvaranje odmah postavi `node` na null — poslednji ne-null snimak
  // ostaje za telo sheet-a tokom izlazne animacije (inače prazan sheet klizi dole).
  const lastNodeRef = useRef<Doc<'thoughtNodes'> | null>(null);
  if (node !== null) lastNodeRef.current = node;
  const renderNode = node ?? lastNodeRef.current;

  const createEdge = useMutation(api.thoughts.createEdge);
  const nestNode = useMutation(api.thoughts.nestNode);
  const detachNode = useMutation(api.thoughts.detachNode);
  const toggleNodeParent = useMutation(api.thoughts.toggleNodeParent);
  const duplicateNodes = useMutation(api.thoughts.duplicateNodes);
  const updateNodeLayout = useMutation(api.thoughts.updateNodeLayout);
  const resetNodeLayoutSize = useMutation(api.thoughts.resetNodeLayoutSize);
  const archiveNodes = useMutation(api.thoughts.archiveNodes);

  // Kandidati za oba pod-prikaza — lenjo, tek kad se prikaz otvori.
  const candidates = usePaginatedQuery(
    api.thoughts.listNodes,
    open && node !== null && (view === 'connect' || view === 'nest') ? { startupId } : 'skip',
    { initialNumItems: 50 },
  );
  // Postojeće veze — da „Poveži" obeleži već povezane misli umesto da server baci.
  const { results: edgeResults } = usePaginatedQuery(
    api.thoughts.listEdges,
    open && node !== null && view === 'connect' ? { startupId } : 'skip',
    { initialNumItems: 200 },
  );
  const connectedIds = useMemo(() => {
    if (node === null) return new Set<string>();
    const set = new Set<string>();
    for (const edge of edgeResults) {
      if (edge.nodeAId === node._id) set.add(edge.nodeBId);
      else if (edge.nodeBId === node._id) set.add(edge.nodeAId);
    }
    return set;
  }, [edgeResults, node]);

  const close = () => {
    setView('menu');
    onClose();
  };

  /** Zajednički omotač: brava, haptika, prikaz greške, zatvaranje po uspehu. */
  const runAction = async (targetId: string, action: () => Promise<string | null>) => {
    if (busyId !== null) return;
    setBusyId(targetId);
    haptics.tap();
    try {
      const note = await action();
      haptics.success();
      if (note) Alert.alert('Gotovo', note);
      close();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Radnja nije izvršena.'));
    } finally {
      setBusyId(null);
    }
  };

  // Nikad nije bio otvoren — nema ni izlazne animacije, nema šta da se crta.
  if (renderNode === null) return null;
  const target = renderNode;

  const title = thoughtDisplayTitle(target);
  const activeSize = activeThoughtSizePreset(target.width);

  const archive = () => {
    if (busyId !== null) return;
    haptics.warning();
    Alert.alert('Arhivirati misao?', `„${title}" se sklanja sa kanvasa. Veze idu sa njom.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Arhiviraj',
        style: 'destructive',
        onPress: () =>
          void runAction('archive', async () => {
            // Detalj mora da preskoči svoj upit PRE nego što misao nestane —
            // inače pretplata baci „Misao nije pronađena." pre `router.back()`.
            onBeforeArchive?.();
            try {
              await archiveNodes({ nodeIds: [target._id] });
            } catch (error) {
              onArchiveFailed?.();
              throw error;
            }
            // Traka „Poništi" je jedini put nazad — backend nema upit za arhivu
            // (`restoreNodes` sam vraća i veze pale uz čvor).
            pushUndo({
              label: 'Misao je arhivirana.',
              action: { kind: 'thoughts', nodeIds: [target._id], edgeIds: [] },
            });
            onArchived?.();
            return null;
          }),
      },
    ]);
  };

  return (
    <Sheet visible={open && node !== null} onClose={close} style={styles.sheet}>
      {view === 'menu' ? (
        <>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heading, { color: colors.foreground }]}>
            {title}
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            <Row
              title="Pošalji u Ideje"
              subtitle="Misao postaje timska ideja; original ostaje privatan"
              onPress={() => onConvert([target])}
              disabled={busyId !== null}
              style={styles.row}
              icon={<Send size={20} color={colors.mutedForeground} />}
            />
            <Row
              title="Poveži sa misli…"
              subtitle="Veza ka drugoj misli, vidljiva na kanvasu"
              onPress={() => setView('connect')}
              disabled={busyId !== null}
              style={styles.row}
              icon={<Link2 size={20} color={colors.mutedForeground} />}
            />
            <Row
              title="Ugnjezdi u…"
              subtitle="Misao postaje deo grupe i putuje sa njom"
              onPress={() => setView('nest')}
              disabled={busyId !== null}
              style={styles.row}
              icon={<FolderInput size={20} color={colors.mutedForeground} />}
            />
            {target.parentThoughtId !== undefined ? (
              <Row
                title="Izdvoji iz grupe"
                subtitle="Vraća misao na vrh kanvasa, gde je i stajala"
                onPress={() =>
                  void runAction('detach', async () => {
                    await detachNode({ nodeId: target._id });
                    return 'Misao je izdvojena iz grupe.';
                  })
                }
                disabled={busyId !== null}
                showChevron={false}
                style={styles.row}
                icon={<Scissors size={20} color={colors.mutedForeground} />}
                value={busyId === 'detach' ? <ActivityIndicator color={colors.primary} /> : undefined}
              />
            ) : null}
            <Row
              title={target.isParent ? 'Ukloni oznaku glavne' : 'Proglasi glavnom misli'}
              subtitle="Glavna misao se ističe kao stožer grupe"
              onPress={() =>
                void runAction('toggle-parent', async () => {
                  await toggleNodeParent({ nodeId: target._id, isParent: !target.isParent });
                  return null;
                })
              }
              disabled={busyId !== null}
              showChevron={false}
              style={styles.row}
              icon={<Crown size={20} color={colors.mutedForeground} />}
              value={
                busyId === 'toggle-parent' ? <ActivityIndicator color={colors.primary} /> : undefined
              }
            />
            <Row
              title="Dupliraj"
              subtitle="Kopija odmah pored originala; veze se ne kopiraju"
              onPress={() =>
                void runAction('duplicate', async () => {
                  await duplicateNodes({
                    nodeIds: [target._id],
                    offsetX: DUPLICATE_OFFSET,
                    offsetY: DUPLICATE_OFFSET,
                  });
                  return 'Misao je duplirana.';
                })
              }
              disabled={busyId !== null}
              showChevron={false}
              style={styles.row}
              icon={<Copy size={20} color={colors.mutedForeground} />}
              value={busyId === 'duplicate' ? <ActivityIndicator color={colors.primary} /> : undefined}
            />
            <Row
              title="Veličina oblačića"
              subtitle={
                activeSize === null ? 'Automatska' : THOUGHT_SIZE_LABEL[activeSize]
              }
              onPress={() => setView('size')}
              disabled={busyId !== null}
              style={styles.row}
              icon={<Scaling size={20} color={colors.mutedForeground} />}
            />
            <Row
              title="Arhiviraj"
              subtitle={'Sklanja misao; traka „Poništi" vraća'}
              onPress={archive}
              disabled={busyId !== null}
              showChevron={false}
              style={styles.row}
              icon={<Archive size={20} color={colors.destructive} />}
              value={busyId === 'archive' ? <ActivityIndicator color={colors.primary} /> : undefined}
            />
          </ScrollView>
        </>
      ) : (
        <>
          <Row
            title={VIEW_TITLE[view]}
            onPress={() => setView('menu')}
            disabled={busyId !== null}
            showChevron={false}
            accessibilityLabel={`Nazad na akcije misli — ${VIEW_TITLE[view]}`}
            style={styles.row}
            icon={<ChevronLeft size={22} color={colors.foreground} />}
          />
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {view === 'connect' || view === 'nest' ? (
              candidates.status === 'LoadingFirstPage' ? (
                <Loading label="Učitavanje misli" />
              ) : (
                <CandidateList
                  view={view}
                  node={target}
                  connectedIds={connectedIds}
                  candidates={candidates.results}
                  busyId={busyId}
                  onConnect={(targetId, targetTitle) =>
                    void runAction(targetId, async () => {
                      await createEdge({ startupId, nodeAId: target._id, nodeBId: targetId });
                      return `Misao je povezana sa „${targetTitle}".`;
                    })
                  }
                  onNest={(targetId, targetTitle) =>
                    void runAction(targetId, async () => {
                      await nestNode({ childNodeId: target._id, parentNodeId: targetId });
                      return `Misao je ugnježdena u „${targetTitle}".`;
                    })
                  }
                  onLoadMore={
                    candidates.status === 'CanLoadMore'
                      ? () => candidates.loadMore(50)
                      : undefined
                  }
                />
              )
            ) : null}

            {view === 'size' ? (
              <>
                {THOUGHT_SIZE_PRESETS.map((preset) => {
                  const dims = THOUGHT_SIZE_DIMENSIONS[preset];
                  return (
                    <Row
                      key={preset}
                      title={THOUGHT_SIZE_LABEL[preset]}
                      subtitle={`${dims.width} × ${dims.height}`}
                      onPress={() =>
                        void runAction(preset, async () => {
                          // `updateNodeLayout` traži i x/y — pozicija se ne menja,
                          // prosleđuju se postojeće koordinate čvora.
                          await updateNodeLayout({
                            nodeId: target._id,
                            x: target.x,
                            y: target.y,
                            width: dims.width,
                            height: dims.height,
                          });
                          return null;
                        })
                      }
                      disabled={busyId !== null}
                      showChevron={false}
                      style={styles.row}
                      accessibilityLabel={`${THOUGHT_SIZE_LABEL[preset]}${activeSize === preset ? ', aktivna' : ''}`}
                      value={
                        busyId === preset ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : activeSize === preset ? (
                          <Check size={18} color={colors.primaryText} />
                        ) : undefined
                      }
                    />
                  );
                })}
                <Row
                  title="Automatska"
                  subtitle="Oblačić raste sa sadržajem"
                  onPress={() =>
                    void runAction('auto-size', async () => {
                      await resetNodeLayoutSize({ nodeId: target._id });
                      return null;
                    })
                  }
                  disabled={busyId !== null}
                  showChevron={false}
                  style={styles.row}
                  accessibilityLabel={`Automatska${activeSize === null ? ', aktivna' : ''}`}
                  value={
                    busyId === 'auto-size' ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : activeSize === null ? (
                      <Check size={18} color={colors.primaryText} />
                    ) : undefined
                  }
                />
              </>
            ) : null}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

function CandidateList({
  view,
  node,
  connectedIds,
  candidates,
  busyId,
  onConnect,
  onNest,
  onLoadMore,
}: {
  view: 'connect' | 'nest';
  node: Doc<'thoughtNodes'>;
  connectedIds: Set<string>;
  candidates: Doc<'thoughtNodes'>[];
  busyId: string | null;
  onConnect: (targetId: Doc<'thoughtNodes'>['_id'], title: string) => void;
  onNest: (targetId: Doc<'thoughtNodes'>['_id'], title: string) => void;
  onLoadMore?: () => void;
}) {
  const colors = useThemeColors();
  const items = candidates.filter((candidate) => candidate._id !== node._id);
  if (items.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.mutedForeground }]}>
        {view === 'connect'
          ? 'Nema druge misli za povezivanje.'
          : 'Nema druge misli u koju bi se ova ugnjezdila.'}
      </Text>
    );
  }
  return (
    <>
      {items.map((candidate) => {
        const candidateTitle = thoughtDisplayTitle(candidate);
        // Već povezana / trenutni roditelj: red ostaje vidljiv ali prigušen — jasnije
        // od tihog izostavljanja (ciklus svejedno čuva server, sa srpskom porukom).
        const alreadyConnected = view === 'connect' && connectedIds.has(candidate._id);
        const currentParent = view === 'nest' && node.parentThoughtId === candidate._id;
        const disabled = busyId !== null || alreadyConnected || currentParent;
        return (
          <Row
            key={candidate._id}
            title={candidateTitle}
            titleNumberOfLines={2}
            subtitle={
              alreadyConnected ? 'Već povezana' : currentParent ? 'Trenutni roditelj' : undefined
            }
            // `Row` u label spaja samo string `value` — razlog prigušenosti mora
            // eksplicitno, inače čitač čuje samo „onemogućeno" bez objašnjenja.
            accessibilityLabel={
              alreadyConnected
                ? `${candidateTitle}, već povezana`
                : currentParent
                  ? `${candidateTitle}, trenutni roditelj`
                  : candidateTitle
            }
            onPress={() =>
              view === 'connect'
                ? onConnect(candidate._id, candidateTitle)
                : onNest(candidate._id, candidateTitle)
            }
            disabled={disabled}
            showChevron={busyId === null && !alreadyConnected && !currentParent}
            style={styles.row}
            icon={
              <View
                style={[styles.colorDot, { backgroundColor: THOUGHT_SWATCH[candidate.color] }]}
              />
            }
            value={busyId === candidate._id ? <ActivityIndicator color={colors.primary} /> : undefined}
          />
        );
      })}
      {onLoadMore ? (
        <Row title="Učitaj još" onPress={onLoadMore} showChevron={false} style={styles.row} />
      ) : null}
    </>
  );
}

function Loading({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  list: {
    paddingBottom: 4,
    gap: 2,
  },
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
  },
  empty: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  loading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});
