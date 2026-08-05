import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Cilj taknutog obaveštenja koji čeka da bude otvoren. Postoji zbog dva slučaja
 * koje je lako promašiti (docs/mobile/03-NOTIFIKACIJE.md):
 *
 *  1. „Hladan start" — tap kad je aplikacija bila potpuno zatvorena. Odgovor se
 *     pročita iz `getLastNotificationResponseAsync` na startu i upamti ovde.
 *  2. Neprijavljen korisnik — gate u root `_layout.tsx` prikazuje prijavu, a
 *     `(app)` (gde živi navigacija) još ne postoji. Cilj čeka ovde dok se
 *     korisnik ne prijavi, pa se tek onda otvara — ne vodi na belo.
 *
 * In-memory je dovoljno: ceo tok (tap → [prijava] → otvaranje) traje u jednom
 * pokretanju, isto kao `pending-invite`.
 */
export type PendingTarget = {
  /** Iz `data.targetType` push payload-a (`chat`, `page`, `ideas`, …). */
  targetType: string;
  /** `data.targetId` — channelId/pageId/… ili null. */
  targetId: string | null;
  /** `data.startupId` — kontekst u koji cilj spada; određuje aktivan startup. */
  startupId: string | null;
};

type PendingTargetContextValue = {
  target: PendingTarget | null;
  setTarget: (next: PendingTarget) => void;
  clearTarget: () => void;
};

const PendingTargetContext = createContext<PendingTargetContextValue | null>(null);

export function PendingTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PendingTarget | null>(null);

  const value = useMemo<PendingTargetContextValue>(
    () => ({ target, setTarget, clearTarget: () => setTarget(null) }),
    [target],
  );

  return (
    <PendingTargetContext.Provider value={value}>{children}</PendingTargetContext.Provider>
  );
}

export function usePendingTarget() {
  const value = useContext(PendingTargetContext);
  if (value === null) {
    throw new Error('usePendingTarget mora biti unutar <PendingTargetProvider>.');
  }
  return value;
}
