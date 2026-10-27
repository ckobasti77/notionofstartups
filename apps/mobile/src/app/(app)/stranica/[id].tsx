import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Ellipsis } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreadcrumbsEyebrow, PathSheet } from '@/components/breadcrumbs-eyebrow';
import { CommentsHeaderButton } from '@/components/collab/comments-button';
import {
  CommentsEntryRow,
  CommentsSheet,
  useCommentsSummary,
  type CommentsSummary,
} from '@/components/collab/comments-sheet';
import { LockNotice } from '@/components/collab/lock';
import { PageUnavailable } from '@/components/collab/page-unavailable';
import { PageMetaStrip } from '@/components/collab/page-meta-strip';
import { RevisionHistorySheet } from '@/components/collab/revision-history-sheet';
import { useLiveNow } from '@/components/collab/use-live-now';
import { usePagePresence } from '@/components/collab/use-page-presence';
import { EmptyState } from '@/components/empty-state';
import { FilesPanel } from '@/components/stranica/files-panel';
import { NoteEditor, type SaveState } from '@/components/stranica/note-editor';
import { PageActionsSheet, type SheetView } from '@/components/stranica/page-actions-sheet';
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
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { haptics } from '@/lib/haptics';
import { pageKindLabel, pageKindMeta } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';

/** Zatvaranje jednog sheet-a pa otvaranje drugog: iOS ne prikazuje modal dok se prethodni skida. */
const SHEET_CHAIN_MS = 350;

