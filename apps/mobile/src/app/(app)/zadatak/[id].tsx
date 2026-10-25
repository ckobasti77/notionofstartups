import {
  assigneesChipValue,
  describeDue,
  PRIORITY_LABELS,
  reopenStatus,
  STATUS_LABELS,
  taskPermissions,
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
  LayoutGrid,
  TriangleAlert,
  Users,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreadcrumbsEyebrow, PathSheet } from '@/components/breadcrumbs-eyebrow';
import { EmptyState } from '@/components/empty-state';
import { LockedNotice } from '@/components/me/choice-chips';
import { MetaChip } from '@/components/me/meta-chip';
import { PageActionsSheet, type SheetView } from '@/components/stranica/page-actions-sheet';
import { PageContributionsSection } from '@/components/stranica/page-contributions-section';
import { RelationsSection } from '@/components/stranica/relations-section';
import { AssigneePickerSheet } from '@/components/zadatak/assignee-picker';
import { TaskMetaSheet, type TaskMetaView } from '@/components/zadatak/task-meta-sheet';
import { DiscussionLink } from '@/components/chat/discussion-link';
import { InstructionsSection } from '@/components/zadatak/instructions-section';
import { TaskCheckpointList } from '@/components/zadatak/task-checkpoint-list';
import { UndoBar } from '@/components/undo-bar';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCard, SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { announceWithUndoBar } from '@/lib/announce';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';
import { accessErrorMessage } from '@/lib/errors';

/**
 * Detalj zadatka — full-screen, van tabova (docs/mobile/02-EKRANI.md §9.2).
 * Najčešće korišćen ekran, pa je brz: status, prioritet, rok i izvršioci su čipovi
 * (K18, par web `MetaChip` iz K17) koji otvaraju `TaskMetaSheet` — rok sa srpskim
 * čipovima i kalendarom u istom sheet-u; zabranjen metapodatak je isprekidan čip
 * sa katancem i razlogom (E15), isti kao u panelu zadatka. Dozvole su iz shared
 * `taskPermissions`, mutacije iste kao panel (`tasks.updateMetadata`,
 * `taskAssignees.join/leave`). Checkpointi su optimistički, bez „sačuvaj"
 * dugmadi. Zadatak je `pages` dokument sa `kind: "task"`.
 */
export default function ZadatakScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pageId = id as Id<'pages'>;
  const { activeStartupId } = useActiveStartup();
  const insets = useSafeAreaInsets();
  const [now] = useState(() => Date.now());
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

  const page = useQuery(api.pages.get, { pageId });
  const profile = useQuery(api.profiles.getCurrent, {});
  const assignees = useQuery(api.taskAssignees.listForTask, { taskPageId: pageId });
  const members = useQuery(
    api.startups.listMembers,
    page?.startupId ? { startupId: page.startupId, limit: 50 } : 'skip',
  );

  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const join = useMutation(api.taskAssignees.join);
  const leave = useMutation(api.taskAssignees.leave);
  const setAssignees = useMutation(api.taskAssignees.setAssignees);

  const notifyError = (error: unknown) => {
    haptics.error();
    Alert.alert('Nešto nije prošlo', error instanceof Error ? error.message : 'Pokušaj ponovo.');
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
          icon={<ClipboardX size={40} color={colors.mutedForeground} />}
          title="Ovo nije zadatak"
          description="Ova stranica nije zadatak, pa nema detalja zadatka."
        />
      </View>
    );
  }

  const myId = profile?._id ?? null;
  const canEditAll = page.permissions.canEdit;
  const isAssignee = myId !== null && assigneeList.some((a) => a.profileId === myId);
  const isCreator = myId !== null && page.createdByProfileId === myId;
  const permissions = taskPermissions({ kind: 'task', isCreator: isCreator || canEditAll, isAssignee });
  const status = (page.taskStatus ?? 'backlog') as StartupTaskStatus;
  const priority = (page.taskPriority ?? 'medium') as TaskPriorityKey;
  const due = describeDue(page.dueDate ?? null, now);
  const denied = (reason: string) => {
    haptics.warning();
    Alert.alert('Nije dozvoljeno', reason);
  };

  // Kanvas zadatka je `kind: 'page'` nad ovim zadatkom — jedini kanvas na kom su koraci
  // vidljivi bez poruke `checkpoints`. Bez ovog ulaza je sa telefona nedostupan (K4):
  // `/stranica/[id]` zadatak preusmerava ovamo, pa dugme sa te strane ne pomaže. Ista
  // ikonica i ista formulacija kao na stranici (`stranica/[id].tsx`).
  const openCanvas = () => {
    haptics.tap();
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'page', id: pageId } });
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
  const saveInstructions = (text: string | null) =>
    run(updateMetadata({ pageId, instructions: text }));

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
            eyebrow={
              <BreadcrumbsEyebrow
                pageId={pageId}
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
                <IconButton accessibilityLabel="Canvas zadatka" onPress={openCanvas}>
                  <LayoutGrid size={20} color={colors.foreground} />
                </IconButton>
                <IconButton
                  accessibilityLabel="Akcije zadatka"
                  onPress={() => setActionsView('menu')}>
                  <Ellipsis size={20} color={colors.foreground} />
                </IconButton>
              </>
            }
          />
        </View>

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

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InstructionsSection
              instructions={page.instructions}
              canEdit={canEditAll}
              onSave={saveInstructions}
            />
            {permissions.instructions.allowed ? null : (
              <LockedNotice label="Instrukcije" reason={permissions.instructions.reason ?? ''} />
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TaskCheckpointList taskPageId={pageId} canCreate={canEditAll} />
            {permissions.checkpoints.allowed ? null : (
              <LockedNotice label="Koraci" reason={permissions.checkpoints.reason ?? ''} />
            )}
          </View>

          <View style={[styles.card, styles.flush, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <RelationsSection
              pageId={pageId}
              startupId={page.startupId}
              areaId={page.areaId}
              onConnect={() => setActionsView('relate')}
              showDivider={false}
            />
          </View>

            <DiscussionLink
              anchor={{ type: 'page', id: pageId, pageKind: 'task' }}
              startupId={page.startupId}
            />
            <PageContributionsSection pageId={pageId} />
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
        />
        <PathSheet
          open={pathOpen}
          pageId={pageId}
          startupId={page.startupId}
          areaId={page.areaId}
          onClose={() => setPathOpen(false)}
        />

        {/* Obrisan checkpoint / doprinos i premešten zadatak se vraćaju odavde
            (PARITET A6, C9/C10/C13). */}
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
 * Greška: `pages.get` prolazi kroz `requireStartupMember`/`requireVisiblePage` i
 * baca kad korisnik nema pristup — expo-router to hvata ovde umesto pada ekrana.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <TaskErrorState message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

function TaskErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Zadatak" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Zadatak se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju zadatka.'}
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
  // Kartica čiji sadržaj sam nosi svoj padding (npr. „Povezane stavke").
  flush: {
    paddingHorizontal: 0,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  // Čipovi metapodataka (status, prioritet, rok, izvršioci) — prelamaju se u redove.
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 4,
  },
});
