import { useMutation, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { LayoutGrid, Lightbulb, Search, TriangleAlert, Wand2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IdeaCreateSheet } from '@/components/canvas/idea-create-sheet';
import { EmptyState } from '@/components/empty-state';
import {
  IdeaActionsSheet,
  ideaDisplayTitle,
  type IdeaListNode,
} from '@/components/ideja/idea-actions-sheet';
import { IdeaConvertSheet } from '@/components/ideja/idea-convert-sheet';
import { VoteButtons } from '@/components/ideja/vote-buttons';
import { UndoBar } from '@/components/undo-bar';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonIdeaCard, SkeletonList } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { formatDayHeading } from '@/lib/activity';
import { absoluteNodePosition } from '@/lib/canvas-position';
import { startOfLocalDay } from '@/lib/deadline';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { tidyGridPosition } from '@/lib/thought-layout';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

/** Backend `MAX_BULK_ITEMS` posredno — „Sredi raspored" šalje najviše 50 poteza. */
const MAX_BULK = 50;
/**
 * Pauza između zatvaranja jednog i otvaranja drugog sheet-a (akcije → konverzija).
 * Dva istovremena RN `Modal`-a na Androidu umeju da progutaju `onRequestClose`
 * (vidi `misli.tsx`).
 */
const SHEET_HANDOFF_MS = 320;

type IdeaItem = {
  _id: Id<'ideaNodes'>;
  title: string | null;
  text: string;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  author: { displayName: string } | null;
  isApproved: boolean;
  createdAt: number;
};

/** Srpska množina za brojač u zaglavlju (isti obrazac kao `tasksWord`). */
function ideasWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return 'ideja';
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'ideje';
  return 'ideja';
}

/**
 * Ekran „Ideje" (M4.4) — native lista sa glasanjem, plus dugme za canvas prikaz
 * (WebView, korak 5). Lista je brža i čitljivija na telefonu od grafa; graf je za
 * pregled i navigaciju. Podaci iz `api.ideas.list` (isti izvor kao canvas).
 */
