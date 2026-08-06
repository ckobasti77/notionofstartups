/**
 * Klasifikacija rokova i grupisanje zadataka za tab „Danas" — mobilni port
 * `apps/web/lib/deadline.ts`. Primitivi (`classifyDeadline`, `dueDayDiff`,
 * `deadlineLabel`…) su 1:1 sa webom; razlika je `bucketTasksForToday`, koji pravi
 * ČETIRI mobilne sekcije (prekoračeno / danas / sledeće / blokirano) umesto web
 * triage zona (koje spajaju overdue+urgent+blocked u „gori").
 *
 * Čisto — bez UI zavisnosti. Ogledalo: `apps/web/lib/deadline.ts`.
 */
import { formatShortDate, type TaskPriority, type TaskStatus } from '@/lib/task-meta';

export const DAY_MS = 86_400_000;

/** Poslednji dan koji još pripada „sledeće" (rok u narednih 7 dana). */
export const WEEK_ZONE_DAYS = 7;

export type DeadlineUrgency =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'week'
  | 'later'
  | 'none'
  | 'done';

export type DeadlineClassification = {
  urgency: DeadlineUrgency;
  /** Razlika u kalendarskim danima: negativno = rok je prošao. `null` bez roka. */
  dayDiff: number | null;
};

export type DeadlineInput = {
  dueDate: number | null;
  taskStatus: TaskStatus | null;
  now: number;
};

/** Ponoć po lokalnoj zoni — poređenje po danu, ne po trenutku. */
export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Razlika u kalendarskim danima; zaokruživanje čuva tačnost i u DST nedeljama. */
export function dueDayDiff(dueDate: number, now: number): number {
  return Math.round((startOfLocalDay(dueDate) - startOfLocalDay(now)) / DAY_MS);
}

/** „1 dan", „2 dana", „21 dan" — srpska pluralizacija za čitače ekrana. */
export function daysWord(count: number): string {
  const absolute = Math.abs(count);
  return absolute % 10 === 1 && absolute % 100 !== 11 ? 'dan' : 'dana';
}

export function classifyDeadline({
  dueDate,
  taskStatus,
  now,
}: DeadlineInput): DeadlineClassification {
  if (taskStatus === 'done') {
    return {
      urgency: 'done',
      dayDiff: dueDate === null ? null : dueDayDiff(dueDate, now),
    };
  }
  if (dueDate === null) return { urgency: 'none', dayDiff: null };

  const dayDiff = dueDayDiff(dueDate, now);
  if (dayDiff < 0) return { urgency: 'overdue', dayDiff };
  if (dayDiff === 0) return { urgency: 'today', dayDiff };
  if (dayDiff === 1) return { urgency: 'tomorrow', dayDiff };
  if (dayDiff <= WEEK_ZONE_DAYS) return { urgency: 'week', dayDiff };
  return { urgency: 'later', dayDiff };
}

/** Kratka oznaka za skeniranje („kasni 3 d", „danas", „sutra", „D-3"). */
export function deadlineLabel(
  classification: DeadlineClassification,
  dueDate: number | null,
): string {
  switch (classification.urgency) {
    case 'overdue':
      return `kasni ${Math.abs(classification.dayDiff ?? 0)} d`;
    case 'today':
      return 'danas';
    case 'tomorrow':
      return 'sutra';
    case 'week':
      return `D-${classification.dayDiff}`;
    case 'none':
      return 'Bez roka';
    default:
      return formatShortDate(dueDate);
  }
}

/** Puna rečenica za čitače ekrana — nikad skraćenice. */
export function deadlineAriaLabel(
  classification: DeadlineClassification,
  dueDate: number | null,
): string {
  const dayDiff = classification.dayDiff ?? 0;
  switch (classification.urgency) {
    case 'overdue': {
      const late = Math.abs(dayDiff);
      return `Rok je prošao: kasni ${late} ${daysWord(late)}`;
    }
    case 'today':
      return 'Rok je danas';
    case 'tomorrow':
      return 'Rok je sutra';
    case 'week':
      return `Rok je za ${dayDiff} ${daysWord(dayDiff)}`;
    case 'later':
      return `Rok: ${formatShortDate(dueDate)}`;
    case 'none':
      return 'Bez roka';
    default:
      return dueDate === null
        ? 'Završeno'
        : `Završeno, rok je bio ${formatShortDate(dueDate)}`;
  }
}

