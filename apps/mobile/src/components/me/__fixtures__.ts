/**
 * Fixture podaci za dizajn-katalog (plan K07 §7) — Jovanovih 6 startupa, rokovi
 * za svaki ton, redovi zadatka i odgovor `myDay.overview` za Moj dan, brzi unos
 * i „Isplaniraj dan". Samo za `dizajn-katalog.tsx` (dev).
 */
import {
  addDaysToKey,
  dayKeyOf,
  noonOfDayKey,
  taskPermissions,
  type TaskPriorityKey,
  type TaskRowModel,
  type TaskStatusKey,
} from '@devotion/shared';

import type { MyDayOverviewData, OverviewStartup } from './my-day/my-day-model';
import type { QuickAddStartupOption } from './quick-add-sheet';

export const KATALOG_STARTUPS: readonly OverviewStartup[] = [
  { _id: 'katalog-cr', name: 'Cluck Rush', logoUrl: null },
  { _id: 'katalog-sh', name: 'Silly Handyman', logoUrl: null },
  { _id: 'katalog-bm', name: 'Beauty Masterclass', logoUrl: null },
  { _id: 'katalog-ei', name: 'Enigma IT', logoUrl: null },
  { _id: 'katalog-sm', name: 'Scan Me', logoUrl: null },
  { _id: 'katalog-na', name: 'Nauči AI', logoUrl: null },
];

/** Startupi sa oblastima za brzi unos (Nauči AI namerno bez oblasti). */
export const KATALOG_QUICK_ADD_STARTUPS: readonly QuickAddStartupOption[] = KATALOG_STARTUPS.map(
  (startup) => ({
    ...startup,
    areas:
      startup._id === 'katalog-na'
        ? []
        : [
            { _id: `${startup._id}-marketing`, label: 'Marketing' },
            { _id: `${startup._id}-sales`, label: 'Prodaja' },
            { _id: `${startup._id}-ops`, label: 'Operativa' },
          ],
  }),
);

function noonIn(now: number, days: number): number {
  return noonOfDayKey(addDaysToKey(dayKeyOf(now), days));
}

/** Po jedan rok za svaki ton `describeDue`: prekoračeno, danas, uskoro, kasnije, bez roka. */
export function katalogDueDates(now: number): { label: string; dueDate: number | null }[] {
  return [
    { label: 'Prekoračeno', dueDate: noonIn(now, -2) },
    { label: 'Danas', dueDate: noonIn(now, 0) },
    { label: 'Uskoro', dueDate: noonIn(now, 3) },
    { label: 'Kasnije', dueDate: noonIn(now, 12) },
    { label: 'Bez roka', dueDate: null },
  ];
}

function row(input: {
  id: string;
  kind?: 'task' | 'personal';
  title: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey | null;
  dueDate: number | null;
  startup: OverviewStartup | null;
  areaLabel: string | null;
  planned?: boolean;
  isCreator?: boolean;
  isAssignee?: boolean;
}): TaskRowModel {
  const kind = input.kind ?? 'task';
  return {
    key: `${kind}:${input.id}`,
    kind,
    id: input.id,
    title: input.title,
    status: input.status,
    priority: input.priority,
    dueDate: input.dueDate,
    startup: input.startup,
    areaLabel: input.areaLabel,
    planned: input.planned ?? false,
    planEntryId: input.planned ? `plan-${input.id}` : null,
    done: input.status === 'done',
    checkpoints: null,
    permissions: taskPermissions({
      kind,
      isCreator: input.isCreator ?? true,
      isAssignee: input.isAssignee ?? true,
    }),
  };
}

/**
 * Redovi zadatka: startup sa oblašću, lično u planu, dug naslov, tuđ zadatak u
 * planu (nema dozvolu za status ni rok), izvršilac bez prava na rok, završen.
 */
export function katalogRows(now: number): TaskRowModel[] {
  const [cr, , bm, , sm] = KATALOG_STARTUPS;
  return [
    row({ id: 'katalog-1', title: 'Ugovor sa dobavljačem', status: 'next', priority: 'urgent', dueDate: noonIn(now, -2), startup: cr, areaLabel: 'Prodaja' }),
    row({ id: 'katalog-2', kind: 'personal', title: 'Faktura za oktobar', status: 'open', priority: null, dueDate: noonIn(now, 0), startup: null, areaLabel: null, planned: true }),
    row({
      id: 'katalog-3',
      title: 'Snimiti promo video za jesenju kampanju i poslati montažeru do petka',
      status: 'in_progress',
      priority: 'high',
      dueDate: noonIn(now, 3),
      startup: bm,
      areaLabel: 'Marketing',
      isCreator: false,
    }),
    row({
      id: 'katalog-4',
      title: 'Pregled ponude (tuđ zadatak u planu)',
      status: 'next',
      priority: 'medium',
      dueDate: null,
      startup: sm,
      areaLabel: 'Prodaja',
      planned: true,
      isCreator: false,
      isAssignee: false,
    }),
    row({ id: 'katalog-5', title: 'Poslati izveštaj timu', status: 'done', priority: null, dueDate: noonIn(now, 0), startup: cr, areaLabel: 'Operativa' }),
  ];
}

