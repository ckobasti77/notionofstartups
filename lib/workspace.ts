export const AREA_META = {
  dev: { label: "Dev", description: "Proizvod, kod i tehničke odluke", accent: "indigo" },
  marketing: { label: "Marketing", description: "Kampanje, sadržaj i pozicioniranje", accent: "violet" },
  sales: { label: "Sales", description: "Leadovi, ponude i razgovori", accent: "emerald" },
  other: { label: "Ostalo", description: "Sve što ne pripada drugim oblastima", accent: "amber" },
} as const;

export type AreaKey = keyof typeof AREA_META;

export const TASK_STATUS_META = {
  backlog: { label: "Backlog", shortLabel: "Backlog" },
  next: { label: "Sledeće", shortLabel: "Sledeće" },
  in_progress: { label: "U toku", shortLabel: "U toku" },
  blocked: { label: "Čeka", shortLabel: "Čeka" },
  done: { label: "Gotovo", shortLabel: "Gotovo" },
} as const;

export type TaskStatus = keyof typeof TASK_STATUS_META;

export const TASK_PRIORITY_META = {
  low: { label: "Nizak", dotClass: "bg-slate-400" },
  medium: { label: "Srednji", dotClass: "bg-blue-500" },
  high: { label: "Visok", dotClass: "bg-amber-500" },
  urgent: { label: "Hitno", dotClass: "bg-rose-500" },
} as const;

export type TaskPriority = keyof typeof TASK_PRIORITY_META;

export function formatShortDate(timestamp?: number | null) {
  if (!timestamp) return "Bez roka";
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}

export function toDateInputValue(timestamp?: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function fromDateInputValue(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T12:00:00`).getTime();
}

