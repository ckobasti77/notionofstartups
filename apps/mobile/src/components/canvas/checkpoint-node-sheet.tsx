import { useMutation } from 'convex/react';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { NodeEdgesSection, type NodeEdgeRow } from '@/components/canvas/node-edges-section';
import { NodeSizeSection, type SizeOption } from '@/components/canvas/node-size-section';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { CHECKPOINT_NODE_SIZE } from '@/lib/canvas-node-size';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

/**
 * Checkpoint oblačić nad kojim se otvaraju akcije. Sve stiže uz `node:actions` /
 * `selection` poruku (`CheckpointNodeDetail` u embedu) — native ne radi nijedan upit.
 */
export type CheckpointNodeTarget = {
  nodeKind: 'checkpoint';
  _id: Id<'taskCheckpoints'>;
  nodeId: string;
  taskPageId: Id<'pages'>;
  ordinal: number;
  text: string;
  completed: boolean;
  locked: boolean;
  /** Autor ZADATKA — isti uslov i za razmeštaj i za veze. */
  canMove: boolean;
  /** Placement već nosi dimenzije → „Poništi" bira tačan inverz. */
  manuallySized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  rootPageId: Id<'pages'> | null;
  nodeCount: number;
  edges: NodeEdgeRow[];
};

const PRESETS = CHECKPOINT_NODE_SIZE;

/**
 * Sheet „Akcije koraka" na kanvasu (K4) — isti skelet kao `PageNodeSheet`, iste
 * deljene sekcije, druge mutacije.
 *
 * Šta ovde NAMERNO NEMA: tekst koraka, kvačica „završen", lančanje, brisanje i
 * glasanje. To je suština checkpointa i već je native na detalju zadatka
 * (`components/zadatak/task-checkpoint-list.tsx`) — kanvas dodaje samo razmeštaj i
 * vezu. Van režima tap na oblačić otvara `/zadatak/<id>`, dakle jedan izvor istine.
 *
 * Zašto veličina ide PRESETIMA, a ne ugaonim ručkama kao kartica: oblačić je
 * 164 × 110 (min 140 × 92), pa bi četiri mete od 44pt zauzele 43% njegove površine i
 * potez koji hoće da POMERI korak skoro uvek bi pogodio ručku. Pravilo lanca je da se
 * u tom slučaju menja interakcija, ne prst — a preseti su tačno ono što nudi i desktop
 * toolbar oblačića (`task-checkpoint-flow-node.tsx`, `setSizePreset`).
 *
 * Sheet se posle svake uspešne izmene ZATVARA — traka „Poništi" je ispod modala
 * nevidljiva (isto pravilo kao u K3).
 */
