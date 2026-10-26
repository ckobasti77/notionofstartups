import { usePaginatedQuery, useQuery, type PaginationStatus } from 'convex/react';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  LayoutGrid,
  Pencil,
  TriangleAlert,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { AppHeader } from '@/components/app-header';
import { PageCreateSheet } from '@/components/canvas/page-create-sheet';
import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { QuickAddFab } from '@/components/danas/quick-add-fab';
import { EmptyState } from '@/components/empty-state';
import { CommandCenter } from '@/components/komandni-centar/command-center';
import { LAYOUT_ANIMATION_MAX_ROWS } from '@/components/me/my-day/my-day-model';
import { NoStartupState, useHasNoStartups } from '@/components/no-startup-state';
import { enterFadeUp, exitFade, listLayout, useListEntering } from '@/components/motion';
import { AreaBriefingSection } from '@/components/prostor/area-briefing-section';
import { AreaContributionsSection } from '@/components/prostor/area-contributions-section';
import { KindFilterRow } from '@/components/prostor/kind-filter-row';
import {
  openProstorDestination,
  ProstorHub,
  ProstorTempRows,
} from '@/components/prostor/prostor-hub';
import { RenameAreaSheet } from '@/components/prostor/rename-area-sheet';
import { TabScreen } from '@/components/tab-screen';
import { UndoBar } from '@/components/undo-bar';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonTaskRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import {
  pageKindColor,
  pageKindMeta,
  supportsTaskData,
  type PageKind,
} from '@/lib/page-kinds';
import { statusColor, TASK_STATUS_META } from '@/lib/task-meta';
import type { TaskStatus } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, space, text, type ColorTokens } from '@/theme/tokens';
import { accessErrorMessage } from '@/lib/errors';

/**
 * Minimalni oblik stranice koji ovaj ekran koristi — polja koja
 * `pages.listChildren` vraća (`summarizePage`), izabrana strukturno umesto pune
 * Convex inferencije.
 */
type PageItem = {
  _id: Id<'pages'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
  kind: PageKind;
  title: string;
  taskStatus: TaskStatus | null;
  dueDate: number | null;
  updatedAt: number;
};

/**
 * Prostor ide samo jedan nivo duboko: izabrana oblast i njene stranice na vrhu.
 * Dublje se ide OTVARANJEM stranice (ekran stranice nosi sekciju „Podstranice"), ne
 * roniranjem ovde — zato okvir drži samo oblast.
 */
type Frame = { areaId: Id<'startupAreas'>; label: string };

/**
 * Tab „Prostor" = početna startupa (PROSTOR P18, plan K07 §4.2). Bez segmenata:
 * naslov je ime startupa (birač), na vrhu su redovi Zadaci · Dokumenti · Ideje ·
 * Kanali · Korpa (E4), ispod njih Komandni centar, a na dnu privremeni Puls
 * nedelje i Aktivnost (do K19). Oblasti su iza reda „Dokumenti" (`/oblasti`).
 *
 * Do K14 ekran oblasti živi ovde kao okvir koji se otvara parametrom `areaId`
 * (lista oblasti, red oblasti u Pulsu): stablo stranica oblasti, tap na red
 * OTVARA stranicu, a „nazad" vraća na početnu.
 */
