import {
  describeDue,
  formatDateShort,
  isOptimisticId,
  PRIORITY_LABELS,
  reopenStatus,
  STATUS_LABELS,
  taskPermissions,
  type TaskPriorityKey,
  type TaskStatusKey,
} from '@devotion/shared';
import { useMutation, usePaginatedQuery } from 'convex/react';
import {
  ArrowRightLeft,
  CalendarClock,
  CircleDot,
  ExternalLink,
  Flag,
  LogIn,
  LogOut,
  Sun,
  SunDim,
  Trash2,
  Users,
} from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedCheck } from '@/components/motion';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { AssigneePickerList, assigneeCountLabel, assigneeLimitHint } from '@/components/zadatak/assignee-picker';
import { TaskCheckpointList } from '@/components/zadatak/task-checkpoint-list';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryState, isGoneError } from '@/hooks/use-query-state';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useRetained } from '@/hooks/use-retained';
import { useToday } from '@/hooks/use-today';
import { announceWithUndoBar } from '@/lib/announce';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { statusColor } from '@/lib/task-meta';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, space, text } from '@/theme/tokens';

import {
  ChipGroup,
  ChoiceChip,
  DueChoiceChips,
  InlineDatePicker,
  LockedNotice,
  PriorityChoiceChips,
} from './choice-chips';
import { MetaChip } from './meta-chip';
import { dueChoiceOf } from './rok-plan-sheet';
import {
  MoveToStartupStep,
  PanelError,
  PanelGone,
  PanelLoading,
  PanelPlace,
  PANEL_INSTRUCTIONS_MAX,
  PANEL_NOTES_MAX,
  SubViewHeader,
  TextBlockField,
  TitleField,
  type MoveTargetStartup,
} from './task-panel-parts';
import { failed, useRowMutations } from './use-row-mutations';

export type TaskPanelTarget =
  | { kind: 'task'; pageId: Id<'pages'> }
  | { kind: 'personal'; personalTaskId: Id<'personalTasks'> };

/** Otvaranje panela: cilj i naslov (ime dok se podaci ne učitaju). */
export type TaskPanelRequest = { target: TaskPanelTarget; title: string };

export type TaskPanelSheetProps = {
  request: TaskPanelRequest | null;
  onClose: () => void;
  /** „Otvori" (startup zadatak): ekran zadatka u njegovom startupu. */
  onOpenInStartup: (startupId: Id<'startups'>, pageId: Id<'pages'>) => void;
};

type PanelView = 'main' | 'status' | 'priority' | 'due' | 'date' | 'assignees' | 'move';

const STARTUP_STATUSES: ReadonlyArray<Exclude<TaskStatusKey, 'open'>> = [
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
];

export function panelRequestKey(request: TaskPanelRequest | null): string | null {
  if (!request) return null;
  return request.target.kind === 'task'
    ? `task:${request.target.pageId}`
    : `personal:${request.target.personalTaskId}`;
}

/**
 * Panel zadatka (plan K07 §1.4, trenutak 3) — telefonski par web `TaskPanel`:
 * donji sheet za startup zadatak ili lični zadatak; Moj dan i Moji zadaci
 * otvaraju ISTI panel. Iste upite i mutacije kao web: `pages.get`,
 * `taskAssignees.listForTask`/`join`/`leave`, `tasks.updateMetadata`
 * (status, prioritet, rok, izvršioci, instrukcije), `pages.update` (naslov),
 * `myDay.plan`/`unplan`; lični: `personalTasks.get`/`update`/`setStatus`/
 * `archive`/`restore`/`moveToStartup`.
 *
 * Izbor (status, prioritet, rok, izvršioci, prebacivanje) menja SADRŽAJ sheet-a
 * umesto da otvara drugi `Modal` (iOS ne prikazuje drugi dok je prvi otvoren —
 * K12). Radnje koje nude traku „Poništi" (završi, obriši, ukloni iz Moj dan)
 * zatvaraju panel da traka ispod njega bude vidljiva.
 */
