import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Prenosi pozivnicu / ime kroz sign-up i onboarding, isto kao što web koristi
 * `sessionStorage` u [app-root.tsx]. Na native-u je čist in-memory state:
 * ceo flow (deep link → sign-up → ensureCurrent) traje u jednom pokretanju.
 */
export type PendingInvite = {
  /** Kod iz pozivnice (`invites` codeHash se poredi na serveru). */
  inviteCode?: string;
  /** Email na koji je pozivnica vezana — prefiluje se u formi. */
  email?: string;
  /** Ime koje je korisnik uneo pri registraciji (fallback za `ensureCurrent`). */
  displayName?: string;
};

type PendingInviteContextValue = {
  pending: PendingInvite;
  setPending: (next: PendingInvite) => void;
  patchPending: (patch: PendingInvite) => void;
  clearPending: () => void;
};

const PendingInviteContext = createContext<PendingInviteContextValue | null>(null);

export function PendingInviteProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingInvite>({});

  const value = useMemo<PendingInviteContextValue>(
    () => ({
      pending,
      setPending,
      patchPending: (patch) => setPending((current) => ({ ...current, ...patch })),
      clearPending: () => setPending({}),
    }),
    [pending],
  );

  return <PendingInviteContext.Provider value={value}>{children}</PendingInviteContext.Provider>;
}

export function usePendingInvite() {
  const value = useContext(PendingInviteContext);
  if (value === null) {
    throw new Error('usePendingInvite mora biti unutar <PendingInviteProvider>.');
  }
  return value;
}
