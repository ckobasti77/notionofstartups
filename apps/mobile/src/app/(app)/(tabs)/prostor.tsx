import { usePaginatedQuery, useQuery } from 'convex/react';
import { useFocusEffect, useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  LayoutGrid,
  LayoutList,
  Plus,
  TriangleAlert,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { EmptyState } from '@/components/empty-state';
import { CreateAreaSheet } from '@/components/prostor/create-area-sheet';
import { TabScreen } from '@/components/tab-screen';
import { Row } from '@/components/ui/row';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { formatActivityTime, formatDayHeading } from '@/lib/activity';
import { startOfLocalDay } from '@/lib/deadline';
import {
  pageKindColor,
  pageKindMeta,
  supportsTaskData,
  type PageKind,
} from '@/lib/page-kinds';
import { areaColor } from '@/lib/task-meta';
import type { TaskStatus } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, type ColorTokens } from '@/theme/tokens';

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
    setFrames([{ areaId: area._id, label: area.label }]);
  }, []);

  const openLeaf = useCallback(
    (page: PageItem) => {
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
      router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'area', id: areaId } });
    },
    [router],
  );

  // Prostor je jednonivoovski (oblast → njene stranice), pa „nazad" uvek vraća na
  // listu oblasti (Nivo 1).
  const goBack = useCallback(() => {
    setFrames((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const jumpTo = useCallback((index: number) => {
    setFrames((prev) => prev.slice(0, index + 1));
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
      <DeepHeader
        frames={frames}
        colors={colors}
        onBack={goBack}
        onJump={jumpTo}
        rightSlot={
          <ViewModeToggle colors={colors} onOpenCanvas={() => openAreaCanvas(top.areaId)} />
        }
      />
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

  return (
    <TabScreen title="Prostor">
      {loading ? (
        <Level1Skeleton colors={colors} />
      ) : startup.areas.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={40} color={colors.mutedForeground} />}
          title="Još nema oblasti"
          description="Oblasti i stranice tima pojaviće se ovde."
          actionLabel="Nova oblast"
          onAction={() => setCreateAreaOpen(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.level1Content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.areaList}>
            {startup.areas.map((area) => (
              <AreaRow
                key={area._id}
                area={area}
                count={countByArea.get(area._id)}
                countsLoaded={counts !== undefined}
                colors={colors}
                onPress={() => onOpenArea(area)}
              />
            ))}
            {/* Nova oblast stoji uz listu oblasti — isti ulaz kao web „Nova oblast". */}
            <Row
              title="Nova oblast"
              onPress={() => setCreateAreaOpen(true)}
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
              {recent.map((page) => (
                <RecentRow
                  key={page._id}
                  page={page}
                  now={now}
                  colors={colors}
                  onPress={() => onOpenLeaf(page)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
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
          <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>{label}</Text>
          </View>
        ) : !countsLoaded ? (
          <Skeleton width={26} height={20} borderRadius={radius.full} />
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

  if (startupId === null || status === 'LoadingFirstPage') {
    return <PageListSkeleton />;
  }

  if (results.length === 0) {
    return <PageLevelEmpty colors={colors} />;
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => (
        <PageBranch
          page={item}
          depth={0}
          startupId={startupId}
          areaId={areaId}
          now={now}
          expandedIds={expandedIds}
          onToggle={toggle}
          onOpen={onOpenLeaf}
        />
      )}
      ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
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
    />
  );
}

/** Jedan red stabla + (kad je razvijen) njegova deca. */
function PageBranch({
  page,
  depth,
  startupId,
  areaId,
  now,
  expandedIds,
  onToggle,
  onOpen,
}: {
  page: PageItem;
  depth: number;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  now: number;
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
        expanded={expanded}
        canExpand={depth < MAX_TREE_DEPTH}
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
  expanded,
  canExpand,
  onToggle,
  onOpen,
}: {
  page: PageItem;
  depth: number;
  now: number;
  expanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
  onOpen: (page: PageItem) => void;
}) {
  const colors = useThemeColors();
  const Icon = pageKindMeta(page.kind).icon;
  const tint = pageKindColor(colors, page.kind);
  // Tap na red OTVARA stranicu; strelica levo razvija podstranice — dve odvojene
  // dodirne mete, kao stablo na webu (`page-tree.tsx`). Da li stranica uopšte ima
  // decu ne znamo pre upita, pa strelica stoji na svakom redu (isto kao web).
  return (
    <Row
      title={page.title}
      titleNumberOfLines={2}
      onPress={() => onOpen(page)}
      accessibilityLabel={`Otvori ${page.title}`}
      style={[styles.pageMain, { paddingLeft: depth * INDENT_STEP }]}
      leading={
        canExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={
              expanded ? `Sakrij podstranice: ${page.title}` : `Prikaži podstranice: ${page.title}`
            }
            onPress={onToggle}
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
        supportsTaskData(page.kind) ? (
          <DeadlineBadge dueDate={page.dueDate} taskStatus={page.taskStatus} now={now} />
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

/* ── Header za dublje nivoe: nazad + horizontalni breadcrumb + akcija ──── */

function DeepHeader({
  frames,
  colors,
  onBack,
  onJump,
  rightSlot,
}: {
  frames: Frame[];
  colors: ColorTokens;
  onBack: () => void;
  onJump: (index: number) => void;
  rightSlot: React.ReactNode;
}) {
  const scrollRef = useRef<ScrollView>(null);
  // Bez `insets.top`: ovo je kontekstualna traka ISPOD stalnog `AppHeader`-a
  // (roditeljski Stack), koji je već „pojeo" gornji safe-area za sve tabove.
  return (
    <View
      style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.breadcrumbScroll}
        contentContainerStyle={styles.breadcrumbContent}
        // Uvek skrolovan na kraj: trenutni (najdublji) nivo je vidljiv na telefonu.
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {frames.map((frame, index) => {
          const label = frame.label;
          const isLast = index === frames.length - 1;
          return (
            <View key={index} style={styles.crumb}>
              {index > 0 ? (
                <ChevronRight size={14} color={colors.mutedForeground} style={styles.crumbSep} />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Idi na ${label}`}
                disabled={isLast}
                onPress={() => onJump(index)}
                style={({ pressed }) => [
                  styles.crumbButton,
                  pressed && !isLast && { backgroundColor: colors.muted },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.crumbText,
                    {
                      color: isLast ? colors.foreground : colors.mutedForeground,
                      fontWeight: isLast ? fontWeight.semibold : fontWeight.medium,
                    },
                  ]}>
                  {label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {rightSlot ? <View style={styles.headerRight}>{rightSlot}</View> : null}
    </View>
  );
}

/** Prekidač Lista / Canvas — Canvas otvara WebView embed kanvasa oblasti (§9.3). */
function ViewModeToggle({
  colors,
  onOpenCanvas,
}: {
  colors: ColorTokens;
  onOpenCanvas: () => void;
}) {
  return (
    <View accessibilityRole="tablist" style={[styles.toggle, { backgroundColor: colors.muted }]}>
      <View
        accessibilityRole="tab"
        accessibilityLabel="Lista prikaz"
        accessibilityState={{ selected: true }}
        style={[
          styles.toggleSeg,
          styles.toggleSegActive,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <LayoutList size={15} color={colors.foreground} />
        <Text style={[styles.toggleText, { color: colors.foreground }]}>Lista</Text>
      </View>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel="Canvas prikaz oblasti"
        accessibilityState={{ selected: false }}
        onPress={onOpenCanvas}
        style={styles.toggleSeg}>
        <LayoutGrid size={15} color={colors.foreground} />
        <Text style={[styles.toggleText, { color: colors.foreground }]}>Canvas</Text>
      </Pressable>
    </View>
  );
}

/* ── Skeletoni ─────────────────────────────────────────────────────────── */

function Level1Skeleton({ colors }: { colors: ColorTokens }) {
  return (
    <View style={styles.level1Content} accessibilityLabel="Učitavanje oblasti">
      <View style={styles.areaList}>
        {[0, 1, 2, 3].map((item) => (
          <View
            key={item}
            style={[styles.areaRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Skeleton width={40} height={40} borderRadius={radius.md} />
            <Skeleton width="45%" height={16} />
            <View style={styles.grow} />
            <Skeleton width={26} height={20} borderRadius={radius.full} />
          </View>
        ))}
      </View>
    </View>
  );
}

function PageListSkeleton() {
  return (
    <View style={[styles.listContent, styles.skeletonList]} accessibilityLabel="Učitavanje stranica">
      {[0, 1, 2, 3, 4].map((item) => (
        <View key={item} style={styles.skeletonRow}>
          <Skeleton width={36} height={36} borderRadius={radius.md} />
          <View style={styles.skeletonBody}>
            <Skeleton width="70%" height={15} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
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
  /* Header (dublji nivoi) */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  breadcrumbScroll: {
    flex: 1,
  },
  breadcrumbContent: {
    alignItems: 'center',
    paddingRight: 8,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbSep: {
    marginHorizontal: 2,
  },
  crumbButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  crumbText: {
    fontSize: 16,
  },
  headerRight: {
    marginLeft: 4,
  },
  /* Lista/Canvas prekidač */
  toggle: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.lg,
    gap: 3,
  },
  toggleSeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  toggleSegActive: {},
  toggleText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
  /* Nivo 1 */
  level1Content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 24,
  },
  areaList: {
    gap: 8,
  },
  // Skelet oblasti (Level1Skeleton) i dalje sklapa red ručno.
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Kartica oblasti kao `Row` override (ostalo dolazi iz Row.base).
  areaCard: {
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // „Nova oblast" — isečkana ivica je razlikuje od stvarnih oblasti.
  addAreaRow: {
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipSm: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  grow: {
    flex: 1,
  },
  recentSection: {
    gap: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
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
    borderRadius: radius.md,
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
    fontSize: 16,
    lineHeight: 22,
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
    gap: 16,
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