export function TaskPanelSheet({ request, onClose, onOpenInStartup }: TaskPanelSheetProps) {
  // Sadržaj ostaje tokom izlazne animacije (zahtev je već `null`).
  const shown = useRetained(request);
  // „Pokušaj ponovo" ponovo montira sadržaj (nova pretplata).
  const [attempt, setAttempt] = useState(0);
  // Prikaz (glavni ili izbor) živi ovde da Android „nazad" i VoiceOver escape
  // vrate JEDAN korak, a ne zatvore ceo panel iz podprikaza.
  const contentKey = `${panelRequestKey(shown)}:${attempt}`;
  const [viewState, setViewState] = useState<{ key: string; view: PanelView }>({ key: contentKey, view: 'main' });
  const view = viewState.key === contentKey ? viewState.view : 'main';
  const setView = (next: PanelView) => setViewState({ key: contentKey, view: next });
  return (
    <Sheet
      visible={request !== null}
      onClose={() => (view === 'main' ? onClose() : setView(view === 'date' ? 'due' : 'main'))}
      avoidKeyboard
      maxHeight="92%"
      style={styles.sheet}>
      {shown ? (
        <PanelContent
          key={contentKey}
          request={shown}
          view={view}
          setView={setView}
          onClose={onClose}
          onOpenInStartup={onOpenInStartup}
          retry={() => setAttempt((value) => value + 1)}
        />
      ) : null}
    </Sheet>
  );
}

type ContentProps = {
  request: TaskPanelRequest;
  view: PanelView;
  setView: (view: PanelView) => void;
  onClose: () => void;
  onOpenInStartup: TaskPanelSheetProps['onOpenInStartup'];
  retry: () => void;
};

type PanelContext = {
  now: number;
  planEntryId: (refKey: string) => string | null;
  startups: ReadonlyArray<MoveTargetStartup & { _id: Id<'startups'> }>;
  profileId: Id<'profiles'> | null;
  profileFailed: boolean;
  rows: ReturnType<typeof useRowMutations>;
  view: PanelView;
  setView: (view: PanelView) => void;
  onOpenInStartup: TaskPanelSheetProps['onOpenInStartup'];
  /** Doskrolaj panel do dna posle fokusa polja (tastatura smanji vidljiv deo). */
  revealField: () => void;
};

function PanelContent({ request, view, setView, onClose, onOpenInStartup, retry }: ContentProps) {
  const today = useToday();
  // Polje pri dnu panela se posle fokusa doskroluje iznad tastature.
  const scrollRef = useRef<ScrollView>(null);
  const profileState = useQueryState(api.profiles.getCurrent, {});
  const profile = profileState.status === 'ready' ? profileState.data : null;
  const overview = useQueryTolerant(api.myDay.overview, { dayKey: today.dayKey, doneSince: today.doneSince });
  const { results } = usePaginatedQuery(api.startups.listForCurrent, {}, { initialNumItems: 50 });
  const startups = useMemo(
    () =>
      results.map((startup) => ({
        _id: startup._id,
        name: startup.name,
        logoUrl: startup.logoUrl,
        areas: startup.areas.map((area) => ({ _id: area._id as string, label: area.label })),
      })),
    [results],
  );
  const rows = useRowMutations({ dayKey: today.dayKey, now: today.now });
  const entries = overview?.entries;
  const ctx: PanelContext = {
    now: today.now,
    planEntryId: (refKey) => entries?.find((entry) => entry.refKey === refKey)?._id ?? null,
    startups,
    profileId: profile?._id ?? null,
    // Profil koji se ne učita (greška ili ne postoji) je greška panela, ne večito učitavanje.
    profileFailed: profileState.status === 'error' || (profileState.status === 'ready' && profileState.data === null),
    rows,
    view,
    setView,
    onOpenInStartup,
    revealField: () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250),
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {request.target.kind === 'task' ? (
        <StartupTaskPanel
          pageId={request.target.pageId}
          fallbackTitle={request.title}
          ctx={ctx}
          onClose={onClose}
          onOpenInStartup={onOpenInStartup}
          retry={retry}
        />
      ) : (
        <PersonalTaskPanel
          personalTaskId={request.target.personalTaskId}
          fallbackTitle={request.title}
          ctx={ctx}
          onClose={onClose}
          retry={retry}
        />
      )}
    </ScrollView>
  );
}

