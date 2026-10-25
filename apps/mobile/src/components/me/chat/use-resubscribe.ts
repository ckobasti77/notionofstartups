import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * „Pokušaj ponovo" za jedan upit: jedan render bez pretplate (`'skip'`), pa
 * nova pretplata — bez ponovnog montiranja ekrana (otvoreni sheet-ovi, pretraga
 * i sklopljene grupe ostaju). Par web `useResubscribe` (K15).
 */
export function useResubscribe(): [paused: boolean, retry: () => void] {
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const retry = useCallback(() => {
    setPaused(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setPaused(false);
    }, 0);
  }, []);
  return [paused, retry];
}
