/**
 * Moj dan (v1, K08) — od odgovora `myDay.overview` do redova za prikaz.
 * ČISTO (vitest). Grupisanje je iz `@devotion/shared` (isto na telefonu, P5).
 */
import {
  countOpenByStartup,
  fromOverview,
  groupMyDay,
  type MyDayGrouping,
  type MyDayOverviewLike,
  type MyDayRow,
  type MyDaySectionId,
} from "@devotion/shared";

import type { TaskRowData } from "../task-row";

export type OverviewStartup = { _id: string; name: string; logoUrl: string | null };

/** Strukturni oblik `api.myDay.overview` koji ovaj prikaz koristi. */
export type MyDayOverviewData = MyDayOverviewLike & {
  startups: ReadonlyArray<OverviewStartup>;
  capped: { tasks: boolean; personal: boolean; history: boolean };
};

export type MyDaySectionModel = {
  id: MyDaySectionId;
  title: string;
  collapsedByDefault: boolean;
  rows: TaskRowData[];
};

export type MyDayModel = {
  sections: MyDaySectionModel[];
  progress: MyDayGrouping["progress"];
  counts: MyDayGrouping["counts"];
  /** Neki izvor u `overview` je odsečen — prikaz je deo zadataka. */
  capped: boolean;
};

export function rowData(row: MyDayRow, startups: ReadonlyMap<string, OverviewStartup>): TaskRowData {
  const startup =
    row.startupId === null
      ? null
      : (startups.get(row.startupId) ?? { _id: row.startupId, name: row.startupName ?? "Startup", logoUrl: null });
  return {
    key: row.key,
    kind: row.kind,
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    startup,
    areaLabel: row.areaLabel,
    done: row.status === "done",
  };
}

export function buildMyDay(overview: MyDayOverviewData, now: number, zone?: string): MyDayModel {
  const grouping = groupMyDay(fromOverview(overview, now, zone));
  const startups = new Map(overview.startups.map((startup) => [startup._id, startup] as const));
  return {
    sections: grouping.sections.map((section) => ({
      id: section.id,
      title: section.title,
      collapsedByDefault: section.collapsedByDefault,
      rows: section.rows.map((row) => rowData(row, startups)),
    })),
    progress: grouping.progress,
    counts: grouping.counts,
    capped: overview.capped.tasks || overview.capped.personal,
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
