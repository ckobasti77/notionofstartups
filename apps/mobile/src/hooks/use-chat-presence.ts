import { useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { CHAT_PRESENCE_REFRESH_MS } from '@/convex/lib/chatPresence';

/**
 * Prijavljuje serveru „gledam ovaj kanal i stojim na dnu" — jedini slučaj u kome
 * poruka ne pravi obaveštenje (`docs/mobile/lanac5/PLAN.md` §1.3). Blizanac
 * `apps/web/components/workspace/chat/use-chat-presence.ts`; razlika je samo u
 * tome šta na ovoj platformi znači „ekran je u prvom planu".
 *
 * `active` je AND dva uslova koje zna pozivalac (ekran je fokusiran, lista je na
 * dnu); treći — da app nije u pozadini — dodaje ovaj hook kroz `AppState`.
 * Pozadina je „ne gleda": tada obaveštenje MORA da stigne, to je i poenta app-a.
 */
export function useChatPresence(channelId: Id<'chatChannels'>, active: boolean) {
  const setPresence = useMutation(api.chat.setPresence);
  /** Šta je server poslednje čuo — da se `false` ne šalje u prazno više puta. */
  const reportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const send = (present: boolean) => {
      if (cancelled) return;
      if (reportedRef.current === present && !present) return;
      reportedRef.current = present;
      // Tiho: prisustvo je optimizacija obaveštenja, a ne radnja korisnika —
      // greška ovde ne sme da prekine čitanje razgovora.
      void setPresence({ channelId, present }).catch(() => {});
    };

    const tick = () => send(active && AppState.currentState === 'active');

    tick();
    const interval = setInterval(tick, CHAT_PRESENCE_REFRESH_MS);
    // Prelazak u pozadinu gasi prisustvo ODMAH — ne čeka se istek TTL-a, jer bi
    // korisnik do tada ostao bez obaveštenja iako je zaključao telefon.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
      else send(false);
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
      // Odlazak sa ekrana razgovora isto gasi prisustvo odmah.
      if (reportedRef.current) {
        reportedRef.current = false;
        void setPresence({ channelId, present: false }).catch(() => {});
      }
    };
  }, [active, channelId, setPresence]);
}