/**
 * Ekran stranice (docs/mobile/02-EKRANI.md §9). Sadržaj se bira po `kind`:
 * beleška (`note`) → `NoteEditor` (M3.2, tentap), `table` → `TablePanel` (M3.3),
 * `file` → `FilesPanel` (M3.3). Zadatak se preusmerava na `zadatak/[id]` — ova
 * ruta je jedini ulaz po `pageId`, pa pozivalac ne mora da zna `kind`.
 *
 * PROSTOR K12 (dokument tima, P1/P5/P13/P23): stranicu menja svaki član dok nije
 * zaključana (`permissions`, bez računanja „autora" na klijentu); Komentari su
 * sheet (zaglavlje + red, E3), Istorija izmena se otvara iz „…", ispod naslova stoji
 * meta red sa „Zaključano" i „<Ime> uređuje", a konflikt rešava editor (baner).
 * Tabela i fajl: sadržaj prvi, pa Podstranice · Povezano · Diskusija · Komentari.
 * Beleška zadržava redove IZNAD editora: traka alata editora se pozicionira od dna
 * prozora (`use-keyboard-inset`), pa ispod editora ne sme ništa da stoji.
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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Editor još čuva: brisanje i vraćanje verzije čekaju (inače bi izmene bile izgubljene).
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  const chainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (chainTimerRef.current) clearTimeout(chainTimerRef.current);
    },
    [],
  );

  const now = useLiveNow();
  // Zaključano → otključano dok je ekran otvoren: beleška se remontira sa svežim telom (tentap
  // `initialContent` se čita samo pri kreiranju); odmontiranje šalje nacrt koji je čekao.
  const loaded = page !== undefined;
  const canEditNow = page?.permissions.canEdit ?? false;
  const prevCanEditRef = useRef<boolean | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  useEffect(() => {
    if (!loaded) return;
    // Sa nacrtom koji čeka odluku (baner) ne remontira se: to radi „Učitaj najnoviju" (onRemountRequest).
    if (prevCanEditRef.current === false && canEditNow && saveStateRef.current === 'saved') {
      setEditorEpoch((value) => value + 1);
    }
    prevCanEditRef.current = canEditNow;
  }, [loaded, canEditNow]);
  const commentsSummary = useCommentsSummary({ kind: 'page', id: pageId });
  const { editors, markEditing } = usePagePresence(pageId, {
    canEdit: page?.permissions.canEdit ?? false,
  });
  const childCounts = useQueryTolerant(
    api.pages.childCounts,
    page ? { startupId: page.startupId, areaId: page.areaId, parentPageIds: [pageId] } : 'skip',
  );
  const hasSubpages = (childCounts?.[0]?.count ?? 0) > 0;
  const savePending = saveState === 'saving' || saveState === 'dirty';

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

  const openMap = () => {
    haptics.tap();
    setActionsView(null);
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'page', id: pageId } });
  };
  const openHistory = () => {
    setActionsView(null);
    if (chainTimerRef.current) clearTimeout(chainTimerRef.current);
    chainTimerRef.current = setTimeout(() => setHistoryOpen(true), SHEET_CHAIN_MS);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        // Beleška ima IZMENJIV naslov u editoru — isto ime i u zaglavlju je bio
        // bag E9; zaglavlje zato nosi vrstu („Beleška"), a meta red ispod naslova putanju (E12).
        // Tabela/prilog telo ne ponavljaju naslov, pa on ostaje u zaglavlju.
        title={page.kind === 'note' ? pageKindLabel(page.kind) : page.title}
        titleNumberOfLines={2}
        subtitle={
          <BreadcrumbsEyebrow
            pageId={page._id}
            startupId={page.startupId}
            areaId={page.areaId}
          />
        }
        onSubtitlePress={() => {
          haptics.tap();
          setPathOpen(true);
        }}
        subtitleAccessibilityLabel="Putanja do korena. Otvara nadređenu stavku"
        onBack={() => router.back()}
        actions={
          <>
            <CommentsHeaderButton
              summary={commentsSummary}
              onPress={() => {
                haptics.tap();
                setCommentsOpen(true);
              }}
            />
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
      <PageMetaStrip page={page} now={now} editors={editors} />
      <PageContent
        page={page}
        colors={colors}
        onConnect={() => setActionsView('relate')}
        summary={commentsSummary}
        onOpenComments={() => setCommentsOpen(true)}
        onEditActivity={markEditing}
        onSaveStateChange={setSaveState}
        editorEpoch={editorEpoch}
        onRemountRequest={() => setEditorEpoch((value) => value + 1)}
      />
      <PageActionsSheet
        open={actionsView !== null}
        initialView={actionsView ?? 'menu'}
        page={page}
        onClose={() => setActionsView(null)}
        onArchived={() => router.back()}
        onOpenHistory={openHistory}
        onOpenMap={hasSubpages && page.kind !== 'task' ? openMap : undefined}
        savePending={savePending}
      />
      <CommentsSheet
        target={{ kind: 'page', id: pageId }}
        startupId={page.startupId}
        title={page.kind === 'note' ? 'Komentari' : `Komentari · ${page.title}`}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
      <RevisionHistorySheet
        target={{ kind: 'page', id: pageId }}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        format={page.kind === 'note' ? 'html' : 'text'}
        subject="page"
        currentRevision={page.revision}
        lockedReason={
          savePending
            ? 'Izmene se još čuvaju. Sačekaj pa vrati verziju.'
            : page.permissions.canRestoreRevision
              ? null
              : 'Stranica je zaključana.'
        }
        updaterName={page.updater?.displayName ?? null}
        updatedAt={page.updatedAt}
      />
      <PathSheet
        open={pathOpen}
        pageId={page._id}
        startupId={page.startupId}
        areaId={page.areaId}
        onClose={() => setPathOpen(false)}
      />

      {/* Uklonjen komentar, premeštena i obrisana stranica (Korpa) se vraćaju
          odavde (PARITET A6, C9/C10). */}
      <UndoBar />
    </View>
  );
}

