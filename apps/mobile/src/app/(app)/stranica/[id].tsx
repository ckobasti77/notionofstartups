import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Ellipsis, LayoutGrid, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BreadcrumbsEyebrow, PathSheet } from '@/components/breadcrumbs-eyebrow';
import { EmptyState } from '@/components/empty-state';
import { FilesPanel } from '@/components/stranica/files-panel';
import { NoteEditor } from '@/components/stranica/note-editor';
import { PageActionsSheet, type SheetView } from '@/components/stranica/page-actions-sheet';
import { PageContributionsSection } from '@/components/stranica/page-contributions-section';
import { RelationsSection } from '@/components/stranica/relations-section';
import { SubpagesSection } from '@/components/stranica/subpages-section';
import { TablePanel } from '@/components/stranica/table-panel';
import { DiscussionLink } from '@/components/chat/discussion-link';
import { UndoBar } from '@/components/undo-bar';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonParagraph, SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pageKindLabel, pageKindMeta } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';

/**
 * Ekran stranice (docs/mobile/02-EKRANI.md §9). Sadržaj se bira po `kind`:
 * beleška (`note`) → `NoteEditor` (M3.2, tentap), `table` → `TablePanel` (M3.3),
 * `file` → `FilesPanel` (M3.3). Zadatak se preusmerava na `zadatak/[id]` — ova
 * ruta je jedini ulaz po `pageId`, pa pozivalac ne mora da zna `kind`.
 */
type PageDetails = FunctionReturnType<typeof api.pages.get>;

export default function StranicaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pageId = id as Id<'pages'>;
  const page = useQuery(api.pages.get, { pageId });
  // `null` = sheet je zatvoren; vrednost je korak na kom se otvara.
  const [actionsView, setActionsView] = useState<SheetView | null>(null);
  // Putanja kao navigacija (C11) — posle dubokog linka nema drugog puta ka roditelju.
  const [pathOpen, setPathOpen] = useState(false);

  // Ova ruta je JEDINI ulaz po `pageId` — pozivaoci (obaveštenje, thread razgovora,
  // veza u tekstu) ne znaju `kind` unapred. Zadatak zato ne završava u ćorsokaku
  // nego se prosledi na svoj ekran; `replace` da „nazad" ne vrati na međukorak.
  const isTask = page?.kind === 'task';
  useEffect(() => {
    if (isTask) {
      router.replace({ pathname: '/zadatak/[id]', params: { id: pageId } });
    }
  }, [isTask, pageId, router]);

  if (page === undefined || isTask) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Stranica" onBack={() => router.back()} />
        <PageSkeleton />
      </View>
    );
  }

  const openCanvas = () => {
    haptics.tap();
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'page', id: pageId } });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        // Beleška ima IZMENJIV naslov u editoru — isto ime i u zaglavlju je bio
        // bag E9; zaglavlje zato nosi vrstu („Beleška"), a eyebrow putanju (E12).
        // Tabela/prilog telo ne ponavljaju naslov, pa on ostaje u zaglavlju.
        title={page.kind === 'note' ? pageKindLabel(page.kind) : page.title}
        titleNumberOfLines={2}
        eyebrow={
          <BreadcrumbsEyebrow
            pageId={page._id}
            startupId={page.startupId}
            areaId={page.areaId}
          />
        }
        onEyebrowPress={() => {
          haptics.tap();
          setPathOpen(true);
        }}
        eyebrowAccessibilityLabel="Putanja do korena — otvori za skok na roditelja"
        onBack={() => router.back()}
        actions={
          <>
            <IconButton accessibilityLabel="Canvas stranice" onPress={openCanvas}>
              <LayoutGrid size={20} color={colors.foreground} />
            </IconButton>
            <IconButton
              accessibilityLabel="Akcije stranice"
              onPress={() => {
                haptics.tap();
                setActionsView('menu');
              }}>
              <Ellipsis size={20} color={colors.foreground} />
            </IconButton>
          </>
        }
      />
      <PageContent page={page} colors={colors} onConnect={() => setActionsView('relate')} />
      <PageActionsSheet
        open={actionsView !== null}
        initialView={actionsView ?? 'menu'}
        page={page}
        onClose={() => setActionsView(null)}
        onArchived={() => router.back()}
      />
      <PathSheet
        open={pathOpen}
        pageId={page._id}
        startupId={page.startupId}
        areaId={page.areaId}
        onClose={() => setPathOpen(false)}
      />

      {/* Obrisan doprinos u sekciji „Doprinosi" i premeštena stranica se vraćaju
          odavde (PARITET A6, C9/C10). */}
      <UndoBar />
    </View>
  );
}

