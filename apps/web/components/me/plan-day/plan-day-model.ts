/**
 * „Isplaniraj dan" (plan K07 §2) — predlozi i „Preneto od ranije" iz istog
 * `myDay.overview`, kroz shared funkcije (`planSuggestions`,
 * `carryOverCandidates`). ČISTO (vitest).
 */
import {
  carryOverCandidates,
  formatDayRelative,
  fromOverview,
  noonOfDayKey,
  PLAN_SUGGESTION_LABELS,
  planSuggestions,
  type PlanSuggestionReason,
  rowFromMyDay,
  type TaskRowModel,
} from "@devotion/shared";

import type { MyDayOverviewData } from "../my-day/my-day-model";

/** Isto kao `MAX_MY_DAY_ENTRIES` na serveru. */
export const MY_DAY_MAX_ENTRIES = 50;
/** Najviše predloga u dijalogu (plan K07 §2). */
export const PLAN_SUGGESTIONS_LIMIT = 30;

export type PlanDayCarryRow = { row: TaskRowModel; fromDayKey: string; fromLabel: string };
export type PlanDaySuggestionRow = { row: TaskRowModel; reason: PlanSuggestionReason; reasonLabel: string };

export type PlanDayModel = {
  carryOver: PlanDayCarryRow[];
  suggestions: PlanDaySuggestionRow[];
  /** Stavke plana za danas („U planu: n od 50"). */
  plannedCount: number;
  max: number;
};

export function buildPlanDay(overview: MyDayOverviewData, now: number, zone?: string): PlanDayModel {
  const input = fromOverview(overview, now, zone);
  const startups = new Map(overview.startups.map((startup) => [startup._id, startup] as const));
  const carryOver = carryOverCandidates(input);
  // Stavka iz „Preneto od ranije" se ne nudi dvaput (i kao predlog).
  const carried = new Set(carryOver.map((candidate) => candidate.row.key));
  return {
    carryOver: carryOver.map((candidate) => ({
      row: rowFromMyDay(candidate.row, startups),
      fromDayKey: candidate.fromDayKey,
      fromLabel: formatDayRelative(noonOfDayKey(candidate.fromDayKey, zone), now, zone),
    })),
    suggestions: planSuggestions(input, PLAN_SUGGESTIONS_LIMIT + carried.size)
      .filter((suggestion) => !carried.has(suggestion.row.key))
      .slice(0, PLAN_SUGGESTIONS_LIMIT)
      .map((suggestion) => ({
        row: rowFromMyDay(suggestion.row, startups),
        reason: suggestion.reason,
        reasonLabel: PLAN_SUGGESTION_LABELS[suggestion.reason],
      })),
    plannedCount: overview.entries.length,
    max: MY_DAY_MAX_ENTRIES,
  };
}

/** Grupe predloga po razlogu, redom kako ih shared vraća. */
export function groupSuggestions(
  suggestions: ReadonlyArray<PlanDaySuggestionRow>,
): Array<{ reason: PlanSuggestionReason; label: string; rows: PlanDaySuggestionRow[] }> {
  const groups: Array<{ reason: PlanSuggestionReason; label: string; rows: PlanDaySuggestionRow[] }> = [];
  for (const suggestion of suggestions) {
    const last = groups.at(-1);
    if (last && last.reason === suggestion.reason) last.rows.push(suggestion);
    else groups.push({ reason: suggestion.reason, label: suggestion.reasonLabel, rows: [suggestion] });
  }
  return groups;
}