export default function ProstorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { activeStartupId } = useActiveStartup();
  const noStartups = useHasNoStartups();
  const [frames, setFrames] = useState<Frame[]>([]);
  // Fiksan „sada" po mount-u: rok/relativno vreme se ne reklasifikuju u renderu.
  const [now] = useState(() => Date.now());
  // Ulaz spolja (lista oblasti, red oblasti u Pulsu) — otvara tab odmah na toj
  // oblasti. `segment` je stari spoljni parametar (pre K09) — vidi efekat ispod.
  const params = useLocalSearchParams<{ areaId?: string; areaLabel?: string; segment?: string }>();
  const [renamingArea, setRenamingArea] = useState(false);
  // FAB „Nova stranica" na Nivou 2 (E13) — isti gest kao „novi zadatak" na Danas.
  const [creatingPage, setCreatingPage] = useState(false);

  // Promena startupa (switcher u headeru) resetuje hijerarhiju na Nivo 1: okviri
  // drže id-jeve oblasti/stranica starog startupa, pa bi upit pukao na tuđem id-ju.
  useEffect(() => {
    setFrames([]);
  }, [activeStartupId]);

  // Parametar se troši ODMAH (`setParams` ga briše), inače bi svaki povratak na
  // tab ponovo silom otvorio istu oblast i pojeo korisnikovo „nazad".
  useEffect(() => {
    const areaId = params.areaId;
    if (!areaId) return;
    setFrames([{ areaId: areaId as Id<'startupAreas'>, label: params.areaLabel ?? 'Oblast' }]);
    router.setParams({ areaId: undefined, areaLabel: undefined });
  }, [params.areaId, params.areaLabel, router]);

  // Stari spoljni parametar `segment` (segmenti su uklonjeni u PROSTOR K09):
  // „komandni-centar" je sada sama početna, a „oblasti" je ekran Dokumenti.
  useEffect(() => {
    const requested = params.segment;
    if (requested === undefined) return;
    router.setParams({ segment: undefined });
    setFrames([]);
    if (requested === 'oblasti') router.push('/oblasti');
  }, [params.segment, router]);

  const openLeaf = useCallback(
    (page: PageItem) => {
      haptics.tap();
      if (page.kind === 'task') {
        router.push({ pathname: '/zadatak/[id]', params: { id: page._id } });
      } else {
        router.push({ pathname: '/stranica/[id]', params: { id: page._id } });
      }
    },
    [router],
  );

  // Canvas oblasti (WebView embed) — resolver na backendu razreši scope iz areaId.
  const openAreaCanvas = useCallback(
    (areaId: Id<'startupAreas'>) => {
      haptics.tap();
      router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'area', id: areaId } });
    },
    [router],
  );

  // Prostor je jednonivoovski (oblast → njene stranice), pa „nazad" uvek vraća na
  // početnu startupa.
  const goBack = useCallback(() => {
    setFrames((prev) => (prev.length === 0 ? prev : []));
  }, []);

  // Android hardware back: unutar hijerarhije skida nivo; na Nivou 1 pušta default
  // (izlazak iz taba). Vezano na fokus da ne otima back kad tab nije aktivan.
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (frames.length > 0) {
          goBack();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [frames.length, goBack]),
  );

  const top = frames.length > 0 ? frames[frames.length - 1] : null;

  if (top === null && activeStartupId === null && noStartups) {
    return (
      <TabScreen title="Prostor">
        <NoStartupState />
      </TabScreen>
    );
  }

  if (top === null) {
    return (
      <TabScreen title="Prostor" startupAsTitle>
        {activeStartupId === null ? (
          <CommandCenterPending />
        ) : (
          <CommandCenter
            key={activeStartupId}
            startupId={activeStartupId}
            header={<ProstorHub startupId={activeStartupId} />}
            footer={<ProstorTempRows onOpen={(destination) => openProstorDestination(router, destination)} />}
          />
        )}
      </TabScreen>
    );
  }

  const frameKey = `area:${top.areaId}`;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      // `padding` na obe platforme: Expo SDK 57 edge-to-edge (Android) razbija OS
      // `adjustResize`, pa tastaturu kompenzujemo u JS-u na obe platforme (isto kao
      // `admin-startup.tsx`). Ekran je plitak (header + brifing + lista), pa je KAV
      // oko celog ekrana bezbedan — nema ugnježđenog KAV-a koji bi izazvao E10 bag.
      behavior="padding">
      {/* Isto zaglavlje kao Nivo 1, samo sa „nazad" i imenom oblasti kao naslovom —
          Prostor ide jedan nivo duboko, pa breadcrumb nema šta da nabraja. */}
      <AppHeader
        title={top.label}
        onBack={goBack}
        actions={
          <>
            {/* Oblast napravljena sa telefona dosad se sa telefona nije mogla
                preimenovati — web to nudi na dva mesta (`area-view`, sidebar). */}
            <IconButton
              accessibilityLabel="Preimenuj oblast"
              onPress={() => {
                haptics.tap();
                setRenamingArea(true);
              }}>
              <Pencil size={20} color={colors.foreground} />
            </IconButton>
            <IconButton
              accessibilityLabel="Canvas prikaz oblasti"
              onPress={() => openAreaCanvas(top.areaId)}>
              <LayoutGrid size={22} color={colors.foreground} />
            </IconButton>
          </>
        }
      />
      <RenameAreaSheet
        open={renamingArea}
        areaId={top.areaId}
        currentLabel={top.label}
        onClose={() => setRenamingArea(false)}
        // Okvir navigacije drži naziv u stanju ekrana, pa ga osvežavamo ovde —
        // `startups.listAreas` se osveži sam, ali zaglavlje čita `frames`.
        onRenamed={(label) =>
          setFrames((prev) =>
            prev.map((frame) =>
              frame.areaId === top.areaId ? { ...frame, label } : frame,
            ),
          )
        }
      />
      {/* Brifing stoji iznad liste, kao dock na vrhu web `area-view`. */}
      <AreaBriefingSection key={`brifing:${top.areaId}`} areaId={top.areaId} areaLabel={top.label} />
      {/* Potpisani doprinosi odmah ispod brifinga — isti redosled kao web
          `area-view.tsx` (C14). */}
      <AreaContributionsSection
        key={`doprinosi:${top.areaId}`}
        areaId={top.areaId}
        areaLabel={top.label}
      />
      <PageLevel
        key={frameKey}
        startupId={activeStartupId}
        areaId={top.areaId}
        now={now}
        onOpenLeaf={openLeaf}
        onCreate={() => setCreatingPage(true)}
      />
      {/* Stranica se prirodno pravi u oblasti (E13); Nivo 1 FAB nema — tamo se
          pravi OBLAST i taj ulaz već postoji („Nova oblast"). */}
      <QuickAddFab
        label="Nova stranica"
        onPress={() => {
          haptics.tap();
          setCreatingPage(true);
        }}
      />
      {activeStartupId ? (
        <PageCreateSheet
          open={creatingPage}
          startupId={activeStartupId}
          areaId={top.areaId}
          parentPageId={null}
          onClose={() => setCreatingPage(false)}
        />
      ) : null}
      {/* Obrisan doprinos oblasti se vraća odavde — bez trake „Poništi" na ovom
          ekranu brisanje ne bi imalo izlaz. `72` = iznad FAB-a (56 + bottom 16);
          traka sama dodaje `insets.bottom + 16`, pa staje i iznad tab bara. */}
      <UndoBar bottomOffset={72} />
    </KeyboardAvoidingView>
  );
}

