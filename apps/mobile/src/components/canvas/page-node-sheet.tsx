import { useMutation } from 'convex/react';
import { ListChecks } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { NodeEdgesSection, type NodeEdgeRow } from '@/components/canvas/node-edges-section';
import { PageSizeSection, type PageSizeTarget } from '@/components/canvas/page-size-section';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';

/** Jedan sused kartice — deljeni oblik sa sheet-om koraka (K4). */
export type PageNodeEdge = NodeEdgeRow;

/**
 * Kartica nad kojom se otvaraju akcije. Nadgradnja `PageSizeTarget`-a iz K2 — sve
 * stiže uz `node:actions` / `selection` poruku (`PageNodeDetail` u embedu), pa native
 * ni za listu veza ne radi dodatni upit.
 */
export type PageNodeTarget = PageSizeTarget & {
  /** Diskriminator iz embeda — native po njemu bira sheet, ne pogađa oblik (K4). */
  nodeKind?: 'page';
  kind?: string;
  canConnect: boolean;
  /** Kartice + prikazani koraci; ispod 2 nema koga da se poveže. */
  nodeCount: number;
  /** Broj koraka zadatka — puni red „Prikaži korake (N)". */
  checkpointTotal?: number;
  edges: PageNodeEdge[];
};

/**
 * Sheet „Akcije kartice" na kanvasu oblasti/stranice (K3). Otvara ga dugi pritisak na
 * karticu u režimu „Uredi raspored" (`node:actions`) ili četvrta ikonica rail-a — dva
 * puta do iste radnje, jer je `contextmenu` u WKWebView-u nepouzdan.
 *
 * Prikaz veza i veličine živi u deljenim sekcijama (`node-edges-section.tsx`,
 * `node-size-section.tsx`) koje koristi i sheet checkpoint oblačića; ovde su samo
 * mutacije kartice i „Prikaži korake" (K4).
 *
 * Sheet se posle svake uspešne izmene ZATVARA: `UndoBar` živi na ekranu kanvasa, a
 * `Sheet` je `Modal` — traka iza otvorenog sheet-a se ne bi ni videla, pa bi njenih
 * 8 s isteklo neiskorišćeno. Zatvaranje je uslov da „Poništi" uopšte postoji.
 */