export default function IdejeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const ideas = useQuery(
    api.ideas.list,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const updatePositions = useMutation(api.ideas.updatePositions);
  const saveViewport = useMutation(api.ideas.saveViewport);

  const [actionNode, setActionNode] = useState<IdeaListNode | null>(null);
  const [convertIdea, setConvertIdea] = useState<IdeaListNode | null>(null);
  const [tidyBusy, setTidyBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchParent, setBranchParent] = useState<{
    id: Id<'ideaNodes'>;
    title: string;
    x?: number;
    y?: number;
  } | null>(null);

  // Doslovno web filtriranje (`ideas-view.tsx:202-206`) — uživo, nad naslovom i tekstom.
  const filteredNodes = useMemo(() => {
    const nodes = ideas?.nodes ?? [];
    const term = searchTerm.trim().toLowerCase();
    if (term.length === 0) return nodes;
    return nodes.filter(
      (node) => (node.title?.toLowerCase().includes(term) ?? false) || node.text.toLowerCase().includes(term),
    );
  }, [ideas, searchTerm]);

  const openCanvas = () => {
    if (!activeStartupId) return;
    haptics.tap();
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'ideas', id: activeStartupId } });
  };

  /**
   * „Sredi raspored" (PARITET A4): mobilna zamena za drag raspoređivanje karata
   * po kanvasu — isti obrazac kao misli (`misli.tsx`). Samo TOP-LEVEL kartice:
   * ugnježdene imaju relativne koordinate i putuju sa roditeljem, a kartice sa
   * vidljivim predlogom gnježdenja imaju PROJEKTOVAN roditeljski id, pa su i one
   * isključene (inače bi `updatePositions` pomerao predlog umesto kartice).
   */
  const requestTidy = () => {
    if (!activeStartupId || tidyBusy || ideas === undefined) return;
    const topLevel = ideas.nodes.filter((node) => node.parentIdeaId === undefined);
    if (topLevel.length === 0) {
      haptics.warning();
      Alert.alert('Nema šta da se sredi', 'Sve ideje su ugnježdene u druge kartice.');
      return;
    }
    const targets = topLevel.slice(0, MAX_BULK);
    // Menja ručni raspored korisnika — upozorenje pre, ne posle.
    haptics.warning();
    Alert.alert(
      'Srediti raspored?',
      `${targets.length} ${ideasWord(targets.length)} (bez ugnježdenih) se raspoređuje u urednu mrežu na kanvasu. Ručni raspored tih kartica se gubi.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Sredi',
          onPress: () => void runTidy(targets, topLevel.length > targets.length),
        },
      ],
    );
  };

  const runTidy = async (targets: IdeaListNode[], truncated: boolean) => {
    if (!activeStartupId || ideas === undefined) return;
    setTidyBusy(true);
    haptics.tap();
    try {
      await updatePositions({
        startupId: activeStartupId,
        updates: targets.map((node, index) => ({
          id: node._id,
          ...tidyGridPosition(index, targets.length),
        })),
      });
      // Mreža je u pozitivnom kvadrantu, pa viewport (0,0) prikazuje celu mrežu.
      // Zoom ostaje korisnikov — `canvasState` je već u pretplati (`ideas.list`),
      // za razliku od misli ne treba poseban `getCanvas` upit.
      await saveViewport({ startupId: activeStartupId, x: 0, y: 0, zoom: ideas.canvasState.zoom });
      haptics.success();
      Alert.alert(
        'Raspored je sređen',
        truncated
          ? `Raspoređeno je prvih ${targets.length} ideja; ostale su ostale gde su bile. Već otvoren kanvas prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.`
          : 'Ideje su raspoređene u mrežu. Već otvoren kanvas prikazuje novi raspored, a sačuvan pogled važi od sledećeg otvaranja.',
      );
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Raspored nije sređen.'));
    } finally {
      setTidyBusy(false);
    }
  };

  const loading = activeStartupId !== null && ideas === undefined;
  const count = ideas?.nodes.length ?? 0;
  const searchActive = searchTerm.trim().length > 0;
  const refreshControl = useListRefresh();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Ideje"
        eyebrow={
          count > 0
            ? searchActive
              ? `${filteredNodes.length} od ${count}`
              : `${count} ${ideasWord(count)}`
            : undefined
        }
        onBack={() => router.back()}
        below={
          activeStartupId !== null && count > 0 ? (
            <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Pretraži ideje…" />
          ) : undefined
        }
        actions={
          activeStartupId ? (
            <>
              {count > 1 ? (
                <IconButton
                  accessibilityLabel="Sredi raspored ideja u mrežu na kanvasu"
                  disabled={tidyBusy}
                  onPress={requestTidy}>
                  {tidyBusy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Wand2 size={22} color={colors.foreground} />
                  )}
                </IconButton>
              ) : null}
              <IconButton accessibilityLabel="Canvas prikaz ideja" onPress={openCanvas}>
                <LayoutGrid size={22} color={colors.foreground} />
              </IconButton>
            </>
          ) : undefined
        }
      />
      {activeStartupId === null ? (
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Ideje se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : ideas && ideas.nodes.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Još nema ideja"
          description="Ideje tima pojaviće se ovde. Dodaj prvu iz canvas prikaza."
          actionLabel="Otvori canvas"
          onAction={openCanvas}
        />
      ) : (
        <LoadingSwap
          loading={loading}
          skeleton={
            <SkeletonList
              count={4}
              gap={8}
              style={styles.list}
              item={(index) => <SkeletonIdeaCard index={index} />}
            />
          }>
          {ideas ? (
            filteredNodes.length === 0 ? (
              <EmptyState
                icon={<Search size={40} color={colors.mutedForeground} />}
                title={`Nema rezultata za „${searchTerm.trim()}"`}
                description="Pokušaj drugu reč ili obriši pretragu."
                actionLabel="Obriši pretragu"
                onAction={() => setSearchTerm('')}
              />
            ) : (
              <ScrollView
                contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={refreshControl}>
                <StaggerGroup>
                  {filteredNodes.map((node, index) => (
                    <StaggerItem key={node._id} index={index}>
                      <IdeaRow
                        idea={node}
                        startupId={activeStartupId}
                        colors={colors}
                        onLongPress={() => {
                          haptics.select();
                          setActionNode(node);
                        }}
                      />
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </ScrollView>
            )
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
                currentProfileId={ideas.currentProfileId}
                startupId={activeStartupId}
                onClose={() => setActionNode(null)}
                // Bez `onEdit`: lista nema edit sheet — izmena ide sa detalja.
                onConvert={(node) => {
                  setActionNode(null);
                  setTimeout(() => setConvertIdea(node), SHEET_HANDOFF_MS);
                }}
                onBranch={() => {
                  if (actionNode === null) return;
                  const at = absoluteNodePosition(ideas.nodes, actionNode._id, (n) => n.parentIdeaId);
                  const parent = {
                    id: actionNode._id,
                    title: ideaDisplayTitle(actionNode),
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
              <IdeaCreateSheet
                open={branchParent !== null}
                startupId={activeStartupId}
                parent={branchParent}
                onClose={() => setBranchParent(null)}
              />
            </>
          ) : null}
          {/* Ideja obrisana sa detalja (`router.back()`) se vraća odavde (A6). */}
          <UndoBar />
        </>
      ) : null}
    </View>
  );
}

function IdeaRow({
  idea,
  startupId,
  colors,
  onLongPress,
}: {
  idea: IdeaItem;
  startupId: Id<'startups'>;
  colors: ColorTokens;
  /** Dugi pritisak otvara akcioni sheet ideje (PARITET A4). */
  onLongPress: () => void;
}) {
  const router = useRouter();
  const vote = useMutation(api.ideas.vote);
  const [busy, setBusy] = useState(false);

  const cast = async (voteType: 'up' | 'down') => {
    setBusy(true);
    haptics.tap();
    try {
      await vote({ startupId, ideaId: idea._id, voteType });
      haptics.success();
      // Bez ovoga je glas prolazio nemo za korisnika čitača ekrana — haptika je
      // bila jedini signal uspeha.
      AccessibilityInfo.announceForAccessibility(
        voteType === 'up' ? 'Glas za je zabeležen.' : 'Glas protiv je zabeležen.',
      );
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Glas nije zabeležen.'));
    } finally {
      setBusy(false);
    }
  };

  const title = (idea.title ?? '').trim() || 'Ideja';
  const body = idea.text.trim();
  // Tap na karticu otvara ekran ideje (detalj + diskusija tima). Glasanje je
  // SEKUNDARNO: kompaktan par dugmadi u podnožju, desno od autora — ne traka
  // preko pola kartice.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Otvori ideju: ${title}`}
      accessibilityHint="Dugi pritisak otvara akcije ideje."
      accessibilityActions={[
        { name: 'vote_up', label: 'Glasaj za' },
        { name: 'vote_down', label: 'Glasaj protiv' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'vote_up') void cast('up');
        else if (event.nativeEvent.actionName === 'vote_down') void cast('down');
      }}
      onPress={() => {
        haptics.tap();
        router.push({ pathname: '/ideja/[id]', params: { id: idea._id } });
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}>
      <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {body ? (
        <Text numberOfLines={2} style={[styles.rowText, { color: colors.mutedForeground }]}>
          {body}
        </Text>
      ) : null}
      <View style={styles.footer}>
        {idea.author ? <Avatar name={idea.author.displayName} size={22} /> : null}
        <Text numberOfLines={1} style={[styles.author, { color: colors.mutedForeground }]}>
          {idea.author ? `${idea.author.displayName} · ` : ''}
          {formatDayHeading(startOfLocalDay(idea.createdAt), Date.now())}
        </Text>
        <View style={styles.grow} />
        <Badge
          label={idea.isApproved ? 'Odobreno' : 'U razmatranju'}
          variant={idea.isApproved ? 'success' : 'outline'}
        />
        <VoteButtons
          upvotes={idea.upvotes}
          downvotes={idea.downvotes}
          userVote={idea.userVote}
          disabled={busy}
          size="sm"
          onVote={(next) => void cast(next)}
        />
      </View>
    </Pressable>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <IdejeError message={error.message} onRetry={retry} />;
}

function IdejeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Ideje" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Ideje se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju ideja.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grow: { flex: 1 },
  list: {
    padding: 16,
    paddingTop: 8,
    gap: 8,
  },
  // Kartica: naslov → tekst → podnožje (autor + glasovi u istom redu).
  row: {
    gap: 4,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  rowText: {
    ...text.body,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  author: {
    ...text.meta,
    flexShrink: 1,
  },
});
