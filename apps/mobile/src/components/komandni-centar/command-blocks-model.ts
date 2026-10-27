/**
 * Komandni centar 2.0 na telefonu (PROSTOR K19) — od odgovora servera do
 * blokova: Za tebe, Trijaža, Čeka tebe, Nedavne izmene, Puls nedelje i Tim.
 * ČISTO (vitest): bez React-a i bez Convex poziva. Zajedničke funkcije (izbor
 * „Za tebe", Puls, red Tima) su iz `@devotion/shared`, isto kao na webu.
 *
 * IZUZETAK od weba (K07 §5.2): Trijaža ostaje u četiri mobilne grupe
 * Prekoračeno · Danas · Sledeće · Blokirano (ne spaja ih sa web particijama
 * gori/danas/nedelja/kasnije).
 */
import {
  activityTarget,
  applyStartupHolds,
  COMMAND_BLOCK_TEXT,
  forYouTasks,
  formatActivity,
  formatEditTime,
  pendingIdeaVotes,
  rowFromTaskItem,
  splitStale,
  teamWorkloadLabel,
  type ActivityIcon,
  type ActivityTarget,
  type PendingItemLike,
  type StartupTaskLike,
  type StartupTaskSection,
  type TaskItemLike,
  type TaskRowModel,
  type WeekPulseFact,
} from '@devotion/shared';

import { bucketTasksForToday, classifyDeadline, TODAY_SECTION_ORDER, type TodaySection } from '@/lib/deadline';
import type { TaskStatus } from '@/lib/task-meta';

import {
  COMMAND_CENTER_LIST,
  startupRow,
  type HoldsContext,
  type StartupRowsContext,
} from './startup-task-model';

// --- Brojevi ------------------------------------------------------------------

/** „Za tebe": najviše redova. */
export const FOR_YOU_LIMIT = 5;
/** Trijaža: najviše redova po grupi (isto važi za skupljeno „Zastarelo"). */
export const TRIAGE_GROUP_LIMIT = 5;
/** Čeka tebe: najviše ideja. */
export const WAITING_LIMIT = 3;
/** Nedavne izmene: najviše redova (samo prva strana upita). */
export const RECENT_LIMIT = 5;

/** Sekcija „Za tebe" u registru redova (`locate`/`getRow` čitaju sve sekcije). */
export const FOR_YOU_SECTION = 'za-tebe';
/** Skupljena grupa „Zastarelo" izdvojena iz Prekoračenog. */
export const STALE_SECTION = 'stale';

/** Ključ pod kojim se vode zadaci bez ijednog izvršioca (filter člana). */
export const UNASSIGNED_KEY = 'unassigned';

// --- Tekstovi -----------------------------------------------------------------

export const BLOCK_TEXT = {
  forYouEmpty: 'Nemaš otvorenih zadataka ovde.',
  forYouError: COMMAND_BLOCK_TEXT.forYouError,
  triageEmpty: 'Tim nema otvorenih zadataka.',
  triageError: COMMAND_BLOCK_TEXT.triageError,
  waitingEmpty: 'Nema ideja koje čekaju tvoj glas.',
  waitingError: COMMAND_BLOCK_TEXT.waitingError,
  recentEmpty: 'Još nema izmena.',
  recentError: COMMAND_BLOCK_TEXT.recentError,
  pulseError: COMMAND_BLOCK_TEXT.pulseError,
  teamError: COMMAND_BLOCK_TEXT.teamError,
  allInTasks: 'Sve u Zadacima',
  allIdeas: 'Sve ideje',
  allActivity: 'Sva aktivnost',
  showAll: 'Prikaži sve',
  retry: 'Pokušaj ponovo',
  voteSaved: 'Glas je sačuvan.',
} as const;

/** „Svi moji zadaci · 12" — N je broj svih koji ispunjavaju uslov „Za tebe". */
export function allMineLabel(total: number): string {
  return `Svi moji zadaci · ${total}`;
}

/** Desna vrednost reda „Sve u Zadacima": koliko ih je ostalo iza prikazanih. */
export function moreValue(more: number): string {
  return `još ${more}`;
}