type OverviewTask = MyDayOverviewData['tasks'][number];

/**
 * Odgovor `myDay.overview` za katalog: 2 prekoračeno, 2 danas, 2 planirano, 1 u
 * toku, 2 uskoro, 1 blokirano, 2 završeno danas; jedno „Preneto od ranije" i
 * nekoliko predloga za „Isplaniraj dan".
 */
export function katalogOverview(now: number): MyDayOverviewData {
  const todayKey = dayKeyOf(now);
  const [cr, sh, bm, ei, sm] = KATALOG_STARTUPS;
  const created = noonIn(now, -10);
  const task = (id: string, partial: Partial<OverviewTask>): OverviewTask => ({
    _id: id,
    title: id,
    taskStatus: 'next',
    taskPriority: 'medium',
    dueDate: null,
    completedAt: null,
    createdAt: created,
    isCreator: true,
    isAssignee: true,
    startup: { _id: cr._id, name: cr.name },
    area: { label: 'Marketing' },
    ...partial,
  });
  return {
    tasks: [
      task('k-ugovor', { title: 'Ugovor sa dobavljačem', dueDate: noonIn(now, -2), taskPriority: 'urgent', area: { label: 'Prodaja' } }),
      task('k-promo', { title: 'Snimiti promo video', dueDate: noonIn(now, 0), taskPriority: 'high', startup: { _id: bm._id, name: bm.name } }),
      task('k-ponuda', { title: 'Ponuda za novi lokal', taskStatus: 'backlog', startup: { _id: sh._id, name: sh.name }, area: { label: 'Prodaja' } }),
      task('k-server', { title: 'Migracija servera', taskStatus: 'in_progress', startup: { _id: ei._id, name: ei.name }, area: { label: 'Operativa' } }),
      task('k-kampanja', { title: 'Plan kampanje za novembar', dueDate: noonIn(now, 3), startup: { _id: sm._id, name: sm.name } }),
      task('k-landing', { title: 'Landing stranica za webinar', dueDate: noonIn(now, 5), taskPriority: 'low' }),
      task('k-faktura-dob', { title: 'Čeka fakturu dobavljača', taskStatus: 'blocked', startup: { _id: sh._id, name: sh.name } }),
      task('k-izvestaj', { title: 'Poslati izveštaj timu', taskStatus: 'done', completedAt: now - 3_600_000, dueDate: noonIn(now, 0) }),
      task('k-hitno', { title: 'Odgovoriti investitoru', taskStatus: 'backlog', taskPriority: 'urgent', startup: { _id: ei._id, name: ei.name } }),
      task('k-preneto', { title: 'Pregled ugovora sa agencijom', taskStatus: 'backlog', startup: { _id: bm._id, name: bm.name } }),
      task('k-tudj', {
        title: 'Snimak za društvene mreže (tuđ)',
        isCreator: false,
        isAssignee: false,
        taskStatus: 'backlog',
        startup: { _id: bm._id, name: bm.name },
      }),
    ],
    personal: [
      { _id: 'k-racun', title: 'Platiti račun za struju', status: 'open', priority: null, dueDate: noonIn(now, -1), completedAt: null, createdAt: created },
      { _id: 'k-teretana', title: 'Teretana', status: 'open', priority: null, dueDate: noonIn(now, 0), completedAt: null, createdAt: created },
      { _id: 'k-knjiga', title: 'Pročitati poglavlje knjige', status: 'open', priority: null, dueDate: null, completedAt: null, createdAt: created },
      { _id: 'k-poziv', title: 'Pozvati mamu', status: 'done', priority: null, dueDate: null, completedAt: now - 7_200_000, createdAt: created },
    ],
    entries: [
      { _id: 'e-ponuda', dayKey: todayKey, refKey: 'task:k-ponuda', position: 1024 },
      { _id: 'e-tudj', dayKey: todayKey, refKey: 'task:k-tudj', position: 2048 },
      { _id: 'e-poziv', dayKey: todayKey, refKey: 'personal:k-poziv', position: 3072 },
    ],
    history: [{ _id: 'h-preneto', dayKey: addDaysToKey(todayKey, -2), refKey: 'task:k-preneto', position: 1024 }],
    startups: KATALOG_STARTUPS,
    capped: { tasks: false, personal: false, history: false },
  };
}
