import { useState } from 'react';

/**
 * Poslednja ne-`null` vrednost — sheet otvoren nad stavkom (`row: T | null`)
 * zadržava sadržaj dok izlazna animacija traje, umesto da se isprazni u prvom
 * frejmu zatvaranja. Stanje se izvodi tokom rendera (React obrazac „prethodna
 * vrednost propa"), bez efekta i bez dodatnog frejma.
 */
export function useRetained<T>(value: T | null): T | null {
  const [retained, setRetained] = useState<T | null>(value);
  if (value !== null && value !== retained) setRetained(value);
  return value ?? retained;
}