/** Trenutak sledeće lokalne ponoći — za preklasifikaciju bez osvežavanja. */
export function nextLocalMidnight(now: number): number {
  const date = new Date(startOfLocalDay(now));
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

/** Broj zadataka kojima je rok prošao (bez završenih). */
export function countOverdue(tasks: readonly SortableTask[], now: number): number {
  return tasks.filter(
    (task) =>
      classifyDeadline({
        dueDate: task.dueDate,
        taskStatus: task.taskStatus,
        now,
      }).urgency === 'overdue',
  ).length;
}

// --- Grupisanje u četiri mobilne sekcije --------------------------------------

export type TodaySection = 'overdue' | 'today' | 'next' | 'blocked';

export const TODAY_SECTION_ORDER: readonly TodaySection[] = [
  'overdue',
  'today',
  'next',
  'blocked',
];

export type SortableTask = {
  dueDate: number | null;
  taskStatus: TaskStatus | null;
  taskPriority: TaskPriority | null;
  taskSortAt?: number;
};

export type TodayBuckets<T> = Record<TodaySection, T[]>;

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 3,
  high: 2,
  medium: 1,
  low: 0,
};

function priorityWeight(priority: TaskPriority | null): number {
  return priority === null ? PRIORITY_WEIGHT.medium : PRIORITY_WEIGHT[priority];
}

function compareDueDate(a: SortableTask, b: SortableTask): number {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate - b.dueDate;
}

/** Standardni redosled u sekciji: po roku → prioritetu → `taskSortAt`. */
function compareFallback(a: SortableTask, b: SortableTask): number {
  const byDueDate = compareDueDate(a, b);
  if (byDueDate !== 0) return byDueDate;

  const byPriority = priorityWeight(b.taskPriority) - priorityWeight(a.taskPriority);
  if (byPriority !== 0) return byPriority;

  return (a.taskSortAt ?? 0) - (b.taskSortAt ?? 0);
}

/**
 * Razvrstava zadatke u četiri sekcije taba „Danas". Precedenca (namerna):
 * prekoračeno > blokirano > danas > sledeće. Prekoračen rok je najhitniji i uvek
 * ide u „prekoračeno" čak i kad je zadatak blokiran; blokirani se izdvajaju da ne
 * zatrpavaju listu izvodljivog posla. Završeni (`done`) se izostavljaju.
 */
export function bucketTasksForToday<T extends SortableTask>(
  tasks: readonly T[],
  now: number,
): TodayBuckets<T> {
  const buckets: TodayBuckets<T> = {
    overdue: [],
    today: [],
    next: [],
    blocked: [],
  };

  for (const task of tasks) {
    if (task.taskStatus === 'done') continue;
    const { urgency } = classifyDeadline({
      dueDate: task.dueDate,
      taskStatus: task.taskStatus,
      now,
    });
    if (urgency === 'overdue') buckets.overdue.push(task);
    else if (task.taskStatus === 'blocked') buckets.blocked.push(task);
    else if (urgency === 'today') buckets.today.push(task);
    else buckets.next.push(task);
  }

  // Prekoračeno: najdublje prekoračen rok prvi, pa standardni redosled.
  buckets.overdue.sort((a, b) => {
    const aDiff = a.dueDate === null ? 0 : dueDayDiff(a.dueDate, now);
    const bDiff = b.dueDate === null ? 0 : dueDayDiff(b.dueDate, now);
    if (aDiff !== bDiff) return aDiff - bDiff;
    return compareFallback(a, b);
  });
  buckets.today.sort(compareFallback);
  buckets.next.sort(compareFallback);
  buckets.blocked.sort(compareFallback);

  return buckets;
}
