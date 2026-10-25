/**
 * Radnje reda zadatka na telefonu (K12, plan K07 §1.2 i §6.2) — ČISTO (vitest),
 * bez ikonica i React-a (lucide se ne uvozi u vitest; ikonice dodaje red).
 *
 * - Swipe DESNO = završi (završen red: vrati u otvoreno). Bez dozvole radnja se
 *   vidi, ali potvrda samo upozori (`warning`) i red se vrati — razlog je isti
 *   tekst kao na webu (shared `PERMISSION_REASONS`).
 * - Swipe LEVO = sheet „Rok i plan" (čipovi roka + Dodaj u / Ukloni iz Moj dan);
 *   plan je uvek dozvoljen, pa je i ova radnja uvek dozvoljena.
 * - Dugi pritisak = sheet radnji (ne ide kroz ovaj modul).
 *
 * Pragovi i smer prsta su iz `components/motion/swipe-logic.ts` (`resolveSwipe`,
 * brojevi iz shared `SWIPE`), pa telefon svuda odlučuje isto.
 */
import { completionCall, type TaskRowModel } from '@devotion/shared';

import { resolveSwipe } from '@/components/motion/swipe-logic';

export type RowCommand = 'complete' | 'reopen' | 'schedule';

export type RowSwipeSide = {
  command: RowCommand;
  /** Glagol ispod reda i za čitač ekrana. */
  label: string;
  allowed: boolean;
  /** Zašto nije dozvoljeno (E15); `null` kad jeste. */
  reason: string | null;
};

export type RowSwipeSpec = { right: RowSwipeSide; left: RowSwipeSide };

export const SCHEDULE_LABEL = 'Rok i plan';

export function rowSwipeSpec(row: Pick<TaskRowModel, 'kind' | 'id' | 'done' | 'permissions'>): RowSwipeSpec {
  // Ista provera koju i kvačica šalje serveru (`completionCall`), da swipe i
  // dodir nikad ne odluče različito.
  const call = completionCall(row, !row.done);
  const allowed = call.fn !== 'denied';
  return {
    right: {
      command: row.done ? 'reopen' : 'complete',
      label: row.done ? 'Vrati' : 'Završi',
      allowed,
      reason: call.fn === 'denied' ? call.reason : null,
    },
    left: { command: 'schedule', label: SCHEDULE_LABEL, allowed: true, reason: null },
  };
}

/**
 * Pušten prst → radnja reda (ili ništa). `translationX` je pomeraj reda kako
 * ga `SwipeRow` vidi (posle gumenog otpora), `velocityX` brzina pri puštanju.
 */
export function swipeCommand(
  gesture: { translationX: number; velocityX: number; thresholdPx?: number },
  row: Pick<TaskRowModel, 'kind' | 'id' | 'done' | 'permissions'>,
): RowSwipeSide | null {
  const side = resolveSwipe(gesture);
  if (side === null) return null;
  const spec = rowSwipeSpec(row);
  return side === 'right' ? spec.right : spec.left;
}
