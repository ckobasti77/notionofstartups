import {
  addDaysToKey,
  dayKeyOf,
  noonOfDayKey,
  rescheduleCandidates,
  rescheduleOutcome,
  type PendingItemLike,
  type RescheduleTarget,
  type StartupTaskLike,
  type TaskItemLike,
} from '@devotion/shared';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { StackAssignee } from '@/components/danas/assignee-stack';
import { BlockErrorRow } from '@/components/komandni-centar/command-block-parts';
import {
  activityRowModel,
  BLOCK_TEXT,
  buildForYouSection,
  buildTriageSections,
  pulseLine,
  teamEntryLabel,
  teamWorkload,
  triageGroups,
  waitingIdeas,
  type WaitingIdea,
} from '@/components/komandni-centar/command-blocks-model';
import { ForYouView } from '@/components/komandni-centar/for-you-block';
import { PulseView } from '@/components/komandni-centar/pulse-block';
import { RecentChangesView } from '@/components/komandni-centar/recent-changes-block';
import {
  RescheduleSheetView,
  type RescheduleNotice,
} from '@/components/komandni-centar/reschedule-sheet';
import { TeamRowView, TeamSheetView } from '@/components/komandni-centar/team-block';
import { TriageView } from '@/components/komandni-centar/triage-block';
import type { StartupRowActions } from '@/components/komandni-centar/use-startup-task-commands';
import { WaitingView } from '@/components/komandni-centar/waiting-block';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text, type ColorTokens } from '@/theme/tokens';

const MINUTE = 60_000;
const STARTUP = { _id: 's1', name: 'Cluck Rush', logoUrl: null };

type Mode = 'ready' | 'loading' | 'empty';

const TITLES = [
  'Pripremi API ključeve za partnere',
  'Ugovor sa dobavljačem',
  'Odgovori na ponudu pekare',
  'Ažuriraj cenovnik za jesen',
  'Pošalji račun za septembar',
  'Proveri izveštaj o prodaji',
  'Zakaži razgovor sa kandidatom',
  'Pregled ugovora iz avgusta',
  'Migracija stare baze',
  'Obnovi domen',
];

function dayNoon(now: number, offset: number): number {
  return noonOfDayKey(addDaysToKey(dayKeyOf(now), offset));
}

function triageTask(id: string, title: string, dueOffset: number | null, now: number, status: StartupTaskLike['taskStatus'] = 'next') {
  return {
    _id: id,
    areaId: 'a1',
    title,
    taskStatus: status,
    taskPriority: 'medium' as const,
    dueDate: dueOffset === null ? null : dayNoon(now, dueOffset),
    createdByProfileId: 'ana',
    taskSortAt: 0,
  } satisfies StartupTaskLike & { taskSortAt: number };
}

/**
 * Zadaci Trijaže: 30 prekoračenih (14 svežih i 16 starijih od 14 dana, koji idu u
 * „Zastarelo"), 3 za danas, 8 sledećih i jedan blokiran.
 */
function triageTasks(now: number) {
  return [
    ...Array.from({ length: 30 }, (_, index) =>
      triageTask(`k${index}`, `${TITLES[index % TITLES.length]}`, -(index + 1), now),
    ),
    triageTask('d1', 'Plan lansiranja', 0, now, 'in_progress'),
    triageTask('d2', 'Odobri budžet za oktobar', 0, now),
    triageTask('d3', 'Pošalji newsletter', 0, now),
    ...Array.from({ length: 8 }, (_, index) => triageTask(`s${index}`, `Sledeći korak ${index + 1}`, index + 1, now)),
    triageTask('b1', 'Čeka odgovor dobavljača', 3, now, 'blocked'),
  ];
}

function forYouItems(now: number): Array<TaskItemLike & { taskSortAt: number }> {
  const make = (id: string, title: string, offset: number | null, status: 'next' | 'in_progress' = 'next') => ({
    _id: id,
    title,
    taskStatus: status,
    taskPriority: 'medium' as const,
    dueDate: offset === null ? null : dayNoon(now, offset),
    taskSortAt: 0,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    isCreator: false,
    isAssignee: true,
    startup: STARTUP,
    area: { label: 'Marketing' },
  });
  return [
    make('m1', 'Pripremi API ključeve za partnere', -2),
    make('m2', 'Plan lansiranja', 0),
    make('m3', 'Migracija baze', null, 'in_progress'),
    make('m4', 'Odgovori Mini na poruku', -1),
    make('m5', 'Ažuriraj FAQ', 0),
    make('m6', 'Napiši beleške sa sastanka', -3),
    make('m7', 'Reel za novi meni', null, 'in_progress'),
  ];
}

