import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Brain, Crown, LayoutGrid, Plus, TriangleAlert, Wand2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThoughtCreateSheet } from '@/components/canvas/thought-create-sheet';
import { EmptyState } from '@/components/empty-state';
import { ThoughtActionsSheet } from '@/components/misli/thought-actions-sheet';
import {
  ThoughtConversionSheet,
  type ThoughtConversionNode,
} from '@/components/misli/thought-conversion-sheet';
import { ThoughtUndoBar } from '@/components/misli/thought-undo-bar';
import { FAB } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { THOUGHT_SWATCH } from '@/lib/thought-colors';
import { misaoWord, thoughtDisplayTitle, tidyGridPosition, vezaWord } from '@/lib/thought-layout';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text, type ColorTokens } from '@/theme/tokens';

const PAGE_SIZE = 50;
/** Backend `MAX_BULK_ITEMS` — `moveNodes` prima najviše 50 poteza. */
const MAX_BULK = 50;
/**
 * Pauza između zatvaranja jednog i otvaranja drugog sheet-a (akcije → konverzija).
 * Dva istovremena RN `Modal`-a na Androidu umeju da progutaju `onRequestClose`
 * (vidi `page-actions-sheet.tsx`), pa se drugi otvara tek kad izlazna animacija
 * prvog (~200ms) sigurno prođe.
 */
const SHEET_HANDOFF_MS = 320;

/**
 * Ekran „Misli" — NATIVE LISTA kao primarni prikaz (PARITET A1): na telefonu je
 * lista upotrebljivija od grafa i radi bez WebView-a. Graf ostaje dostupan iz
 * zaglavlja (isti dualitet kao `ideje.tsx`). Misli su privatne po vlasniku;
 * `listNodes`/`listEdges` su PAGINIRANI (za razliku od `ideas.list`), pa lista ide
 * kroz `usePaginatedQuery` + `FlatList` (obrazac `aktivnost.tsx`).
 *
 * Veze se automatski dovlače do kraja (kao web embed) — služe brojaču veza po
 * misli, a bez celog skupa bi brojevi lagali.
 */