/** „Zastarelo · 9". */
export function staleLabel(count: number): string {
  return `Zastarelo · ${count}`;
}

/** „Sredi rokove · 7". */
export function rescheduleButtonLabel(count: number): string {
  return `Sredi rokove · ${count}`;
}

/** „1 član" · „3 člana" · „5 članova" · „11 članova" · „21 član". */
export function membersLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    last === 1 && lastTwo !== 11
      ? 'član'
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? 'člana'
        : 'članova';
  return `${count} ${word}`;
}

/** Red Tima: „Tim · 6 članova". */
export function teamRowLabel(memberCount: number): string {
  return `Tim · ${membersLabel(memberCount)}`;
}

/** Prazna Trijaža: ceo tim ili izabrani član. */
export function triageEmptyText(filterName: string | null): string {
  return filterName === null ? BLOCK_TEXT.triageEmpty : `${filterName} nema otvorenih zadataka.`;
}

/** Meta reda u „Sredi rokove": „kasni 4 d", a za zastarele „Zastarelo · kasni 21 d". */
export function candidateMeta(candidate: { daysLate: number; stale: boolean }): string {
  const late = `kasni ${candidate.daysLate} d`;
  return candidate.stale ? `Zastarelo · ${late}` : late;
}

/** Red Pulsa: „Završeno 14 · Novo 9 · Zapelo 3". */
export function pulseLine(facts: ReadonlyArray<WeekPulseFact>): string {
  return facts.map((fact) => `${fact.label} ${fact.value}`).join(' · ');
}

// --- Za tebe --------------------------------------------------------------------

/** Ključ reda u „Za tebe": isti zadatak može biti i u Trijaži, a ključevi moraju biti različiti. */
export function forYouRowKey(key: string): string {
  return `${FOR_YOU_SECTION}:${key}`;
}

export type ForYouSection = StartupTaskSection<typeof FOR_YOU_SECTION>;

/**
 * „Za tebe" iz `tasks.listEverywhere`: prekoračeno → danas → u toku, do
 * `FOR_YOU_LIMIT` redova. Red je zajednički `TaskRowModel` (`rowFromTaskItem` —
 * stavka nema `areaId`, pa `startupRow` ne dolazi u obzir), ali sa prefiksiranim
 * ključem. Zadržavanje posle kvačice (`applyStartupHolds`) ide kroz istu listu
 * (`COMMAND_CENTER_LIST`) kao Trijaža, pod sekcijom `za-tebe`.
 */
export function buildForYouSection<T extends TaskItemLike & { taskSortAt?: number }>(
  items: ReadonlyArray<T>,
  now: number,
  context: { plannedKeys: ReadonlyMap<string, string> } & HoldsContext,
): { section: ForYouSection; total: number } {
  const picked = forYouTasks(items, now, FOR_YOU_LIMIT);
  const rows = picked.items.map((item): TaskRowModel => {
    const row = rowFromTaskItem(item, context.plannedKeys);
    return { ...row, key: forYouRowKey(row.key) };
  });
  const [section] = applyStartupHolds(
    COMMAND_CENTER_LIST,
    [{ id: FOR_YOU_SECTION, rows }],
    context.holds,
    context.pending,
  );
  // Zadržan red se vraća na svoje mesto, pa lista na trenutak može da pređe granicu.
  return { section: { id: FOR_YOU_SECTION, rows: (section?.rows ?? rows).slice(0, FOR_YOU_LIMIT) }, total: picked.total };
}

// --- Trijaža ----------------------------------------------------------------------

export type TriageSectionId = TodaySection | typeof STALE_SECTION;
export type TriageSection = StartupTaskSection<TriageSectionId>;

type AssigneesOf = ReadonlyMap<string, ReadonlyArray<{ profileId: string }>>;

/**
 * Filter člana iz bloka Tim: `null` = svi, `UNASSIGNED_KEY` = bez izvršioca.
 * Zadatak bez unosa u `assigneesByTask` (iznad granice od 300) nije ničiji.
 */
