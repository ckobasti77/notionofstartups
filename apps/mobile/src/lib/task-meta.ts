/**
 * Labele, redosledi i boje za zadatke — mobilni port „čistog" dela
 * `apps/web/lib/workspace.ts`. Labele su iste (jedan jezik za oba klijenta);
 * boje se ne prenose kao Tailwind klase nego kao funkcije koje vraćaju token
 * boje iz `useThemeColors()`. Datumi se formatiraju ručno (bez `Intl` locale
 * podataka, koje Hermes ne garantuje).
 *
 * Kad se ovde nešto menja, ogledalo je `apps/web/lib/workspace.ts`.
 */
import type { ColorTokens } from '@/theme/tokens';

export const TASK_STATUS_META = {
  backlog: { label: 'Backlog' },
  next: { label: 'Sledeće' },
  in_progress: { label: 'U toku' },
  blocked: { label: 'Čeka' },
  done: { label: 'Gotovo' },
} as const;

export type TaskStatus = keyof typeof TASK_STATUS_META;

export const TASK_PRIORITY_META = {
  low: { label: 'Nizak' },
  medium: { label: 'Srednji' },
  high: { label: 'Visok' },
  urgent: { label: 'Hitno' },
} as const;

export type TaskPriority = keyof typeof TASK_PRIORITY_META;

/** Statusi koje komandni centar smatra otvorenim (ogledalo `OPEN_TASK_STATUSES`). */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  'backlog',
  'next',
  'in_progress',
  'blocked',
];

/** Redosled u pikerima statusa (uključuje `done` za „označi gotovo"). */
export const TASK_STATUS_ORDER: readonly TaskStatus[] = [
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
];

/** Redosled prioriteta u pikeru (nisko → hitno). */
export const TASK_PRIORITY_ORDER: readonly TaskPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
];

/**
 * Boja prioriteta iz semantičkih tokena (web: urgent rose, high amber,
 * medium blue, low slate → destructive/warning/info/muted).
 */
export function priorityColor(colors: ColorTokens, priority: TaskPriority | null): string {
  switch (priority) {
    case 'urgent':
      return colors.destructive;
    case 'high':
      return colors.warning;
    case 'medium':
      return colors.info;
    case 'low':
    default:
      return colors.mutedForeground;
  }
}

/** Boja statusa — za tačkice/oznake u meniju akcija. */
export function statusColor(colors: ColorTokens, status: TaskStatus | null): string {
  switch (status) {
    case 'in_progress':
      return colors.warning;
    case 'blocked':
      return colors.destructive;
    case 'done':
      return colors.success;
    case 'next':
      return colors.info;
    case 'backlog':
    default:
      return colors.mutedForeground;
  }
}

/**
 * Boja oblasti izvedena iz njenog `key` (web `AREA_META`: indigo/violet/emerald/
 * amber → primary/info/success/warning). Nepoznati („custom_…") ključevi su muted.
 */
export function areaColor(colors: ColorTokens, key: string): string {
  switch (key) {
    case 'dev':
      return colors.primary;
    case 'marketing':
      return colors.info;
    case 'sales':
      return colors.success;
    case 'other':
      return colors.warning;
    default:
      return colors.mutedForeground;
  }
}

/** „1 zadatak", „3 zadatka", „7 zadataka" — srpska pluralizacija. */
export function tasksWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return 'zadatak';
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return 'zadatka';
  }
  return 'zadataka';
}

const SR_MONTHS_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'avg',
  'sep',
  'okt',
  'nov',
  'dec',
];

/** Kratak datum bez `Intl` locale-a (Hermes ga ne garantuje): „7. avg". */
export function formatShortDate(timestamp?: number | null): string {
  if (!timestamp) return 'Bez roka';
  const date = new Date(timestamp);
  return `${date.getDate()}. ${SR_MONTHS_SHORT[date.getMonth()]}`;
}

/**
 * Rok kao lokalno podne za `now + days` (kao web `fromDateInputValue`) — poređenje
 * po danu tako ne „preskače" u 12:01. `days = 0` je danas, `1` sutra, itd.
 */
export function dueDateInDays(days: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}
