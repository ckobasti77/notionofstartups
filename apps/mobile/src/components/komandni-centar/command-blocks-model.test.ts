import {
  findStartupRow,
  locateStartupRow,
  type PendingItemLike,
  type StartupTaskHold,
  type StartupTaskLike,
  type TaskItemLike,
} from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import {
  activityRowModel,
  allMineLabel,
  BLOCK_TEXT,
  buildForYouSection,
  candidateMeta,
  buildTriageSections,
  filterTasksByMember,
  FOR_YOU_LIMIT,
  forYouRowKey,
  membersLabel,
  moreValue,
  pulseLine,
  rescheduleButtonLabel,
  staleLabel,
  teamEntryLabel,
  teamRowLabel,
  teamWorkload,
  triageEmptyText,
  triageGroups,
  TRIAGE_GROUP_LIMIT,
  UNASSIGNED_KEY,
  visibleTriageRows,
  waitingIdeas,
  WAITING_LIMIT,
} from './command-blocks-model';
import { COMMAND_CENTER_LIST, type HoldsContext, type StartupRowsContext } from './startup-task-model';

// subota 24.10.2026. 09:30 u Beogradu
const NOW = Date.UTC(2026, 9, 24, 7, 30);
const noon = (day: number) => Date.UTC(2026, 9, day, 10, 0);
const STARTUP = { _id: 's1', name: 'Cluck Rush', logoUrl: null };

function task(id: string, partial: Partial<StartupTaskLike & { taskSortAt: number }> = {}) {
  return {
    _id: id,
    areaId: 'a1',
    title: `Zadatak ${id}`,
    taskStatus: 'next' as const,
    taskPriority: 'medium' as const,
    dueDate: null,
    createdByProfileId: 'ana',
    taskSortAt: 0,
    ...partial,
  };
}

function item(id: string, partial: Partial<TaskItemLike & { taskSortAt: number }> = {}) {
  return {
    _id: id,
    title: `Moj ${id}`,
    taskStatus: 'next' as const,
    taskPriority: 'medium' as const,
    dueDate: null,
    taskSortAt: 0,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    isCreator: false,
    isAssignee: true,
    startup: STARTUP,
    area: { label: 'Marketing' },
    ...partial,
  };
}

const context = (partial: Partial<StartupRowsContext & HoldsContext> = {}): StartupRowsContext & HoldsContext => ({
  profileId: 'me',
  startup: STARTUP,
  areaLabels: new Map([['a1', 'Marketing']]),
  assigneeIdsByTask: new Map<string, string[]>(),
  plannedKeys: new Map<string, string>(),
  holds: new Map<string, StartupTaskHold>(),
  pending: new Map<string, boolean>(),
  ...partial,
});

const holdsContext = (holds = new Map<string, StartupTaskHold>()): { plannedKeys: Map<string, string> } & HoldsContext => ({
  plannedKeys: new Map<string, string>(),
  holds,
  pending: new Map<string, boolean>(),
});

const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((row) => row.id);