function PageContent({
  page,
  colors,
  onConnect,
  summary,
  onOpenComments,
  onEditActivity,
  onSaveStateChange,
  editorEpoch,
  onRemountRequest,
}: {
  page: PageDetails;
  colors: ColorTokens;
  /** Otvara `PageActionsSheet` na koraku „Poveži sa…". */
  onConnect: () => void;
  summary: CommentsSummary;
  onOpenComments: () => void;
  onEditActivity: () => void;
  onSaveStateChange: (state: SaveState) => void;
  /** Raste kad se stranica otključa: nov ključ remontira editor. */
  editorEpoch: number;
  onRemountRequest: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const isNote = page.kind === 'note';

  const sections = (
    <>
      {/* „Podstranice" su sekcija unutar stranice (tap u Prostoru otvara stranicu, ne
          roni u podstranice), skupljena podrazumevano. Ispod nje „Povezane stavke". */}
      <SubpagesSection pageId={page._id} startupId={page.startupId} areaId={page.areaId} />
      <RelationsSection
        pageId={page._id}
        startupId={page.startupId}
        areaId={page.areaId}
        onConnect={onConnect}
      />
      {/* Diskusija uz stranicu — isti `chat.channelForAnchor`/`sendToAnchor` koji web
          `EntityDiscussionPanel` koristi za SVE tipove stranica. */}
      <DiscussionLink
        anchor={{ type: 'page', id: page._id, pageKind: page.kind }}
        startupId={page.startupId}
      />
    </>
  );

  return (
    <View style={styles.content}>
      {isNote ? (
        // Razvijene veze ne smeju da stisnu editor: redovi iznad njega skrolују do 40 % ekrana.
        <ScrollView
          nestedScrollEnabled
          style={[styles.notesSections, { maxHeight: Math.round(windowHeight * 0.4) }]}>
          {sections}
        </ScrollView>
      ) : null}
      {!isNote && !page.permissions.canEdit ? <LockNotice /> : null}
      <View style={styles.kindContent}>
        {page.kind === 'note' ? (
          <NoteEditor
            // Nov ključ = nov editor: tentap `initialContent` se čita samo na
            // montiranju, pa prelazak na drugu belešku mora da ga remontira.
            key={`${page._id}:${editorEpoch}`}
            pageId={page._id}
            startupId={page.startupId}
            remoteTitle={page.title}
            remoteContent={page.content}
            remoteRevision={page.revision}
            canEdit={page.permissions.canEdit}
            canEditBody={page.permissions.canEdit}
            remoteUpdater={{ name: page.updater?.displayName ?? null, at: page.updatedAt }}
            onEditActivity={onEditActivity}
            onSaveStateChange={onSaveStateChange}
            onRemountRequest={onRemountRequest}
          />
        ) : page.kind === 'table' ? (
          <TablePanel pageId={page._id} />
        ) : page.kind === 'file' ? (
          <FilesPanel pageId={page._id} canManage={page.permissions.canEdit} />
        ) : (
          <UnexpectedKind kind={page.kind} colors={colors} />
        )}
      </View>
      {isNote ? null : (
        // Tabela i fajl nemaju traku alata vezanu za tastaturu: sadržaj je prvi, redovi ispod.
        // Visina je ograničena (razvijene veze ne smeju da pojedu sadržaj), pa redovi skroluju.
        <ScrollView
          nestedScrollEnabled
          style={[styles.sections, { borderTopColor: colors.border, maxHeight: Math.round(windowHeight * 0.4) }]}
          contentContainerStyle={{ paddingBottom: insets.bottom }}>
          {sections}
          <CommentsEntryRow summary={summary} onPress={onOpenComments} />
        </ScrollView>
      )}
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
      icon={<Icon size={20} color={colors.mutedForeground} />}
      title={pageKindLabel(kind)}
      description="Ova stavka se otvara na svom ekranu — vrati se i otvori je iz liste."
    />
  );
}

/**
 * Greška: `pages.get` baca samo kad SERVER prijavi grešku (obrisana ili nepostojeća
 * stranica, nema pristupa…) — pukla veza ne baca ništa (o njoj brine
 * `ConnectionBanner`). Obrisano i greška vode u Korpu (K07 §5.6).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PageUnavailable subject="page" error={error} onRetry={retry} />;
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
  sections: {
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  notesSections: {
    flexGrow: 0,
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
