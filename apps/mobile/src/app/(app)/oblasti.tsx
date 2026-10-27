import { useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { FolderClosed, FolderOpen, Plus, TriangleAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { exitFade, listLayout, useListEntering } from '@/components/motion';
import {
  AREA_ROW_TASK_COUNT_MAX,
  areaMetaLine,
  taskCountFromPage,
  TASK_COUNT_PAGE_SIZE,
  type CountValue,
} from '@/components/oblast/area-model';
import { CreateAreaSheet } from '@/components/prostor/create-area-sheet';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { UndoBar } from '@/components/undo-bar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { formatActivityTime, formatDayHeading } from '@/lib/activity';
import { startOfLocalDay } from '@/lib/deadline';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { backOrProstor, dismissToProstor } from '@/lib/navigation/back-to-prostor';
import { pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

/** Minimalni oblik stranice iz `pages.recentForStartup` koji red koristi. */
type RecentPage = {
  _id: Id<'pages'>;
  kind: PageKind;
  title: string;
  updatedAt: number;
};

/** „14:22" danas, inače dan („juče", „7. avgust"). */
function formatRecentTime(updatedAt: number, now: number): string {
  const day = startOfLocalDay(updatedAt);
  return day === startOfLocalDay(now) ? formatActivityTime(updatedAt) : formatDayHeading(day, now);
}

/**
 * „Dokumenti" (PROSTOR P18, plan K07 §4.5) — lista oblasti aktivnog startupa sa
 * brojem stranica i zadataka, „Nova oblast" i „Nedavno". Ulaz je red „Dokumenti"
 * u Prostoru; dodir na oblast otvara ekran oblasti (`/oblast/[id]`, K14).
 */
export default function OblastiScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { activeStartupId, restoring } = useActiveStartup();
  const arg = activeStartupId ? { startupId: activeStartupId } : 'skip';
  const startup = useQuery(api.startups.get, arg);
  // Broj stranica i „Nedavno" su pratioci: njihov pad ne sme da obori listu oblasti.
  const counts = useQueryTolerant(api.pages.areaTopLevelCounts, arg);
  const recent = useQueryTolerant(
    api.pages.recentForStartup,
    activeStartupId ? { startupId: activeStartupId, limit: 8 } : 'skip',
  );
  const [createAreaOpen, setCreateAreaOpen] = useState(false);
  // Fiksan „sada" po mount-u: relativno vreme se ne reklasifikuje u renderu.
  const [now] = useState(() => Date.now());

  const countByArea = useMemo(() => {
    const map = new Map<Id<'startupAreas'>, { count: number; capped: boolean }>();
    counts?.forEach((entry) => map.set(entry.areaId, { count: entry.count, capped: entry.capped }));
    return map;
  }, [counts]);

  const loading = activeStartupId === null || startup === undefined;
  const refreshControl = useListRefresh();
  const entering = useListEntering(reduced, `${activeStartupId ?? ''}:${loading ? 'ucitavanje' : 'spremno'}`);
  const layout = listLayout(reduced);

  const openArea = (area: Doc<'startupAreas'>) => {
    haptics.tap();
    router.push({ pathname: '/oblast/[id]', params: { id: area._id } });
  };

  const openPage = (page: RecentPage) => {
    haptics.tap();
    if (page.kind === 'task') {
      router.push({ pathname: '/zadatak/[id]', params: { id: page._id } });
    } else {
      router.push({ pathname: '/stranica/[id]', params: { id: page._id } });
    }
  };

  const header = <ScreenHeader title="Dokumenti" onBack={() => backOrProstor(router)} />;

  if (activeStartupId === null && !restoring) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {header}
        <EmptyState
          icon={<FolderOpen size={20} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Dokumenti se prikazuju po startupu."
          actionLabel="Otvori Prostor"
          onAction={() => dismissToProstor(router)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {header}
      {!loading && startup.areas.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={20} color={colors.mutedForeground} />}
          title="Nema oblasti."
          actionLabel="Nova oblast"
          onAction={() => setCreateAreaOpen(true)}
        />
      ) : (
        <LoadingSwap loading={loading} skeleton={<AreasSkeleton />}>
          {startup === undefined ? null : (
            <ScrollView
              contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}>
              <Animated.View layout={layout}>
                {startup.areas.map((area, index) => (
                  <Animated.View
                    key={area._id}
                    entering={entering(index)}
                    exiting={exitFade(reduced)}
                    layout={layout}>
                    <AreaListRow
                      startupId={startup._id}
                      area={area}
                      pages={countByArea.get(area._id) ?? null}
                      pagesLoading={counts === undefined}
                      withTasks={index < AREA_ROW_TASK_COUNT_MAX}
                      onPress={() => openArea(area)}
                    />
                  </Animated.View>
                ))}
                <Animated.View layout={layout}>
                  <Row
                    icon={<Plus size={20} color={colors.mutedForeground} />}
                    title="Nova oblast"
                    showChevron={false}
                    onPress={() => {
                      haptics.tap();
                      setCreateAreaOpen(true);
                    }}
                    style={[styles.row, styles.rowSingle]}
                  />
                </Animated.View>
              </Animated.View>

              {recent === undefined ? (
                // Mesto za „Nedavno" dok stiže — sekcija ne iskače i ne pomera listu.
                <View style={styles.section}>
                  <SectionHeader title="Nedavno" />
                  <SkeletonList
                    count={3}
                    gap={0}
                    item={(index) => <SkeletonRow index={index} leading="icon" subtitle />}
                  />
                </View>
              ) : recent.length > 0 ? (
                <Animated.View
                  entering={entering(startup.areas.length + 1)}
                  layout={layout}
                  style={styles.section}>
                  <SectionHeader title="Nedavno" />
                  {recent.map((page) => {
                    const Icon = pageKindMeta(page.kind).icon;
                    const time = formatRecentTime(page.updatedAt, now);
                    return (
                      <Animated.View key={page._id} exiting={exitFade(reduced)} layout={layout}>
                        <Row
                          icon={<Icon size={20} color={colors.mutedForeground} />}
                          title={page.title}
                          subtitle={time}
                          showChevron={false}
                          // Vreme je podnaslov, pa ga `Row` ne sklapa u labelu — dodaje se ručno.
                          accessibilityLabel={`Otvori ${page.title}, ${time}`}
                          onPress={() => openPage(page)}
                          style={styles.row}
                        />
                      </Animated.View>
                    );
                  })}
                </Animated.View>
              ) : null}
            </ScrollView>
          )}
        </LoadingSwap>
      )}

      {activeStartupId ? (
        <CreateAreaSheet
          open={createAreaOpen}
          startupId={activeStartupId}
          onClose={() => setCreateAreaOpen(false)}
        />
      ) : null}
      <UndoBar />
    </View>
  );
}

