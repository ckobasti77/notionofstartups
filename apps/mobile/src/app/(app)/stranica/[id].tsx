import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ChevronLeft, Ellipsis, LayoutGrid, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { FilesPanel } from '@/components/stranica/files-panel';
import { PageActionsSheet } from '@/components/stranica/page-actions-sheet';
import { SubpagesSection } from '@/components/stranica/subpages-section';
import { TablePanel } from '@/components/stranica/table-panel';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { pageKindLabel, pageKindMeta } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, type ColorTokens } from '@/theme/tokens';

/**
 * Ekran stranice (docs/mobile/02-EKRANI.md §9). Sadržaj se bira po `kind`:
 * `table` → `TablePanel` (M3.3), `file` → `FilesPanel` (M3.3). Beleška (`note`)
 * i dalje čeka rich-text editor (M3.2, „measure-then-decide"), pa prikazuje
 * placeholder. Zadatak ima svoj ekran (`zadatak/[id]`), ovamo ne stiže.
 */
export default function StranicaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pageId = id as Id<'pages'>;
  const page = useQuery(api.pages.get, { pageId });
  const [actionsOpen, setActionsOpen] = useState(false);

  if (page === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <PageHeader title="Stranica" onBack={() => router.back()} colors={colors} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje" />
        </View>
      </View>
    );
  }

  const openCanvas = () =>
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'page', id: pageId } });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageHeader
        title={page.title}
        onBack={() => router.back()}
        onOpenCanvas={openCanvas}
        onOpenActions={() => setActionsOpen(true)}
        colors={colors}
      />
      <PageContent
        pageId={pageId}
        kind={page.kind}
        canManage={page.permissions.canEdit}
        startupId={page.startupId}
        areaId={page.areaId}
        colors={colors}
      />
      <PageActionsSheet
        open={actionsOpen}
        page={page}
        onClose={() => setActionsOpen(false)}
      />
    </View>
  );
}

function PageContent({
  pageId,
  kind,
  canManage,
  startupId,
  areaId,
  colors,
}: {
  pageId: Id<'pages'>;
  kind: 'note' | 'task' | 'file' | 'table';
  canManage: boolean;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  colors: ColorTokens;
}) {
  // „Podstranice" su sada sekcija unutar stranice (tap u Prostoru otvara stranicu, ne
  // roni u podstranice) — stoji iznad sadržaja, skupljena podrazumevano.
  return (
    <View style={styles.content}>
      <SubpagesSection pageId={pageId} startupId={startupId} areaId={areaId} />
      <View style={styles.kindContent}>
        {kind === 'table' ? (
          <TablePanel pageId={pageId} />
        ) : kind === 'file' ? (
          <FilesPanel pageId={pageId} canManage={canManage} />
        ) : (
          <NotePlaceholder kind={kind} colors={colors} />
        )}
      </View>
    </View>
  );
}

/**
 * Beleška: pun editor (embed WebView) stiže tek posle mernog gejta (KORAK 2 plana).
 * Do tada placeholder — ali navigacija i „Podstranice" već rade.
 */
function NotePlaceholder({
  kind,
  colors,
}: {
  kind: 'note' | 'task' | 'file' | 'table';
  colors: ColorTokens;
}) {
  const Icon = pageKindMeta(kind).icon;
  return (
    <EmptyState
      icon={<Icon size={40} color={colors.mutedForeground} />}
      title="Editor stiže uskoro"
      description={`Uređivanje sadržaja (${pageKindLabel(kind)}) stiže sa rich-text editorom (M3.2).`}
    />
  );
}

function PageHeader({
  title,
  onBack,
  onOpenCanvas,
  onOpenActions,
  colors,
}: {
  title: string;
  onBack: () => void;
  onOpenCanvas?: () => void;
  /** „…" — organizacija stranice (premesti / ugnjezdi / izdvoji / poveži). */
  onOpenActions?: () => void;
  colors: ColorTokens;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 6,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {onOpenCanvas ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Canvas stranice"
          onPress={onOpenCanvas}
          style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
          <LayoutGrid size={20} color={colors.foreground} />
        </Pressable>
      ) : null}
      {onOpenActions ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Akcije stranice"
          onPress={onOpenActions}
          style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
          <Ellipsis size={20} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Greška: `pages.get` prolazi kroz `requireStartupMember`/`requireVisiblePage` i
 * baca kad korisnik nema pristup — expo-router to hvata ovde umesto pada ekrana.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PageErrorState message={error.message} onRetry={retry} />;
}

function PageErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageHeader title="Stranica" onBack={() => router.back()} colors={colors} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Stranica se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju stranice.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  kindContent: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginRight: 8,
  },
});