export function CheckpointNodeSheet({
  checkpoint,
  onClose,
  onStartConnect,
  onApplied,
}: {
  checkpoint: CheckpointNodeTarget | null;
  onClose: () => void;
  /** „Poveži sa…" — roditelj zatvara sheet i ulazi u biranje cilja. */
  onStartConnect: (checkpoint: CheckpointNodeTarget) => void;
  /** Nova veličina posle uspešne izmene — pozivalac osvežava svoj lokalni detalj. */
  onApplied?: (width: number, height: number) => void;
}) {
  const colors = useThemeColors();
  const savePlacement = useMutation(api.taskCheckpoints.saveCanvasPlacement);
  const resetCanvasSize = useMutation(api.taskCheckpoints.resetCanvasSize);
  const disconnectEdge = useMutation(api.taskCheckpointCanvasEdges.disconnect);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  // Jedna brava za CEO sheet (veličina + veze) — kao u sheet-u kartice.
  const [busy, setBusy] = useState<string | null>(null);

  /** Zajednički omotač: brava, haptika, poruka greške, zatvaranje po uspehu. */
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy !== null) return;
    setBusy(key);
    haptics.tap();
    try {
      await action();
      haptics.success();
      onClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Veličina koraka nije promenjena.'));
    } finally {
      setBusy(null);
    }
  };

  const applyPreset = (key: string, size: { width: number; height: number }) => {
    if (!checkpoint) return;
    const before = {
      x: checkpoint.x,
      y: checkpoint.y,
      width: checkpoint.width,
      height: checkpoint.height,
      manuallySized: checkpoint.manuallySized,
    };
    void run(key, async () => {
      await savePlacement({
        checkpointId: checkpoint._id,
        canvasRootPageId: checkpoint.rootPageId,
        // `x`/`y` iz detalja: `saveCanvasPlacement` ih traži uvek, a korak ostaje
        // tačno gde jeste — menja se samo veličina.
        x: checkpoint.x,
        y: checkpoint.y,
        width: size.width,
        height: size.height,
      });
      pushUndo({
        label: `Veličina koraka: ${size.width} × ${size.height}.`,
        action: { kind: 'checkpointResize', checkpointId: checkpoint._id,
          canvasRootPageId: checkpoint.rootPageId, ...before },
      });
      onApplied?.(size.width, size.height);
    });
  };

  const reset = () => {
    if (!checkpoint) return;
    const before = {
      x: checkpoint.x,
      y: checkpoint.y,
      width: checkpoint.width,
      height: checkpoint.height,
      manuallySized: checkpoint.manuallySized,
    };
    void run('reset', async () => {
      await resetCanvasSize({
        checkpointId: checkpoint._id,
        canvasRootPageId: checkpoint.rootPageId,
      });
      // Red je bio ručno dimenzionisan (inače je dugme ugašeno), pa je inverz čist
      // `saveCanvasPlacement` sa starim dimenzijama.
      pushUndo({
        label: 'Vraćena je podrazumevana veličina koraka.',
        action: { kind: 'checkpointResize', checkpointId: checkpoint._id,
          canvasRootPageId: checkpoint.rootPageId, ...before },
      });
    });
  };

  const breakEdge = (edge: NodeEdgeRow) => {
    if (busy !== null || !checkpoint) return;
    haptics.warning();
    Alert.alert('Prekinuti vezu?', `Veza sa „${edge.otherTitle}" se uklanja sa kanvasa.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Prekini',
        style: 'destructive',
        onPress: async () => {
          setBusy(edge._id);
          try {
            if (!edge.endpoints) throw new Error('Veza koraka nema podatke o krajevima.');
            await disconnectEdge({
              startupId: checkpoint.startupId,
              areaId: checkpoint.areaId,
              rootPageId: checkpoint.rootPageId,
              edgeId: edge._id as Id<'taskCheckpointCanvasEdges'>,
            });
            pushUndo({
              label: 'Veza koraka je uklonjena.',
              action: {
                kind: 'checkpointEdgeDisconnect',
                startupId: checkpoint.startupId,
                areaId: checkpoint.areaId,
                rootPageId: checkpoint.rootPageId,
                source: edge.endpoints.source,
                target: edge.endpoints.target,
              },
            });
            haptics.success();
            onClose();
          } catch (error) {
            haptics.error();
            Alert.alert('Greška', accessErrorMessage(error, 'Veza nije prekinuta.'));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const requestEdgeDeletion = (edge: NodeEdgeRow) => {
    if (busy !== null) return;
    setBusy(edge._id);
    haptics.tap();
    void requestDeletion({
      target: { kind: 'task_checkpoint_edge', id: edge._id as Id<'taskCheckpointCanvasEdges'> },
    })
      .then(() => {
        haptics.success();
        onClose();
        // Prikaz glasanja već postoji na ekranu „Odobrenja" („Veza checkpointa").
        Alert.alert('Poslato', 'Glasanje o brisanju veze je pokrenuto.');
      })
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Zahtev nije poslat.'));
      })
      .finally(() => setBusy(null));
  };

  const isCompact =
    checkpoint !== null &&
    checkpoint.manuallySized &&
    checkpoint.width === PRESETS.compact.width &&
    checkpoint.height === PRESETS.compact.height;
  const isExpanded =
    checkpoint !== null &&
    checkpoint.manuallySized &&
    checkpoint.width === PRESETS.expanded.width &&
    checkpoint.height === PRESETS.expanded.height;

  const options: SizeOption[] = [
    {
      key: 'compact',
      title: 'Kompaktno',
      subtitle: `${PRESETS.compact.width} × ${PRESETS.compact.height}`,
      icon: <Minimize2 size={20} color={colors.mutedForeground} />,
      disabled: isCompact,
      onPress: () => applyPreset('compact', PRESETS.compact),
    },
    {
      key: 'expanded',
      title: 'Prošireno',
      subtitle: `${PRESETS.expanded.width} × ${PRESETS.expanded.height}`,
      icon: <Maximize2 size={20} color={colors.mutedForeground} />,
      disabled: isExpanded,
      onPress: () => applyPreset('expanded', PRESETS.expanded),
    },
    {
      key: 'reset',
      title: 'Vrati podrazumevanu veličinu',
      titleNumberOfLines: 2,
      subtitle: 'Veličina se izvodi iz teksta koraka',
      icon: <RotateCcw size={20} color={colors.mutedForeground} />,
      disabled: checkpoint === null || !checkpoint.manuallySized,
      onPress: reset,
    },
  ];

  return (
    <Sheet visible={checkpoint !== null} onClose={onClose} style={styles.sheet}>
      {checkpoint ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heading, { color: colors.foreground }]}>
            {checkpoint.text.trim() || 'Korak'}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {`Korak ${checkpoint.ordinal} · ${checkpoint.completed ? 'Završen' : 'Otvoren'} · ` +
              `Trenutno: ${checkpoint.width} × ${checkpoint.height}`}
          </Text>

          <NodeEdgesSection
            edges={checkpoint.edges}
            canConnect={checkpoint.canMove && checkpoint.nodeCount >= 2}
            connectSubtitle={
              !checkpoint.canMove
                ? 'Vezu možete praviti samo od ili ka svojoj stavci.'
                : checkpoint.nodeCount < 2
                  ? 'Na kanvasu nema druge stavke.'
                  : 'Zatim tapni korak ili karticu sa kojom se povezuje'
            }
            emptyNote="Nema veza sa ovog koraka."
            busy={busy}
            onConnect={() => onStartConnect(checkpoint)}
            onBreak={breakEdge}
            onRequestDeletion={requestEdgeDeletion}
          />

          <NodeSizeSection
            canResize={checkpoint.canMove}
            deniedNote="Veličinu i položaj koraka menja autor zadatka."
            options={options}
            busy={busy}
            hint={
              'Sam tekst koraka, kvačica i lančanje menjaju se na detalju zadatka — ' +
              'kanvas služi za razmeštaj i veze.'
            }
          />
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 12,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    paddingBottom: 4,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 8,
  },
  meta: {
    ...text.meta,
    paddingHorizontal: 8,
    marginTop: 2,
  },
});