export default function MisliScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const nodesQuery = usePaginatedQuery(
    api.thoughts.listNodes,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
    { initialNumItems: PAGE_SIZE },
  );
  const {
    results: edgeResults,
    status: edgesStatus,
    loadMore: loadMoreEdges,
  } = usePaginatedQuery(
    api.thoughts.listEdges,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
    { initialNumItems: 100 },
  );
  // Viewport kanvasa — „Sredi raspored" čuva postojeći zoom (može biti `null`:
  // canvas dokument nastaje tek uz prvi čvor/viewport, `getCanvas` NIJE getOrCreate).
  const canvas = useQuery(
    api.thoughts.getCanvas,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const moveNodes = useMutation(api.thoughts.moveNodes);
  const saveViewport = useMutation(api.thoughts.saveViewport);

  const [createOpen, setCreateOpen] = useState(false);
  const [actionNode, setActionNode] = useState<Doc<'thoughtNodes'> | null>(null);
  const [conversionNodes, setConversionNodes] = useState<ThoughtConversionNode[] | null>(null);
  const [tidyBusy, setTidyBusy] = useState(false);

  useEffect(() => {
    if (edgesStatus === 'CanLoadMore') loadMoreEdges(200);
  }, [edgesStatus, loadMoreEdges]);

  const edgeCountByNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const edge of edgeResults) {
      map.set(edge.nodeAId, (map.get(edge.nodeAId) ?? 0) + 1);
      map.set(edge.nodeBId, (map.get(edge.nodeBId) ?? 0) + 1);
    }
    return map;
  }, [edgeResults]);

  const openCanvas = () => {
    if (!activeStartupId) return;
    haptics.tap();
    router.push({
      pathname: '/canvas/[kind]/[id]',
      params: { kind: 'thoughts', id: activeStartupId },
    });
  };

  /**
   * „Sredi raspored": misli kreirane sa telefona padaju nasumično oko početka
   * (`thought-create-sheet`, SPREAD) i preklapaju se — ovo je mobilna zamena za
   * drag raspoređivanje. Samo TOP-LEVEL misli: ugnježdene imaju RELATIVNE
   * koordinate i putuju sa roditeljem.
   */
  const requestTidy = () => {
    if (!activeStartupId || tidyBusy) return;
    const topLevel = nodesQuery.results.filter((node) => node.parentThoughtId === undefined);
    if (topLevel.length === 0) {
      haptics.warning();
      Alert.alert('Nema šta da se sredi', 'Sve učitane misli su ugnježdene u druge misli.');
      return;
    }
    const targets = topLevel.slice(0, MAX_BULK);
    // Menja ručni raspored korisnika — upozorenje pre, ne posle.
    haptics.warning();
    Alert.alert(
      'Srediti raspored?',
      `${targets.length} ${misaoWord(targets.length)} (bez ugnježdenih) se raspoređuje u urednu mrežu na kanvasu. Ručni raspored tih misli se gubi.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Sredi',
          onPress: () => void runTidy(targets, topLevel.length > targets.length),
        },
      ],
    );
  };

  const runTidy = async (targets: Doc<'thoughtNodes'>[], truncated: boolean) => {
    if (!activeStartupId) return;
    setTidyBusy(true);
    haptics.tap();
    try {
      await moveNodes({
        moves: targets.map((node, index) => ({
          nodeId: node._id,
          ...tidyGridPosition(index, targets.length),
        })),
      });
      // Mreža je u pozitivnom kvadrantu, pa viewport (0,0) — svetska tačka (0,0)
      // u gornjem levom uglu — prikazuje celu mrežu. Zoom ostaje korisnikov.
      await saveViewport({ startupId: activeStartupId, x: 0, y: 0, zoom: canvas?.zoom ?? 1 });
      haptics.success();
      Alert.alert(
        'Raspored je sređen',
        truncated
          ? `Raspoređeno je prvih ${targets.length} misli; ostale su ostale gde su bile. Već otvoren kanvas prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.`
          : 'Misli su raspoređene u mrežu. Već otvoren kanvas prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.',
      );
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Raspored nije sređen.'));
    } finally {
      setTidyBusy(false);
    }
  };

  const loadingFirst = activeStartupId === null || nodesQuery.status === 'LoadingFirstPage';
  const count = nodesQuery.results.length;
  const hasMore = nodesQuery.status === 'CanLoadMore' || nodesQuery.status === 'LoadingMore';
  const refreshControl = useListRefresh();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Misli"
        eyebrow={count > 0 ? `${count}${hasMore ? '+' : ''} ${misaoWord(count)}` : undefined}
        onBack={() => router.back()}
        actions={
          activeStartupId ? (
            <>
              {count > 1 ? (
                <IconButton
                  accessibilityLabel="Sredi raspored misli u mrežu na kanvasu"
                  disabled={tidyBusy}
                  onPress={requestTidy}>
                  {tidyBusy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Wand2 size={22} color={colors.foreground} />
                  )}
                </IconButton>
              ) : null}
              <IconButton accessibilityLabel="Canvas prikaz misli" onPress={openCanvas}>
                <LayoutGrid size={22} color={colors.foreground} />
              </IconButton>
            </>
          ) : undefined
        }
      />

      {activeStartupId === null ? (
        <EmptyState
          icon={<Brain size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Misli se vode po startupu. Izaberi ga iz zaglavlja."
        />
      ) : !loadingFirst && count === 0 ? (
        <EmptyState
          icon={<Brain size={40} color={colors.mutedForeground} />}
          title="Još nema misli"
          description="Misli su tvoj privatni prostor za razmišljanje. Kad sazru, šalju se timu u Ideje."
          actionLabel="Nova misao"
          onAction={() => {
            haptics.tap();
            setCreateOpen(true);
          }}
        />
      ) : (
        <LoadingSwap loading={loadingFirst} skeleton={<MisliSkeleton />}>
          {loadingFirst ? null : (
            <FlatList
              data={nodesQuery.results}
              keyExtractor={(item) => item._id}
              renderItem={({ item, index }) => (
                <StaggerItem index={index}>
                  <ThoughtRow
                    node={item}
                    edgeCount={edgeCountByNode.get(item._id) ?? 0}
                    colors={colors}
                    onPress={() => {
                      haptics.tap();
                      router.push({ pathname: '/misao/[id]', params: { id: item._id } });
                    }}
                    onLongPress={() => {
                      haptics.select();
                      setActionNode(item);
                    }}
                  />
                </StaggerItem>
              )}
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (nodesQuery.status === 'CanLoadMore') nodesQuery.loadMore(PAGE_SIZE);
              }}
              ListFooterComponent={
                nodesQuery.status === 'LoadingMore' ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : null
              }
              // Donji padding čisti i FAB (do insets+72) i traku „Poništi" iznad
              // njega (do ~insets+144) — poslednji red ne sme ni pod jedno.
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 152 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
            />
          )}
        </LoadingSwap>
      )}

      {activeStartupId !== null ? (
        <>
          <FAB
            icon={Plus}
            accessibilityLabel="Nova misao"
            onPress={() => {
              haptics.tap();
              setCreateOpen(true);
            }}
            style={{ bottom: insets.bottom + 16 }}
          />
          <ThoughtCreateSheet
            open={createOpen}
            startupId={activeStartupId}
            onClose={() => setCreateOpen(false)}
          />
          <ThoughtActionsSheet
            open={actionNode !== null}
            node={actionNode}
            startupId={activeStartupId}
            onClose={() => setActionNode(null)}
            onConvert={(nodes) => {
              setActionNode(null);
              setTimeout(() => setConversionNodes(nodes), SHEET_HANDOFF_MS);
            }}
          />
          <ThoughtConversionSheet
            open={conversionNodes !== null}
            startupId={activeStartupId}
            nodes={conversionNodes ?? []}
            onClose={() => setConversionNodes(null)}
          />
          {/* Iznad FAB-a (56 + razmak) da „Poništi" ne legne pod dugme. */}
          <ThoughtUndoBar bottomOffset={72} />
        </>
      ) : null}
    </View>
  );
}

function ThoughtRow({
  node,
  edgeCount,
  colors,
  onPress,
  onLongPress,
}: {
  node: Doc<'thoughtNodes'>;
  edgeCount: number;
  colors: ColorTokens;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const title = thoughtDisplayTitle(node);
  // Kad naslova nema, prvi red teksta je već u naslovu — podnaslov bi ga ponovio.
  const preview = node.title?.trim() ? node.text.trim() || undefined : undefined;
  const label = [
    title,
    edgeCount > 0 ? `${edgeCount} ${vezaWord(edgeCount)}` : null,
    node.isParent ? 'glavna misao' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Row
      style={styles.row}
      icon={
        <View
          style={[styles.colorDot, { backgroundColor: THOUGHT_SWATCH[node.color] }]}
          accessibilityElementsHidden
        />
      }
      title={title}
      titleNumberOfLines={preview ? 1 : 2}
      subtitle={preview}
      value={
        node.isParent || edgeCount > 0 ? (
          <View style={styles.valueWrap}>
            {node.isParent ? <Crown size={16} color={colors.warning} /> : null}
            {edgeCount > 0 ? (
              <Text style={[styles.valueText, { color: colors.mutedForeground }]}>
                {edgeCount} {vezaWord(edgeCount)}
              </Text>
            ) : null}
          </View>
        ) : undefined
      }
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={label}
      accessibilityHint="Dugi pritisak otvara akcije misli."
    />
  );
}

/** Oblik `ThoughtRow`: tačka boje + dva reda teksta + brojač veza desno. */
function MisliSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje misli">
      <SkeletonList
        count={6}
        gap={12}
        item={(index) => (
          <View style={styles.skeletonRow}>
            <Skeleton width={14} height={14} borderRadius={radius.pill} />
            <View style={styles.skeletonBody}>
              <Skeleton width={index % 2 === 0 ? '70%' : '55%'} height={15} />
              <Skeleton width="40%" height={12} />
            </View>
            <Skeleton width={44} height={12} />
          </View>
        )}
      />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <MisliError message={error.message} onRetry={retry} />;
}

function MisliError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Misli" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Misli se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju misli.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 6,
    borderRadius: radius.control,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueText: {
    ...text.meta,
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skeleton: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonBody: {
    flex: 1,
    gap: 8,
  },
});
