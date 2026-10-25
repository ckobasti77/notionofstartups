/**
 * „Isplaniraj dan" (plan K07 §2) — predlozi i „Preneto od ranije" iz istog
 * `myDay.overview`, kroz shared funkcije (`planSuggestions`,
 * `carryOverCandidates`). Pravila su od K12 u `@devotion/shared`
 * (`my-day-plan.ts`), da ih telefon deli; ovde ostaju isti izvozi.
 */
export {
  buildPlanDay,
  groupSuggestions,
  MY_DAY_MAX_ENTRIES,
  PLAN_SUGGESTIONS_LIMIT,
  type PlanDayCarryRow,
  type PlanDayModel,
  type PlanDaySuggestionRow,
} from "@devotion/shared";