/** Dok se aktivan startup ne razreši (prvo otvaranje), oblik onoga što stiže. */
function CommandCenterPending() {
  return (
    <View
      style={styles.pendingContent}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje komandnog centra">
      <Skeleton width="100%" height={44} borderRadius={radius.lg} />
      <SkeletonList count={3} item={(index) => <SkeletonTaskRow index={index} />} />
    </View>
  );
}

/* ── Nivo 2: stablo stranica u oblasti ─────────────────────────────────── */

/** Uvlačenje po nivou; dalje od ovoga naslov na telefonu ostaje bez prostora. */
const INDENT_STEP = 18;
const MAX_TREE_DEPTH = 8;

/** Broj podstranica po redu — `undefined` dok upit ne stigne. */
type ChildCount = { count: number; capped: boolean };

/**
 * Broj podstranica za jedan vidljivi nivo (jedan upit za ceo nivo, ne po redu).
 * Meta u redu odgovara na „ima li šta unutra" pre nego što se red razvije.
 */
function useChildCounts(
  startupId: Id<'startups'> | null,
  areaId: Id<'startupAreas'>,
  pages: readonly { _id: Id<'pages'> }[],
): Map<Id<'pages'>, ChildCount> {
  const ids = useMemo(() => pages.map((page) => page._id), [pages]);
  const rows = useQuery(
    api.pages.childCounts,
    startupId !== null && ids.length > 0
      ? { startupId, areaId, parentPageIds: ids }
      : 'skip',
  );
  return useMemo(() => {
    const map = new Map<Id<'pages'>, ChildCount>();
    rows?.forEach((row) => map.set(row.pageId, { count: row.count, capped: row.capped }));
    return map;
  }, [rows]);
}

