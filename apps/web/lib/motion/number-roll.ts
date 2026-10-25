/**
 * Plan kotrljanja cifara za `NumberRoll` — ČISTO (vitest). Cifre i smer
 * dolaze iz shared `rollDigits`; ovde se dodaju pomeraji za GSAP (`yPercent`).
 */
import { rollDigits } from "@devotion/shared";

export type RollSlot = {
  /** Stabilan ključ pozicije sa desna („d1" = jedinice). */
  key: string;
  from: string | null;
  to: string | null;
  /** Da li se ova pozicija kotrlja. */
  animate: boolean;
  /** Odakle nova cifra ulazi (yPercent): +100 odozdo kad broj raste. */
  enterFromPercent: number;
  /** Kuda stara cifra izlazi (yPercent): −100 nagore kad broj raste. */
  exitToPercent: number;
};

export function planRoll(previous: number, next: number, cap = 99): RollSlot[] {
  return rollDigits(previous, next, cap).map((roll) => ({
    key: roll.key,
    from: roll.from,
    to: roll.to,
    animate: roll.direction !== 0,
    enterFromPercent: roll.direction === 0 ? 0 : roll.direction * 100,
    exitToPercent: roll.direction === 0 ? 0 : roll.direction * -100,
  }));
}