describe('Za tebe — izbor, ključevi i zadržavanje', () => {
  test('prekoračeno → danas → u toku; budući rok i otvoreno bez „u toku" ne ulaze; total broji sve', () => {
    const { section, total } = buildForYouSection(
      [
        item('toku', { taskStatus: 'in_progress' }),
        item('danas', { dueDate: noon(24) }),
        item('kasni', { dueDate: noon(20) }),
        item('kasnije', { dueDate: noon(30) }),
        item('bezroka'),
        item('gotov', { taskStatus: 'done', dueDate: noon(20) }),
      ],
      NOW,
      holdsContext(),
    );
    expect(ids(section.rows)).toEqual(['kasni', 'danas', 'toku']);
    expect(total).toBe(3);
  });

  test('najviše 5 redova, a total kaže koliko ih je iza (red „Svi moji zadaci · N")', () => {
    const many = Array.from({ length: 8 }, (_, index) => item(`k${index}`, { dueDate: noon(10 + index) }));
    const { section, total } = buildForYouSection(many, NOW, holdsContext());
    expect(section.rows).toHaveLength(FOR_YOU_LIMIT);
    expect(total).toBe(8);
    expect(allMineLabel(total)).toBe('Svi moji zadaci · 8');
  });

  test('ključ reda je prefiksiran sekcijom, id i ostalo ostaju', () => {
    const { section } = buildForYouSection([item('a', { dueDate: noon(20) })], NOW, holdsContext());
    expect(section.id).toBe('za-tebe');
    expect(section.rows[0]).toMatchObject({ key: 'za-tebe:task:a', id: 'a', kind: 'task', done: false });
    expect(forYouRowKey('task:a')).toBe('za-tebe:task:a');
  });

  test('isti zadatak u „Za tebe" i u Trijaži ima dva različita ključa i obe liste ga nalaze', () => {
    const forYou = buildForYouSection([item('a', { dueDate: noon(20) })], NOW, holdsContext()).section;
    const triage = buildTriageSections([task('a', { dueDate: noon(20) })], NOW, context());
    const all = [forYou, ...triage];
    expect(locateStartupRow(COMMAND_CENTER_LIST, all, 'za-tebe:task:a')).toEqual({
      section: `${COMMAND_CENTER_LIST}:za-tebe`,
      index: 0,
    });
    expect(locateStartupRow(COMMAND_CENTER_LIST, all, 'task:a')).toEqual({
      section: `${COMMAND_CENTER_LIST}:overdue`,
      index: 0,
    });
    expect(findStartupRow(all, 'za-tebe:task:a')?.id).toBe('a');
    expect(findStartupRow(all, 'task:a')?.id).toBe('a');
  });

  test('zadržan red (kvačica) ostaje u „Za tebe" i kad ga server više ne šalje; Trijaža ga ne dira', () => {
    const served = [item('danas', { dueDate: noon(24) }), item('drugi', { dueDate: noon(24) })];
    const first = buildForYouSection(served, NOW, holdsContext()).section.rows[0];
    const holds = new Map<string, StartupTaskHold>([
      [first.key, { section: `${COMMAND_CENTER_LIST}:za-tebe`, index: 0, row: first, done: true }],
    ]);
    // Server je već sklonio završen zadatak.
    const { section } = buildForYouSection(served.slice(1), NOW, holdsContext(holds));
    expect(ids(section.rows)).toEqual(['danas', 'drugi']);
    expect(section.rows[0].done).toBe(true);

    // Isti zadatak u Trijaži (bez prefiksa) nije zadržan: kvačica u „Za tebe" ne pomera ni red u Trijaži.
    const triage = buildTriageSections([task('danas', { dueDate: noon(24) })], NOW, context({ holds }));
    expect(ids(triage.find((entry) => entry.id === 'today')?.rows ?? [])).toEqual(['danas']);
    expect(triage.find((entry) => entry.id === 'today')?.rows[0].done).toBe(false);
  });

  test('zadržavanje u Trijaži ostaje u svojoj sekciji, a „Za tebe" ga ne vidi', () => {
    const served = [task('kasni', { dueDate: noon(20) })];
    const row = buildTriageSections(served, NOW, context()).find((entry) => entry.id === 'overdue')!.rows[0];
    const holds = new Map<string, StartupTaskHold>([
      [row.key, { section: `${COMMAND_CENTER_LIST}:overdue`, index: 0, row, done: true }],
    ]);
    const triage = buildTriageSections([], NOW, context({ holds }));
    expect(ids(triage.find((entry) => entry.id === 'overdue')?.rows ?? [])).toEqual(['kasni']);
    const forYou = buildForYouSection([item('kasni', { dueDate: noon(20) })], NOW, holdsContext(holds)).section;
    expect(forYou.rows[0].done).toBe(false);
  });

  test('„čeka potvrdu" važi po prefiksiranom ključu', () => {
    const { section } = buildForYouSection(
      [item('a', { dueDate: noon(20) })],
      NOW,
      { ...holdsContext(), pending: new Map([['za-tebe:task:a', true]]) },
    );
    expect(section.rows[0].done).toBe(true);
  });
});

