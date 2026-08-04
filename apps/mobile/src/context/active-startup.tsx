import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Id } from '@/convex/_generated/dataModel';

type ActiveStartupContextValue = {
  activeStartupId: Id<'startups'> | null;
  setActiveStartupId: (id: Id<'startups'>) => void;
};

const ActiveStartupContext = createContext<ActiveStartupContextValue | null>(null);

/**
 * Drži trenutno izabrani startup na nivou (app) segmenta. Startup switcher u
 * headeru menja ovu vrednost; tabovi je čitaju da bi znali čiji kontekst prikazuju.
 */
export function ActiveStartupProvider({ children }: { children: ReactNode }) {
  const [activeStartupId, setActiveStartupId] = useState<Id<'startups'> | null>(null);

  const value = useMemo<ActiveStartupContextValue>(
    () => ({ activeStartupId, setActiveStartupId }),
    [activeStartupId],
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
