import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { readActiveStartupId, writeActiveStartupId } from '@/lib/device-prefs';
import { clearUndo } from '@/lib/undo';

type ActiveStartupContextValue = {
  activeStartupId: Id<'startups'> | null;
  setActiveStartupId: (id: Id<'startups'>) => void;
  /**
   * `true` dok se proverava da li je zapamćeni startup (C2, restart aplikacije)
   * i dalje važeći. Dok traje, `AppHeader` NE sme da nametne prvi startup sa
   * liste — inače bi zapamćen izbor uvek izgubio od trke sa učitavanjem liste.
   */
  restoring: boolean;
};

const ActiveStartupContext = createContext<ActiveStartupContextValue | null>(null);

/**
 * Drži trenutno izabrani startup na nivou (app) segmenta. Startup switcher u
 * headeru menja ovu vrednost; tabovi je čitaju da bi znali čiji kontekst
 * prikazuju.
 *
 * PARITET-REVIZIJA C2: poslednji izbor se pamti PO PROFILU (`lib/device-prefs.ts`)
 * i obnavlja posle restarta — ali tek pošto server potvrdi da je profil i dalje
 * član (`startups.isCurrentMember`). Bez te provere bi korisnik uklonjen iz tima
 * dobio ekran pun grešaka umesto tihog pada na prvi dostupan startup.
 */
export function ActiveStartupProvider({ children }: { children: ReactNode }) {
  const profile = useQuery(api.profiles.getCurrent, {});
  const profileId = profile?._id ?? null;

  // Zapamćen izbor se čita SINHRONO, čim znamo čiji je (ključ je po profilu).
  const remembered = useMemo(
    () => (profileId === null ? null : readActiveStartupId(profileId)),
    [profileId],
  );

  const [chosen, setChosen] = useState<Id<'startups'> | null>(null);

  // Zapamćen id se NE koristi dok server ne potvrdi članstvo.
  const stillMember = useQuery(
    api.startups.isCurrentMember,
    chosen === null && remembered !== null ? { startupId: remembered } : 'skip',
  );

  const restoring = chosen === null && remembered !== null && stillMember === undefined;
  const activeStartupId = chosen ?? (stillMember === true ? remembered : null);

  const setActiveStartupId = useCallback(
    (id: Id<'startups'>) => {
      setChosen(id);
      if (profileId !== null) writeActiveStartupId(profileId, id);
      // Stavke iz Undo trake/istorije se odnose na prošli startup.
      clearUndo();
    },
    [profileId],
  );

  // Promena profila (odjava/prijava drugog naloga) bez odmontiranja provajdera:
  // danas nedostižno jer `Stack.Protected` (`app/_layout.tsx`) odmontira ceo
  // (app) segment pri odjavi — ali render-faza čuvar je jeftiniji od pretpostavke.
  const lastProfileRef = useRef(profileId);
  if (lastProfileRef.current !== profileId) {
    const hadProfile = lastProfileRef.current !== null;
    lastProfileRef.current = profileId;
    if (hadProfile && chosen !== null) setChosen(null);
  }

  const value = useMemo<ActiveStartupContextValue>(
    () => ({ activeStartupId, setActiveStartupId, restoring }),
    [activeStartupId, setActiveStartupId, restoring],
  );

  return <ActiveStartupContext.Provider value={value}>{children}</ActiveStartupContext.Provider>;
}

export function useActiveStartup(): ActiveStartupContextValue {
  const ctx = useContext(ActiveStartupContext);
  if (ctx === null) {
    throw new Error('useActiveStartup mora biti unutar <ActiveStartupProvider>.');
  }
  return ctx;
}