function PageContent({
  page,
  colors,
  onConnect,
}: {
  page: PageDetails;
  colors: ColorTokens;
  /** Otvara `PageActionsSheet` na koraku „Poveži sa…". */
  onConnect: () => void;
}) {
  // „Podstranice" su sada sekcija unutar stranice (tap u Prostoru otvara stranicu, ne
  // roni u podstranice) — stoji iznad sadržaja, skupljena podrazumevano. Ispod nje
  // „Povezane stavke": veze na druge stranice, iz bilo koje oblasti.
  return (
    <View style={styles.content}>
      <SubpagesSection
        pageId={page._id}
        startupId={page.startupId}
        areaId={page.areaId}
      />
      <RelationsSection
        pageId={page._id}
        startupId={page.startupId}
        areaId={page.areaId}
        onConnect={onConnect}
      />
      {/* Diskusija uz stranicu — isti `chat.channelForAnchor`/`sendToAnchor` koji
          web `EntityDiscussionPanel` koristi za SVE tipove stranica, ne samo za
          zadatak. Komponenta je `anchorType`-agnostična, samo nije bila montirana. */}
      <DiscussionLink
        anchor={{ type: 'page', id: page._id, pageKind: page.kind }}
        startupId={page.startupId}
      />
      <PageContributionsSection pageId={page._id} />
      <View style={styles.kindContent}>
        {page.kind === 'note' ? (
          <NoteEditor
            // Nov ključ = nov editor: tentap `initialContent` se čita samo na
            // montiranju, pa prelazak na drugu belešku mora da ga remontira.
            key={page._id}
            pageId={page._id}
            startupId={page.startupId}
            remoteTitle={page.title}
            remoteContent={page.content}
            remoteRevision={page.revision}
            canEdit={page.permissions.canEdit}
            canEditBody={page.permissions.canEditBody}
          />
        ) : page.kind === 'table' ? (
          <TablePanel pageId={page._id} />
        ) : page.kind === 'file' ? (
          <FilesPanel pageId={page._id} canManage={page.permissions.canEdit} />
        ) : (
          <UnexpectedKind kind={page.kind} colors={colors} />
        )}
      </View>
    </View>
  );
}

/**
 * Oblik ekrana stranice: dva sklopiva reda („Podstranice", „Povezane stavke"), pa
 * naslov beleške i blok teksta — najčešći `kind` je `note`.
 */
function PageSkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje stranice">
      <SkeletonRow leading="icon" trailing="chevron" />
      <SkeletonRow index={1} leading="icon" trailing="chevron" />
      <View style={styles.skeletonBody}>
        <Skeleton width="68%" height={24} />
        <SkeletonParagraph lines={6} />
      </View>
    </View>
  );
}

/**
 * Zadatak ima svoj ekran (`zadatak/[id]`) i ovde ne bi trebalo da stigne. Ako
 * ipak stigne (stara duboka veza, notifikacija iz prethodne verzije), bolje je
 * jasna poruka nego prazan ekran.
 */
function UnexpectedKind({
  kind,
  colors,
}: {
  kind: PageDetails['kind'];
  colors: ColorTokens;
}) {
  const Icon = pageKindMeta(kind).icon;
  return (
    <EmptyState
      icon={<Icon size={40} color={colors.mutedForeground} />}
      title={pageKindLabel(kind)}
      description="Ova stavka se otvara na svom ekranu — vrati se i otvori je iz liste."
    />
  );
}

/**
 * Greška: `pages.get` baca samo kad SERVER prijavi grešku (nema pristupa,
 * pokvarena funkcija…) — pukla veza ne baca ništa (o njoj brine
 * `ConnectionBanner`). Zato okvir jasno kaže da je greška serverska, sa
 * stvarnom porukom umesto sirovog omotača.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PageErrorState error={error} onRetry={retry} />;
}

function PageErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Stranica" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Greška na serveru"
        description={accessErrorMessage(
          error,
          'Server je prijavio grešku pri učitavanju stranice.',
        )}
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
  skeleton: {
    flex: 1,
  },
  skeletonBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
});