// --- Startup zadatak ---------------------------------------------------------

function StartupTaskPanel({
  pageId,
  fallbackTitle,
  ctx,
  onClose,
  onOpenInStartup,
  retry,
}: {
  pageId: Id<'pages'>;
  fallbackTitle: string;
  ctx: PanelContext;
  onClose: () => void;
  onOpenInStartup: TaskPanelSheetProps['onOpenInStartup'];
  retry: () => void;
}) {
  const colors = useThemeColors();
  const { rows, view, setView } = ctx;
  const page = useQueryState(api.pages.get, { pageId });
  const assignees = useQueryState(api.taskAssignees.listForTask, { taskPageId: pageId });
  const data = page.status === 'ready' ? page.data : null;
  const isCreator = data !== null && ctx.profileId !== null && data.createdByProfileId === ctx.profileId;
  const members = useQueryState(
    api.startups.listMembers,
    data && isCreator ? { startupId: data.startupId, limit: 50 } : 'skip',
  );
  const updateMetadata = useMutation(api.tasks.updateMetadata);
  const renamePage = useMutation(api.pages.update);
  const join = useMutation(api.taskAssignees.join);
  const leave = useMutation(api.taskAssignees.leave);

  if (ctx.profileFailed) return <PanelError retry={retry} onClose={onClose} />;
  if (page.status === 'error' || assignees.status === 'error') {
    const error = page.status === 'error' ? page.error : assignees.status === 'error' ? assignees.error : null;
    return error && isGoneError(error) ? (
      <PanelGone onClose={onClose} />
    ) : (
      <PanelError retry={retry} onClose={onClose} />
    );
  }
  if (!data || assignees.status !== 'ready' || ctx.profileId === null) return <PanelLoading title={fallbackTitle} />;

  const startup = ctx.startups.find((item) => item._id === data.startupId) ?? {
    _id: data.startupId,
    name: 'Startup',
    logoUrl: null,
    areas: [],
  };
  const area = startup.areas.find((item) => item._id === data.areaId);
  const assigneeList = assignees.data;
  const isAssignee = assigneeList.some((person) => person.profileId === ctx.profileId);
  const permissions = taskPermissions({ kind: 'task', isCreator, isAssignee });
  const status = (data.taskStatus ?? 'backlog') as Exclude<TaskStatusKey, 'open'>;
  const priority = (data.taskPriority ?? null) as TaskPriorityKey | null;
  const dueDate = data.dueDate ?? null;
  const planEntryId = ctx.planEntryId(`task:${pageId}`);
  const due = describeDue(dueDate, ctx.now);

  const fail = (title: string, fallback: string) => (error: unknown) => failed(title, error, fallback);
  const denied = (reason: string) => {
    haptics.warning();
    Alert.alert('Nije dozvoljeno', reason);
  };

  const changeStatus = (next: Exclude<TaskStatusKey, 'open'>) => {
    setView('main');
    if (next === status) return;
    void rows
      .send({ fn: 'tasks.updateMetadata', pageId, status: next })
      .then(() => {
        if (next !== 'done') return;
        haptics.success();
        const label = `Završeno: ${data.title}`;
        announceWithUndoBar(label);
        pushUndo({ label, action: { kind: 'taskStatus', pageId, status: reopenStatus(status) } });
        // Traka „Poništi" je ispod panela: panel se zatvara da bude vidljiva.
        onClose();
      })
      .catch(fail('Izmena nije sačuvana', 'Pokušaj ponovo.'));
  };
  const changePriority = (next: TaskPriorityKey | null) => {
    setView('main');
    if (next === null || next === priority) return;
    void rows
      .send({ fn: 'tasks.updateMetadata', pageId, priority: next })
      .catch(fail('Prioritet nije sačuvan', 'Pokušaj ponovo.'));
  };
  const changeDue = (next: number | null) => {
    setView('main');
    if (next === dueDate) return;
    void rows
      .send({ fn: 'tasks.updateMetadata', pageId, dueDate: next })
      .then(() => AccessibilityInfo.announceForAccessibility('Rok je promenjen.'))
      .catch(fail('Rok nije sačuvan', 'Pokušaj ponovo.'));
  };
  const changeAssignees = (profileIds: Id<'profiles'>[]) => {
    void updateMetadata({ pageId, assigneeProfileIds: profileIds }).catch(
      fail('Izmena nije sačuvana', 'Pokušaj ponovo.'),
    );
  };
  const saveInstructions = (value: string | null) => {
    void updateMetadata({ pageId, instructions: value }).catch(fail('Instrukcije nisu sačuvane', 'Pokušaj ponovo.'));
  };
  const togglePlan = () => {
    rows.togglePlanOf({ kind: 'task', taskPageId: pageId }, planEntryId);
    // Uklanjanje nudi traku „Poništi" ispod panela.
    if (planEntryId !== null && !isOptimisticId(planEntryId)) onClose();
  };

  if (view === 'status') {
    return (
      <View style={styles.stack}>
        <SubViewHeader title="Status" onBack={() => setView('main')} />
        <ChipGroup label="Status">
          {STARTUP_STATUSES.map((value) => (
            <ChoiceChip
              key={value}
              label={STATUS_LABELS[value]}
              selected={status === value}
              leading={<View style={[styles.dot, { backgroundColor: statusColor(colors, value) }]} />}
              onPress={() => changeStatus(value)}
            />
          ))}
        </ChipGroup>
      </View>
    );
  }
  if (view === 'priority') {
    return (
      <View style={styles.stack}>
        <SubViewHeader title="Prioritet" onBack={() => setView('main')} />
        <PriorityChoiceChips value={priority} allowNone={false} onSelect={changePriority} />
      </View>
    );
  }
  if (view === 'due') {
    return (
      <View style={styles.stack}>
        <SubViewHeader title="Rok" onBack={() => setView('main')} />
        <DueChoiceChips
          now={ctx.now}
          selected={dueChoiceOf(dueDate, ctx.now)}
          dateLabel={dueDate === null ? null : formatDateShort(dueDate)}
          onShortcut={(_, value) => changeDue(value)}
          onPickDate={() => setView('date')}
          onNone={() => changeDue(null)}
        />
      </View>
    );
  }
  if (view === 'date') {
    return <InlineDatePicker value={dueDate} onBack={() => setView('due')} onSelect={changeDue} />;
  }
  if (view === 'assignees') {
    const selected = assigneeList.map((person) => person.profileId as Id<'profiles'>);
    return (
      <View style={styles.stack}>
        <SubViewHeader title={assigneeCountLabel(selected.length)} onBack={() => setView('main')} />
        {permissions.assignees.selfOnly ? (
          <>
            {assigneeList.length === 0 ? (
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>Niko još nije dodeljen.</Text>
            ) : (
              assigneeList.map((person) => (
                <View key={person.profileId} style={styles.person}>
                  <Avatar name={person.displayName} uri={person.avatarUrl} size={32} />
                  <Text numberOfLines={1} style={[styles.personName, { color: colors.foreground }]}>
                    {person.displayName}
                  </Text>
                </View>
              ))
            )}
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>{permissions.assignees.reason}</Text>
            <Button
              label={isAssignee ? 'Napusti zadatak' : 'Priključi se'}
              variant="secondary"
              icon={
                isAssignee ? (
                  <LogOut size={16} color={colors.foreground} />
                ) : (
                  <LogIn size={16} color={colors.foreground} />
                )
              }
              onPress={() => {
                void (isAssignee ? leave({ taskPageId: pageId }) : join({ taskPageId: pageId })).catch(
                  fail(isAssignee ? 'Napuštanje zadatka nije uspelo' : 'Priključivanje nije uspelo', 'Pokušaj ponovo.'),
                );
              }}
            />
          </>
        ) : members.status === 'error' ? (
          <Text accessibilityRole="alert" style={[styles.muted, { color: colors.destructive }]}>
            Članovi se ne mogu učitati. Zatvori i ponovo otvori panel.
          </Text>
        ) : (
          <>
            <AssigneePickerList
              members={members.status === 'ready' ? members.data : undefined}
              selectedIds={selected}
              onChange={changeAssignees}
            />
            {assigneeLimitHint(selected.length) ? (
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                {assigneeLimitHint(selected.length)}
              </Text>
            ) : null}
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.headerBlock}>
        <PanelPlace startup={startup} areaLabel={area?.label ?? null} />
        <TitleField
          value={data.title}
          editable={data.permissions.canEdit}
          onCommit={(title) => {
            void renamePage({ pageId, title, expectedRevision: data.revision }).catch(
              fail('Naslov nije sačuvan', 'Pokušaj ponovo.'),
            );
          }}
        />
      </View>

      <View style={styles.chips}>
        <MetaChip
          label="Status"
          value={STATUS_LABELS[status]}
          icon={CircleDot}
          perm={permissions.status}
          onDenied={denied}
          onPress={() => setView('status')}
        />
        <MetaChip
          label="Prioritet"
          value={priority ? PRIORITY_LABELS[priority] : 'Bez prioriteta'}
          bare={priority === null}
          icon={Flag}
          perm={permissions.priority}
          onDenied={denied}
          onPress={() => setView('priority')}
        />
        <MetaChip
          label="Rok"
          value={due.label}
          bare={dueDate === null}
          icon={CalendarClock}
          perm={permissions.due}
          accessibilityLabel={due.ariaLabel}
          onDenied={denied}
          onPress={() => setView('due')}
        />
        <MetaChip
          label="Izvršioci"
          value={assigneeList.length === 0 ? 'Niko' : String(assigneeList.length)}
          icon={Users}
          perm={{ allowed: true, reason: null }}
          onPress={() => setView('assignees')}
        />
      </View>

      <View style={styles.chips}>
        <PlanButton planned={planEntryId !== null} onPress={togglePlan} />
        <Button
          label="Otvori u startupu"
          variant="secondary"
          icon={<ExternalLink size={16} color={colors.foreground} />}
          onPress={() => {
            onClose();
            onOpenInStartup(data.startupId, pageId);
          }}
        />
        {permissions.assignees.selfOnly ? (
          <Button
            label={isAssignee ? 'Napusti zadatak' : 'Priključi se'}
            variant="ghost"
            icon={
              isAssignee ? (
                <LogOut size={16} color={colors.foreground} />
              ) : (
                <LogIn size={16} color={colors.foreground} />
              )
            }
            onPress={() => {
              void (isAssignee ? leave({ taskPageId: pageId }) : join({ taskPageId: pageId })).catch(
                fail(isAssignee ? 'Napuštanje zadatka nije uspelo' : 'Priključivanje nije uspelo', 'Pokušaj ponovo.'),
              );
            }}
          />
        ) : null}
      </View>

      <View style={styles.stack}>
        <TaskCheckpointList taskPageId={pageId} canCreate={permissions.checkpoints.allowed} onDeleted={onClose} />
        {permissions.checkpoints.allowed ? null : (
          <LockedNotice label="Koraci" reason={permissions.checkpoints.reason ?? ''} />
        )}
      </View>

      <TextBlockField
        title="Instrukcije"
        value={data.instructions ?? null}
        editable={permissions.instructions.allowed}
        lockedReason={permissions.instructions.allowed ? null : permissions.instructions.reason}
        max={PANEL_INSTRUCTIONS_MAX}
        placeholder="Dodaj instrukcije…"
        emptyText="Nema instrukcija."
        accessibilityLabel="Instrukcije"
        onFocusField={ctx.revealField}
        onSave={saveInstructions}
      />
    </View>
  );
}

// --- Lični zadatak -----------------------------------------------------------

function PersonalTaskPanel({
  personalTaskId,
  fallbackTitle,
  ctx,
  onClose,
  retry,
}: {
  personalTaskId: Id<'personalTasks'>;
  fallbackTitle: string;
  ctx: PanelContext;
  onClose: () => void;
  retry: () => void;
}) {
  const colors = useThemeColors();
  const { rows, view, setView } = ctx;
  const taskState = useQueryState(api.personalTasks.get, { personalTaskId });
  const update = useMutation(api.personalTasks.update);
  const archive = useMutation(api.personalTasks.archive);
  const moveToStartup = useMutation(api.personalTasks.moveToStartup);

  if (taskState.status === 'error') {
    return isGoneError(taskState.error) ? (
      <PanelGone onClose={onClose} />
    ) : (
      <PanelError retry={retry} onClose={onClose} />
    );
  }
  if (taskState.status === 'loading') return <PanelLoading title={fallbackTitle} />;
  const task = taskState.data;
  if (task === null) return <PanelGone onClose={onClose} />;

  const planEntryId = ctx.planEntryId(`personal:${personalTaskId}`);
  const due = describeDue(task.dueDate, ctx.now);
  const done = task.status === 'done';
  const moveBlocked = done
    ? 'Završen zadatak se ne prebacuje u startup.'
    : ctx.startups.length === 0
      ? 'Još nisi ni u jednom startupu.'
      : null;
  const fail = (title: string, fallback: string) => (error: unknown) => failed(title, error, fallback);

  const change = (patch: {
    title?: string;
    notes?: string | null;
    priority?: TaskPriorityKey | null;
    dueDate?: number | null;
  }) => {
    void update({ personalTaskId, ...patch })
      .then(() => {
        if (patch.dueDate !== undefined) AccessibilityInfo.announceForAccessibility('Rok je promenjen.');
      })
      .catch(
        fail(patch.dueDate !== undefined ? 'Rok nije sačuvan' : 'Izmena nije sačuvana', 'Pokušaj ponovo.'),
      );
  };
  const toggleDone = (next: boolean) => {
    void rows
      .send({ fn: 'personalTasks.setStatus', personalTaskId, status: next ? 'done' : 'open' })
      .then(() => {
        if (!next) return;
        haptics.success();
        const label = `Završeno: ${task.title}`;
        announceWithUndoBar(label);
        pushUndo({ label, action: { kind: 'personalTaskStatus', personalTaskId, status: 'open' } });
        onClose();
      })
      .catch(fail(next ? 'Zadatak nije završen' : 'Zadatak nije vraćen', 'Pokušaj ponovo.'));
  };
  const remove = () => {
    // Kao na webu: bez potvrde, a „Poništi" (`restore`) stoji 8 s u traci.
    void archive({ personalTaskId })
      .then(() => {
        const label = 'Zadatak je obrisan.';
        announceWithUndoBar(label);
        pushUndo({ label, action: { kind: 'personalTaskArchive', personalTaskId } });
        onClose();
      })
      .catch(fail('Brisanje nije uspelo', 'Pokušaj ponovo.'));
  };
  const togglePlan = () => {
    rows.togglePlanOf({ kind: 'personal', personalTaskId }, planEntryId);
    if (planEntryId !== null && !isOptimisticId(planEntryId)) onClose();
  };

  if (view === 'priority') {
    return (
      <View style={styles.stack}>
        <SubViewHeader title="Prioritet" onBack={() => setView('main')} />
        <PriorityChoiceChips
          value={task.priority}
          allowNone
          onSelect={(next) => {
            setView('main');
            if (next !== task.priority) change({ priority: next });
          }}
        />
      </View>
    );
  }
  if (view === 'due') {
    return (
      <View style={styles.stack}>
        <SubViewHeader title="Rok" onBack={() => setView('main')} />
        <DueChoiceChips
          now={ctx.now}
          selected={dueChoiceOf(task.dueDate, ctx.now)}
          dateLabel={task.dueDate === null ? null : formatDateShort(task.dueDate)}
          onShortcut={(_, value) => {
            setView('main');
            if (value !== task.dueDate) change({ dueDate: value });
          }}
          onPickDate={() => setView('date')}
          onNone={() => {
            setView('main');
            if (task.dueDate !== null) change({ dueDate: null });
          }}
        />
      </View>
    );
  }
  if (view === 'date') {
    return (
      <InlineDatePicker
        value={task.dueDate}
        onBack={() => setView('due')}
        onSelect={(value) => {
          setView('main');
          if (value !== task.dueDate) change({ dueDate: value });
        }}
      />
    );
  }
  if (view === 'move') {
    return (
      <MoveToStartupStep
        title={task.title}
        startups={ctx.startups}
        onCancel={() => setView('main')}
        onMove={async (startupId, areaId) => {
          const target = ctx.startups.find((item) => item._id === startupId);
          try {
            const { pageId } = await moveToStartup({
              personalTaskId,
              startupId: startupId as Id<'startups'>,
              areaId: areaId as Id<'startupAreas'>,
            });
            haptics.success();
            const label = `Prebačeno u ${target?.name ?? 'startup'}.`;
            onClose();
            // Prebacivanje se ne poništava (D12), pa traka „Poništi" ne postoji;
            // „Otvori" iz web toasta je ovde dugme obaveštenja.
            Alert.alert(label, undefined, [
              { text: 'Zatvori', style: 'cancel' },
              { text: 'Otvori', onPress: () => ctx.onOpenInStartup(startupId as Id<'startups'>, pageId) },
            ]);
          } catch (error) {
            throw new Error(accessErrorMessage(error, 'Zadatak nije prebačen. Pokušaj ponovo.'));
          }
        }}
      />
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.headerBlock}>
        <PanelPlace startup={null} areaLabel={null} />
        <View style={styles.titleRow}>
          <AnimatedCheck
            checked={done}
            onToggle={toggleDone}
            accessibilityLabel={`Zadatak: ${task.title}`}
          />
          <View style={styles.titleField}>
            <TitleField value={task.title} editable onCommit={(title) => change({ title })} />
          </View>
        </View>
      </View>

      <View style={styles.chips}>
        <MetaChip
          label="Rok"
          value={due.label}
          bare={task.dueDate === null}
          icon={CalendarClock}
          perm={{ allowed: true, reason: null }}
          accessibilityLabel={due.ariaLabel}
          onPress={() => setView('due')}
        />
        <MetaChip
          label="Prioritet"
          value={task.priority ? PRIORITY_LABELS[task.priority] : 'Bez prioriteta'}
          bare={task.priority === null}
          icon={Flag}
          perm={{ allowed: true, reason: null }}
          onPress={() => setView('priority')}
        />
        <PlanButton planned={planEntryId !== null} onPress={togglePlan} />
      </View>

      <TextBlockField
        title="Beleška"
        value={task.notes}
        editable
        max={PANEL_NOTES_MAX}
        placeholder="Dodaj belešku…"
        emptyText="Nema beleške."
        accessibilityLabel="Beleška"
        onFocusField={ctx.revealField}
        onSave={(notes) => change({ notes })}
      />

      <View style={styles.stack}>
        <View style={styles.chips}>
          <Button
            label="Prebaci u startup"
            variant="secondary"
            accessibilityState={{ disabled: moveBlocked !== null }}
            icon={<ArrowRightLeft size={16} color={moveBlocked ? colors.mutedForeground : colors.foreground} />}
            // `aria-disabled` obrazac (E15): dodir pokazuje razlog umesto da bude mrtav.
            onPress={() => {
              if (moveBlocked) {
                haptics.warning();
                Alert.alert('Nije dozvoljeno', moveBlocked);
                return;
              }
              setView('move');
            }}
          />
          <Button
            label="Obriši"
            variant="ghost"
            icon={<Trash2 size={16} color={colors.destructive} />}
            onPress={remove}
          />
        </View>
        {moveBlocked ? <Text style={[styles.muted, { color: colors.mutedForeground }]}>{moveBlocked}</Text> : null}
      </View>
    </View>
  );
}

/** „Dodaj u Moj dan" / „Ukloni iz Moj dan" (plan je lični — uvek dozvoljen). */
function PlanButton({ planned, onPress }: { planned: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Button
      label={planned ? 'Ukloni iz Moj dan' : 'Dodaj u Moj dan'}
      variant="secondary"
      icon={
        planned ? <Sun size={16} color={colors.primaryText} /> : <SunDim size={16} color={colors.foreground} />
      }
      onPress={() => {
        haptics.select();
        onPress();
      }}
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingBottom: space[2],
  },
  stack: {
    gap: space[4],
  },
  headerBlock: {
    gap: space[2],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[1],
  },
  titleField: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 44,
  },
  personName: {
    ...text.body,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  muted: {
    ...text.body,
  },
});

