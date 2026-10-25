/**
 * Moj dan (K12) — od odgovora `myDay.overview` do sekcija za prikaz. ČISTO
 * (vitest). Grupisanje je iz `@devotion/shared` (isto kao web, P5), a red je
 * zajednički `TaskRowModel` (shared `task-row.ts`, plan K07 §1, E4) — dozvole
 * i „koja radnja se zove" ne zavise od platforme. Par web
 * `apps/web/components/me/my-day/my-day-model.ts`.
 *
 * Razlika od weba je samo u obliku: telefon crta JEDNU listu (`Animated.FlatList`),
 * pa oba rasporeda („po vremenu" i „po startupu") ovde postaju isti niz sekcija
 * sa ključem `<raspored>:<id>`, a lista se ravna u stavke (zaglavlje + redovi).
 */
import {
  applyCompletionHolds,
  type CompletionHold,
  fromOverview,
  groupMyDay,
  groupMyDayByStartup,
  type MyDayGrouping,
  type MyDayOverviewLike,
  type MyDaySectionId,
  PERMISSION_REASONS,
  reopenStatus,
  rowFromMyDay,
  type StartupMini,
  type TaskRowModel,
  type TaskStatusKey,
} from '@devotion/shared';

import type { Id } from '@/convex/_generated/dataModel';
import type { UndoAction } from '@/lib/undo';

export type OverviewStartup = StartupMini;

/** Strukturni oblik `api.myDay.overview` koji ovaj prikaz koristi. */
export type MyDayOverviewData = MyDayOverviewLike & {
  startups: ReadonlyArray<OverviewStartup>;
  capped: { tasks: boolean; personal: boolean; history: boolean };
};

export type MyDayGroupMode = 'time' | 'startup';

/** Razlog za onemogućenu kvačicu (plan K07 §3, E15) — tekst iz shared paketa. */
export const STATUS_DENIED_REASON = PERMISSION_REASONS.status;

/** Iznad ovoliko redova layout animacija se gasi (plan K07 E12, telefon). */
export const LAYOUT_ANIMATION_MAX_ROWS = 60;

export type MyDayListSection = {
  /** `time:<sekcija>` ili `startup:<personal | id startupa | doneToday>`. */
  key: string;
  title: string;
  /** Čip startupa u zaglavlju grupe; `null` = „Lično"; `undefined` = bez čipa. */
  startup?: OverviewStartup | null;
  tone: 'default' | 'danger';
  /** Sklopiva (Blokirano, Završeno danas) — podrazumevano sklopljena. */
  collapsible: boolean;
  /** Sekcija u kojoj se red sme pomerati gore/dole (Planirano, po vremenu). */
  reorderable: boolean;
  rows: TaskRowModel[];
};

export type MyDayModel = {
  /** Svih sedam sekcija po vremenu (prazne ostaju, prikaz ih preskače). */
  time: MyDayListSection[];
  /** Isti skup stavki po startupu: Lično prvo, pa startupi, pa „Završeno danas". */
  startup: MyDayListSection[];
  progress: MyDayGrouping['progress'];
  counts: MyDayGrouping['counts'];
  /** Neki izvor u `overview` je odsečen — prikaz je deo zadataka. */
  capped: boolean;
  /** Ukupno redova po vremenu (granica za layout animaciju). */
  rowCount: number;
};

const DONE_TODAY_TITLE = 'Završeno danas';

export function sectionKey(mode: MyDayGroupMode, id: string): string {
  return `${mode}:${id}`;
}

