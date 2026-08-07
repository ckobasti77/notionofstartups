import { usePaginatedQuery, useQuery } from 'convex/react';
import { useFocusEffect, useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  LayoutGrid,
  LayoutList,
  SquareArrowOutUpRight,
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
import { TabScreen } from '@/components/tab-screen';
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
import { pageBackRoute } from '@/lib/workspace-route';
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

/** Jedan nivo u hijerarhiji: koren oblasti (Nivo 2) ili ugnježdena stranica (Nivo 3+). */
type Frame =
  | { kind: 'area'; areaId: Id<'startupAreas'>; label: string }
  | { kind: 'page'; page: PageItem };

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
 * `page-tree`. Nivoi se drže u internom steku okvira (bez push ruta), pa header
 * nosi breadcrumb, a „nazad" ide kroz `pageBackRoute` (roditeljska stranica,
 * inače koren oblasti). Ceo red uđe dublje; zaseban „Otvori" vodi na sadržaj
 * (beleška/fajl/tabela → editor placeholder, zadatak → ekran zadatka).
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
    setFrames([{ kind: 'area', areaId: area._id, label: area.label }]);
  }, []);

  const drillPage = useCallback((page: PageItem) => {
    setFrames((prev) => [...prev, { kind: 'page', page }]);
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

  // „Nazad" kroz hijerarhiju preko `pageBackRoute`: nivo naviše — roditeljska
  // stranica, inače koren oblasti; sa korena oblasti nazad na listu oblasti.
  const goBack = useCallback(() => {
    setFrames((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[prev.length - 1];
      if (top.kind === 'area') return [];
      const back = pageBackRoute(top.page);
      return back.kind === 'area' ? prev.slice(0, 1) : prev.slice(0, prev.length - 1);
    });
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

  const areaId = top.kind === 'area' ? top.areaId : top.page.areaId;
  const parentPageId = top.kind === 'area' ? null : top.page._id;
  // Ključ po nivou: svaki nivo dobija svež paginacioni kursor (`listChildren`).
  const frameKey = top.kind === 'area' ? `area:${top.areaId}` : `page:${top.page._id}`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <DeepHeader
        frames={frames}
        colors={colors}
        onBack={goBack}
        onJump={jumpTo}
        rightSlot={
          top.kind === 'area' ? (
            <ViewModeToggle colors={colors} onOpenCanvas={() => openAreaCanvas(top.areaId)} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Otvori ${top.page.title}`}
              onPress={() => openLeaf(top.page)}
              style={({ pressed }) => [styles.openButton, pressed && { backgroundColor: colors.muted }]}>
              <SquareArrowOutUpRight size={20} color={colors.foreground} />
            </Pressable>
          )
        }
      />
      <PageLevel
        key={frameKey}
        startupId={activeStartupId}
        areaId={areaId}
        parentPageId={parentPageId}
        currentPage={top.kind === 'page' ? top.page : null}
        now={now}
        onDrill={drillPage}
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Otvori oblast ${area.label}${label ? `, ${label} stranica` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.areaRow,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}>
      <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
        <FolderClosed size={20} color={tint} />
      </View>
      <Text numberOfLines={1} style={[styles.areaLabel, { color: colors.foreground }]}>
        {area.label}
      </Text>
      {label !== null ? (
        <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>{label}</Text>
        </View>
      ) : !countsLoaded ? (
        <Skeleton width={26} height={20} borderRadius={radius.full} />
      ) : null}
      <ChevronRight size={20} color={colors.mutedForeground} />
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Otvori ${page.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.recentRow, pressed && { backgroundColor: colors.muted }]}>
      <View style={[styles.iconChipSm, { backgroundColor: `${tint}22` }]}>
        <Icon size={16} color={tint} />
      </View>
      <Text numberOfLines={1} style={[styles.recentTitle, { color: colors.foreground }]}>
        {page.title}
      </Text>
      <Text style={[styles.recentTime, { color: colors.mutedForeground }]}>
        {formatRecentTime(page.updatedAt, now)}
      </Text>
    </Pressable>
  );
}

/* ── Nivo 2/3: stranice u oblasti / podstranice ────────────────────────── */

function PageLevel({
  startupId,
  areaId,
  parentPageId,
  currentPage,
  now,
  onDrill,
  onOpenLeaf,
}: {
  startupId: Id<'startups'> | null;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
  currentPage: PageItem | null;
  now: number;
  onDrill: (page: PageItem) => void;
  onOpenLeaf: (page: PageItem) => void;
}) {
  const colors = useThemeColors();
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    startupId ? { startupId, areaId, parentPageId } : 'skip',
    { initialNumItems: 50 },
  );

  const loadingFirst = startupId === null || status === 'LoadingFirstPage';

  if (loadingFirst) {
    return <PageListSkeleton />;
  }

  if (results.length === 0) {
    return <PageLevelEmpty currentPage={currentPage} colors={colors} onOpenLeaf={onOpenLeaf} />;
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => (
        <PageRow page={item} now={now} colors={colors} onDrill={onDrill} onOpen={onOpenLeaf} />
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

function PageRow({
  page,
  now,
  colors,
  onDrill,
  onOpen,
}: {
  page: PageItem;
  now: number;
  colors: ColorTokens;
  onDrill: (page: PageItem) => void;
  onOpen: (page: PageItem) => void;
}) {
  const Icon = pageKindMeta(page.kind).icon;
  const tint = pageKindColor(colors, page.kind);
  // Dva sestrinska dodirna elementa (ne ugnježdena): red = uđi dublje, dugme =
  // otvori sadržaj. Ugnježdeni Pressable bi ih spojio u jedan a11y čvor, pa
  // „Otvori" ne bi bio poseban fokus za čitač ekrana.
  return (
    <View style={styles.pageRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Uđi u ${page.title}`}
        accessibilityHint="Prikazuje podstranice"
        onPress={() => onDrill(page)}
        style={({ pressed }) => [styles.pageMain, pressed && { backgroundColor: colors.muted }]}>
        <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
          <Icon size={18} color={tint} />
        </View>
        <View style={styles.pageBody}>
          <Text numberOfLines={2} style={[styles.pageTitle, { color: colors.foreground }]}>
            {page.title}
          </Text>
          {supportsTaskData(page.kind) ? (
            <DeadlineBadge dueDate={page.dueDate} taskStatus={page.taskStatus} now={now} />
          ) : null}
        </View>
        <ChevronRight size={18} color={colors.mutedForeground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Otvori ${page.title}`}
        onPress={() => onOpen(page)}
        style={({ pressed }) => [styles.openButton, pressed && { backgroundColor: colors.muted }]}>
        <SquareArrowOutUpRight size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function PageLevelEmpty({
  currentPage,
  colors,
  onOpenLeaf,
}: {
  currentPage: PageItem | null;
  colors: ColorTokens;
  onOpenLeaf: (page: PageItem) => void;
}) {
  if (currentPage) {
    const Icon = pageKindMeta(currentPage.kind).icon;
    return (
      <EmptyState
        icon={<Icon size={40} color={colors.mutedForeground} />}
        title="Nema podstranica"
        description="Ova stranica još nema ugnježdene stranice."
        actionLabel="Otvori stranicu"
        onAction={() => onOpenLeaf(currentPage)}
      />
    );
  }
  return (
    <EmptyState
      icon={<FolderOpen size={40} color={colors.mutedForeground} />}
      title="Ova oblast je prazna."
      description="Kreiranje stranica stiže u Fazi 3."
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
          const label = frame.kind === 'area' ? frame.label : frame.page.title;
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
    fontSize: 15,
  },
  headerRight: {
    marginLeft: 4,
  },
  openButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
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
  areaLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: fontWeight.semibold,
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
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  recentTitle: {
    flex: 1,
    fontSize: 16,
  },
  recentTime: {
    fontSize: 13,
  },
  /* Nivo 2/3 lista */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 2,
    borderRadius: radius.md,
  },
  pageBody: {
    flex: 1,
    gap: 6,
    alignItems: 'flex-start',
  },
  pageTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: fontWeight.medium,
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
