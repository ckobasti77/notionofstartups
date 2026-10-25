import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { msUntilNextDay, nextToday, todayOf, type Today } from '@/lib/today';

/**
 * `{ now, dayKey, doneSince }` za lični nivo (plan K07, E3). Osvežava se u
 * lokalnu ponoć i kad se aplikacija vrati u prvi plan (telefon je možda
 * spavao preko noći) — a ne na svaki render, pa argumenti `myDay.overview`
 * ostaju stabilni ceo dan.
 */
export function useToday(): Today {
  const [today, setToday] = useState<Today>(() => todayOf(Date.now()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(refresh, msUntilNextDay(Date.now()));
    };
    const refresh = () => {
      setToday((previous) => nextToday(previous, Date.now()));
      schedule();
    };
    schedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
