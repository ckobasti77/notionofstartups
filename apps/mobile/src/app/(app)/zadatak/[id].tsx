import {
  assigneesChipValue,
  describeDue,
  PRIORITY_LABELS,
  reopenStatus,
  STATUS_LABELS,
  type StartupTaskStatus,
  type TaskPriorityKey,
} from '@devotion/shared';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  CalendarClock,
  CircleDot,
  ClipboardX,
  Ellipsis,
  Flag,
  Users,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreadcrumbsEyebrow, PathSheet } from '@/components/breadcrumbs-eyebrow';
import { EmptyState } from '@/components/empty-state';
import { conflictFromError } from '@/components/collab/collab-model';
import { CommentsHeaderButton } from '@/components/collab/comments-button';
import {
  CommentsEntryRow,
  CommentsSheet,
  useCommentsSummary,
} from '@/components/collab/comments-sheet';
import { showConflictAlert } from '@/components/collab/conflict-alert';
import { LockNotice } from '@/components/collab/lock';
import { PageUnavailable } from '@/components/collab/page-unavailable';
import { PageMetaStrip } from '@/components/collab/page-meta-strip';
import { RevisionHistorySheet } from '@/components/collab/revision-history-sheet';
import { useLiveNow } from '@/components/collab/use-live-now';
import { usePagePresence } from '@/components/collab/use-page-presence';
import { MetaChip } from '@/components/me/meta-chip';
import { PlanButton } from '@/components/me/task-panel-sheet';
import { useRowMutations } from '@/components/me/use-row-mutations';
import { PageActionsSheet, type SheetView } from '@/components/stranica/page-actions-sheet';
import { RelationsSection } from '@/components/stranica/relations-section';
import { AssigneePickerSheet } from '@/components/zadatak/assignee-picker';
import { BlockBoundary } from '@/components/collab/block-boundary';
import { TaskMetaSheet, type TaskMetaView } from '@/components/zadatak/task-meta-sheet';
import { DiscussionLink } from '@/components/chat/discussion-link';
import { InstructionsSection } from '@/components/zadatak/instructions-section';
import { TaskCheckpointList } from '@/components/zadatak/task-checkpoint-list';
import { taskPermissionsOf } from '@/components/zadatak/task-permissions';
import { UndoBar } from '@/components/undo-bar';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCard, SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useToday } from '@/hooks/use-today';
import { announceWithUndoBar } from '@/lib/announce';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/** Zatvaranje jednog sheet-a pa otvaranje drugog: iOS ne prikazuje modal dok se prethodni skida. */
const SHEET_CHAIN_MS = 350;

/**
 * Detalj zadatka — full-screen, van tabova (docs/mobile/02-EKRANI.md §9.2).
 * Najčešće korišćen ekran, pa je brz: status, prioritet, rok i izvršioci su čipovi
 * (K18, par web `MetaChip` iz K17) koji otvaraju `TaskMetaSheet` — rok sa srpskim
 * čipovima i kalendarom u istom sheet-u; zabranjen metapodatak je isprekidan čip
 * sa katancem i razlogom (E15), isti kao u panelu zadatka. Dozvole su iz shared
 * `taskPermissionsOf` (nad `pages.get › permissions`, bez računanja „autora"),
 * mutacije iste kao panel (`tasks.updateMetadata`, `taskAssignees.join/leave`).
 * Checkpointi su optimistički, bez „sačuvaj" dugmadi. Zadatak je `pages` dokument
 * sa `kind: "task"`.
 *
 * PROSTOR K12 (P1/P5/P14/P23): otključan zadatak menja svaki član, zaključan autor,
 * vlasnik i admin (izvršilac status i korake, D5); Komentari su sheet (zaglavlje +
 * red, E3), Istorija izmena (instrukcije) iz „…" i iz zaglavlja Instrukcija, uz
 * „Zaključano" i „<Ime> uređuje". Instrukcije idu kroz `areasV2.updatePage` sa
 * revizijom (konflikt → „Učitaj najnoviju" / „Prepiši"). Zadatak nema mapu.
 */