/**
 * Red oblasti: naziv + meta „12 stranica · 8 zadataka". Broj stranica dolazi iz
 * jednog upita za celu listu, a broj zadataka iz prve strane `tasks.listForArea`
 * (50, „50+") — pretplata po redu, pa samo za prvih `AREA_ROW_TASK_COUNT_MAX`.
 * Pad brojeva ne obara red: ostaje naziv bez mete.
 */
function AreaListRow({
  startupId,
  area,
  pages,
  pagesLoading,
  withTasks,
  onPress,
}: {
  startupId: Id<'startups'>;
  area: Doc<'startupAreas'>;
  pages: CountValue | null;
  pagesLoading: boolean;
  withTasks: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const firstTaskPage = useQueryTolerant(
    api.tasks.listForArea,
    withTasks
      ? {
          startupId,
          areaId: area._id,
          paginationOpts: { numItems: TASK_COUNT_PAGE_SIZE, cursor: null },
        }
      : 'skip',
  );
  const tasks = firstTaskPage ? taskCountFromPage(firstTaskPage) : null;
  const meta = areaMetaLine(pages, tasks);
  const waiting = meta === null && (pagesLoading || (withTasks && firstTaskPage === undefined));
  return (
    <Row
      icon={<FolderClosed size={20} color={colors.mutedForeground} />}
      title={area.label}
      subtitle={
        meta ?? (waiting ? <Skeleton width={120} height={13} borderRadius={radius.sm} /> : undefined)
      }
      accessibilityLabel={`Otvori oblast ${area.label}${meta ? `, ${meta}` : ''}`}
      onPress={onPress}
      style={[styles.row, meta === null && !waiting && styles.rowSingle]}
    />
  );
}

/** Oblik reda oblasti: ikonica, naziv, meta ispod. */
function AreasSkeleton() {
  return (
    <View
      style={styles.content}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje oblasti">
      <SkeletonList
        count={4}
        gap={0}
        item={(index) => <SkeletonRow index={index} leading="icon" subtitle />}
      />
    </View>
  );
}

/** `startups.get` baca kad korisnik nije član aktivnog startupa (uklonjen, zastareo izbor). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Dokumenti" onBack={() => backOrProstor(router)} />
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Dokumenti nisu učitani."
        description={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')}
        actionLabel="Pokušaj ponovo"
        onAction={retry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  // Lista ekrana već ima razmak 16 — red ga ne dodaje drugi put.
  row: {
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
  // Red bez meta reda: ista visina kao redovi Prostora i Više (DIZAJN-SMIRENJE §3).
  rowSingle: {
    minHeight: MIN_TOUCH_TARGET + 4,
  },
  section: {
    marginTop: 24,
  },
});