export function filterTasksByMember<T extends { _id: string }>(
  tasks: ReadonlyArray<T>,
  assigneesByTask: AssigneesOf,
  filter: string | null,
): T[] {
  if (filter === null) return [...tasks];
  if (filter === UNASSIGNED_KEY) {
    return tasks.filter((task) => assigneesByTask.get(task._id)?.length === 0);
  }
  return tasks.filter((task) =>
    (assigneesByTask.get(task._id) ?? []).some((assignee) => assignee.profileId === filter),
  );
}

/**
 * Sekcije Trijaže sa redovima: Prekoračeno (bez zastarelih) · Zastarelo · Danas ·
 * Sledeće · Blokirano. `splitStale` izdvaja zastarele (rok stariji od 14 dana)
 * iz Prekoračenog; sve sekcije prolaze kroz `applyStartupHolds`, pa zadržan red
 * ostaje u svojoj sekciji dok se kvačica ne smiri.
 */
export function buildTriageSections<T extends StartupTaskLike & { taskSortAt?: number }>(
  tasks: ReadonlyArray<T>,
  now: number,
  context: StartupRowsContext & HoldsContext,
): TriageSection[] {
  const buckets = bucketTasksForToday(tasks, now);
  const { fresh, stale } = splitStale(buckets.overdue, now);
  const rowsOf = (list: ReadonlyArray<T>) => list.map((task) => startupRow(task, context));
  return applyStartupHolds<TriageSectionId>(
    COMMAND_CENTER_LIST,
    [
      { id: 'overdue', rows: rowsOf(fresh) },
      { id: STALE_SECTION, rows: rowsOf(stale) },
      { id: 'today', rows: rowsOf(buckets.today) },
      { id: 'next', rows: rowsOf(buckets.next) },
      { id: 'blocked', rows: rowsOf(buckets.blocked) },
    ],
    context.holds,
    context.pending,
  );
}

export const TRIAGE_TITLE: Record<TodaySection, string> = {
  overdue: 'Prekoračeno',
  today: 'Danas',
  next: 'Sledeće',
  blocked: 'Blokirano',
};

export type TriageList = {
  /** Ukupno u skupu (ne samo prikazani redovi). */
  count: number;
  /** Prikazani redovi, najviše `limit`. */
  rows: TaskRowModel[];
  /** Koliko ih je iza prikazanih (red „Sve u Zadacima" postoji kad je > 0). */
  more: number;
};

export type TriageGroupView = {
  id: TodaySection;
  title: string;
  /** Svi u grupi; kod Prekoračenog i zastareli (da se poklopi sa „Sredi rokove"). */
  count: number;
  list: TriageList;
  /** Samo Prekoračeno: skupljen red „Zastarelo · N" ispod njega. */
  stale: TriageList | null;
};

function limited(rows: ReadonlyArray<TaskRowModel>, limit: number): TriageList {
  return { count: rows.length, rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit) };
}

/** Grupe za prikaz; prazna grupa se ne crta (a Prekoračeno živi i samo od zastarelih). */
export function triageGroups(
  sections: ReadonlyArray<TriageSection>,
  limit: number = TRIAGE_GROUP_LIMIT,
): TriageGroupView[] {
  const rowsOf = (id: TriageSectionId) => sections.find((section) => section.id === id)?.rows ?? [];
  const groups: TriageGroupView[] = [];
  for (const id of TODAY_SECTION_ORDER) {
    const rows = rowsOf(id);
    const staleRows = id === 'overdue' ? rowsOf(STALE_SECTION) : [];
    const count = rows.length + staleRows.length;
    if (count === 0) continue;
    groups.push({
      id,
      title: TRIAGE_TITLE[id],
      count,
      list: limited(rows, limit),
      stale: staleRows.length > 0 ? limited(staleRows, limit) : null,
    });
  }
  return groups;
}

/** Svi redovi svih sekcija (za proveru granice layout animacija). */
export function visibleTriageRows(groups: ReadonlyArray<TriageGroupView>, staleOpen: boolean): number {
  return groups.reduce(
    (sum, group) => sum + group.list.rows.length + (staleOpen && group.stale ? group.stale.rows.length : 0),
    0,
  );
}

// --- Tim --------------------------------------------------------------------------

