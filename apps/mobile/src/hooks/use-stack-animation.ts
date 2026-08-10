import { useMemo } from 'react';

import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * Podrazumevane opcije native stack-a: prelaz ekrana + gest „nazad".
 *
 * `ios_from_right` daje Androidu isti iOS-oliki push (na iOS-u se svodi na
 * podrazumevani native prelaz), pa se ekran svuda otvara na isti način.
 * `gestureEnabled` je iOS-only — na Androidu „nazad" nosi sistemski gest/dugme.
 *
 * Kad je uključeno „smanji pokret", prelaz je `none`: ekran se prosto zameni.
 * Gest ostaje — on je navigacija, ne dekoracija.
 *
 * Zaglavlje je isključeno globalno: svaki ekran crta SVOJE (`AppHeader` za tabove,
 * `ScreenHeader` za stack ekrane) — vidi `app/(app)/_layout.tsx`.
 *
 * Izuzetak je kanvas: WebView uzima horizontalni pan, pa on gasi gest kod sebe.
 */
export function useStackAnimation() {
  const reduced = useReducedMotion();
  return useMemo(
    () => ({
      headerShown: false,
      animation: reduced ? ('none' as const) : ('ios_from_right' as const),
      gestureEnabled: true,
    }),
    [reduced],
  );
}