export function PageNodeSheet({
  page,
  checkpointsExpanded = false,
  onClose,
  onStartConnect,
  onApplied,
  onToggleCheckpoints,
}: {
  page: PageNodeTarget | null;
  /** Da li ova kartica trenutno pokazuje svoje korake na platnu (K4). */
  checkpointsExpanded?: boolean;
  onClose: () => void;
  /** „Poveži sa…" — roditelj zatvara sheet i ulazi u biranje cilja. */
  onStartConnect: (page: PageNodeTarget) => void;
  /** Nova veličina posle uspešne izmene — pozivalac osvežava svoj `selectedNode`. */
  onApplied?: (width: number, height: number) => void;
  /** „Prikaži korake" / „Sakrij korake" — `null` sakriva (K4). */
  onToggleCheckpoints?: (taskPageId: Id<'pages'> | null) => void;
}) {
  const colors = useThemeColors();
  const disconnectPages = useMutation(api.areasV2.disconnectPages);
  const disconnectCheckpointEdge = useMutation(api.taskCheckpointCanvasEdges.disconnect);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  // Jedna brava za CEO sheet (veličina + veze): dve mutacije nad istom karticom se
  // ne smeju okinuti jedna preko druge. Vrednost je ključ reda koji je u toku.
  const [busy, setBusy] = useState<string | null>(null);

  const breakEdge = (edge: PageNodeEdge) => {
    if (busy !== null || !page) return;
    haptics.warning();
    Alert.alert('Prekinuti vezu?', `Veza sa „${edge.otherTitle}" se uklanja sa kanvasa.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Prekini',
        style: 'destructive',
        onPress: async () => {
          setBusy(edge._id);
          try {
            if (edge.kind === 'checkpoint') {
              // Veza kartica ↔ korak živi u drugoj tabeli (K4). „Poništi" nosi
              // endpointe, jer `connect` arhiviranu ivicu NE oživljava nego pravi novu.
              if (!edge.endpoints) throw new Error('Veza koraka nema podatke o krajevima.');
              await disconnectCheckpointEdge({
                startupId: page.startupId,
                areaId: page.areaId,
                rootPageId: page.rootPageId,
                edgeId: edge._id as Id<'taskCheckpointCanvasEdges'>,
              });
              pushUndo({
                label: 'Veza koraka je uklonjena.',
                action: {
                  kind: 'checkpointEdgeDisconnect',
                  startupId: page.startupId,
                  areaId: page.areaId,
                  rootPageId: page.rootPageId,
                  source: edge.endpoints.source,
                  target: edge.endpoints.target,
                },
              });
            } else {
              await disconnectPages({
                startupId: page.startupId,
                areaId: page.areaId,
                rootPageId: page.rootPageId,
                edgeId: edge._id as Id<'pageCanvasEdgesV2'>,
              });
              // `connectPages` NE oživljava arhiviranu ivicu, pa „Poništi" pravi novu —
              // sa istim parom i istim nazivom.
              pushUndo({
                label: 'Veza je uklonjena.',
                action: {
                  kind: 'pageEdgeDisconnect',
                  startupId: page.startupId,
                  areaId: page.areaId,
                  rootPageId: page.rootPageId,
                  sourcePageId: page._id,
                  targetPageId: edge.otherId as Id<'pages'>,
                  ...(edge.label ? { label: edge.label } : {}),
                },
              });
            }
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

  const requestEdgeDeletion = (edge: PageNodeEdge) => {
    if (busy !== null) return;
    setBusy(edge._id);
    haptics.tap();
    void requestDeletion({
      target:
        edge.kind === 'checkpoint'
          ? { kind: 'task_checkpoint_edge', id: edge._id as Id<'taskCheckpointCanvasEdges'> }
          : { kind: 'page_edge', id: edge._id as Id<'pageCanvasEdgesV2'> },
    })
      .then(() => {
        haptics.success();
        onClose();
        // Prikaz glasanja već postoji na ekranu „Odobrenja" („Veza stranica" /
        // „Veza checkpointa").
        Alert.alert('Poslato', 'Glasanje o brisanju veze je pokrenuto.');
      })
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Zahtev nije poslat.'));
      })
      .finally(() => setBusy(null));
  };

  const checkpointTotal = page?.checkpointTotal ?? 0;
  const showCheckpointRow = page?.kind === 'task' && onToggleCheckpoints !== undefined;

  return (
    <Sheet visible={page !== null} onClose={onClose} style={styles.sheet}>
      {page ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heading, { color: colors.foreground }]}>
            {page.title || 'Stranica bez naslova'}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {`Trenutno: ${page.width} × ${page.height}`}
          </Text>

          {showCheckpointRow ? (
            <Row
              title={checkpointsExpanded ? 'Sakrij korake' : `Prikaži korake (${checkpointTotal})`}
              subtitle={
                checkpointTotal === 0
                  ? 'Zadatak nema korake.'
                  : 'Koraci se na kanvasu razmeštaju i povezuju'
              }
              onPress={() => {
                // Sheet se sklanja: koraci doskaču u orbitu oko kartice, a modal bi ih
                // pokrio. Prikaz je čist pogled — ne piše ništa i nema „Poništi".
                haptics.tap();
                onToggleCheckpoints(checkpointsExpanded ? null : page._id);
                onClose();
              }}
              disabled={busy !== null || (checkpointTotal === 0 && !checkpointsExpanded)}
              showChevron={false}
              style={styles.row}
              icon={<ListChecks size={20} color={colors.mutedForeground} />}
            />
          ) : null}

          <NodeEdgesSection
            edges={page.edges}
            canConnect={page.canConnect && page.nodeCount >= 2}
            connectSubtitle={
              !page.canConnect
                ? 'Vezu možete praviti samo od ili ka svojoj kartici.'
                : page.nodeCount < 2
                  ? 'Na kanvasu nema druge stavke.'
                  : 'Zatim tapni karticu ili korak sa kojim se povezuje'
            }
            emptyNote="Nema veza sa ove kartice."
            busy={busy}
            onConnect={() => onStartConnect(page)}
            onBreak={breakEdge}
            onRequestDeletion={requestEdgeDeletion}
          />

          <PageSizeSection
            page={page}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
            onApplied={onApplied}
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
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
    marginTop: 8,
  },
});