export default function ZadatakScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pageId = id as Id<'pages'>;
  const { activeStartupId } = useActiveStartup();
  const insets = useSafeAreaInsets();
  const [now] = useState(() => Date.now());
  const liveNow = useLiveNow();
  const [metaView, setMetaView] = useState<TaskMetaView | null>(null);
  // Kreator bira izvršioce u posebnom sheet-u (deljen sa kreiranjem zadatka) — duža
  // lista članova ne mora da deli prostor sa statusom/prioritetom/rokom.
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  // Zadatak je `pages` dokument kao i stranica, pa deli isti „…" sheet
  // (premesti / ugnjezdi / izdvoji / poveži) — web mu nudi iste akcije.
  // `null` = sheet je zatvoren; vrednost je korak na kom se otvara.
  const [actionsView, setActionsView] = useState<SheetView | null>(null);
  // Putanja kao navigacija (C11) — obaveštenje o zadatku je najčešći duboki link.
  const [pathOpen, setPathOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const chainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (chainTimerRef.current) clearTimeout(chainTimerRef.current);
    },
    [],
  );

  const page = useQuery(api.pages.get, { pageId });
  const profile = useQuery(api.profiles.getCurrent, {});
  const assignees = useQuery(api.taskAssignees.listForTask, { taskPageId: pageId });
  const members = useQuery(
    api.startups.listMembers,
    page?.startupId ? { startupId: page.startupId, limit: 50 } : 'skip',
  );

  // „Dodaj u Moj dan" / „Ukloni iz Moj dan": isti plan i ista traka „Poništi" kao panel i web.
  const today = useToday();
  const overview = useQueryTolerant(api.myDay.overview, {
    dayKey: today.dayKey,
    doneSince: today.doneSince,
  });
  const rows = useRowMutations({ dayKey: today.dayKey, now: today.now });
  const planEntryId =
    overview?.entries.find((entry) => entry.refKey === `task:${pageId}`)?._id ?? null;

  const commentsSummary = useCommentsSummary({ kind: 'page', id: pageId });
  const { editors, markEditing } = usePagePresence(pageId, {
    canEdit: page?.permissions.canEdit ?? false,
  });

  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const updatePage = useMutation(api.areasV2.updatePage);
  const join = useMutation(api.taskAssignees.join);
  const leave = useMutation(api.taskAssignees.leave);
  const setAssignees = useMutation(api.taskAssignees.setAssignees);

  const notifyError = (error: unknown) => {
    haptics.error();
    Alert.alert('Greška', accessErrorMessage(error, 'Pokušaj ponovo.'));
  };
  const run = (promise: Promise<unknown>) => {
    void promise.then(() => haptics.success()).catch(notifyError);
  };
  const assigneeList = useMemo(() => assignees ?? [], [assignees]);
  const assigneeNames = useMemo(
    () => new Map(assigneeList.map((person) => [person.profileId as string, person.displayName])),
    [assigneeList],
  );

  if (page === undefined || profile === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Zadatak" onBack={() => router.back()} />
        <TaskSkeleton />
      </View>
    );
  }

  if (page.kind !== 'task') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={page.title} titleNumberOfLines={2} onBack={() => router.back()} />
        <EmptyState
          icon={<ClipboardX size={20} color={colors.mutedForeground} />}
          title="Ovo nije zadatak"
          description="Ova stranica nije zadatak."
        />
      </View>
    );
  }

  const myId = profile?._id ?? null;
  // Otključan zadatak menja svaki član; zaključan autor/vlasnik/admin (`canEdit`).
  const canEditAll = page.permissions.canEdit;
  const isAssignee = myId !== null && assigneeList.some((a) => a.profileId === myId);
  const permissions = taskPermissionsOf(page.permissions, isAssignee);
  const status = (page.taskStatus ?? 'backlog') as StartupTaskStatus;
  const priority = (page.taskPriority ?? 'medium') as TaskPriorityKey;
  const due = describeDue(page.dueDate ?? null, now);
  const denied = (reason: string) => {
    haptics.warning();
    Alert.alert('Nije dozvoljeno', reason);
  };

  const openHistory = () => {
    // Čeka se samo kad je sheet akcija otvoren (iOS); iz zaglavlja Instrukcija nema šta da se skida.
    if (actionsView === null) {
      setHistoryOpen(true);
      return;
    }
    setActionsView(null);
    if (chainTimerRef.current) clearTimeout(chainTimerRef.current);
    chainTimerRef.current = setTimeout(() => setHistoryOpen(true), SHEET_CHAIN_MS);
  };
  const applyStatus = (next: StartupTaskStatus) => {
    setMetaView(null);
    if (next === status) return;
    void updateMetadata({ pageId, status: next })
      .then(() => {
        haptics.success();
        if (next !== 'done') return;
        // Završavanje nudi „Poništi" (traka je na ovom ekranu), kao toast na webu.
        const label = `Završeno: ${page.title}`;
        announceWithUndoBar(label);
        pushUndo({ label, action: { kind: 'taskStatus', pageId, status: reopenStatus(status) } });
      })
      .catch(notifyError);
  };
  const applyPriority = (next: TaskPriorityKey) => {
    setMetaView(null);
    if (next === priority) return;
    run(updateMetadata({ pageId, priority: next }));
  };
  const applyDue = (dueDate: number | null) => {
    setMetaView(null);
    if (dueDate === (page.dueDate ?? null)) return;
    void updateMetadata({ pageId, dueDate })
      .then(() => {
        haptics.success();
        AccessibilityInfo.announceForAccessibility('Rok je promenjen.');
      })
      .catch(notifyError);
  };
  const applyJoinLeave = () => {
    setMetaView(null);
    void (isAssignee ? leave({ taskPageId: pageId }) : join({ taskPageId: pageId }))
      .then(() => {
        haptics.success();
        AccessibilityInfo.announceForAccessibility(
          isAssignee ? 'Više nisi na zadatku.' : 'Sad si na zadatku.',
        );
      })
      .catch(notifyError);
  };
  const applySetAssignees = (profileIds: Id<'profiles'>[]) =>
    run(setAssignees({ taskPageId: pageId, profileIds }));
  /**
   * Instrukcije su deo dokumenta zadatka: idu sa revizijom (kao na webu), pa tuđa
   * izmena u međuvremenu daje konflikt — „Učitaj najnoviju" odbacuje tvoj tekst,
   * „Prepiši" ponavlja upis preko tuđe izmene (njihova verzija ostaje u Istoriji).
   */
  const saveInstructions = (value: string | null) => {
    const send = (expectedRevision: number) =>
      updatePage({ startupId: page.startupId, pageId, expectedRevision, instructions: value });
    void send(page.revision)
      .then(() => haptics.success())
      .catch((error: unknown) => {
        const conflict = conflictFromError(error);
        if (conflict === null) {
          notifyError(error);
          return;
        }
        showConflictAlert({
          subject: 'task',
          updaterName: page.updater?.displayName ?? null,
          updatedAt: conflict.updatedAt ?? page.updatedAt,
          onLoadLatest: () => {},
          draftText: value,
          onOverwrite: () =>
            void send(conflict.currentRevision ?? page.revision)
              .then(() => haptics.success())
              .catch(notifyError),
        });
      });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Visina zaglavlja je offset za `KeyboardAvoidingView` — meri se ovde,
            jer `ScreenHeader` sam uračunava safe-area i menja visinu po uređaju. */}
        <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
          <ScreenHeader
            title={page.title}
            titleNumberOfLines={2}
            // Putanja umesto statusa (E12): status već stoji kao prvi red meta
            // kartice ispod, a „gde sam" se bez sidebara nema odakle videti.
            subtitle={
              <BreadcrumbsEyebrow
                pageId={pageId}
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
                  accessibilityLabel="Akcije zadatka"
                  onPress={() => setActionsView('menu')}>
                  <Ellipsis size={20} color={colors.foreground} />
                </IconButton>
              </>
            }
          />
        </View>

        <PageMetaStrip page={page} now={liveNow} editors={editors} />
        {page.permissions.isLocked && !page.permissions.canEdit ? (
          <LockNotice subject="task" />
        ) : null}

        <KeyboardAvoidingView
          style={styles.flex}
          // `padding` + offset visine headera: Expo SDK 57 edge-to-edge (Android)
          // razbija OS `adjustResize`, pa tastaturu kompenzujemo u JS-u (isto kao
          // `razgovor/[id].tsx`). Bez ovoga tastatura prekrije unos checkpointa.
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.chips}>
              <MetaChip
                label="Status"
                value={STATUS_LABELS[status]}
                icon={CircleDot}
                perm={permissions.status}
                onDenied={denied}
                onPress={() => setMetaView('status')}
              />
              <MetaChip
                label="Prioritet"
                value={PRIORITY_LABELS[priority]}
                icon={Flag}
                perm={permissions.priority}
                onDenied={denied}
                onPress={() => setMetaView('priority')}
              />
              <MetaChip
                label="Rok"
                value={due.label}
                bare={page.dueDate === null}
                icon={CalendarClock}
                perm={permissions.due}
                accessibilityLabel={due.ariaLabel}
                onDenied={denied}
                onPress={() => setMetaView('due')}
              />
              <MetaChip
                label="Izvršioci"
                value={
                  assignees === undefined
                    ? '…'
                    : assigneesChipValue(
                        assigneeList.map((person) => person.profileId),
                        myId ?? '',
                        assigneeNames,
                      )
                }
                icon={Users}
                perm={{ allowed: true, reason: null }}
                // Kreator bira pun spisak (deljeni piker); ko nije kreator dobija
                // „priključi se / napusti".
                onPress={() => {
                  if (assignees === undefined) return; // izvršioci još stižu
                  if (permissions.assignees.selfOnly) setMetaView('assignees');
                  else setAssigneesOpen(true);
                }}
              />
            </View>

            <View style={styles.planRow}>
              <PlanButton
                planned={planEntryId !== null}
                onPress={() => rows.togglePlanOf({ kind: 'task', taskPageId: pageId }, planEntryId)}
              />
            </View>

            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <InstructionsSection
                instructions={page.instructions}
                canEdit={permissions.instructions.allowed}
                onSave={saveInstructions}
                onOpenHistory={openHistory}
                onDraftChange={markEditing}
              />
            </View>

            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <BlockBoundary title="Koraci nisu učitani.">
                <TaskCheckpointList
                  taskPageId={pageId}
                  startupId={page.startupId}
                  canCreate={permissions.checkpoints.allowed}
                />
              </BlockBoundary>
            </View>

            <View style={[styles.section, styles.flush, { borderTopColor: colors.border }]}>
              <BlockBoundary title="Povezano nije učitano.">
                <RelationsSection
                  pageId={pageId}
                  startupId={page.startupId}
                  areaId={page.areaId}
                  onConnect={() => setActionsView('relate')}
                  showDivider={false}
                />
              </BlockBoundary>
            </View>

            <View style={[styles.section, styles.flush, { borderTopColor: colors.border }]}>
              <CommentsEntryRow summary={commentsSummary} onPress={() => setCommentsOpen(true)} />
            </View>

            <DiscussionLink
              anchor={{ type: 'page', id: pageId, pageKind: 'task' }}
              startupId={page.startupId}
            />
          </ScrollView>
        </KeyboardAvoidingView>

        <TaskMetaSheet
          view={metaView}
          onViewChange={setMetaView}
          onClose={() => setMetaView(null)}
          now={now}
          title={page.title}
          status={status}
          priority={priority}
          dueDate={page.dueDate ?? null}
          assigneesPerm={permissions.assignees}
          assignees={assigneeList}
          isAssignee={isAssignee}
          onStatus={applyStatus}
          onPriority={applyPriority}
          onDue={applyDue}
          onJoinLeave={applyJoinLeave}
        />

        <AssigneePickerSheet
          open={assigneesOpen}
          members={members}
          selectedIds={assigneeList.map((a) => a.profileId)}
          onChange={applySetAssignees}
          onClose={() => setAssigneesOpen(false)}
        />

        <PageActionsSheet
          open={actionsView !== null}
          initialView={actionsView ?? 'menu'}
          page={page}
          onClose={() => setActionsView(null)}
          onArchived={() => router.back()}
          onOpenHistory={openHistory}
        />
        <CommentsSheet
          target={{ kind: 'page', id: pageId }}
          startupId={page.startupId}
          title={`Komentari · ${page.title}`}
          visible={commentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
        <RevisionHistorySheet
          target={{ kind: 'page', id: pageId }}
          visible={historyOpen}
          onClose={() => setHistoryOpen(false)}
          title="Istorija izmena · Instrukcije"
          format="text"
          subject="task"
          currentRevision={page.revision}
          lockedReason={page.permissions.canRestoreRevision ? null : 'Zadatak je zaključan.'}
          updaterName={page.updater?.displayName ?? null}
          updatedAt={page.updatedAt}
        />
        <PathSheet
          open={pathOpen}
          pageId={pageId}
          startupId={page.startupId}
          areaId={page.areaId}
          onClose={() => setPathOpen(false)}
        />

        {/* Obrisan korak / komentar, premešten i obrisan zadatak (Korpa) se vraćaju
            odavde (PARITET A6, C9/C10/C13). */}
        <UndoBar />
      </View>
    </View>
  );
}

