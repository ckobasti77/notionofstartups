import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  Brain,
  Crown,
  FolderInput,
  Link2,
  MoreHorizontal,
  Send,
  TriangleAlert,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThoughtNodeSheet, type ThoughtDetail } from '@/components/canvas/thought-node-sheet';
import { EmptyState } from '@/components/empty-state';
import {
  ThoughtActionsSheet,
  type ThoughtActionsView,
} from '@/components/misli/thought-actions-sheet';
import {
  ThoughtConversionSheet,
  type ThoughtConversionNode,
} from '@/components/misli/thought-conversion-sheet';
import { ThoughtEdgeSheet, type ThoughtEdgeDetail } from '@/components/misli/thought-edge-sheet';
import { ThoughtUndoBar } from '@/components/misli/thought-undo-bar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { haptics } from '@/lib/haptics';
import { THOUGHT_COLOR_LABEL, THOUGHT_SWATCH } from '@/lib/thought-colors';
import { misaoWord, thoughtDisplayTitle } from '@/lib/thought-layout';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/** Ista pauza kao na listi — dva RN modala se ne otvaraju istovremeno. */
const SHEET_HANDOFF_MS = 320;
/** `getConnectedGroup` limit = backend `MAX_BULK_ITEMS`, pa „Pošalji grupu" uvek prolazi. */
const GROUP_LIMIT = 50;

/**
 * Detalj misli (PARITET A1) — pun ekran, ne sheet: nosi sadržaj, veze i grupu, a
 * pretraga i lista vode pravo ovamo. Napajanje: `thoughts.getConnectedGroup`
 * (reaktivan; uključuje i početni čvor) — jedan upit daje misao + susede + veze,
 * a pojedinačni `getNode` upit ne postoji (paginirani `listNodes` nije pouzdan za
 * `find`).
 *
 * TRKA PRI ARHIVIRANJU: čim misao nestane, pretplata baca „Misao nije pronađena."
 * — PRE `router.back()`. Zato se upit prebacuje na `skip` (`leaving`) pre mutacije;
 * ako mutacija padne, `leaving` se vraća.
 */