describe('Trijaža — grupe, ograničenje 5 i Zastarelo', () => {
  const sectionsOf = (tasks: ReadonlyArray<ReturnType<typeof task>>) => buildTriageSections(tasks, NOW, context());

  test('četiri mobilne grupe redom; prazna grupa se ne crta', () => {
    const groups = triageGroups(
      sectionsOf([
        task('blok', { taskStatus: 'blocked' }),
        task('danas', { dueDate: noon(24) }),
        task('kasni', { dueDate: noon(20) }),
        task('kasnije', { dueDate: noon(30) }),
      ]),
    );
    expect(groups.map((group) => group.id)).toEqual(['overdue', 'today', 'next', 'blocked']);
    expect(groups.map((group) => group.title)).toEqual(['Prekoračeno', 'Danas', 'Sledeće', 'Blokirano']);

    const onlyToday = triageGroups(sectionsOf([task('danas', { dueDate: noon(24) })]));
    expect(onlyToday.map((group) => group.id)).toEqual(['today']);
    expect(triageGroups(sectionsOf([]))).toEqual([]);
  });

  test('po grupi najviše 5 redova, `more` kaže koliko ih je iza (red „Sve u Zadacima")', () => {
    const many = Array.from({ length: 8 }, (_, index) => task(`s${index}`, { dueDate: noon(26 + (index % 4)) }));
    const [group] = triageGroups(sectionsOf(many));
    expect(group.id).toBe('next');
    expect(group.count).toBe(8);
    expect(group.list.rows).toHaveLength(TRIAGE_GROUP_LIMIT);
    expect(group.list.more).toBe(3);
    expect(moreValue(group.list.more)).toBe('još 3');
    expect(BLOCK_TEXT.allInTasks).toBe('Sve u Zadacima');

    const [exactly] = triageGroups(sectionsOf(many.slice(0, 5)));
    expect(exactly.list.more).toBe(0);
  });

  test('Zastarelo (rok stariji od 14 dana) se izdvaja iz Prekoračenog u skupljen skup', () => {
    const [group] = triageGroups(
      sectionsOf([
        task('svez', { dueDate: noon(20) }), // 4 dana
        task('granica', { dueDate: noon(10) }), // tačno 14 dana — još nije zastarelo
        task('star1', { dueDate: noon(9) }), // 15 dana
        task('star2', { dueDate: noon(2) }), // 22 dana
      ]),
    );
    expect(group.id).toBe('overdue');
    // Najdublje prekoračen prvi, kao do sada.
    expect(ids(group.list.rows)).toEqual(['granica', 'svez']);
    expect(group.stale).not.toBeNull();
    expect(ids(group.stale!.rows)).toEqual(['star2', 'star1']);
    // Broj u zaglavlju pokriva i zastarele (poklapa se sa „Sredi rokove · N").
    expect(group.count).toBe(4);
    expect(staleLabel(group.stale!.count)).toBe('Zastarelo · 2');
  });

  test('Zastarelo ima isto ograničenje 5 i svoj `more`', () => {
    const old = Array.from({ length: 7 }, (_, index) => task(`o${index}`, { dueDate: noon(1 + (index % 5)) }));
    const [group] = triageGroups(sectionsOf(old));
    expect(group.list.rows).toHaveLength(0);
    expect(group.stale!.rows).toHaveLength(TRIAGE_GROUP_LIMIT);
    expect(group.stale!.more).toBe(2);
    expect(group.count).toBe(7);
  });

  test('Prekoračeno se crta i kad su svi zastareli; zastareli blokirani ostaju u Prekoračenom', () => {
    const [group] = triageGroups(sectionsOf([task('star', { dueDate: noon(1), taskStatus: 'blocked' })]));
    expect(group.id).toBe('overdue');
    expect(group.list.rows).toHaveLength(0);
    expect(group.stale?.rows).toHaveLength(1);
  });

  test('zadržan red u skupu Zastarelo ostaje u njemu (sekcija `stale`)', () => {
    const served = [task('star', { dueDate: noon(2) })];
    const row = buildTriageSections(served, NOW, context()).find((entry) => entry.id === 'stale')!.rows[0];
    const holds = new Map<string, StartupTaskHold>([
      [row.key, { section: `${COMMAND_CENTER_LIST}:stale`, index: 0, row, done: true }],
    ]);
    const sections = buildTriageSections([], NOW, context({ holds }));
    expect(ids(sections.find((entry) => entry.id === 'stale')?.rows ?? [])).toEqual(['star']);
    expect(locateStartupRow(COMMAND_CENTER_LIST, sections, row.key)).toEqual({
      section: `${COMMAND_CENTER_LIST}:stale`,
      index: 0,
    });
  });

  test('završeni zadaci se ne prikazuju', () => {
    expect(triageGroups(sectionsOf([task('gotov', { taskStatus: 'done', dueDate: noon(20) })]))).toEqual([]);
  });

  test('granica layout animacija broji samo prikazane redove (skupljeno Zastarelo se ne računa)', () => {
    const groups = triageGroups(
      sectionsOf([task('svez', { dueDate: noon(20) }), task('star', { dueDate: noon(2) }), task('danas', { dueDate: noon(24) })]),
    );
    expect(visibleTriageRows(groups, false)).toBe(2);
    expect(visibleTriageRows(groups, true)).toBe(3);
  });
});