function PageLevel({
  startupId,
  areaId,
  now,
  onOpenLeaf,
  onCreate,
}: {
  startupId: Id<'startups'> | null;
  areaId: Id<'startupAreas'>;
  now: number;
  onOpenLeaf: (page: PageItem) => void;
  onCreate: () => void;
}) {
  const colors = useThemeColors();
  // Filter po vrsti (C7) živi ovde jer `PageLevel` već ima `key={frameKey}` u
  // roditelju — promena oblasti sama resetuje filter.
  const [kindFilter, setKindFilter] = useState<PageKind | null>(null);
  // Koren oblasti (`parentPageId: null`); dublji nivoi se dohvataju tek kad se red
  // razvije — svaki `PageBranch` ima svoj upit i montira ga samo dok je otvoren.
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    startupId
      ? {
          startupId,
          areaId,
          parentPageId: null,
          ...(kindFilter === null ? {} : { kind: kindFilter }),
        }
      : 'skip',
    { initialNumItems: 50 },
  );

  const loading = startupId === null || status === 'LoadingFirstPage';

  return (
    <View style={styles.level2}>
      {/* Chip red stoji IZNAD liste i van `LoadingSwap`-a — filter ne treperi sa
          skeletonom i ne odskroluje sa listom. */}
      <KindFilterRow value={kindFilter} onChange={setKindFilter} />
      {kindFilter === null ? null : (
        <Text style={[styles.filterNote, { color: colors.mutedForeground }]}>
          {/* Podstranice se namerno NE filtriraju: `pages.childCounts` broji svu
              decu, pa bi filtrirana deca dala red koji obeća „2 podstranice" i
              otvori „Nema podstranica.". Web filtrira isti skup — direktnu decu
              opsega. */}
          Filter važi za koren oblasti.
        </Text>
      )}
      {!loading && results.length === 0 ? (
        <PageLevelEmpty
          colors={colors}
          kindFilter={kindFilter}
          onClearFilter={() => setKindFilter(null)}
          onCreate={onCreate}
        />
      ) : (
        <PageLevelList
          startupId={startupId}
          areaId={areaId}
          now={now}
          onOpenLeaf={onOpenLeaf}
          results={results}
          status={status}
          loadMore={loadMore}
          loading={loading}
        />
      )}
    </View>
  );
}

