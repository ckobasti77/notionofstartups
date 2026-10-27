import { useMutation } from 'convex/react';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { PAGE_PRESENCE_REFRESH_MS } from '@/convex/lib/pagePresence';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';

import {
  activeEditors,
  isEditingNow,
  shouldSendEagerHeartbeat,
} from '@/components/collab/collab-model';

/**
 * „<Ime> uređuje" (PROSTOR P23, plan K07 §6.4) — blizanac web `use-page-presence.ts`.
 *
 * Dok je ekran u fokusu i aplikacija aktivna, šalje `presence.heartbeat` na
 * mount i na `PAGE_PRESENCE_REFRESH_MS` (15 s); server drži red 45 s. `editing`
 * je pravo izmene ∧ unos u poslednjih 15 s — ekran javlja unos kroz
 * `markEditing()` (naslov, telo, instrukcije). Na odlasku iz fokusa i pri
 * prelasku u pozadinu `presence.leave`, da se „uređuje" ne vuče do isteka TTL-a.
 *
 * Upit ne čita sat: sveže redove bira klijent (`activeEditors`) sa satom koji
 * tiče na 15 s. Greška prisustva se tiho preskače — nije radnja korisnika.
 */
export function usePagePresence(pageId: Id<'pages'>, { canEdit }: { canEdit: boolean }) {
  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);
  const rows = useQueryTolerant(api.presence.listForPage, { pageId });
  const [now, setNow] = useState(() => Date.now());

  const lastActivityRef = useRef(0);
  const reportedEditingRef = useRef(false);
  const lastSentRef = useRef(0);
  /** Samo dok je ekran u fokusu i aplikacija aktivna — `markEditing` izvan toga ćuti. */
  const liveRef = useRef(false);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const send = useCallback(() => {
    if (!liveRef.current) return;
    const at = Date.now();
    const editing = isEditingNow({
      canEdit: canEditRef.current,
      lastActivityAt: lastActivityRef.current,
      now: at,
    });
    reportedEditingRef.current = editing;
    lastSentRef.current = at;
    void heartbeat({ pageId, editing }).catch(() => {});
  }, [heartbeat, pageId]);

  useFocusEffect(
    useCallback(() => {
      liveRef.current = AppState.currentState === 'active';
      setNow(Date.now());
      send();
      const interval = setInterval(() => {
        setNow(Date.now());
        send();
      }, PAGE_PRESENCE_REFRESH_MS);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          liveRef.current = true;
          setNow(Date.now());
          send();
        } else if (state === 'background') {
          // `inactive` (iOS: Control Center, poziv, Face ID) ne gasi prisustvo — tuđe "uređuje" ne treperi.
          liveRef.current = false;
          reportedEditingRef.current = false;
          void leave({ pageId }).catch(() => {});
        }
      });
      return () => {
        clearInterval(interval);
        subscription.remove();
        // `leave` je već poslat ako je aplikacija otišla u pozadinu (liveRef je tada false).
        const wasLive = liveRef.current;
        liveRef.current = false;
        reportedEditingRef.current = false;
        if (wasLive) void leave({ pageId }).catch(() => {});
      };
    }, [leave, pageId, send]),
  );

  /** Ekran poziva na svaki unos; prvi unos posle tišine odmah javlja „uređujem". */
  const markEditing = useCallback(() => {
    const at = Date.now();
    lastActivityRef.current = at;
    if (
      shouldSendEagerHeartbeat({
        canEdit: canEditRef.current,
        reportedEditing: reportedEditingRef.current,
        lastSentAt: lastSentRef.current,
        now: at,
      })
    ) {
      send();
    }
  }, [send]);

  const editors = useMemo(() => activeEditors(rows, now), [rows, now]);
  return { editors, markEditing };
}