export default function MisaoScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();
  const params = useLocalSearchParams<{ id: string }>();
  const nodeId = params.id as Id<'thoughtNodes'>;

  const [leaving, setLeaving] = useState(false);
  const group = useQuery(
    api.thoughts.getConnectedGroup,
    !leaving && activeStartupId
      ? { startupId: activeStartupId, nodeId, limit: GROUP_LIMIT }
      : 'skip',
  );

  const node = useMemo(
    () => group?.nodes.find((candidate) => candidate._id === nodeId) ?? null,
    [group, nodeId],
  );
  const titlesById = useMemo(
    () => new Map((group?.nodes ?? []).map((n) => [n._id, thoughtDisplayTitle(n)])),
    [group],
  );
  // Direktne veze OVE misli (grupa nosi i veze između suseda — one ovde ne idu).
  const connections = useMemo(
    () =>
      (group?.edges ?? [])
        .filter((edge) => edge.nodeAId === nodeId || edge.nodeBId === nodeId)
        .map((edge) => ({
          edge,
          otherId: edge.nodeAId === nodeId ? edge.nodeBId : edge.nodeAId,
        })),
    [group, nodeId],
  );

  const [editThought, setEditThought] = useState<ThoughtDetail | null>(null);
  const [actions, setActions] = useState<{
    node: Doc<'thoughtNodes'>;
    view: ThoughtActionsView;
  } | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<ThoughtEdgeDetail | null>(null);
  const [conversionNodes, setConversionNodes] = useState<ThoughtConversionNode[] | null>(null);

  const openOther = (otherId: Id<'thoughtNodes'>) => {
    haptics.tap();
    router.push({ pathname: '/misao/[id]', params: { id: otherId } });
  };

  const loading = activeStartupId !== null && group === undefined;
  const refreshControl = useListRefresh();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Misao"
        eyebrow="Misli"
        onBack={() => router.back()}
        actions={
          node ? (
            <IconButton
              accessibilityLabel="Akcije misli"
              onPress={() => {
                haptics.tap();
                setActions({ node, view: 'menu' });
              }}>
              <MoreHorizontal size={22} color={colors.foreground} />
            </IconButton>
          ) : undefined
        }
      />

      {activeStartupId === null ? (
        <EmptyState
          icon={<Brain size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Misli se vode po startupu. Izaberi ga iz zaglavlja."
        />
      ) : !loading && node === null ? (
        // `getConnectedGroup` uvek vraća početni čvor — ovde se stiže samo ako se
        // misao promeni ispod nas na neočekivan način. Isti izlaz kao greška.
        <EmptyState
          icon={<TriangleAlert size={40} color={colors.destructive} />}
          title="Misao nije pronađena"
          description="Možda je arhivirana ili više nije dostupna."
          actionLabel="Nazad"
          onAction={() => router.back()}
        />
      ) : (
        <LoadingSwap loading={loading} skeleton={<MisaoSkeleton />}>
          {node === null ? null : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.metaRow}>
                <View
                  style={[styles.colorDot, { backgroundColor: THOUGHT_SWATCH[node.color] }]}
                  accessibilityElementsHidden
                />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  {THOUGHT_COLOR_LABEL[node.color]}
                </Text>
                {node.isParent ? (
                  <>
                    <Crown size={14} color={colors.warning} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      Glavna misao
                    </Text>
                  </>
                ) : null}
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {thoughtDisplayTitle(node)}
              </Text>
              {node.title?.trim() && node.text.trim() ? (
                <Text selectable style={[styles.body, { color: colors.foreground }]}>
                  {node.text.trim()}
                </Text>
              ) : null}
              {node.conversionCount > 0 ? (
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  Poslato u Ideje {node.conversionCount}×
                </Text>
              ) : null}
            </View>

            <View style={styles.buttonRow}>
              <Button
                label="Izmeni"
                variant="ghost"
                onPress={() => {
                  haptics.tap();
                  setEditThought({
                    _id: node._id,
                    title: node.title,
                    text: node.text,
                    color: node.color,
                    isParent: node.isParent ?? false,
                  });
                }}
                style={styles.flexBtn}
              />
              <Button
                label="Pošalji u Ideje"
                onPress={() => {
                  haptics.tap();
                  setConversionNodes([node]);
                }}
                style={styles.flexBtn}
              />
            </View>

            {node.parentThoughtId !== undefined ? (
              <Row
                style={styles.row}
                icon={<FolderInput size={20} color={colors.mutedForeground} />}
                title={
                  titlesById.get(node.parentThoughtId) !== undefined
                    ? `U grupi: ${titlesById.get(node.parentThoughtId)}`
                    : 'Ugnježdena u drugu misao'
                }
                subtitle="Otvori roditeljsku misao"
                onPress={() => openOther(node.parentThoughtId as Id<'thoughtNodes'>)}
              />
            ) : null}

            <SectionHeader
              title="Veze"
              count={connections.length}
              style={styles.sectionHeader}
            />
            {connections.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Ova misao još nema veza.
              </Text>
            ) : (
              connections.map(({ edge, otherId }) => {
                const otherTitle = titlesById.get(otherId) ?? 'Misao';
                return (
                  <Row
                    key={edge._id}
                    style={styles.row}
                    icon={<Link2 size={20} color={colors.mutedForeground} />}
                    title={otherTitle}
                    titleNumberOfLines={2}
                    subtitle={edge.label ?? undefined}
                    onPress={() => {
                      haptics.tap();
                      setEdgeDetail({
                        edgeId: edge._id,
                        label: edge.label,
                        otherTitle,
                        otherNodeId: otherId,
                      });
                    }}
                    accessibilityLabel={`Veza sa: ${otherTitle}${edge.label ? `, ${edge.label}` : ''}`}
                    accessibilityHint="Otvara uređivanje veze."
                  />
                );
              })
            )}
            <Row
              style={styles.row}
              icon={<Link2 size={20} color={colors.subtle} />}
              title="Poveži sa misli…"
              showChevron={false}
              onPress={() => {
                haptics.tap();
                setActions({ node, view: 'connect' });
              }}
            />

            {group !== undefined && group.nodes.length > 1 ? (
              <>
                <SectionHeader
                  title="Povezana grupa"
                  count={group.nodes.length}
                  style={styles.sectionHeader}
                />
                {group.truncated ? (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    Prikazano je prvih {GROUP_LIMIT} povezanih misli — ova mreža je veća.
                  </Text>
                ) : null}
                <Row
                  style={styles.row}
                  icon={<Send size={20} color={colors.mutedForeground} />}
                  title={`Pošalji grupu u Ideje (${group.nodes.length})`}
                  subtitle={`Svih ${group.nodes.length} ${misaoWord(group.nodes.length)}, sa vezama`}
                  showChevron={false}
                  onPress={() => {
                    haptics.tap();
                    setConversionNodes(group.nodes);
                  }}
                />
              </>
            ) : null}
          </ScrollView>
          )}
        </LoadingSwap>
      )}

      {activeStartupId !== null ? (
        <>
          <ThoughtNodeSheet
            thought={editThought}
            onClose={() => setEditThought(null)}
            onBeforeArchive={() => setLeaving(true)}
            onArchived={() => router.back()}
            onArchiveFailed={() => setLeaving(false)}
          />
          <ThoughtActionsSheet
            open={actions !== null}
            node={actions?.node ?? null}
            startupId={activeStartupId}
            initialView={actions?.view ?? 'menu'}
            onClose={() => setActions(null)}
            onConvert={(nodes) => {
              setActions(null);
              setTimeout(() => setConversionNodes(nodes), SHEET_HANDOFF_MS);
            }}
            onBeforeArchive={() => setLeaving(true)}
            onArchived={() => router.back()}
            onArchiveFailed={() => setLeaving(false)}
          />
          <ThoughtEdgeSheet
            edge={edgeDetail}
            onClose={() => setEdgeDetail(null)}
            onOpenOther={(otherId) => {
              setEdgeDetail(null);
              openOther(otherId);
            }}
          />
          <ThoughtConversionSheet
            open={conversionNodes !== null}
            startupId={activeStartupId}
            nodes={conversionNodes ?? []}
            onClose={() => setConversionNodes(null)}
          />
          <ThoughtUndoBar />
        </>
      ) : null}
    </View>
  );
}

/** Oblik detalja: kartica sadržaja, red dugmadi, pa redovi veza. */
function MisaoSkeleton() {
  return (
    <View
      style={styles.content}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje misli">
      <Skeleton width="100%" height={120} borderRadius={radius.card} />
      <View style={styles.buttonRow}>
        <Skeleton width="48%" height={44} borderRadius={radius.control} />
        <Skeleton width="48%" height={44} borderRadius={radius.control} />
      </View>
      <Skeleton width="30%" height={13} />
      <Skeleton width="100%" height={52} borderRadius={radius.control} />
      <Skeleton width="100%" height={52} borderRadius={radius.control} />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <MisaoError message={error.message} onRetry={retry} />;
}

function MisaoError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Misao" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Misao se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju misli.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    gap: 8,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
  },
  metaText: {
    ...text.meta,
  },
  title: {
    ...text.title,
  },
  body: {
    ...text.body,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flexBtn: {
    flex: 1,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 4,
    borderRadius: radius.control,
  },
  sectionHeader: {
    marginTop: 8,
  },
  emptyText: {
    ...text.body,
    paddingVertical: 4,
  },
});
