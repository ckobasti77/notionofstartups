import { useMutation } from 'convex/react';
import { Lightbulb, RotateCcw } from 'lucide-react-native';
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
 * Ideja nad kojom se otvaraju akcije na kanvasu. Sve stiže uz `node:actions` /
 * `selection` poruku (`IdeaNodeDetail` u embedu) — native ne radi nijedan upit.
 *
 * `x`/`y` su STORED (relativne) koordinate: ugnježdena ideja se u bazi čuva u odnosu
 * na roditelja (`ZA-POPRAVKU.md` §9), a `ideas.updateLayout` prima baš njih.
 */
export type IdeaNodeTarget = {
  nodeKind: 'idea';
  _id: Id<'ideaNodes'>;
  title: string | null;
  text: string;
  startupId: Id<'startups'>;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ima li ideja RUČNU veličinu — od toga zavisi tačan inverz „Poništi". */
  manuallySized: boolean;
  canResize: boolean;
  canConnect: boolean;
  nodeCount: number;
  edges: NodeEdgeRow[];
};

/**
 * Sheet „Akcije ideje" na kanvasu ideja (K5) — isti skelet i iste deljene sekcije
 * kao `PageNodeSheet`/`CheckpointNodeSheet`, druge mutacije.
 *
 * Šta ovde NAMERNO NEMA: tekst, glasanje, doprinose, konverziju i brisanje. To je
 * suština ideje i već je native na njenom detalju (`idea-node-sheet.tsx` i ekran
 * `/ideja/[id]`) — kanvas dodaje samo razmeštaj, veličinu i veze.
 *
 * Veličina ide PRESETIMA, ne samo ugaonim ručkama: ručke postoje na platnu (K2
 * mehanika važi i ovde), ali se ispod zuma 0.5 ne crtaju, pa preseti moraju da
 * postoje kao put koji ne zavisi od zuma. Isti preseti kao web
 * (`workspace-item-dialog.tsx` `ITEM_SIZE_DIMENSIONS`, ogledani u `lib/thought-layout.ts`).
 *
 * Sheet se posle svake uspešne izmene ZATVARA — traka „Poništi" je ispod modala
 * nevidljiva (isto pravilo kao u K3/K4).
 */
