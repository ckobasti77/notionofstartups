import { usePaginatedQuery, useQuery } from 'convex/react';
import { useFocusEffect, useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  LayoutGrid,
  Plus,
  TriangleAlert,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppHeader } from '@/components/app-header';
import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { EmptyState } from '@/components/empty-state';
import { AreaBriefingSection } from '@/components/prostor/area-briefing-section';
import { CreateAreaSheet } from '@/components/prostor/create-area-sheet';
import { TabScreen } from '@/components/tab-screen';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { formatActivityTime, formatDayHeading } from '@/lib/activity';
import { haptics } from '@/lib/haptics';
import { startOfLocalDay } from '@/lib/deadline';
import {
  pageKindColor,
  pageKindMeta,
  supportsTaskData,
  type PageKind,
} from '@/lib/page-kinds';
import { areaColor, statusColor, TASK_STATUS_META } from '@/lib/task-meta';
import type { TaskStatus } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import {
  fontWeight,
  MIN_TOUCH_TARGET,
  radius,
  space,
  text,
  type ColorTokens,
} from '@/theme/tokens';

/**
 * Minimalni oblik stranice koji ovaj ekran koristi — presek polja koja i
 * `pages.listChildren` i `pages.recentForStartup` vraćaju (`summarizePage`). Bira
 * se strukturno umesto pune Convex inferencije da red i „Nedavno" dele isti tip.
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

/** „Danas 14:22" nije potrebno — kratko relativno vreme za sekciju „Nedavno". */
function formatRecentTime(updatedAt: number, now: number): string {
  const day = startOfLocalDay(updatedAt);
  return day === startOfLocalDay(now)
    ? formatActivityTime(updatedAt)
    : formatDayHeading(day, now);
}

/**
 * Tab „Prostor" — hijerarhijska navigacija kroz oblasti i stranice
 * (docs/mobile/02-EKRANI.md §5). Zamena za desktop `workspace-sidebar` +
 * `page-tree`. Prostor ide samo do liste stranica u oblasti; tap na red OTVARA
 * stranicu (beleška/fajl/tabela → ekran stranice, zadatak → ekran zadatka), a
 * podstranice su sekcija u samoj stranici. „Nazad" sa liste vraća na Nivo 1.
 */
export default function ProstorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { activeStartupId } = useActiveStartup();
  const [frames, setFrames] = useState<Frame[]>([]);
  // Fiksan „sada" po mount-u: rok/relativno vreme se ne reklasifikuju u renderu.
  const [now] = useState(() => Date.now());

  // Promena startupa (switcher u headeru) resetuje hijerarhiju na Nivo 1: okviri
  // drže id-jeve oblasti/stranica starog startupa, pa bi upit pukao na tuđem id-ju.
  useEffect(() => {
    setFrames([]);
  }, [activeStartupId]);

  const openArea = useCallback((area: Doc<'startupAreas'>) => {
    haptics.tap();
    setFrames([{ areaId: area._id, label: area.label }]);
  }, []);

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
  // listu oblasti (Nivo 1).
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

  if (top === null) {
    return (
      <Level1
        startupId={activeStartupId}
        now={now}
        onOpenArea={openArea}
        onOpenLeaf={openLeaf}
      />
    );
  }

  const frameKey = `area:${top.areaId}`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Isto zaglavlje kao Nivo 1, samo sa „nazad" i imenom oblasti kao naslovom —
          Prostor ide jedan nivo duboko, pa breadcrumb nema šta da nabraja. */}
      <AppHeader
        title={top.label}
        onBack={goBack}
        actions={
          <IconButton
            accessibilityLabel="Canvas prikaz oblasti"
            onPress={() => openAreaCanvas(top.areaId)}>
            <LayoutGrid size={22} color={colors.foreground} />
          </IconButton>
        }
      />
      {/* Brifing stoji iznad liste, kao dock na vrhu web `area-view`. */}
      <AreaBriefingSection key={`brifing:${top.areaId}`} areaId={top.areaId} areaLabel={top.label} />
      <PageLevel
        key={frameKey}
        startupId={activeStartupId}
        areaId={top.areaId}
        now={now}
        onOpenLeaf={openLeaf}
      />
    </View>
  );
}

/* ── Nivo 1: oblasti + Nedavno ─────────────────────────────────────────── */

