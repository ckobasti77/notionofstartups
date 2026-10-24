"use client";

import { useMemo, useState } from "react";

import { planRoll, type RollSlot } from "./number-roll";

/**
 * Pamti prethodnu vrednost i vraća plan kotrljanja do nove. `version` raste
 * pri svakoj promeni — komponenta po njemu zna da treba da pusti animaciju.
 */
export function useNumberRoll(value: number, cap = 99): { slots: RollSlot[]; version: number } {
  const [pair, setPair] = useState({ from: value, to: value, version: 0 });
  // Izvedeno stanje iz props-a (React obrazac „prethodna vrednost"):
  // ponovni render pre commit-a, bez efekta.
  if (pair.to !== value) {
    setPair({ from: pair.to, to: value, version: pair.version + 1 });
  }
  return useMemo(
    () => ({ slots: planRoll(pair.from, pair.to, cap), version: pair.version }),
    [pair, cap],
  );
}