/**
 * Skeleton u obliku detalja zadatka: kartica meta-redova (status/prioritet/rok/
 * izvršioci), pa blok instrukcija i lista podzadataka — iste mere kao pravi ekran,
 * pa dolazak podataka ne pomera raspored.
 */
function TaskSkeleton() {
  const colors = useThemeColors();
  return (
    <View style={styles.content} accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje zadatka">
      <SkeletonCard style={[styles.card, { backgroundColor: colors.card }]}>
        <SkeletonList
          count={4}
          item={(index) => <SkeletonRow index={index} leading="icon" trailing="value" />}
        />
      </SkeletonCard>
      <SkeletonCard style={[styles.card, { backgroundColor: colors.card }]}>
        <Skeleton width="35%" height={16} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="72%" height={14} />
      </SkeletonCard>
      <SkeletonCard style={[styles.card, { backgroundColor: colors.card }]}>
        <Skeleton width="42%" height={16} />
        <Skeleton width="88%" height={14} />
        <Skeleton width="64%" height={14} />
      </SkeletonCard>
    </View>
  );
}

/**
 * Greška: `pages.get` prolazi kroz `requireStartupMember`/`requireVisiblePage` i baca kad
 * zadatak ne postoji, je obrisan ili korisnik nema pristup — expo-router to hvata
 * ovde. Obrisano i greška vode u Korpu (K07 §5.6).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PageUnavailable subject="task" error={error} onRetry={retry} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 8,
    gap: 8,
    paddingBottom: 40,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 4,
  },
  // Sekcija ekrana nije kartica (smirivanje): razmak i tanka linija, bez okvira.
  section: {
    marginTop: 8,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Sekcija čiji sadržaj sam nosi svoj padding (npr. „Povezane stavke", red „Komentari").
  flush: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  planRow: {
    paddingTop: 4,
  },
  // Čipovi metapodataka (status, prioritet, rok, izvršioci) — prelamaju se u redove.
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 4,
  },
});
