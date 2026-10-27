import { useEffect, useState } from 'react';

/**
 * Sat koji tiče na `intervalMs` — upiti ne čitaju vreme, pa „pre 5 min" i TTL
 * prisustva računa klijent. Ekran se osvežava samo kad se minut promeni.
 */
export function useLiveNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