export type TeamEntry = {
  key: string;
  name: string;
  /** `null` za „Nedodeljeno" — tada nema avatara. */
  avatar: { displayName: string; avatarUrl: string | null } | null;
  open: number;
  overdue: number;
};

/**
 * Opterećenje tima: računa se iz SVIH otvorenih zadataka (ne iz filtriranih), da
 * brojevi po članu ostanu stabilni dok se filter menja. Svi izvršioci su
 * ravnopravni — zadatak ulazi u opterećenje svakog od njih. Nepoznati izvršioci
 * (nije stigao odgovor ili je iznad granice) se ne broje.
 */
export function teamWorkload(
  members: ReadonlyArray<{ profile: { _id: string; displayName: string; avatarUrl: string | null } }>,
  tasks: ReadonlyArray<{ _id: string; dueDate: number | null; taskStatus: TaskStatus | null }>,
  assigneesByTask: AssigneesOf,
  now: number,
): TeamEntry[] {
  const entries: TeamEntry[] = members.map((member) => ({
    key: member.profile._id,
    name: member.profile.displayName,
    avatar: { displayName: member.profile.displayName, avatarUrl: member.profile.avatarUrl },
    open: 0,
    overdue: 0,
  }));
  const unassigned: TeamEntry = { key: UNASSIGNED_KEY, name: 'Nedodeljeno', avatar: null, open: 0, overdue: 0 };
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));

  for (const task of tasks) {
    const assignees = assigneesByTask.get(task._id);
    if (assignees === undefined) continue;
    const targets =
      assignees.length === 0
        ? [unassigned]
        : assignees.flatMap((assignee) => {
            const entry = byKey.get(assignee.profileId);
            return entry === undefined ? [] : [entry];
          });
    const overdue = classifyDeadline({ dueDate: task.dueDate, taskStatus: task.taskStatus, now }).urgency === 'overdue';
    for (const entry of targets) {
      entry.open += 1;
      if (overdue) entry.overdue += 1;
    }
  }
  return unassigned.open > 0 ? [...entries, unassigned] : entries;
}

/** Red Tima u sheetu: „6 otvoreno · 2 kasni". */
export function teamEntryLabel(entry: Pick<TeamEntry, 'open' | 'overdue'>): string {
  return teamWorkloadLabel(entry);
}

// --- Čeka tebe --------------------------------------------------------------------

export type WaitingIdea = {
  ideaId: string;
  title: string;
  authorName: string | null;
  upvotes: number;
  downvotes: number;
};

/** Ideje koje čekaju moj glas (samo `idea_vote`), do `WAITING_LIMIT`. */
export function waitingIdeas(
  items: ReadonlyArray<PendingItemLike>,
  truncated = false,
): { items: WaitingIdea[]; hasMore: boolean } {
  const votes = pendingIdeaVotes(items);
  return {
    items: votes.slice(0, WAITING_LIMIT).map((vote) => ({
      ideaId: vote.ideaId,
      title: vote.title,
      authorName: vote.authorName,
      upvotes: vote.upvotes,
      downvotes: vote.downvotes,
    })),
    hasMore: votes.length > WAITING_LIMIT || truncated,
  };
}

// --- Nedavne izmene ------------------------------------------------------------------

export type ActivityRowModel = {
  id: string;
  sentence: string;
  icon: ActivityIcon;
  /** „pre 5 min", „danas u 14:05", „juče u 09:10", „12. okt". */
  time: string;
  target: ActivityTarget;
};

/** Red aktivnosti: rečenica i vreme iz shared-a, cilj klika iz `activityTarget`. */
export function activityRowModel(
  item: {
    _id: string;
    action: string;
    title: string;
    detail?: string;
    targetType: string;
    targetId: string;
    createdAt: number;
    actor: { displayName: string } | null;
  },
  now: number,
): ActivityRowModel {
  const format = formatActivity(item, item.actor?.displayName ?? null);
  return {
    id: item._id,
    sentence: format.sentence,
    icon: format.icon,
    time: formatEditTime(item.createdAt, now),
    target: activityTarget(item),
  };
}