function pendingVotes(): PendingItemLike[] {
  const vote = (ideaId: string, title: string, authorName: string | null): PendingItemLike => ({
    kind: 'idea_vote',
    ideaId,
    title,
    authorName,
    upvotes: 0,
    downvotes: 0,
    startup: { _id: STARTUP._id },
  });
  return [
    vote('i1', 'Referral program za pekare', 'Ana Ilić'),
    vote('i2', 'Novi onboarding sa video uvodom', 'Marko Jović'),
    vote('i3', 'Besplatna dostava iznad 3.000 din', null),
    vote('i4', 'Jesenji meni sa sezonskim ponudama', 'Mina Petrović'),
  ];
}

function recentItems(now: number) {
  const base = { detail: undefined as string | undefined, actor: { displayName: 'Ana Ilić' } };
  return [
    { ...base, _id: 'a1', action: 'page_locked', title: 'Specifikacija API', targetType: 'page', targetId: 'p1', createdAt: now - 60 * MINUTE },
    {
      ...base,
      _id: 'a2',
      action: 'page_restored',
      title: 'Plan lansiranja',
      detail: 'Sa 3 podstranice',
      targetType: 'page',
      targetId: 'p2',
      createdAt: now - 3 * 60 * MINUTE,
      actor: { displayName: 'Marko Jović' },
    },
    { ...base, _id: 'a3', action: 'idea_stage_changed', title: 'Referral program', detail: 'Razmatra se', targetType: 'idea', targetId: 'i1', createdAt: now - 26 * 60 * MINUTE },
    { ...base, _id: 'a4', action: 'tasks_rescheduled', title: 'Cluck Rush', detail: '12 zadataka → sutra', targetType: 'startup', targetId: 's1', createdAt: now - 2 * 24 * 60 * MINUTE },
    { ...base, _id: 'a5', action: 'comment_created', title: 'Cenovnik', targetType: 'page', targetId: 'p3', createdAt: now - 5 * 24 * 60 * MINUTE, actor: { displayName: 'Mina Petrović' } },
  ];
}

const MEMBERS = [
  { profile: { _id: 'ana', displayName: 'Ana Ilić', avatarUrl: null } },
  { profile: { _id: 'marko', displayName: 'Marko Jović', avatarUrl: null } },
  { profile: { _id: 'mina', displayName: 'Mina Petrović', avatarUrl: null } },
  { profile: { _id: 'luka', displayName: 'Luka Nikolić', avatarUrl: null } },
  { profile: { _id: 'sara', displayName: 'Sara Todorović', avatarUrl: null } },
];

function Caption({ label, colors }: { label: string; colors: ColorTokens }) {
  return <Text style={[styles.caption, { color: colors.subtle }]}>{label}</Text>;
}

function Frame({ children, colors }: { children: React.ReactNode; colors: ColorTokens }) {
  return <View style={[styles.frame, { borderColor: colors.border }]}>{children}</View>;
}

/**
 * Dizajn katalog — PROSTOR K19: blokovi Komandnog centra 2.0 (Za tebe, Trijaža sa
 * „Zastarelo · N", Čeka tebe, Nedavne izmene, Puls nedelje, Tim), red greške bloka i
 * „Sredi rokove" sa 30 prekoračenih. Prikazi su bez upita; radnje se samo beleže.
 */
