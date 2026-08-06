import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ChevronLeft, ChevronRight, ClipboardX, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssigneeStack } from '@/components/danas/assignee-stack';
import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { PriorityDot } from '@/components/danas/priority-dot';
import { TaskActionsSheet } from '@/components/danas/task-actions-sheet';
import { EmptyState } from '@/components/empty-state';
import { DiscussionLink } from '@/components/zadatak/discussion-link';
import { InstructionsSection } from '@/components/zadatak/instructions-section';
import { TaskCheckpointList } from '@/components/zadatak/task-checkpoint-list';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  formatShortDate,
  statusColor,
  TASK_STATUS_META,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

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

  const notifyError = (error: unknown) =>
    Alert.alert('Nešto nije prošlo', error instanceof Error ? error.message : 'Pokušaj ponovo.');
  const run = (promise: Promise<unknown>) => {
    void promise.catch(notifyError);
  };

  if (page === undefined || profile === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TaskHeader title="Zadatak" onBack={() => router.back()} colors={colors} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (page.kind !== 'task') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TaskHeader title={page.title} onBack={() => router.back()} colors={colors} />
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
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TaskHeader
          title={page.title}
          onBack={() => router.back()}
          colors={colors}
          onMeasure={setHeaderHeight}
        />

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
            <MetaRow label="Status" onPress={openSheet} colors={colors}>
              <View style={styles.statusValue}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(colors, status) }]} />
                <Text style={[styles.valueText, { color: colors.foreground }]}>
                  {TASK_STATUS_META[status].label}
                </Text>
              </View>
            </MetaRow>
            <Divider colors={colors} />
            <MetaRow label="Prioritet" onPress={openSheet} colors={colors}>
              <PriorityDot priority={page.taskPriority} showLabel />
            </MetaRow>
            <Divider colors={colors} />
            <MetaRow label="Rok" onPress={openSheet} colors={colors}>
              {page.dueDate === null ? (
                <Text style={[styles.valueText, { color: colors.mutedForeground }]}>Bez roka</Text>
              ) : (
                <View style={styles.rokValue}>
                  <Text style={[styles.valueText, { color: colors.foreground }]}>
                    {formatShortDate(page.dueDate)}
                  </Text>
                  <DeadlineBadge dueDate={page.dueDate} taskStatus={page.taskStatus} now={now} />
                </View>
              )}
            </MetaRow>
            <Divider colors={colors} />
            <MetaRow label="Izvršioci" onPress={openSheet} colors={colors}>
              <AssigneeStack assignees={assigneeList} max={5} />
            </MetaRow>
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
      </View>
    </GestureHandlerRootView>
  );
}

function TaskHeader({
  title,
  onBack,
  colors,
  onMeasure,
}: {
  title: string;
  onBack: () => void;
  colors: ColorTokens;
  onMeasure?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      onLayout={onMeasure ? (event) => onMeasure(event.nativeEvent.layout.height) : undefined}
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
    </View>
  );
}

function MetaRow({
  label,
  onPress,
  colors,
  children,
}: {
  label: string;
  onPress: () => void;
  colors: ColorTokens;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Izmeni: ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.metaRow, pressed && { backgroundColor: colors.muted }]}>
      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.metaValue}>{children}</View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

function Divider({ colors }: { colors: ColorTokens }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
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
      <TaskHeader title="Zadatak" onBack={() => router.back()} colors={colors} />
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
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    paddingHorizontal: 4,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    width: 84,
  },
  metaValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    fontSize: 15,
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
