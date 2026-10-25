/**
 * Moj dan — od odgovora `myDay.overview` do sekcija za prikaz. ČISTO (vitest).
 * Grupisanje je iz `@devotion/shared` (isto na telefonu, P5), a red je
 * zajednički `TaskRowModel` (shared `task-row.ts`, plan K07 §1).
 */
import {
  applyCompletionHolds,
  type CompletionHold,
  countOpenByStartup,
  fromOverview,
  groupMyDay,
  groupMyDayByStartup,
  type MyDayGrouping,
  type MyDayOverviewLike,
  type MyDaySectionId,
  rowFromMyDay,
  type StartupMini,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

export type OverviewStartup = StartupMini;

/** Strukturni oblik `api.myDay.overview` koji ovaj prikaz koristi. */
export type MyDayOverviewData = MyDayOverviewLike & {
  startups: ReadonlyArray<OverviewStartup>;
  capped: { tasks: boolean; personal: boolean; history: boolean };
};

export type MyDaySectionModel = {
  id: MyDaySectionId;
  title: string;
  collapsedByDefault: boolean;
  rows: TaskRowModel[];
};

export type MyDayStartupGroupModel = {
  /** „personal" ili id startupa. */
  key: string;
  startup: OverviewStartup | null;
  title: string;
  rows: TaskRowModel[];
};

export type MyDayModel = {
  sections: MyDaySectionModel[];
  /** Isti skup stavki „po startupu": Lično prvo, pa startupi redom iz `overview.startups`. */
  byStartup: { groups: MyDayStartupGroupModel[]; doneToday: TaskRowModel[] };
  progress: MyDayGrouping["progress"];
  counts: MyDayGrouping["counts"];
  /** Neki izvor u `overview` je odsečen — prikaz je deo zadataka. */
  capped: boolean;
  /** Ukupno redova na ekranu (granica za Flip, plan K07 E12). */
  rowCount: number;
};

export type MyDayGroupMode = "time" | "startup";

/** Ključ lokalnog skladišta za prekidač „po vremenu / po startupu" (plan K07 §1.2). */
export const GROUP_MODE_STORAGE_KEY = "devotion:me-today:grouping";

export function parseGroupMode(raw: string | null | undefined): MyDayGroupMode {
  return raw === "startup" ? "startup" : "time";
}

/** Iznad ovoliko redova nema Flip-a, samo neprozirnost (plan K07 E12). */
export const FLIP_MAX_ROWS = 80;

export function buildMyDay(overview: MyDayOverviewData, now: number, zone?: string): MyDayModel {
  const input = fromOverview(overview, now, zone);
  const grouping = groupMyDay(input);
  const startups = new Map(overview.startups.map((startup) => [startup._id, startup] as const));
  const toRow = (row: Parameters<typeof rowFromMyDay>[0]) => rowFromMyDay(row, startups);
  const sections = grouping.sections.map((section) => ({
    id: section.id,
    title: section.title,
    collapsedByDefault: section.collapsedByDefault,
    rows: section.rows.map(toRow),
  }));
  const byStartup = groupMyDayByStartup(
    input,
    overview.startups.map((startup) => startup._id),
  );
  return {
    sections,
    byStartup: {
      groups: byStartup.groups.map((group) => ({
        key: group.startupId ?? "personal",
        startup: group.startupId === null ? null : (startups.get(group.startupId) ?? null),
        title: group.title,
        rows: group.rows.map(toRow),
      })),
      doneToday: byStartup.doneToday.map(toRow),
    },
    progress: grouping.progress,
    counts: grouping.counts,
    capped: overview.capped.tasks || overview.capped.personal,
    rowCount: sections.reduce((sum, section) => sum + section.rows.length, 0),
  };
}

/** Broj u meniju „Ja" uz Moj dan: otvoreno za danas (prekoračeno + danas + planirano). */
export function openTodayCount(counts: Record<MyDaySectionId, number>): number {
  return counts.overdue + counts.today + counts.planned;
}

/** Moji otvoreni dodeljeni zadaci po startupu (meni „Ja", plan K01 D13). */
export function openByStartup(overview: MyDayOverviewData, now: number, zone?: string): Record<string, number> {
  return countOpenByStartup(fromOverview(overview, now, zone).items);
}

/** „2 kasni, 3 za danas." — sažetak ispod pozdrava; delovi sa nulom se izostavljaju. */
export function daySummary(counts: Record<MyDaySectionId, number>): string {
  const parts: string[] = [];
  if (counts.overdue > 0) parts.push(`${counts.overdue} kasni`);
  if (counts.today > 0) parts.push(`${counts.today} za danas`);
  return parts.length === 0 ? "Ništa ne gori." : `${parts.join(", ")}.`;
}

/** Ime za pozdrav: prva reč imena za prikaz. */
export function firstNameOf(displayName: string): string | null {
  const first = displayName.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** „3 od 7 završeno" / „Dan je završen." — vrednost prstena za čitač ekrana. */
export function progressValueText(progress: { done: number; total: number }): string {
  if (progress.total > 0 && progress.done >= progress.total) return "Dan je završen.";
  return `${progress.done} od ${progress.total} završeno`;
}

/** Id-jevi stavki plana redom kako se vide u „Planirano" (za `myDay.reorder`). */
export function plannedOrder(model: MyDayModel): string[] {
  const planned = model.sections.find((section) => section.id === "planned");
  return (planned?.rows ?? [])
    .map((row) => row.planEntryId)
    .filter((id): id is string => id !== null);
}

// --- Optimistička slika (`withOptimisticUpdate`) -----------------------------
// Klijent odmah pokaže ishod (pa Flip ima šta da animira), a Convex vrati
// pravo stanje čim server odgovori. Funkcije čuvaju tip odgovora servera
// (`as T`: `map` nad generičkim nizom vraća tip ograničenja, oblik je isti).

type EntryLike = { _id: string; position: number };
type OverviewShape = {
  tasks: ReadonlyArray<{ _id: string; dueDate: number | null; taskPriority: TaskPriorityKey | null }>;
  personal: ReadonlyArray<{ _id: string; dueDate: number | null; priority: TaskPriorityKey | null }>;
  entries: ReadonlyArray<EntryLike>;
};

/** Privremeni id optimističke stavke plana (nikad ne ide na server). */
export const OPTIMISTIC_PREFIX = "optimistic:";

export function isOptimisticId(id: string | null): boolean {
  return id !== null && id.startsWith(OPTIMISTIC_PREFIX);
}

/** Izmena roka ili prioriteta jedne stavke. */
export function patchItem<T extends OverviewShape>(
  overview: T,
  target: { kind: "task" | "personal"; id: string },
  patch: { dueDate?: number | null; priority?: TaskPriorityKey | null },
): T {
  if (target.kind === "task") {
    return {
      ...overview,
      tasks: overview.tasks.map((task) =>
        task._id !== target.id
          ? task
          : {
              ...task,
              ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
              ...(patch.priority === undefined ? {} : { taskPriority: patch.priority }),
            },
      ),
    } as T;
  }
  return {
    ...overview,
    personal: overview.personal.map((task) =>
      task._id !== target.id
        ? task
        : {
            ...task,
            ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
            ...(patch.priority === undefined ? {} : { priority: patch.priority }),
          },
    ),
  } as T;
}

/** Nova stavka plana na kraju dana (pozicija kao `appendPlanEntry`: poslednja + 1024). */
export function withEntry<T extends OverviewShape>(overview: T, entry: T["entries"][number]): T {
  if (overview.entries.some((existing) => existing._id === entry._id)) return overview;
  const last = overview.entries.reduce((max, existing) => Math.max(max, existing.position), 0);
  return { ...overview, entries: [...overview.entries, { ...entry, position: last + 1024 }] } as T;
}

export function withoutEntry<T extends OverviewShape>(overview: T, entryId: string): T {
  return { ...overview, entries: overview.entries.filter((entry) => entry._id !== entryId) } as T;
}

/**
 * Novi redosled zadatih stavki — kao `myDay.reorder`: stavke zadržavaju SKUP
 * pozicija koje već zauzimaju, ostale stoje gde jesu.
 */
export function withEntryOrder<T extends OverviewShape>(overview: T, orderedIds: ReadonlyArray<string>): T {
  const wanted = new Set(orderedIds);
  const positions = overview.entries
    .filter((entry) => wanted.has(entry._id))
    .map((entry) => entry.position)
    .sort((a, b) => a - b);
  const nextPosition = new Map(orderedIds.map((id, index) => [id, positions[index]] as const));
  const entries = overview.entries
    .map((entry) => {
      const position = nextPosition.get(entry._id);
      return position === undefined ? entry : { ...entry, position };
    })
    .sort((a, b) => a.position - b.position);
  return { ...overview, entries } as T;
}

/** Skloni stavke istorije (`clearOld`, `carryOver`); `null` = sve. */
export function withoutHistory<T extends { history: ReadonlyArray<{ refKey: string }> }>(
  overview: T,
  refKeys: ReadonlySet<string> | null,
): T {
  return {
    ...overview,
    history: refKeys === null ? [] : overview.history.filter((entry) => !refKeys.has(entry.refKey)),
  } as T;
}

// --- Zadržavanje reda posle kvačice (E7) u oba prikaza -----------------------

/** Zadržan red: `section` je `time:<sekcija>` ili `startup:<ključ grupe>`. */
export type RowHold = CompletionHold<TaskRowModel>;

export function holdSectionKey(mode: MyDayGroupMode, id: string): string {
  return `${mode}:${id}`;
}

/** Gde je red sada (za zadržavanje na istom mestu). */
export function locateRow(
  model: MyDayModel,
  mode: MyDayGroupMode,
  key: string,
): { section: string; index: number } | null {
  const lists =
    mode === "time"
      ? model.sections.map((section) => ({ id: section.id as string, rows: section.rows }))
      : [
          ...model.byStartup.groups.map((group) => ({ id: group.key, rows: group.rows })),
          { id: "doneToday", rows: model.byStartup.doneToday },
        ];
  for (const list of lists) {
    const index = list.rows.findIndex((row) => row.key === key);
    if (index !== -1) return { section: holdSectionKey(mode, list.id), index };
  }
  return null;
}

/**
 * Primeni zadržane redove i stanje „čeka potvrdu" na oba prikaza. Zadržan red
 * važi samo u prikazu u kome je kliknut (u drugom ga vode podaci).
 */
export function applyHolds(
  model: MyDayModel,
  holds: ReadonlyMap<string, RowHold>,
  pending: ReadonlyMap<string, boolean>,
): MyDayModel {
  if (holds.size === 0 && pending.size === 0) return model;
  const holdsFor = (mode: MyDayGroupMode) =>
    new Map([...holds].filter(([, hold]) => hold.section.startsWith(`${mode}:`)));

  const prefix = (mode: MyDayGroupMode) => `${mode}:`.length;
  const sections = applyCompletionHolds(
    model.sections.map((section) => ({ ...section, id: holdSectionKey("time", section.id) })),
    holdsFor("time"),
    pending,
  ).map((section) => ({ ...section, id: section.id.slice(prefix("time")) as MyDaySectionId }));

  const startupLists = applyCompletionHolds(
    [
      ...model.byStartup.groups.map((group) => ({ id: holdSectionKey("startup", group.key), rows: group.rows })),
      { id: holdSectionKey("startup", "doneToday"), rows: model.byStartup.doneToday },
    ],
    holdsFor("startup"),
    pending,
  );
  const rowsOf = (id: string) =>
    startupLists.find((list) => list.id === holdSectionKey("startup", id))?.rows ?? [];

  return {
    ...model,
    sections,
    byStartup: {
      groups: model.byStartup.groups.map((group) => ({ ...group, rows: rowsOf(group.key) })),
      doneToday: rowsOf("doneToday"),
    },
  };
}