/** Sama lista stabla — izdvojena da chip red iznad nje ostane van `LoadingSwap`-a. */
function PageLevelList({
  startupId,
  areaId,
  now,
  onOpenLeaf,
  results,
  status,
  loadMore,
  loading,
}: {
  startupId: Id<'startups'> | null;
  areaId: Id<'startupAreas'>;
  now: number;
  onOpenLeaf: (page: PageItem) => void;
  results: PageItem[];
  status: PaginationStatus;
  loadMore: (count: number) => void;
  loading: boolean;
}) {
  const colors = useThemeColors();
  // Stanje razvijenosti traje dok se ne napusti ekran / ne promeni oblast
  // (`key` na `PageLevel` u roditelju ga tada resetuje).
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((pageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);
  const childCounts = useChildCounts(startupId, areaId, results);
  const refreshControl = useListRefresh();
  // Stablo stranica (K19): ulaz sa stagger-om kad lista stigne, a razvijanje
  // grane pomera redove ispod layout springom (do granice, plan K07 E12).
  const reduced = useReducedMotion();
  const entering = useListEntering(reduced, `${areaId}:${loading ? 'ucitavanje' : 'spremno'}`);
  // Granica (E12) važi po nivou: koreni ovde, podstranice u `ChildPages`.
  const layout = results.length <= LAYOUT_ANIMATION_MAX_ROWS ? listLayout(reduced) : undefined;

  return (
    <LoadingSwap loading={loading} skeleton={<PageListSkeleton />}>
      {startupId === null || loading ? null : (
        <Animated.FlatList
          data={results}
          keyExtractor={(item: PageItem) => item._id}
          itemLayoutAnimation={layout}
          renderItem={({ item, index }: { item: PageItem; index: number }) => (
            <Animated.View
              entering={entering(index)}
              exiting={layout === undefined ? undefined : exitFade(reduced)}>
              <PageBranch
                page={item}
                depth={0}
                startupId={startupId}
                areaId={areaId}
                now={now}
                childCount={childCounts.get(item._id)}
                expandedIds={expandedIds}
                onToggle={toggle}
                onOpen={onOpenLeaf}
                layout={layout}
              />
            </Animated.View>
          )}
          ItemSeparatorComponent={() => (
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (status === 'CanLoadMore') loadMore(50);
          }}
          ListFooterComponent={
            status === 'LoadingMore' ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje" />
              </View>
            ) : (
              <View style={styles.footerSpacer} />
            )
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        />
      )}
    </LoadingSwap>
  );
}

type BranchLayout = ReturnType<typeof listLayout>;

/** Jedan red stabla + (kad je razvijen) njegova deca. */
function PageBranch({
  page,
  depth,
  startupId,
  areaId,
  now,
  childCount,
  expandedIds,
  onToggle,
  onOpen,
  layout,
}: {
  page: PageItem;
  depth: number;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  now: number;
  childCount: ChildCount | undefined;
  expandedIds: ReadonlySet<string>;
  onToggle: (pageId: string) => void;
  onOpen: (page: PageItem) => void;
  /** Layout spring za ovaj nivo (`undefined` iznad granice E12 ili u smanjenom pokretu). */
  layout: BranchLayout;
}) {
  const expanded = expandedIds.has(page._id);
  const reduced = useReducedMotion();
  return (
    // Razvijanje/sklapanje (K19): susedne grane se pomere layout springom, a
    // podstranice uđu podizanjem. Koren pomera ćelija liste (`itemLayoutAnimation`),
    // pa sam red animira samo ispod korena. Sklopljeno podstablo nestaje odmah
    // (bez izlaza), da ne bi bledelo preko redova koji se penju na njegovo mesto.
    <Animated.View layout={depth > 0 ? layout : undefined}>
      <PageRow
        page={page}
        depth={depth}
        now={now}
        childCount={childCount}
        expanded={expanded}
        // Dok brojač ne stigne strelica stoji; kad se zna da nema dece — nestaje,
        // pa se ne otvara prazan nivo.
        canExpand={depth < MAX_TREE_DEPTH && childCount?.count !== 0}
        onToggle={() => onToggle(page._id)}
        onOpen={onOpen}
      />
      {expanded ? (
        <Animated.View entering={enterFadeUp(0, reduced)}>
          <ChildPages
            startupId={startupId}
            areaId={areaId}
            parentPageId={page._id}
            depth={depth + 1}
            now={now}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onOpen={onOpen}
            layout={layout}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Deca jednog reda. Montira se TEK kad je red razvijen, pa se `listChildren` i
 * pokreće tek tada — zatvoreno stablo ne plaća nijedan dodatan upit.
 */
function ChildPages({
  startupId,
  areaId,
  parentPageId,
  depth,
  now,
  expandedIds,
  onToggle,
  onOpen,
  layout,
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'>;
  depth: number;
  now: number;
  expandedIds: ReadonlySet<string>;
  onToggle: (pageId: string) => void;
  onOpen: (page: PageItem) => void;
  layout: BranchLayout;
}) {
  const colors = useThemeColors();
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId, areaId, parentPageId },
    { initialNumItems: 20 },
  );
  const childCounts = useChildCounts(startupId, areaId, results);
  const indent = { paddingLeft: depth * INDENT_STEP };
  // Granica E12 po nivou: veliki nivo se ne animira (ni redovi ispod njega).
  const levelLayout = results.length <= LAYOUT_ANIMATION_MAX_ROWS ? layout : undefined;

  if (status === 'LoadingFirstPage') {
    return (
      <View style={[styles.childState, indent]}>
        <ActivityIndicator
          size="small"
          color={colors.mutedForeground}
          accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje podstranica"
        />
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <Text style={[styles.childEmpty, indent, { color: colors.mutedForeground }]}>
        Nema podstranica.
      </Text>
    );
  }

  return (
    <View>
      {results.map((child) => (
        <PageBranch
          key={child._id}
          page={child}
          depth={depth}
          startupId={startupId}
          areaId={areaId}
          now={now}
          childCount={childCounts.get(child._id)}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onOpen={onOpen}
          layout={levelLayout}
        />
      ))}
      {status === 'LoadingMore' ? (
        <View style={[styles.childState, indent]}>
          <ActivityIndicator size="small" color={colors.mutedForeground} accessibilityLabel="Učitavanje" />
        </View>
      ) : status === 'CanLoadMore' ? (
        <Row
          title="Učitaj još"
          onPress={() => loadMore(20)}
          showChevron={false}
          style={[styles.pageMain, indent]}
        />
      ) : null}
    </View>
  );
}

function PageRow({
  page,
  depth,
  now,
  childCount,
  expanded,
  canExpand,
  onToggle,
  onOpen,
}: {
  page: PageItem;
  depth: number;
  now: number;
  childCount: ChildCount | undefined;
  expanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
  onOpen: (page: PageItem) => void;
}) {
  const colors = useThemeColors();
  const Icon = pageKindMeta(page.kind).icon;
  const tint = pageKindColor(colors, page.kind);
  const isTask = supportsTaskData(page.kind);
  const status = isTask ? (page.taskStatus ?? 'backlog') : null;
  const subpages =
    childCount && childCount.count > 0
      ? `${childCount.count}${childCount.capped ? '+' : ''}`
      : null;

  // Tap na red OTVARA stranicu; strelica levo razvija podstranice — dve odvojene
  // dodirne mete, kao stablo na webu (`page-tree.tsx`). Desno NEMA druge strelice:
  // tamo stoji meta (status zadatka, broj podstranica), a red je ionako ceo dodirljiv.
  return (
    <Row
      title={page.title}
      titleNumberOfLines={2}
      onPress={() => onOpen(page)}
      showChevron={false}
      accessibilityLabel={[
        `Otvori ${page.title}`,
        status ? TASK_STATUS_META[status].label : null,
        subpages ? `${subpages} podstranica` : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[styles.pageMain, { paddingLeft: depth * INDENT_STEP }]}
      leading={
        canExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={
              expanded ? `Sakrij podstranice: ${page.title}` : `Prikaži podstranice: ${page.title}`
            }
            onPress={() => {
              haptics.select();
              onToggle();
            }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.twisty,
              pressed && { backgroundColor: colors.muted },
            ]}>
            {expanded ? (
              <ChevronDown size={18} color={colors.mutedForeground} />
            ) : (
              <ChevronRight size={18} color={colors.mutedForeground} />
            )}
          </Pressable>
        ) : (
          <View style={styles.twisty} />
        )
      }
      icon={
        <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
          <Icon size={18} color={tint} />
        </View>
      }
      subtitle={
        isTask ? (
          <DeadlineBadge dueDate={page.dueDate} taskStatus={page.taskStatus} now={now} />
        ) : undefined
      }
      value={
        status || subpages ? (
          <View style={styles.rowMeta}>
            {status ? (
              <View style={styles.statusTag}>
                <View
                  style={[styles.statusDot, { backgroundColor: statusColor(colors, status) }]}
                />
                <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                  {TASK_STATUS_META[status].label}
                </Text>
              </View>
            ) : null}
            {subpages ? (
              <Text style={[styles.subpageCount, { color: colors.subtle }]}>{subpages}</Text>
            ) : null}
          </View>
        ) : undefined
      }
    />
  );
}

/**
 * Prazno stanje MORA da zna za filter — bez toga „Ova oblast je prazna." laže kad
 * oblast ima sadržaj druge vrste.
 */
function PageLevelEmpty({
  colors,
  kindFilter,
  onClearFilter,
  onCreate,
}: {
  colors: ColorTokens;
  kindFilter: PageKind | null;
  onClearFilter: () => void;
  onCreate: () => void;
}) {
  if (kindFilter !== null) {
    const Icon = pageKindMeta(kindFilter).icon;
    return (
      <EmptyState
        icon={<Icon size={40} color={colors.mutedForeground} />}
        title={`Nema stranica vrste ${pageKindMeta(kindFilter).label} u ovoj oblasti`}
        description="Filter važi za koren oblasti — podstranice se ne filtriraju."
        actionLabel="Prikaži sve"
        onAction={onClearFilter}
      />
    );
  }
  return (
    <EmptyState
      icon={<FolderOpen size={40} color={colors.mutedForeground} />}
      title="Ova oblast je prazna"
      description="Dodaj prvu stranicu."
      actionLabel="Nova stranica"
      onAction={onCreate}
    />
  );
}

/* ── Skeletoni ─────────────────────────────────────────────────────────── */

/** Oblik reda stabla: ikonica vrste 36 + naslov + meta linija. */
function PageListSkeleton() {
  return (
    <View style={[styles.listContent, styles.skeletonList]} accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje stranica">
      <SkeletonList
        count={5}
        gap={16}
        item={(index) => (
          <View style={styles.skeletonRow}>
            <Skeleton width={36} height={36} borderRadius={radius.md} />
            <View style={styles.skeletonBody}>
              <Skeleton width={index % 2 === 0 ? '70%' : '55%'} height={15} />
              <Skeleton width="40%" height={12} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

/**
 * Greška: upiti prolaze kroz `requireStartupMember` i bacaju kad korisnik nije
 * član — expo-router to hvata ovde umesto pada ekrana.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ProstorErrorState message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

/**
 * Ekran greške NE crta `TabScreen`: njegov `AppHeader` ima upite (profil, lista
 * startupa) koji bi pali istom greškom, pa goli `ScreenHeader`.
 */
function ProstorErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Prostor" titleSize="display" />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Prostor nije učitan."
        description={message || 'Proveri vezu i pokušaj ponovo.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  level2: {
    flex: 1,
  },
  filterNote: {
    ...text.meta,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  /* Početna dok se startup razrešava */
  pendingContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 16,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Meta desno u redu stabla: status zadatka i broj podstranica.
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...text.meta,
  },
  subpageCount: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
  },
  /* Nivo 2/3 lista */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    // Poslednji red mora ceo iznad FAB-a (56 + bottom 16). 160, ne 96: na Danas
    // listi je IZMERENO da 96 efektivno ostavi ~25dp (E11) — isti iznos i ovde.
    paddingBottom: 160,
  },
  // Red stranice kao `Row` override — samo horizontalni padding i radijus.
  // (`paddingLeft` se dodaje inline po dubini u stablu.)
  pageMain: {
    paddingHorizontal: 2,
    borderRadius: radius.control,
    minHeight: 52,
  },
  // Strelica „razvij" — svoja dodirna meta levo od ikonice vrste.
  twisty: {
    // Bila 28: visina je bila 44, širina nije. Sada je meta kvadratna.
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  childState: {
    paddingVertical: 10,
    paddingLeft: 2,
    alignItems: 'flex-start',
  },
  childEmpty: {
    ...text.body,
    paddingVertical: 10,
    paddingLeft: 2,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
  },
  footer: {
    paddingVertical: space[4],
    alignItems: 'center',
  },
  footerSpacer: {
    height: space[2],
  },
  /* Skeletoni */
  skeletonList: {
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
