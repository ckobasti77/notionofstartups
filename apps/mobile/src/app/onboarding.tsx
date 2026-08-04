import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/convex/_generated/api';
import { AccessProblem } from '@/components/auth/access-problem';
import { FullScreenLoader } from '@/components/full-screen-loader';
import { usePendingInvite } from '@/context/pending-invite';
import { accessErrorMessage } from '@/lib/errors';

/**
 * Prikazuje se kad je korisnik prijavljen ali nema profil (gate: `needsOnboarding`).
 * Pokreće `profiles.ensureCurrent` sa pozivnicom/imenom iz PendingInvite konteksta;
 * uspeh reaktivno kreira profil → gate prebacuje na `(app)`. Preslikava onboarding
 * efekat iz web [app-root.tsx].
 */
export default function OnboardingScreen() {
  const { pending, clearPending } = usePendingInvite();
  const ensureCurrent = useMutation(api.profiles.ensureCurrent);
  const { signOut } = useAuthActions();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void ensureCurrent({
      ...(pending.displayName ? { displayName: pending.displayName } : {}),
      ...(pending.inviteCode ? { inviteCode: pending.inviteCode } : {}),
    })
      .then(() => clearPending())
      .catch((caught: unknown) => {
        started.current = false;
        setError(
          accessErrorMessage(
            caught,
            'Profil nije mogao da se poveže sa pozivnicom. Otvori pozivni link ponovo.',
          ),
        );
      });
  }, [ensureCurrent, pending, clearPending]);

  if (error) {
    return (
      <AccessProblem
        message={error}
        onSignOut={() => {
          clearPending();
          void signOut();
        }}
      />
    );
  }

  return <FullScreenLoader label="Povezujem tvoj profil…" />;
}