export function buildMyDay(overview: MyDayOverviewData, now: number, zone?: string): MyDayModel {
  const input = fromOverview(overview, now, zone);
  const grouping = groupMyDay(input);
  const startups = new Map(overview.startups.map((startup) => [startup._id, startup] as const));
  const toRow = (row: Parameters<typeof rowFromMyDay>[0]) => rowFromMyDay(row, startups);

  const time: MyDayListSection[] = grouping.sections.map((section) => ({
    key: sectionKey('time', section.id),
    title: section.title,
    tone: section.id === 'overdue' ? 'danger' : 'default',
    collapsible: section.collapsedByDefault,
    reorderable: section.id === 'planned',
    rows: section.rows.map(toRow),
  }));

  const byStartup = groupMyDayByStartup(
    input,
    overview.startups.map((startup) => startup._id),
  );
  const startup: MyDayListSection[] = [
    ...byStartup.groups.map((group) => ({
      key: sectionKey('startup', group.startupId ?? 'personal'),
      title: group.title,
      startup: group.startupId === null ? null : (startups.get(group.startupId) ?? null),
      tone: 'default' as const,
      collapsible: false,
      reorderable: false,
      rows: group.rows.map(toRow),
    })),
    {
      key: sectionKey('startup', 'doneToday'),
      title: DONE_TODAY_TITLE,
      tone: 'default' as const,
      collapsible: true,
      reorderable: false,
      rows: byStartup.doneToday.map(toRow),
    },
  ];

  return {
    time,
    startup,
    progress: grouping.progress,
    counts: grouping.counts,
    capped: overview.capped.tasks || overview.capped.personal,
    rowCount: time.reduce((sum, section) => sum + section.rows.length, 0),
  };
}

export function sectionsFor(model: MyDayModel, mode: MyDayGroupMode): MyDayListSection[] {
  return mode === 'time' ? model.time : model.startup;
}

/** Nema ničega otvorenog za danas (prazno stanje) — „Završeno danas" se ne broji. */
export function hasOpenRows(model: MyDayModel): boolean {
  return model.time.some(
    (section) => section.key !== sectionKey('time', 'doneToday') && section.rows.length > 0,
  );
}

/** Id-jevi stavki plana redom kako se vide u „Planirano" (za `myDay.reorder`). */
export function plannedOrder(model: MyDayModel): string[] {
  const planned = model.time.find((section) => section.key === sectionKey('time', 'planned'));
  return (planned?.rows ?? [])
    .map((row) => row.planEntryId)
    .filter((id): id is string => id !== null);
}

// --- Zadržavanje reda posle kvačice (E7) ------------------------------------

/** Zadržan red: `section` je ključ sekcije (`<raspored>:<id>`) u kojoj je kliknut. */
export type RowHold = CompletionHold<TaskRowModel>;

/** Gde je red sada u listi koja se vidi (za zadržavanje na istom mestu). */
export function locateRow(
  sections: ReadonlyArray<MyDayListSection>,
  key: string,
): { section: string; index: number } | null {
  for (const section of sections) {
    const index = section.rows.findIndex((row) => row.key === key);
    if (index !== -1) return { section: section.key, index };
  }
  return null;
}

/**
 * Posle dodira na kvačicu red ostaje na svom mestu, kao završen, dok se spring
 * kvačice ne smiri; tek onda ga podaci sa servera presele (npr. u „Završeno
 * danas"). `pending` drži željeni status dok server ne potvrdi. Zadržan red
 * važi samo u rasporedu u kome je kliknut (ključ sekcije nosi raspored). Bez
 * zadržavanja i čekanja vraća iste sekcije.
 */
export function applyHolds(
  sections: MyDayListSection[],
  holds: ReadonlyMap<string, RowHold>,
  pending: ReadonlyMap<string, boolean>,
): MyDayListSection[] {
  if (holds.size === 0 && pending.size === 0) return sections;
  const keys = new Set(sections.map((section) => section.key));
  const relevant = new Map([...holds].filter(([, hold]) => keys.has(hold.section)));
  // Red zadržan u DRUGOM rasporedu ovde vode podaci (samo nosi željeni status).
  // `id` je ključ sekcije koji shared funkcija traži (višak polja ne smeta prikazu).
  return applyCompletionHolds(
    sections.map((section) => ({ ...section, id: section.key })),
    relevant,
    pending,
  );
}

