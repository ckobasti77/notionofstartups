import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { FolderOpen, Map as MapIcon, MoreHorizontal, Pencil, Plus, TriangleAlert } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PageCreateSheet } from '@/components/canvas/page-create-sheet';
import { BlockBoundary } from '@/components/collab/block-boundary';
import { SegmentedControl } from '@/components/chat/segmented-control';
import { QuickAddFab } from '@/components/danas/quick-add-fab';
import { EmptyState } from '@/components/empty-state';
import { AreaOverview } from '@/components/oblast/area-overview';
import {
  AREA_TABS,
  areaMetaLine,
  DEFAULT_AREA_TAB,
  taskCountFromPage,
  TASK_COUNT_PAGE_SIZE,
  type AreaTab,
  type CountValue,
} from '@/components/oblast/area-model';
import { AreaTasks } from '@/components/oblast/area-tasks';
import { PageLevel, type PageItem } from '@/components/oblast/page-level';
import { RenameAreaSheet } from '@/components/prostor/rename-area-sheet';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { UndoBar } from '@/components/undo-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { backOrProstor, dismissToProstor } from '@/lib/navigation/back-to-prostor';
import type { PageKind } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

/** Prelaz sheet → sheet ide zatvaranjem prvog pa otvaranjem drugog (iOS, K12-5). */
const SHEET_CHAIN_MS = 350;

/**
 * Ekran oblasti (PROSTOR P12, plan K07 §5.5, K14) — par web `workspace/area/area-view`
 * (K13). Naslov je naziv oblasti, meta „12 stranica · 8 zadataka"; ispod su kartice
 * Pregled · Zadaci · Dokumenti, a „Mapa" je dugme koje otvara postojeći WebView
 * (`/canvas/area/<id>`, embed protokol se ne menja). „…" nosi Preimenuj oblast i
 * Novu stranicu; plutajuće dugme pravi stranicu u oblasti.
 *
 * Kartica nije u URL-u i ne pamti se: ekran se uvek otvara na Pregledu (ODLUKA K14-2).
 */