function Level1({
  startupId,
  now,
  onOpenArea,
  onOpenLeaf,
}: {
  startupId: Id<'startups'> | null;
  now: number;
  onOpenArea: (area: Doc<'startupAreas'>) => void;
  onOpenLeaf: (page: PageItem) => void;
}) {
  const colors = useThemeColors();
  const arg = startupId ? { startupId } : 'skip';
  const startup = useQuery(api.startups.get, arg);
  const counts = useQuery(api.pages.areaTopLevelCounts, arg);
  const recent = useQuery(
    api.pages.recentForStartup,
    startupId ? { startupId, limit: 8 } : 'skip',
  );
  const [createAreaOpen, setCreateAreaOpen] = useState(false);

  const countByArea = useMemo(() => {
    const map = new Map<Id<'startupAreas'>, { count: number; capped: boolean }>();
    counts?.forEach((entry) => map.set(entry.areaId, { count: entry.count, capped: entry.capped }));
    return map;
  }, [counts]);

  const loading = startupId === null || startup === undefined;
  const refreshControl = useListRefresh();

  return (
    <TabScreen title="Prostor">
      {!loading && startup.areas.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={40} color={colors.mutedForeground} />}
          title="Još nema oblasti"
          description="Oblasti i stranice tima pojaviće se ovde."
          actionLabel="Nova oblast"
          onAction={() => setCreateAreaOpen(true)}
        />
      ) : (
        <LoadingSwap loading={loading} skeleton={<Level1Skeleton />}>
          {startup === undefined ? null : (
            <ScrollView
              contentContainerStyle={styles.level1Content}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}>
              <StaggerGroup>
                <View style={styles.areaList}>
                  {startup.areas.map((area, index) => (
                    <StaggerItem key={area._id} index={index}>
                      <AreaRow
                        area={area}
                        count={countByArea.get(area._id)}
                        countsLoaded={counts !== undefined}
                        colors={colors}
                        onPress={() => onOpenArea(area)}
                      />
                    </StaggerItem>
                  ))}
                  {/* Nova oblast stoji uz listu oblasti — isti ulaz kao web „Nova oblast". */}
                  <Row
                    title="Nova oblast"
                    onPress={() => {
                      haptics.tap();
                      setCreateAreaOpen(true);
                    }}
                    showChevron={false}
                    style={[styles.addAreaRow, { borderColor: colors.border }]}
                    icon={<Plus size={20} color={colors.mutedForeground} />}
                  />
                </View>

                {recent && recent.length > 0 ? (
                  <View style={styles.recentSection}>
                    <Text
                      accessibilityRole="header"
                      style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                      Nedavno
                    </Text>
                    {recent.map((page, index) => (
                      <StaggerItem key={page._id} index={startup.areas.length + index}>
                        <RecentRow
                          page={page}
                          now={now}
                          colors={colors}
                          onPress={() => onOpenLeaf(page)}
                        />
                      </StaggerItem>
                    ))}
                  </View>
                ) : null}
              </StaggerGroup>
            </ScrollView>
          )}
        </LoadingSwap>
      )}

      {startupId ? (
        <CreateAreaSheet
          open={createAreaOpen}
          startupId={startupId}
          onClose={() => setCreateAreaOpen(false)}
        />
      ) : null}
    </TabScreen>
  );
}