export function IdeaNodeActionsSheet({
  idea,
  onClose,
  onStartConnect,
  onApplied,
}: {
  idea: IdeaNodeTarget | null;
  onClose: () => void;
  /** „Poveži sa…" — roditelj zatvara sheet i ulazi u biranje cilja. */
  onStartConnect: (idea: IdeaNodeTarget) => void;
  /** Nova veličina posle uspešne izmene — pozivalac osvežava svoj lokalni detalj. */
  onApplied?: (width: number, height: number) => void;
}) {
  const colors = useThemeColors();
  const updateLayout = useMutation(api.ideas.updateLayout);
  const resetLayoutSize = useMutation(api.ideas.resetLayoutSize);
  const disconnect = useMutation(api.ideas.disconnect);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  /** Jedna brava za CEO sheet (veličina + veze) — kao u sheet-u kartice. */
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
      Alert.alert('Greška', accessErrorMessage(error, 'Veličina ideje nije promenjena.'));
    } finally {
      setBusy(null);
    }
  };

  /** Stanje od PRE radnje — „Poništi" ga ne čita iz baze (baza već drži novo). */
  const snapshot = (target: IdeaNodeTarget) => ({
    startupId: target.startupId,
    ideaId: target._id,
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    manuallySized: target.manuallySized,
  });

  const applyPreset = (key: string, size: { width: number; height: number }) => {
    if (!idea) return;
    const before = snapshot(idea);
    void run(key, async () => {
      // `updateLayout` traži i x/y — pozicija se ne menja, prosleđuju se postojeće
      // (stored) koordinate čvora, isto kao na webu.
      await updateLayout({
        startupId: idea.startupId,
        ideaId: idea._id,
        x: idea.x,
        y: idea.y,
        width: size.width,
        height: size.height,
      });
      pushUndo({
        label: `Veličina ideje: ${size.width} × ${size.height}.`,
        action: { kind: 'ideaResize', ...before },
      });
      onApplied?.(size.width, size.height);
    });
  };

  const reset = () => {
    if (!idea) return;
    const before = snapshot(idea);
    void run('reset', async () => {
      await resetLayoutSize({ startupId: idea.startupId, ideaId: idea._id });
      // Kartica je bila ručno dimenzionisana (inače je red ugašen), pa je inverz
      // čist `updateLayout` sa starim dimenzijama.
      pushUndo({
        label: 'Vraćena je automatska veličina ideje.',
        action: { kind: 'ideaResize', ...before },
      });
    });
  };

  const breakEdge = (edge: NodeEdgeRow) => {
    if (busy !== null || !idea) return;
    haptics.warning();
    Alert.alert('Prekinuti vezu?', `Veza sa „${edge.otherTitle}" se uklanja sa kanvasa.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Prekini',
        style: 'destructive',
        onPress: async () => {
          setBusy(edge._id);
          try {
            await disconnect({
              startupId: idea.startupId,
              edgeId: edge._id as Id<'ideaEdges'>,
            });
            // `ideas.connect` na postojećem paru OŽIVLJAVA arhiviranu vezu i čuva
            // joj label, pa je par tačan inverz (postojeći član `ideaEdge`).
            pushUndo({
              label: 'Veza ideja je uklonjena.',
              action: {
                kind: 'ideaEdge',
                startupId: idea.startupId,
                nodeAId: idea._id,
                nodeBId: edge.otherId as Id<'ideaNodes'>,
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
    void requestDeletion({ target: { kind: 'idea_edge', id: edge._id as Id<'ideaEdges'> } })
      .then(() => {
        haptics.success();
        onClose();
        Alert.alert('Poslato', 'Glasanje o brisanju veze je pokrenuto.');
      })
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Zahtev nije poslat.'));
      })
      .finally(() => setBusy(null));
  };

  const activePreset = idea?.manuallySized
    ? activeThoughtSizePreset(idea.width)
    : null;

  const options: SizeOption[] = [
    ...THOUGHT_SIZE_PRESETS.map((preset) => {
      const dims = THOUGHT_SIZE_DIMENSIONS[preset];
      return {
        key: preset,
        title: THOUGHT_SIZE_LABEL[preset],
        subtitle: `${dims.width} × ${dims.height}`,
        icon: <Lightbulb size={20} color={colors.mutedForeground} />,
        disabled: activePreset === preset,
        onPress: () => applyPreset(preset, dims),
      };
    }),
    {
      key: 'reset',
      title: 'Automatska veličina',
      titleNumberOfLines: 2,
      subtitle: 'Kartica raste sa sadržajem',
      icon: <RotateCcw size={20} color={colors.mutedForeground} />,
      disabled: idea === null || !idea.manuallySized,
      onPress: reset,
    },
  ];

  return (
    <Sheet visible={idea !== null} onClose={onClose} style={styles.sheet}>
      {idea ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heading, { color: colors.foreground }]}>
            {(idea.title ?? idea.text).trim() || 'Ideja'}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {`Trenutno: ${idea.width} × ${idea.height}`}
          </Text>

          <NodeEdgesSection
            edges={idea.edges}
            canConnect={idea.canConnect && idea.nodeCount >= 2}
            connectSubtitle={
              !idea.canConnect
                ? 'Vezu možete praviti samo sa svoje kartice.'
                : idea.nodeCount < 2
                  ? 'Na kanvasu nema druge ideje.'
                  : 'Zatim tapni ideju sa kojom se povezuje'
            }
            emptyNote="Nema veza sa ove ideje."
            busy={busy}
            onConnect={() => onStartConnect(idea)}
            onBreak={breakEdge}
            onRequestDeletion={requestEdgeDeletion}
          />

          <NodeSizeSection
            canResize={idea.canResize}
            deniedNote="Veličinu kartice menja njen autor."
            options={options}
            busy={busy}
            hint={
              'Tekst, glasanje i brisanje ideje su na njenom detalju — kanvas služi za ' +
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