// --- Ravna lista za `Animated.FlatList` -------------------------------------

export type MyDayListItem =
  | {
      type: 'header';
      key: string;
      section: MyDayListSection;
      collapsed: boolean;
    }
  | {
      type: 'row';
      key: string;
      row: TaskRowModel;
      sectionKey: string;
      /** Gore/dole u „Planirano" (dugi pritisak) — `null` van te sekcije. */
      movable: { up: boolean; down: boolean } | null;
    };

/**
 * Sekcije → stavke liste: prazne sekcije se preskaču, sklopljena sekcija daje
 * samo zaglavlje. Ključ reda je `refKey` (isti u svakoj sekciji), pa red koji
 * pređe u drugu sekciju lista POMERI (layout tranzicija), ne izbriše i napravi.
 */
export function listItems(
  sections: ReadonlyArray<MyDayListSection>,
  collapsed: ReadonlySet<string>,
): MyDayListItem[] {
  const items: MyDayListItem[] = [];
  for (const section of sections) {
    if (section.rows.length === 0) continue;
    const isCollapsed = section.collapsible && collapsed.has(section.key);
    items.push({ type: 'header', key: `h:${section.key}`, section, collapsed: isCollapsed });
    if (isCollapsed) continue;
    section.rows.forEach((row, index) => {
      items.push({
        type: 'row',
        key: `r:${row.key}`,
        row,
        sectionKey: section.key,
        movable: section.reorderable
          ? { up: index > 0, down: index < section.rows.length - 1 }
          : null,
      });
    });
  }
  return items;
}

/** Podrazumevano sklopljene sekcije (Blokirano, Završeno danas u oba rasporeda). */
export const INITIAL_COLLAPSED: ReadonlySet<string> = new Set([
  sectionKey('time', 'blocked'),
  sectionKey('time', 'doneToday'),
  sectionKey('startup', 'doneToday'),
]);

// --- Tekstovi ---------------------------------------------------------------

/** „2 kasni, 3 za danas." — sažetak ispod pozdrava; delovi sa nulom se izostavljaju. */
export function daySummary(counts: Record<MyDaySectionId, number>): string {
  const parts: string[] = [];
  if (counts.overdue > 0) parts.push(`${counts.overdue} kasni`);
  if (counts.today > 0) parts.push(`${counts.today} za danas`);
  return parts.length === 0 ? 'Ništa ne gori.' : `${parts.join(', ')}.`;
}

/** Ime za pozdrav: prva reč imena za prikaz. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

/** „3 od 7 završeno" / „Dan je završen." — vrednost prstena za čitač ekrana. */
export function progressValueText(progress: { done: number; total: number }): string {
  if (progress.total > 0 && progress.done >= progress.total) return 'Dan je završen.';
  return `${progress.done} od ${progress.total} završeno`;
}

/** „Završeno: Ugovor sa dobavljačem" — traka „Poništi" i najava čitaču (plan K07 §3). */
export function completionLabel(title: string, done: boolean): string {
  return done ? `Završeno: ${title}` : `Vraćeno u otvoreno: ${title}`;
}

/**
 * Inverz završavanja za traku „Poništi“ (par web toasta „Završeno: …“): startup
 * zadatak se vraća na status OD PRE (inače „Sledeće“), lični u otvoren.
 */
export function completionUndoAction(row: TaskRowModel, previous: TaskStatusKey | undefined): UndoAction {
  // Id-jevi su prošli kroz shared model kao stringovi; potiču iz `myDay.overview`.
  return row.kind === 'personal'
    ? { kind: 'personalTaskStatus', personalTaskId: row.id as Id<'personalTasks'>, status: 'open' }
    : { kind: 'taskStatus', pageId: row.id as Id<'pages'>, status: reopenStatus(previous) };
}
