import { useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { LayoutGrid, Lightbulb, Plus, Search, TriangleAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IdeaCreateSheet } from '@/components/canvas/idea-create-sheet';
import { EmptyState } from '@/components/empty-state';
import { IdeaActionsSheet, type IdeaListNode } from '@/components/ideja/idea-actions-sheet';
import { IdeaConvertSheet } from '@/components/ideja/idea-convert-sheet';
import { IdeaListRow } from '@/components/ideja/idea-list-row';
import { IdeaStageSheet } from '@/components/ideja/idea-stage-sheet';
import { useListEntering } from '@/components/motion/layout';
import {
  buildSections,
  chipLabel,
  emptyCopy,
  filterIdeas,
  ideasCountLabel,
  IDEA_STAGE_CHIPS,
  stageCounts,
  type IdeaStageFilter,
} from '@/components/ideja/ideje-model';
import { useIdeaVote } from '@/components/ideja/use-idea-vote';
import { useLiveNow } from '@/components/collab/use-live-now';
import { UndoBar } from '@/components/undo-bar';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { OptionChip } from '@/components/ui/option-chip';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchField } from '@/components/ui/search-field';
import { SectionHeader } from '@/components/ui/section-header';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { absoluteNodePosition } from '@/lib/canvas-position';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Pauza između zatvaranja jednog i otvaranja drugog sheet-a (akcije → konverzija).
 * Dva istovremena RN `Modal`-a na Androidu umeju da progutaju `onRequestClose`
 * (vidi `misli.tsx`).
 */
const SHEET_HANDOFF_MS = 320;

/**
 * Ekran „Ideje" (PROSTOR P6, P16; plan K07 §5.9) — par web `ideas-view.tsx`:
 * čipovi faza sa brojem (Sve · Predlog · Razmatra se · Odobreno · Postalo zadatak ·
 * Odbijeno), lista grupisana po fazi sa glasovima i brojem komentara, „Mapa" vodi
 * na kanvas ideja. Glasa svaki član (`ideas.vote`); fazu menja samo kome server
 * dozvoljava (`permissions.canSetStage`), kroz sheet (E12 — bez prevlačenja).
 * Podaci iz `ideas.list` (R7), ista pretplata koju drže detalj i Mapa.
 */
