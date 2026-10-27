import { usePaginatedQuery, useQuery, type PaginationStatus } from 'convex/react';
import { ChevronDown, ChevronRight, FolderOpen, Lock, MoreHorizontal } from 'lucide-react-native';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { EmptyState } from '@/components/empty-state';
import { LAYOUT_ANIMATION_MAX_ROWS } from '@/components/me/my-day/my-day-model';
import { enterFadeUp, exitFade, listLayout, useListEntering } from '@/components/motion';
import { KindFilterRow } from '@/components/prostor/kind-filter-row';
import { PageActionsSheet } from '@/components/stranica/page-actions-sheet';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { pageKindColor, pageKindMeta, supportsTaskData, type PageKind } from '@/lib/page-kinds';
import { statusColor, TASK_STATUS_META } from '@/lib/task-meta';
import type { TaskStatus } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, space, text, type ColorTokens } from '@/theme/tokens';

/**
 * Minimalni oblik stranice koji ovaj prikaz koristi — polja koja
 * `pages.listChildren` vraća (`summarizePage`), izabrana strukturno umesto pune
 * Convex inferencije.
 */
export type PageItem = {
  _id: Id<'pages'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
  kind: PageKind;
  title: string;
  taskStatus: TaskStatus | null;
  dueDate: number | null;
  updatedAt: number;
  /** `pages.listChildren` ga uvek šalje (broj ili `null`); ikonica Zaključano. */
  lockedAt?: number | null;
};

/** Otvara radnje nad redom (Premesti, Ugnezdi, Odvoji, Obriši); `PageLevel` ga daje redovima. */
const PageActionsContext = createContext<(page: PageItem) => void>(() => undefined);

/* ── Dokumenti: stablo stranica u oblasti ──────────────────────────────── */

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

/**
 * Kartica Dokumenti ekrana oblasti (K14): stranice vrha oblasti kao stablo, filter
 * vrste i razvijanje grana. Dodir na red OTVARA stranicu (ne roni u podstranice),
 * strelica levo razvija. Preseljeno iz Prostora (K09 → K14).
 */
export function PageLevel({
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
  // Radnje nad redom: stranica se učitava (`pages.get`) tek kad se radnje otvore.
  const [actionsPageId, setActionsPageId] = useState<Id<'pages'> | null>(null);
  const openActions = useCallback((page: PageItem) => {
    haptics.tap();
    setActionsPageId(page._id);
  }, []);
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
    <PageActionsContext.Provider value={openActions}>
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
      <PageRowActions pageId={actionsPageId} onClose={() => setActionsPageId(null)} />
    </View>
    </PageActionsContext.Provider>
  );
}

/**
 * Radnje nad stranicom iz Dokumenata: isti PageActionsSheet kao na ekranu stranice
 * (premesti, ugnezdi, odvoji, zaključaj, obriši uz Poništi). Istorija i Mapa se ovde
 * ne nude (otvaraju se sa ekrana stranice). Pad upita ne obara listu.
 */
function PageRowActions({ pageId, onClose }: { pageId: Id<'pages'> | null; onClose: () => void }) {
  const page = useQueryTolerant(api.pages.get, pageId === null ? 'skip' : { pageId });
  if (pageId === null || page === undefined) return null;
  return <PageActionsSheet open page={page} onClose={onClose} onArchived={onClose} />;
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
  const openActions = useContext(PageActionsContext);
  const locked = page.lockedAt != null;
  const title = page.title.trim() === '' ? 'Bez naslova' : page.title;
  const subpages =
    childCount && childCount.count > 0
      ? `${childCount.count}${childCount.capped ? '+' : ''}`
      : null;

  // Tap na red OTVARA stranicu; strelica levo razvija podstranice — dve odvojene
  // dodirne mete, kao stablo na webu (`page-tree.tsx`). Desno NEMA druge strelice:
  // tamo stoji meta (status zadatka, broj podstranica), a red je ionako ceo dodirljiv.
  return (
    <Row
      title={title}
      titleNumberOfLines={2}
      onPress={() => onOpen(page)}
      onLongPress={() => openActions(page)}
      showChevron={false}
      accessibilityHint="Dugi pritisak otvara radnje nad stranicom"
      accessibilityLabel={[
        `Otvori ${title}`,
        locked ? 'zaključano' : null,
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
        <View style={styles.iconChip}>
          <Icon size={18} color={tint} />
        </View>
      }
      subtitle={
        isTask ? (
          <DeadlineBadge dueDate={page.dueDate} taskStatus={page.taskStatus} now={now} />
        ) : undefined
      }
      value={
        (
          <View style={styles.rowMeta}>
            {locked ? <Lock size={14} color={colors.mutedForeground} /> : null}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Radnje: ${title}`}
              onPress={() => openActions(page)}
              hitSlop={4}
              style={({ pressed }) => [styles.more, pressed && { backgroundColor: colors.muted }]}>
              <MoreHorizontal size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        )
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
        icon={<Icon size={20} color={colors.mutedForeground} />}
        title="Nema rezultata za ovaj filter."
        description="Filter važi za koren oblasti — podstranice se ne filtriraju."
        actionLabel="Poništi filter"
        onAction={onClearFilter}
      />
    );
  }
  return (
    <EmptyState
      icon={<FolderOpen size={20} color={colors.mutedForeground} />}
      title="Oblast još nema stranica."
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

const styles = StyleSheet.create({
  level2: {
    flex: 1,
  },
  filterNote: {
    ...text.meta,
    paddingHorizontal: 16,
    paddingBottom: 6,
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
  more: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
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