export function KomandniCentarK19Katalog() {
  const colors = useThemeColors();
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState<Mode>('ready');
  const [log, setLog] = useState('Dodirni red ili dugme.');

  const rowActions: StartupRowActions = {
    onToggleDone: (row, done) => setLog(`${done ? 'Završeno' : 'Vraćeno'}: ${row.title}`),
    onOpen: (row) => setLog(`Otvori: ${row.title}`),
    onLongPress: (row) => setLog(`Radnje: ${row.title}`),
    onSchedule: (row) => setLog(`Rok i plan: ${row.title}`),
    onDenied: (_row, reason) => setLog(reason),
  };
  const holds = useMemo(() => ({ holds: new Map(), pending: new Map<string, boolean>() }), []);

  // --- Za tebe ---
  const forYou = useMemo(
    () => buildForYouSection(forYouItems(now), now, { plannedKeys: new Map(), ...holds }),
    [now, holds],
  );

  // --- Trijaža ---
  const [staleOpen, setStaleOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const tasks = useMemo(() => triageTasks(now), [now]);
  const assignees = useMemo(() => {
    const mina: StackAssignee = { profileId: 'mina' as Id<'profiles'>, displayName: 'Mina Petrović', avatarUrl: null };
    const ana: StackAssignee = { profileId: 'ana' as Id<'profiles'>, displayName: 'Ana Ilić', avatarUrl: null };
    return new Map<string, StackAssignee[]>([
      ['k0', [ana]],
      ['k1', [ana, mina]],
      ['d1', [mina]],
    ]);
  }, []);
  const triageSections = useMemo(
    () =>
      buildTriageSections(tasks, now, {
        profileId: 'me',
        startup: STARTUP,
        areaLabels: new Map([['a1', 'Marketing']]),
        assigneeIdsByTask: new Map(),
        plannedKeys: new Map(),
        ...holds,
      }),
    [tasks, now, holds],
  );
  const groups = useMemo(
    () => (mode === 'empty' ? [] : triageGroups(triageSections)),
    [mode, triageSections],
  );
  const candidates = useMemo(() => rescheduleCandidates(tasks, now), [tasks, now]);

  // --- Čeka tebe ---
  const [ideas, setIdeas] = useState<WaitingIdea[]>(() => waitingIdeas(pendingVotes()).items);
  const [busyId, setBusyId] = useState<string | null>(null);

  // --- Tim ---
  const [teamOpen, setTeamOpen] = useState(false);
  const entries = useMemo(
    () =>
      teamWorkload(
        MEMBERS,
        tasks,
        new Map<string, Array<{ profileId: string }>>([
          ['k0', [{ profileId: 'ana' }]],
          ['k1', [{ profileId: 'ana' }, { profileId: 'mina' }]],
          ['d1', [{ profileId: 'mina' }]],
          ['d2', [{ profileId: 'marko' }]],
          ['s0', []],
          ['s1', [{ profileId: 'luka' }]],
        ]),
        now,
      ),
    [tasks, now],
  );

  // --- Sredi rokove ---
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<RescheduleNotice | null>(null);
  const selectedIds = new Set(candidates.filter((c) => !deselected.has(c.id)).map((c) => c.id));
  const apply = (target: RescheduleTarget) => {
    const outcome = rescheduleOutcome(target, { updated: selectedIds.size, unchanged: 0, skipped: [] });
    setNotice({ message: outcome.message, undoable: outcome.changed, undoBusy: false });
    setLog(`Sredi rokove: ${target}, ${selectedIds.size}`);
  };

  return (
    <View style={styles.root}>
      <SectionHeader title="PROSTOR K19 — Komandni centar" />
      <Caption
        label="Blokovi su prikazi bez upita: svaki ima učitavanje, prazno stanje i red greške."
        colors={colors}
      />
      <View style={styles.modeRow}>
        {(['ready', 'loading', 'empty'] as const).map((value) => (
          <Button
            key={value}
            label={{ ready: 'Podaci', loading: 'Učitavanje', empty: 'Prazno' }[value]}
            size="sm"
            variant={mode === value ? 'default' : 'secondary'}
            onPress={() => setMode(value)}
          />
        ))}
      </View>
      <Text style={[styles.log, { color: colors.mutedForeground }]}>{log}</Text>

      <Caption label="Za tebe — do 5 redova, „Svi moji zadaci · N”" colors={colors} />
      <Frame colors={colors}>
        <ForYouView
          rows={mode === 'loading' ? undefined : mode === 'empty' ? [] : forYou.section.rows}
          total={mode === 'ready' ? forYou.total : 0}
          now={now}
          rowActions={rowActions}
          onOpenAll={() => setLog('Svi moji zadaci')}
        />
      </Frame>

      <Caption
        label="Trijaža — 4 mobilne grupe, najviše 5 redova, „Zastarelo · N” skupljeno, „Sredi rokove · N”"
        colors={colors}
      />
      <View style={styles.modeRow}>
        <Button
          label={filter === null ? 'Filter: Ana' : 'Skini filter'}
          size="sm"
          variant="secondary"
          onPress={() => setFilter(filter === null ? 'Ana Ilić' : null)}
        />
      </View>
      <Frame colors={colors}>
        <TriageView
          groups={mode === 'loading' ? undefined : filter !== null && mode === 'ready' ? groups.slice(0, 1) : groups}
          filterName={filter}
          rescheduleCount={mode === 'ready' ? candidates.length : 0}
          staleOpen={staleOpen}
          now={now}
          rowActions={rowActions}
          assigneesByTask={assignees}
          truncated={false}
          onToggleStale={() => setStaleOpen((value) => !value)}
          onReschedule={() => {
            setNotice(null);
            setRescheduleOpen(true);
          }}
          onClearFilter={() => setFilter(null)}
          onOpenTasks={() => setLog('Sve u Zadacima')}
        />
      </Frame>

      <Caption label="Čeka tebe — Za / Protiv u redu, najviše 3, „Sve ideje” kad ih ima više" colors={colors} />
      <Frame colors={colors}>
        <WaitingView
          ideas={mode === 'loading' ? undefined : mode === 'empty' ? [] : ideas}
          hasMore={mode === 'ready'}
          busyId={busyId}
          onVote={(ideaId, voteType) => {
            setBusyId(ideaId);
            setLog(`Glas ${voteType === 'up' ? 'za' : 'protiv'}: ${ideaId}`);
            // Reaktivni upit sklanja red kad server potvrdi glas.
            setTimeout(() => {
              setIdeas((current) => current.filter((idea) => idea.ideaId !== ideaId));
              setBusyId(null);
            }, 500);
          }}
          onOpen={(ideaId) => setLog(`Otvori ideju: ${ideaId}`)}
          onOpenAll={() => setLog('Sve ideje')}
        />
      </Frame>
      {ideas.length < 3 ? (
        <Button label="Vrati ideje" size="sm" variant="secondary" onPress={() => setIdeas(waitingIdeas(pendingVotes()).items)} />
      ) : null}

      <Caption label="Nedavne izmene — rečenica iz shared-a, „pre N”, „Sva aktivnost”" colors={colors} />
      <Frame colors={colors}>
        <RecentChangesView
          rows={
            mode === 'loading'
              ? undefined
              : mode === 'empty'
                ? []
                : recentItems(now).map((item) => activityRowModel(item, now))
          }
          onOpen={(target) => setLog(`Otvori izmenu: ${target.kind}`)}
          onOpenAll={() => setLog('Sva aktivnost')}
        />
      </Frame>

      <Caption label="Puls nedelje — jedan red" colors={colors} />
      <Frame colors={colors}>
        <PulseView
          line={
            mode === 'loading'
              ? undefined
              : pulseLine([
                  { key: 'completed', label: 'Završeno', value: 14 },
                  { key: 'created', label: 'Novo', value: 9 },
                  { key: 'stuck', label: 'Zapelo', value: 3 },
                ])
          }
          onOpen={() => setLog('Otvori Puls')}
        />
      </Frame>

      <Caption label="Tim — red i sheet sa opterećenjem" colors={colors} />
      <Frame colors={colors}>
        <TeamRowView
          memberCount={mode === 'loading' ? undefined : MEMBERS.length}
          filterName={filter}
          onOpen={() => setTeamOpen(true)}
        />
      </Frame>

      <Caption label="Greška bloka — jedan red, ne ekran" colors={colors} />
      <Frame colors={colors}>
        <BlockErrorRow title={BLOCK_TEXT.forYouError} onRetry={() => setLog('Pokušaj ponovo')} />
      </Frame>

      <Caption label="Sredi rokove — 30 prekoračenih (14 svežih, 16 zastarelih)" colors={colors} />
      <Button
        label={`Otvori Sredi rokove · ${candidates.length}`}
        variant="secondary"
        onPress={() => {
          setNotice(null);
          setRescheduleOpen(true);
        }}
      />

      <TeamSheetView
        visible={teamOpen}
        onClose={() => setTeamOpen(false)}
        entries={entries}
        totalLabel={teamEntryLabel({ open: tasks.length, overdue: candidates.length })}
        activeKey={filter === null ? null : 'ana'}
        onSelect={(key) => {
          setFilter(key === null ? null : (entries.find((entry) => entry.key === key)?.name ?? null));
          setTeamOpen(false);
        }}
      />
      <RescheduleSheetView
        visible={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        candidates={candidates}
        selectedIds={selectedIds}
        busyTarget={null}
        notice={notice}
        onToggle={(id) =>
          setDeselected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onSelectAll={() => setDeselected(new Set())}
        onClearSelection={() => setDeselected(new Set(candidates.map((candidate) => candidate.id)))}
        onApply={apply}
        onUndo={() => {
          setNotice({ message: 'Vraćeno 12 zadataka.', undoable: false, undoBusy: false });
          setLog('Poništi');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  caption: {
    ...text.meta,
  },
  log: {
    ...text.meta,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frame: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