export default function OblastScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeStartupId, restoring } = useActiveStartup();
  const startup = useQuery(
    api.startups.get,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  // Oblast se traži u spisku aktivnog startupa: nepoznat id ili tuđ startup nikad ne
  // stigne do upita oblasti (isti razlog kao `PageUnavailable` za stranicu).
  const area = useMemo(
    () => startup?.areas.find((candidate) => candidate._id === id) ?? null,
    [startup, id],
  );
  const areaId = area?._id ?? null;

  const [tab, setTab] = useState<AreaTab>(DEFAULT_AREA_TAB);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);
  // Vrsta sa kojom se otvara Nova stranica: kartica Zadaci traži Zadatak.
  const [createKind, setCreateKind] = useState<PageKind | undefined>(undefined);
  const openCreate = (kind?: PageKind) => {
    setCreateKind(kind);
    setCreatingPage(true);
  };
  // Fiksan „sada" po mount-u: rok i relativno vreme se ne reklasifikuju u renderu.
  const [now] = useState(() => Date.now());

  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (chainTimer.current !== null) clearTimeout(chainTimer.current);
    },
    [],
  );
  const afterMenu = (action: () => void) => {
    setMenuOpen(false);
    if (chainTimer.current !== null) clearTimeout(chainTimer.current);
    chainTimer.current = setTimeout(action, SHEET_CHAIN_MS);
  };

  // Brojevi u meta redu su pratioci: pad njihovog upita ne sme da obori ekran.
  const pageCounts = useQueryTolerant(
    api.pages.areaTopLevelCounts,
    activeStartupId && areaId ? { startupId: activeStartupId } : 'skip',
  );
  const firstTaskPage = useQueryTolerant(
    api.tasks.listForArea,
    activeStartupId && areaId
      ? {
          startupId: activeStartupId,
          areaId,
          paginationOpts: { numItems: TASK_COUNT_PAGE_SIZE, cursor: null },
        }
      : 'skip',
  );
  const pagesCount = useMemo<CountValue | null>(() => {
    const entry = pageCounts?.find((candidate) => candidate.areaId === areaId);
    return entry ? { count: entry.count, capped: entry.capped } : null;
  }, [pageCounts, areaId]);
  const tasksCount = useMemo<CountValue | null>(
    () => (firstTaskPage ? taskCountFromPage(firstTaskPage) : null),
    [firstTaskPage],
  );
  const meta = areaMetaLine(pagesCount, tasksCount);

  const openMap = () => {
    if (areaId === null) return;
    haptics.tap();
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'area', id: areaId } });
  };

  const openLeaf = (page: PageItem) => {
    haptics.tap();
    if (page.kind === 'task') {
      router.push({ pathname: '/zadatak/[id]', params: { id: page._id } });
    } else {
      router.push({ pathname: '/stranica/[id]', params: { id: page._id } });
    }
  };

  const back = () => backOrProstor(router);

  if (activeStartupId === null) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Oblast" onBack={back} />
        {restoring ? (
          <AreaSkeleton />
        ) : (
          <EmptyState
            icon={<FolderOpen size={20} color={colors.mutedForeground} />}
            title="Izaberi startup"
            description="Oblasti se prikazuju po startupu."
            actionLabel="Otvori Prostor"
            onAction={() => dismissToProstor(router)}
          />
        )}
      </View>
    );
  }

  if (startup !== undefined && (area === null || areaId === null)) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Oblast" onBack={back} />
        <EmptyState
          icon={<FolderOpen size={20} color={colors.mutedForeground} />}
          title="Oblast nije pronađena."
          description="Možda je uklonjena ili pripada drugom startupu."
          actionLabel="Otvori Dokumente"
          onAction={() => router.dismissTo('/oblasti')}
        />
      </View>
    );
  }

  const loading = startup === undefined || area === null || areaId === null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={area?.label ?? 'Oblast'}
        titleNumberOfLines={2}
        subtitle={meta ?? undefined}
        onBack={back}
        actions={
          loading ? undefined : (
            <>
              <Button
                label="Mapa"
                variant="ghost"
                size="sm"
                icon={<MapIcon size={18} color={colors.foreground} />}
                accessibilityLabel="Mapa oblasti"
                onPress={openMap}
              />
              <IconButton
                accessibilityLabel="Više radnji za oblast"
                onPress={() => {
                  haptics.tap();
                  setMenuOpen(true);
                }}>
                <MoreHorizontal size={22} color={colors.foreground} />
              </IconButton>
            </>
          )
        }
        below={<SegmentedControl options={AREA_TABS} value={tab} onChange={setTab} />}
      />

      <LoadingSwap loading={loading} skeleton={<AreaSkeleton />}>
        {loading ? null : (
          <View style={styles.body}>
            {tab === 'pregled' ? (
              <AreaOverview
                key={`pregled:${areaId}`}
                startupId={activeStartupId}
                areaId={areaId}
                areaLabel={area.label}
              />
            ) : tab === 'zadaci' ? (
              <BlockBoundary key={`zadaci:${areaId}`} title="Zadaci nisu učitani.">
                <AreaTasks
                  startupId={activeStartupId}
                  areaId={areaId}
                  onCreate={() => openCreate('task')}
                />
              </BlockBoundary>
            ) : (
              <BlockBoundary key={`dokumenti:${areaId}`} title="Dokumenti nisu učitani.">
                <PageLevel
                  startupId={activeStartupId}
                  areaId={areaId}
                  now={now}
                  onOpenLeaf={openLeaf}
                  onCreate={() => openCreate()}
                />
              </BlockBoundary>
            )}
          </View>
        )}
      </LoadingSwap>

      {loading ? null : (
        <>
          <QuickAddFab
            label={tab === 'zadaci' ? 'Novi zadatak' : 'Nova stranica'}
            bottomInset={insets.bottom}
            onPress={() => {
              haptics.tap();
              openCreate(tab === 'zadaci' ? 'task' : undefined);
            }}
          />
          <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} style={styles.menu}>
            <Text accessibilityRole="header" style={[styles.menuTitle, { color: colors.foreground }]}>
              {area.label}
            </Text>
            <Row
              icon={<Pencil size={20} color={colors.mutedForeground} />}
              title="Preimenuj oblast"
              showChevron={false}
              onPress={() => {
                haptics.tap();
                afterMenu(() => setRenaming(true));
              }}
            />
            <Row
              icon={<Plus size={20} color={colors.mutedForeground} />}
              title="Nova stranica"
              showChevron={false}
              onPress={() => {
                haptics.tap();
                afterMenu(() => openCreate());
              }}
            />
          </Sheet>
          <RenameAreaSheet
            open={renaming}
            areaId={areaId}
            currentLabel={area.label}
            onClose={() => setRenaming(false)}
          />
          <PageCreateSheet
            open={creatingPage}
            startupId={activeStartupId}
            areaId={areaId}
            parentPageId={null}
            initialKind={createKind}
            onClose={() => setCreatingPage(false)}
          />
        </>
      )}
      {/* „Poništi" posle brisanja iz ove oblasti; `72` = iznad plutajućeg dugmeta (56 + 16). */}
      <UndoBar bottomOffset={72} />
    </View>
  );
}

/** Oblik onoga što stiže: tri reda sa ikonicom. */
function AreaSkeleton() {
  return (
    <View
      style={styles.skeleton}
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
      <ScreenHeader title="Oblast" onBack={() => backOrProstor(router)} />
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Oblast nije učitana."
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
  body: {
    flex: 1,
  },
  skeleton: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  menu: {
    paddingHorizontal: 16,
    gap: 4,
  },
  menuTitle: {
    ...text.title,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
  },
});