export default function IdejeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId, restoring } = useActiveStartup();
  const now = useLiveNow(60_000);

  const ideas = useQuery(
    api.ideas.list,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const { cast, busyId } = useIdeaVote(activeStartupId);

  const [filter, setFilter] = useState<IdeaStageFilter>('sve');
  const reduced = useReducedMotion();
  // Ulaz liste samo na prvo punjenje (K07 §8); promena filtera je odmah.
  const entering = useListEntering(reduced, ideas === undefined ? 'ucitava' : 'spremno');
  const [expandedRejected, setExpandedRejected] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionNode, setActionNode] = useState<IdeaListNode | null>(null);
  const [convertIdea, setConvertIdea] = useState<IdeaListNode | null>(null);
  const [stageIdea, setStageIdea] = useState<IdeaListNode | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchParent, setBranchParent] = useState<{
    id: Id<'ideaNodes'>;
    title: string;
    x?: number;
    y?: number;
  } | null>(null);

  const nodes = useMemo<IdeaListNode[]>(() => ideas?.nodes ?? [], [ideas]);
  // Čipovi broje SVE ideje startupa, a pretraga sužava ono što je izlistano ispod.
  const counts = useMemo(() => stageCounts(nodes), [nodes]);
  const searched = useMemo(() => filterIdeas(nodes, searchTerm), [nodes, searchTerm]);
  const sections = useMemo(
    () => buildSections<IdeaListNode>(searched, filter, expandedRejected),
    [searched, filter, expandedRejected],
  );

  const openCanvas = () => {
    if (!activeStartupId) return;
    haptics.tap();
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'ideas', id: activeStartupId } });
  };

  const loading = activeStartupId !== null && ideas === undefined;
  const total = nodes.length;
  const searchActive = searchTerm.trim().length > 0;
  const refreshControl = useListRefresh();
  const empty = emptyCopy({ total, filter, searching: searchActive });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Ideje"
        subtitle={total > 0 ? ideasCountLabel(total) : undefined}
        onBack={() => router.back()}
        below={
          activeStartupId !== null && total > 0 ? (
            <View>
              <View style={styles.search}>
                <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Pretraži ideje…" />
              </View>
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScroll}
                contentContainerStyle={styles.chips}>
                {IDEA_STAGE_CHIPS.map((chip) => (
                  <OptionChip
                    key={chip.value}
                    label={chipLabel(chip.label, counts[chip.value])}
                    active={filter === chip.value}
                    onPress={() => setFilter(chip.value)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : undefined
        }
        actions={
          activeStartupId ? (
            <>
              <IconButton accessibilityLabel="Mapa ideja" onPress={openCanvas}>
                <LayoutGrid size={22} color={colors.foreground} />
              </IconButton>
              <IconButton
                accessibilityLabel="Nova ideja"
                onPress={() => {
                  haptics.tap();
                  setCreateOpen(true);
                }}>
                <Plus size={22} color={colors.primary} />
              </IconButton>
            </>
          ) : undefined
        }
      />
      {activeStartupId === null ? (
        restoring ? (
          <SkeletonList
            count={5}
            gap={8}
            style={styles.skeleton}
            item={(index) => <SkeletonRow index={index} subtitle />}
          />
        ) : (
          <EmptyState
            icon={<Lightbulb size={20} color={colors.mutedForeground} />}
            title="Izaberi startup"
            description="Ideje se prikazuju po startupu. Izaberi ga u Prostoru."
            actionLabel="Otvori Prostor"
            onAction={() => router.navigate('/prostor')}
          />
        )
      ) : (
        <LoadingSwap
          loading={loading}
          skeleton={
            <SkeletonList
              count={5}
              gap={8}
              style={styles.skeleton}
              item={(index) => <SkeletonRow index={index} subtitle />}
            />
          }>
          {ideas && total === 0 ? (
            <EmptyState
              icon={<Lightbulb size={20} color={colors.mutedForeground} />}
              title={empty.title}
              actionLabel="Nova ideja"
              onAction={() => setCreateOpen(true)}
            />
          ) : ideas && sections.length === 0 ? (
            <EmptyState
              icon={<Search size={20} color={colors.mutedForeground} />}
              title={empty.title}
              actionLabel={searchActive ? 'Obriši pretragu' : 'Prikaži sve'}
              onAction={() => {
                setSearchTerm('');
                setFilter('sve');
              }}
            />
          ) : ideas ? (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item._id}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
              renderSectionHeader={({ section }) => {
                const collapsible = filter === 'sve' && section.stage === 'odbijeno';
                return (
                  <SectionHeader
                    title={section.title}
                    count={section.count}
                    collapsible={collapsible}
                    collapsed={section.collapsed}
                    onToggle={collapsible ? () => setExpandedRejected((open) => !open) : undefined}
                    style={styles.sectionHeader}
                  />
                );
              }}
              renderItem={({ item, index }) => (
                <Animated.View entering={entering(index)}>
                  <IdeaListRow
                    idea={item}
                    now={now}
                    voteBusy={busyId === item._id}
                    onOpen={() => {
                      haptics.tap();
                      router.push({ pathname: '/ideja/[id]', params: { id: item._id } });
                    }}
                    onLongPress={() => {
                      haptics.select();
                      setActionNode(item);
                    }}
                    onVote={(vote) => void cast(item._id, item.userVote, vote)}
                  />
                </Animated.View>
              )}
            />
          ) : null}
        </LoadingSwap>
      )}

      {activeStartupId !== null ? (
        <>
          {ideas !== undefined ? (
            <>
              <IdeaActionsSheet
                open={actionNode !== null}
                idea={actionNode}
                nodes={ideas.nodes}
                edges={ideas.edges}
                startupId={activeStartupId}
                onClose={() => setActionNode(null)}
                // Bez `onEdit`: lista nema edit sheet — izmena ide sa detalja.
                onConvert={(node) => {
                  setActionNode(null);
                  setTimeout(() => setConvertIdea(node), SHEET_HANDOFF_MS);
                }}
                onStage={(node) => {
                  setActionNode(null);
                  setTimeout(() => setStageIdea(node), SHEET_HANDOFF_MS);
                }}
                onBranch={() => {
                  if (actionNode === null) return;
                  const at = absoluteNodePosition(ideas.nodes, actionNode._id, (n) => n.parentIdeaId);
                  const parent = {
                    id: actionNode._id,
                    title: (actionNode.title ?? '').trim() || actionNode.text.trim().slice(0, 60) || 'Ideja',
                    ...(at.complete ? { x: at.x, y: at.y } : {}),
                  };
                  setActionNode(null);
                  setTimeout(() => setBranchParent(parent), SHEET_HANDOFF_MS);
                }}
              />
              <IdeaConvertSheet
                open={convertIdea !== null}
                idea={convertIdea}
                startupId={activeStartupId}
                onClose={() => setConvertIdea(null)}
              />
              <IdeaStageSheet
                open={stageIdea !== null}
                idea={stageIdea}
                startupId={activeStartupId}
                onClose={() => setStageIdea(null)}
              />
            </>
          ) : null}
          <IdeaCreateSheet
            open={createOpen || branchParent !== null}
            startupId={activeStartupId}
            parent={createOpen ? null : branchParent}
            onClose={() => {
              setCreateOpen(false);
              setBranchParent(null);
            }}
          />
          {/* Ideja obrisana sa detalja (`router.back()`) se vraća odavde (A6). */}
          <UndoBar />
        </>
      ) : null}
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <IdejeError message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

function IdejeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Ideje" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Ideje nisu učitane."
        description={message || 'Proveri vezu i pokušaj ponovo.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: { paddingBottom: 4 },
  // `flexGrow: 0`: horizontalni ScrollView u koloni se inače razvuče i pojede visinu liste.
  // Zaglavlje ima 16 sa strane; čipovi se klize do ivice ekrana (−16 / +16).
  chipsScroll: { flexGrow: 0, marginHorizontal: -16 },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeleton: { paddingHorizontal: 16, paddingTop: 8 },
  sectionHeader: { paddingTop: 12, paddingBottom: 4 },
});