function AreaRow({
  area,
  count,
  countsLoaded,
  colors,
  onPress,
}: {
  area: Doc<'startupAreas'>;
  count: { count: number; capped: boolean } | undefined;
  countsLoaded: boolean;
  colors: ColorTokens;
  onPress: () => void;
}) {
  const tint = areaColor(colors, area.key);
  const label = count ? (count.capped ? `${count.count}+` : String(count.count)) : null;
  return (
    <Row
      title={area.label}
      onPress={onPress}
      accessibilityLabel={`Otvori oblast ${area.label}${label ? `, ${label} stranica` : ''}`}
      style={[styles.areaCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      icon={
        <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
          <FolderClosed size={20} color={tint} />
        </View>
      }
      value={
        label !== null ? (
          <Pill label={label} />
        ) : !countsLoaded ? (
          <Skeleton width={26} height={20} borderRadius={radius.pill} />
        ) : undefined
      }
    />
  );
}

function RecentRow({
  page,
  now,
  colors,
  onPress,
}: {
  page: PageItem;
  now: number;
  colors: ColorTokens;
  onPress: () => void;
}) {
  const Icon = pageKindMeta(page.kind).icon;
  const tint = pageKindColor(colors, page.kind);
  return (
    <Row
      title={page.title}
      subtitle={formatRecentTime(page.updatedAt, now)}
      onPress={onPress}
      showChevron={false}
      // Vreme je podnaslov, pa ga `Row` ne sklapa u labelu — dodaje se ručno.
      accessibilityLabel={`Otvori ${page.title}, ${formatRecentTime(page.updatedAt, now)}`}
      style={styles.recentRow}
      icon={
        <View style={[styles.iconChipSm, { backgroundColor: `${tint}22` }]}>
          <Icon size={16} color={tint} />
        </View>
      }
    />
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
}: {
  startupId: Id<'startups'> | null;
  areaId: Id<'startupAreas'>;
  now: number;
  onOpenLeaf: (page: PageItem) => void;
}) {
  const colors = useThemeColors();
  // Koren oblasti (`parentPageId: null`); dublji nivoi se dohvataju tek kad se red
  // razvije — svaki `PageBranch` ima svoj upit i montira ga samo dok je otvoren.
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    startupId ? { startupId, areaId, parentPageId: null } : 'skip',
    { initialNumItems: 50 },
  );

  // Stanje razvijenosti živi na nivou oblasti i traje dok se ne napusti ekran /
  // ne promeni oblast (`key` na `PageLevel` u roditelju ga tada resetuje).
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

  const loading = startupId === null || status === 'LoadingFirstPage';

  if (!loading && results.length === 0) {
    return <PageLevelEmpty colors={colors} />;
  }

  return (
    <LoadingSwap loading={loading} skeleton={<PageListSkeleton />}>
      {startupId === null || loading ? null : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          renderItem={({ item, index }) => (
            <StaggerItem index={index}>
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
              />
            </StaggerItem>
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
}) {
  const expanded = expandedIds.has(page._id);
  return (
    <View>
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
        <ChildPages
          startupId={startupId}
          areaId={areaId}
          parentPageId={page._id}
          depth={depth + 1}
          now={now}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ) : null}
    </View>
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
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'>;
  depth: number;
  now: number;
  expandedIds: ReadonlySet<string>;
  onToggle: (pageId: string) => void;
  onOpen: (page: PageItem) => void;
}) {
  const colors = useThemeColors();
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId, areaId, parentPageId },
    { initialNumItems: 20 },
  );
  const childCounts = useChildCounts(startupId, areaId, results);
  const indent = { paddingLeft: depth * INDENT_STEP };

  if (status === 'LoadingFirstPage') {
    return (
      <View style={[styles.childState, indent]}>
        <ActivityIndicator
          size="small"
          color={colors.mutedForeground}
          accessibilityLabel="Učitavanje podstranica"
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

function PageLevelEmpty({ colors }: { colors: ColorTokens }) {
  return (
    <EmptyState
      icon={<FolderOpen size={40} color={colors.mutedForeground} />}
      title="Ova oblast je prazna."
      description="Otvori Canvas u zaglavlju da dodaš prvu stranicu."
    />
  );
}

/* ── Skeletoni ─────────────────────────────────────────────────────────── */

/** Oblik kartice oblasti: ikonica-čip 40 + naziv + brojač stranica desno. */
function Level1Skeleton() {
  const colors = useThemeColors();
  return (
    <View style={styles.level1Content} accessibilityLabel="Učitavanje oblasti">
      <SkeletonList
        count={4}
        gap={4}
        item={() => (
          <View style={[styles.areaRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Skeleton width={40} height={40} borderRadius={radius.md} />
            <Skeleton width="45%" height={16} />
            <View style={styles.grow} />
            <Skeleton width={26} height={20} borderRadius={radius.full} />
          </View>
        )}
      />
    </View>
  );
}

/** Oblik reda stabla: ikonica vrste 36 + naslov + meta linija. */
function PageListSkeleton() {
  return (
    <View style={[styles.listContent, styles.skeletonList]} accessibilityLabel="Učitavanje stranica">
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
  return <ProstorErrorState message={error.message} onRetry={retry} />;
}

function ProstorErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <TabScreen title="Prostor">
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Prostor se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju oblasti.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  /* Nivo 1 */
  level1Content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 16,
  },
  areaList: {
    gap: 4,
  },
  // Skelet oblasti (Level1Skeleton) i dalje sklapa red ručno.
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Kartica oblasti kao `Row` override (ostalo dolazi iz Row.base).
  areaCard: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // „Nova oblast" — isečkana ivica je razlikuje od stvarnih oblasti.
  addAreaRow: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipSm: {
    width: 28,
    height: 28,
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
  grow: {
    flex: 1,
  },
  recentSection: {
    gap: 2,
  },
  sectionLabel: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
    marginLeft: 2,
  },
  // „Nedavno" red kao `Row` override — samo horizontalni padding i radijus.
  recentRow: {
    paddingHorizontal: 2,
    borderRadius: radius.md,
  },
  /* Nivo 2/3 lista */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
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
    width: 28,
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
