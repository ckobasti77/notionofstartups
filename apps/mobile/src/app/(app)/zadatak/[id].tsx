import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  CalendarDays,
  CircleDot,
  ClipboardX,
  Ellipsis,
  Flag,
  TriangleAlert,
  Users,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssigneeStack } from '@/components/danas/assignee-stack';
import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { PriorityDot } from '@/components/danas/priority-dot';
import { TaskActionsSheet } from '@/components/danas/task-actions-sheet';
import { EmptyState } from '@/components/empty-state';
import { PageActionsSheet, type SheetView } from '@/components/stranica/page-actions-sheet';
import { RelationsSection } from '@/components/stranica/relations-section';
import { AssigneePickerSheet } from '@/components/zadatak/assignee-picker';
import { DiscussionLink } from '@/components/zadatak/discussion-link';
import { InstructionsSection } from '@/components/zadatak/instructions-section';
import { TaskCheckpointList } from '@/components/zadatak/task-checkpoint-list';
import { IconButton } from '@/components/ui/icon-button';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCard, SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import {
  formatShortDate,
  statusColor,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

/**
 * Detalj zadatka — full-screen, van tabova (docs/mobile/02-EKRANI.md §9.2).
 * Najčešće korišćen ekran, pa je brz: status/prioritet/rok/izvršioci se menjaju
 * kroz deljeni `TaskActionsSheet` (isti kao Danas), checkpointi su optimistički,
 * bez „sačuvaj" dugmadi. Zadatak je `pages` dokument sa `kind: "task"`.
 */
export default function ZadatakScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pageId = id as Id<'pages'>;
  const { activeStartupId } = useActiveStartup();
  const insets = useSafeAreaInsets();
  const [now] = useState(() => Date.now());
  const [sheetOpen, setSheetOpen] = useState(false);
  // Izvršioci imaju svoj sheet (deljen sa kreiranjem zadatka) — duža lista članova
  // ne mora da deli prostor sa statusom/prioritetom/rokom.
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  // Zadatak je `pages` dokument kao i stranica, pa deli isti „…" sheet
  // (premesti / ugnjezdi / izdvoji / poveži) — web mu nudi iste akcije.
  // `null` = sheet je zatvoren; vrednost je korak na kom se otvara.
  const [actionsView, setActionsView] = useState<SheetView | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const page = useQuery(api.pages.get, { pageId });
  const profile = useQuery(api.profiles.getCurrent, {});
  const assignees = useQuery(api.taskAssignees.listForTask, { taskPageId: pageId });
  const members = useQuery(
    api.startups.listMembers,
    activeStartupId ? { startupId: activeStartupId, limit: 50 } : 'skip',
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
  const assigneeList = assignees ?? [];
  const canEditAll = page.permissions.canEdit;
  const isAssignee = myId !== null && assigneeList.some((a) => a.profileId === myId);
  const canChangeStatus = canEditAll || isAssignee;
  const status = page.taskStatus ?? 'backlog';

  const openSheet = () => setSheetOpen(true);
  const applyStatus = (next: TaskStatus) => {
    run(updateMetadata({ pageId, status: next }));
    setSheetOpen(false);
  };
  const applyPriority = (next: TaskPriority) => {
    run(updateMetadata({ pageId, priority: next }));
    setSheetOpen(false);
  };
  const applyDue = (dueDate: number | null) => {
    run(updateMetadata({ pageId, dueDate }));
    setSheetOpen(false);
  };
  const applyJoinLeave = (isSelfAssigned: boolean) =>
    run(isSelfAssigned ? leave({ taskPageId: pageId }) : join({ taskPageId: pageId }));
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
            eyebrow={TASK_STATUS_META[status].label}
            onBack={() => router.back()}
            actions={
              <IconButton
                accessibilityLabel="Akcije zadatka"
                onPress={() => setActionsView('menu')}>
                <Ellipsis size={20} color={colors.foreground} />
              </IconButton>
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
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row
                variant="value"
                title="Status"
                onPress={openSheet}
                accessibilityLabel={`Izmeni status, trenutno ${TASK_STATUS_META[status].label}`}
                style={styles.metaRow}
                icon={<CircleDot size={20} color={colors.mutedForeground} />}
                value={
                  <View style={styles.statusValue}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor(colors, status) }]} />
                    <Text style={[styles.valueText, { color: colors.foreground }]}>
                      {TASK_STATUS_META[status].label}
                    </Text>
                  </View>
                }
              />
              <Divider colors={colors} />
              <Row
                variant="value"
                title="Prioritet"
                onPress={openSheet}
                accessibilityLabel={`Izmeni prioritet, trenutno ${TASK_PRIORITY_META[page.taskPriority ?? 'medium'].label}`}
                style={styles.metaRow}
                icon={<Flag size={20} color={colors.mutedForeground} />}
                value={<PriorityDot priority={page.taskPriority} showLabel />}
              />
              <Divider colors={colors} />
              <Row
                variant="value"
                title="Rok"
                onPress={openSheet}
                accessibilityLabel={`Izmeni rok, trenutno ${
                  page.dueDate === null ? 'bez roka' : formatShortDate(page.dueDate)
                }`}
                style={styles.metaRow}
                icon={<CalendarDays size={20} color={colors.mutedForeground} />}
                value={
                  page.dueDate === null ? (
                    <Text style={[styles.valueText, { color: colors.mutedForeground }]}>Bez roka</Text>
                  ) : (
                    <View style={styles.rokValue}>
                      <Text style={[styles.valueText, { color: colors.foreground }]}>
                        {formatShortDate(page.dueDate)}
                      </Text>
                      <DeadlineBadge dueDate={page.dueDate} taskStatus={page.taskStatus} now={now} />
                    </View>
                  )
                }
              />
              <Divider colors={colors} />
              <Row
                variant="value"
                title="Izvršioci"
                // Kreator bira pun spisak (deljeni piker); ko nije kreator dobija
                // „priključi se / napusti" iz `TaskActionsSheet`.
                onPress={canEditAll ? () => setAssigneesOpen(true) : openSheet}
                accessibilityLabel={`Izmeni izvršioce, trenutno ${
                  assigneeList.length === 0 ? 'bez izvršilaca' : assigneeList.length
                }`}
                style={styles.metaRow}
                icon={<Users size={20} color={colors.mutedForeground} />}
                // Dok `listForTask` traje, `assigneeList` je prazan — bez ovoga bi
                // dodeljen zadatak nakratko pokazao „Nedodeljeno" placeholder.
                value={
                  assignees === undefined ? (
                    <Skeleton width={26} height={26} borderRadius={radius.full} />
                  ) : (
                    <AssigneeStack assignees={assigneeList} max={5} />
                  )
                }
              />
            </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InstructionsSection
              instructions={page.instructions}
              canEdit={canEditAll}
              onSave={saveInstructions}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TaskCheckpointList taskPageId={pageId} canCreate={canEditAll} />
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

            <DiscussionLink pageId={pageId} startupId={page.startupId} />
          </ScrollView>
        </KeyboardAvoidingView>

        <TaskActionsSheet
          task={sheetOpen ? page : null}
          now={now}
          assignees={assigneeList}
          members={members}
          currentProfileId={myId}
          canChangeStatus={canChangeStatus}
          canEditAll={canEditAll}
          onStatus={applyStatus}
          onPriority={applyPriority}
          onDue={applyDue}
          onJoinLeave={applyJoinLeave}
          onSetAssignees={applySetAssignees}
          onClose={() => setSheetOpen(false)}
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
        />
      </View>
    </View>
  );
}

function Divider({ colors }: { colors: ColorTokens }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
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
  return <TaskErrorState message={error.message} onRetry={retry} />;
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
  // Row unutar kartice (padding 12) — bez dodatnog horizontalnog paddinga.
  metaRow: {
    paddingHorizontal: 4,
    borderRadius: radius.control,
  },
  valueText: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  statusValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rokValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
});