describe('Filter člana iz bloka Tim', () => {
  const tasks = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }];
  const assignees = new Map<string, Array<{ profileId: string }>>([
    ['a', [{ profileId: 'ana' }]],
    ['b', [{ profileId: 'ana' }, { profileId: 'marko' }]],
    ['c', []],
    // `d` nema unos (iznad granice od 300): nije ničiji.
  ]);

  test('bez filtera su svi; član dobija svoje (i zajedničke); „Nedodeljeno" samo prazne', () => {
    expect(filterTasksByMember(tasks, assignees, null).map((t) => t._id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterTasksByMember(tasks, assignees, 'ana').map((t) => t._id)).toEqual(['a', 'b']);
    expect(filterTasksByMember(tasks, assignees, 'marko').map((t) => t._id)).toEqual(['b']);
    expect(filterTasksByMember(tasks, assignees, UNASSIGNED_KEY).map((t) => t._id)).toEqual(['c']);
  });

  test('prazna Trijaža: tim ili izabrani član', () => {
    expect(triageEmptyText(null)).toBe('Tim nema otvorenih zadataka.');
    expect(triageEmptyText('Ana')).toBe('Ana nema otvorenih zadataka.');
  });
});

describe('Tim — opterećenje i oznake', () => {
  const members = [
    { profile: { _id: 'ana', displayName: 'Ana Ilić', avatarUrl: null } },
    { profile: { _id: 'marko', displayName: 'Marko Jović', avatarUrl: null } },
    { profile: { _id: 'mina', displayName: 'Mina', avatarUrl: null } },
  ];
  const tasks = [
    { _id: 'a', dueDate: noon(20), taskStatus: 'next' as const },
    { _id: 'b', dueDate: noon(30), taskStatus: 'next' as const },
    { _id: 'c', dueDate: null, taskStatus: 'backlog' as const },
    { _id: 'd', dueDate: noon(20), taskStatus: 'next' as const },
  ];
  const assignees = new Map<string, Array<{ profileId: string }>>([
    ['a', [{ profileId: 'ana' }]],
    ['b', [{ profileId: 'ana' }, { profileId: 'marko' }]],
    ['c', []],
  ]);

  test('zadatak ulazi svima koji su na njemu; nepoznati izvršioci se ne broje; Nedodeljeno samo kad ga ima', () => {
    const entries = teamWorkload(members, tasks, assignees, NOW);
    expect(entries.map((entry) => [entry.key, entry.open, entry.overdue])).toEqual([
      ['ana', 2, 1],
      ['marko', 1, 0],
      ['mina', 0, 0],
      [UNASSIGNED_KEY, 1, 0],
    ]);
    expect(teamWorkload(members, tasks.slice(0, 2), assignees, NOW).some((entry) => entry.key === UNASSIGNED_KEY)).toBe(
      false,
    );
  });

  test('oznake: red Tima, srpska množina i opterećenje', () => {
    expect(membersLabel(1)).toBe('1 član');
    expect(membersLabel(3)).toBe('3 člana');
    expect(membersLabel(5)).toBe('5 članova');
    expect(membersLabel(11)).toBe('11 članova');
    expect(membersLabel(21)).toBe('21 član');
    expect(teamRowLabel(6)).toBe('Tim · 6 članova');
    expect(teamEntryLabel({ open: 6, overdue: 2 })).toBe('6 otvoreno · 2 kasni');
    expect(teamEntryLabel({ open: 0, overdue: 0 })).toBe('Nema otvorenih');
    expect(rescheduleButtonLabel(7)).toBe('Sredi rokove · 7');
  });
});

