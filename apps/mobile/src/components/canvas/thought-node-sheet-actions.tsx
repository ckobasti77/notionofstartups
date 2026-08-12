import { useMutation } from 'convex/react';
import { Brain, RotateCcw } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { NodeEdgesSection, type NodeEdgeRow } from '@/components/canvas/node-edges-section';
import { NodeSizeSection, type SizeOption } from '@/components/canvas/node-size-section';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import {
  activeThoughtSizePreset,
  THOUGHT_SIZE_DIMENSIONS,
  THOUGHT_SIZE_LABEL,
  THOUGHT_SIZE_PRESETS,
} from '@/lib/thought-layout';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

/**
 * Misao nad kojom se otvaraju akcije na kanvasu. Sve stiže uz `node:actions` /
 * `selection` poruku (`ThoughtNodeDetail` u embedu) — native ne radi nijedan upit.
 *
 * `x`/`y` su STORED (relativne) koordinate — vidi `IdeaNodeTarget`.
 */
export type ThoughtNodeTarget = {
  nodeKind: 'thought';
  _id: Id<'thoughtNodes'>;
  title: string | null;
  text: string;
  startupId: Id<'startups'>;
  x: number;
  y: number;
  width: number;
  height: number;
  manuallySized: boolean;
  canResize: boolean;
  canConnect: boolean;
  nodeCount: number;
  edges: NodeEdgeRow[];
};

/**
 * Sheet „Akcije misli" na kanvasu misli (K5) — blizanac `IdeaNodeActionsSheet`.
 *
 * Razlika u dozvolama je stvarna, ne kozmetička: misli su PRIVATNE po vlasniku
 * (`thoughts.listNodes` na serveru filtrira `ownerProfileId`), pa je sve na ovom
 * platnu tvoje — nema tuđe kartice, nema glasanja o brisanju veze, veza se raskida
 * direktno.
 */
export function ThoughtNodeActionsSheet({
  thought,
  onClose,
  onStartConnect,
  onApplied,
}: {
  thought: ThoughtNodeTarget | null;
  onClose: () => void;
  onStartConnect: (thought: ThoughtNodeTarget) => void;
  onApplied?: (width: number, height: number) => void;
}) {
  const colors = useThemeColors();
  const updateNodeLayout = useMutation(api.thoughts.updateNodeLayout);
  const resetNodeLayoutSize = useMutation(api.thoughts.resetNodeLayoutSize);
  const archiveEdges = useMutation(api.thoughts.archiveEdges);
  const [busy, setBusy] = useState<string | null>(null);

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
      Alert.alert('Greška', accessErrorMessage(error, 'Veličina misli nije promenjena.'));
    } finally {
      setBusy(null);
    }
  };

  const snapshot = (target: ThoughtNodeTarget) => ({
    nodeId: target._id,
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    manuallySized: target.manuallySized,
  });

  const applyPreset = (key: string, size: { width: number; height: number }) => {
    if (!thought) return;
    const before = snapshot(thought);
    void run(key, async () => {
      // `updateNodeLayout` traži i x/y — pozicija se ne menja, prosleđuju se
      // postojeće (stored) koordinate čvora, isto kao na webu.
      await updateNodeLayout({
        nodeId: thought._id,
        x: thought.x,
        y: thought.y,
        width: size.width,
        height: size.height,
      });
      pushUndo({
        label: `Veličina misli: ${size.width} × ${size.height}.`,
        action: { kind: 'thoughtResize', ...before },
      });
      onApplied?.(size.width, size.height);
    });
  };

  const reset = () => {
    if (!thought) return;
    const before = snapshot(thought);
    void run('reset', async () => {
      await resetNodeLayoutSize({ nodeId: thought._id });
      pushUndo({
        label: 'Vraćena je automatska veličina misli.',
        action: { kind: 'thoughtResize', ...before },
      });
    });
  };

  const breakEdge = (edge: NodeEdgeRow) => {
    if (busy !== null || !thought) return;
    haptics.warning();
    Alert.alert('Prekinuti vezu?', `Veza sa „${edge.otherTitle}" se uklanja sa kanvasa.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Prekini',
        style: 'destructive',
        onPress: async () => {
          setBusy(edge._id);
          try {
            await archiveEdges({ edgeIds: [edge._id as Id<'thoughtEdges'>] });
            // Inverz arhiviranja je `restoreEdges` — postojeći član `thoughts`.
            pushUndo({
              label: 'Veza misli je uklonjena.',
              action: {
                kind: 'thoughts',
                nodeIds: [],
                edgeIds: [edge._id as Id<'thoughtEdges'>],
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

  const activePreset = thought?.manuallySized
    ? activeThoughtSizePreset(thought.width)
    : null;

  const options: SizeOption[] = [
    ...THOUGHT_SIZE_PRESETS.map((preset) => {
      const dims = THOUGHT_SIZE_DIMENSIONS[preset];
      return {
        key: preset,
        title: THOUGHT_SIZE_LABEL[preset],
        subtitle: `${dims.width} × ${dims.height}`,
        icon: <Brain size={20} color={colors.mutedForeground} />,
        disabled: activePreset === preset,
        onPress: () => applyPreset(preset, dims),
      };
    }),
    {
      key: 'reset',
      title: 'Automatska veličina',
      titleNumberOfLines: 2,
      subtitle: 'Oblačić raste sa sadržajem',
      icon: <RotateCcw size={20} color={colors.mutedForeground} />,
      disabled: thought === null || !thought.manuallySized,
      onPress: reset,
    },
  ];

  return (
    <Sheet visible={thought !== null} onClose={onClose} style={styles.sheet}>
      {thought ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heading, { color: colors.foreground }]}>
            {(thought.title ?? thought.text).trim() || 'Misao'}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {`Trenutno: ${thought.width} × ${thought.height}`}
          </Text>

          <NodeEdgesSection
            edges={thought.edges}
            canConnect={thought.canConnect && thought.nodeCount >= 2}
            connectSubtitle={
              thought.nodeCount < 2
                ? 'Na kanvasu nema druge misli.'
                : 'Zatim tapni misao sa kojom se povezuje'
            }
            emptyNote="Nema veza sa ove misli."
            busy={busy}
            onConnect={() => onStartConnect(thought)}
            onBreak={breakEdge}
            // Misli su privatne — tuđe misli na platnu nema, pa ni glasanja.
            onRequestDeletion={() => undefined}
          />

          <NodeSizeSection
            canResize={thought.canResize}
            deniedNote="Veličinu oblačića menja njegov vlasnik."
            options={options}
            busy={busy}
            hint={
              'Tekst, boja i konverzija u ideju su na detalju misli — kanvas služi za ' +
              'razmeštaj, veličinu i veze.'
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