describe('Čeka tebe, Nedavne izmene i Puls', () => {
  const vote = (ideaId: string): PendingItemLike => ({
    kind: 'idea_vote',
    ideaId,
    title: `Ideja ${ideaId}`,
    authorName: ideaId === 'i2' ? null : 'Ana',
    upvotes: 0,
    downvotes: 0,
    startup: { _id: 's1' },
  });

  test('samo glasanje o ideji, do 3, a više od 3 otvara „Sve ideje"', () => {
    const old: PendingItemLike = { kind: 'deletion_vote', ballotId: 'b1', title: 'Staro', startup: { _id: 's1' } };
    const few = waitingIdeas([old, vote('i1'), vote('i2')]);
    expect(few.items).toEqual([
      { ideaId: 'i1', title: 'Ideja i1', authorName: 'Ana', upvotes: 0, downvotes: 0 },
      { ideaId: 'i2', title: 'Ideja i2', authorName: null, upvotes: 0, downvotes: 0 },
    ]);
    expect(few.hasMore).toBe(false);

    const many = waitingIdeas(['i1', 'i2', 'i3', 'i4'].map(vote));
    expect(many.items).toHaveLength(WAITING_LIMIT);
    expect(many.hasMore).toBe(true);
    expect(waitingIdeas([]).items).toEqual([]);
  });

  test('red aktivnosti: rečenica, vreme i cilj klika iz shared-a', () => {
    const base = { _id: 'x1', createdAt: NOW - 5 * 60_000, actor: { displayName: 'Ana' } };
    const page = activityRowModel(
      { ...base, action: 'page_locked', title: 'Specifikacija API', targetType: 'page', targetId: 'p1' },
      NOW,
    );
    expect(page.sentence).toBe('Ana je zaključao/la „Specifikacija API”');
    expect(page.time).toBe('pre 5 min');
    expect(page.target).toEqual({ kind: 'page', pageId: 'p1' });
    expect(page.icon).toBe('lock');

    const idea = activityRowModel(
      { ...base, action: 'idea_restored', title: 'Referral', targetType: 'idea', targetId: 'i1' },
      NOW,
    );
    expect(idea.target).toEqual({ kind: 'idea', ideaId: 'i1' });

    const startup = activityRowModel(
      { ...base, actor: null, action: 'startup_updated', title: 'Ažuriran startup', targetType: 'startup', targetId: 's1' },
      NOW,
    );
    expect(startup.target).toEqual({ kind: 'none' });
    expect(startup.sentence.startsWith('Član tima')).toBe(true);
  });

  test('meta reda u „Sredi rokove": zastareli nose reč „Zastarelo"', () => {
    expect(candidateMeta({ daysLate: 4, stale: false })).toBe('kasni 4 d');
    expect(candidateMeta({ daysLate: 21, stale: true })).toBe('Zastarelo · kasni 21 d');
  });

  test('red Pulsa: Završeno · Novo · Zapelo', () => {
    expect(
      pulseLine([
        { key: 'completed', label: 'Završeno', value: 14 },
        { key: 'created', label: 'Novo', value: 9 },
        { key: 'stuck', label: 'Zapelo', value: 3 },
      ]),
    ).toBe('Završeno 14 · Novo 9 · Zapelo 3');
  });
});
